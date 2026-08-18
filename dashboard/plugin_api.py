"""
AI Usage — Plugin API backend.

Reads API keys from $HERMES_HOME/.env and proxies usage calls
for AI providers defined in providers.py.

Endpoints:
  GET /providers        — provider metadata (names, windows)
  GET /usage            — all enabled providers
  GET /usage/<provider> — specific provider usage
"""
import os, json, ssl, stat, urllib.request, urllib.error, logging
from pathlib import Path
from ..providers import get_enabled_providers, get_provider_by_id

TIMEOUT_SECONDS = 15
MAX_RESPONSE_BYTES = 4096
MAX_ENV_FILE_BYTES = 65536
logger = logging.getLogger(__name__)
_key_cache = {}


def _read_api_keys():
    if _key_cache:
        return _key_cache
    hermes_home = os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes"))
    env_path = Path(hermes_home) / ".env"
    if not env_path.exists():
        return _key_cache
    try:
        mode = stat.S_IMODE(env_path.stat().st_mode)
        if mode & (stat.S_IRGRP | stat.S_IROTH):
            logger.warning("opencode-usage: .env has permissive perms (%o)", mode)
    except OSError:
        pass
    try:
        text = env_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return _key_cache
    if len(text) > MAX_ENV_FILE_BYTES:
        return _key_cache
    needed = {p["key_env"] for p in get_enabled_providers()}
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key in needed:
            _key_cache[key] = value.strip().strip("'\"")
    return _key_cache


def _fetch_usage(provider, api_key, ssl_ctx):
    headers = dict(provider.get("headers", {}))
    headers["Authorization"] = f"Bearer {api_key}"
    req = urllib.request.Request(provider["endpoint"], headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS, context=ssl_ctx) as resp:
            raw = resp.read(MAX_RESPONSE_BYTES).decode("utf-8", errors="replace")
            body = json.loads(raw)
    except urllib.error.HTTPError:
        return {"error": "upstream-error"}
    except Exception:
        return {"error": "network-error"}
    parser = provider.get("parse")
    windows = provider.get("windows", [])
    usage = parser(body, windows) if parser else (body.get("usage") if isinstance(body, dict) else None)
    if usage is None:
        return {"error": "unexpected-response"}
    return {"error": None, "usage": usage}


def register(flask_app):
    _ssl_ctx = ssl.create_default_context()

    @flask_app.route("/providers", methods=["GET"])
    def list_providers():
        providers = get_enabled_providers()
        return {"providers": [{"id": p["id"], "name": p["name"], "windows": p.get("windows", [])} for p in providers]}

    @flask_app.route("/usage", methods=["GET"])
    def get_all_usage():
        keys = _read_api_keys()
        providers = get_enabled_providers()
        results = []
        for p in providers:
            api_key = keys.get(p["key_env"])
            if not api_key:
                results.append({"id": p["id"], "name": p["name"], "windows": p.get("windows", []), "error": "no-api-key", "usage": None})
                continue
            result = _fetch_usage(p, api_key, _ssl_ctx)
            results.append({"id": p["id"], "name": p["name"], "windows": p.get("windows", []), "error": result.get("error"), "usage": result.get("usage")})
        return {"providers": results}

    @flask_app.route("/usage/<provider_id>", methods=["GET"])
    def get_provider_usage(provider_id):
        provider = get_provider_by_id(provider_id)
        if not provider:
            return {"error": "unknown-provider"}, 404
        if not provider.get("enabled", True):
            return {"error": "provider-disabled"}, 400
        keys = _read_api_keys()
        api_key = keys.get(provider["key_env"])
        if not api_key:
            return {"id": provider["id"], "name": provider["name"], "windows": provider.get("windows", []), "error": "no-api-key", "usage": None}
        result = _fetch_usage(provider, api_key, _ssl_ctx)
        return {"id": provider["id"], "name": provider["name"], "windows": provider.get("windows", []), "error": result.get("error"), "usage": result.get("usage")}
