"""
Provider registry — add new providers here.

Each provider dict has:
  id          — unique slug (matched against model prefix)
  name        — display name
  key_env     — env var name in $HERMES_HOME/.env for the API key
  endpoint    — usage API URL
  enabled     — whether to fetch this provider
  headers     — dict of static headers (Authorization added dynamically)
  windows     — list of window definitions: [{id, label}]
  parse       — optional callable(body, windows) -> normalized usage dict
"""


def _parse_opencode(body, windows):
    """Parse OpenCode-style: {usage: {rolling: {...}, weekly: {...}, ...}}"""
    usage = body.get("usage") if isinstance(body, dict) else None
    if not isinstance(usage, dict):
        return None
    return _normalize_windows(usage, windows)


def _parse_copilot(body, windows):
    """Parse GitHub Copilot (placeholder)."""
    usage = body.get("usage") if isinstance(body, dict) else None
    if not isinstance(usage, dict):
        return None
    mapped = {}
    for w in windows:
        wid = w["id"]
        mapped[wid] = usage.get(wid) or usage.get(wid.replace("_", ""))
    return _normalize_windows(mapped, windows)


def _normalize_windows(usage, windows):
    """Extract and validate windows from the usage dict."""
    result = {}
    for w in windows:
        wid = w["id"]
        raw = usage.get(wid)
        if not isinstance(raw, dict):
            result[wid] = None
            continue
        percent = raw.get("percent")
        try:
            percent = round(float(percent), 1) if percent is not None else None
        except (ValueError, TypeError):
            percent = None
        result[wid] = {
            "status": raw.get("status") if isinstance(raw.get("status"), str) else None,
            "percent": percent,
            "resetsAt": raw.get("resetsAt") if isinstance(raw.get("resetsAt"), str) else None,
        }
    return result


PROVIDERS = [
    {
        "id": "opencode-go",
        "name": "OpenCode Go",
        "key_env": "OPENCODE_GO_API_KEY",
        "endpoint": "https://opencode.ai/zen/go/v1/usage",
        "enabled": True,
        "headers": {"Accept": "application/json"},
        "windows": [
            {"id": "rolling", "label": "5h"},
            {"id": "weekly", "label": "W"},
            {"id": "monthly", "label": "M"},
        ],
        "parse": _parse_opencode,
    },
    # {
    #     "id": "opencode-zen",
    #     "name": "OpenCode Zen",
    #     "key_env": "OPENCODE_ZEN_API_KEY",
    #     "endpoint": "https://opencode.ai/zen/v1/usage",
    #     "enabled": False,
    #     "headers": {"Accept": "application/json"},
    #     "windows": [
    #         {"id": "rolling", "label": "5h"},
    #         {"id": "weekly", "label": "W"},
    #         {"id": "monthly", "label": "M"},
    #     ],
    #     "parse": _parse_opencode,
    # },
]


def get_enabled_providers():
    """Return list of enabled provider configs."""
    return [p for p in PROVIDERS if p.get("enabled", True)]


def get_provider_by_id(provider_id):
    """Lookup a provider by its ID."""
    for p in PROVIDERS:
        if p["id"] == provider_id:
            return p
    return None
