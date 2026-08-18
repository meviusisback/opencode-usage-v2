"""OpenCode Go usage API for the Hermes desktop plugin.

Hermes discovers this file through ``dashboard/manifest.json`` and mounts the
module-level FastAPI ``router`` under ``/api/plugins/opencode-usage``.
"""

from __future__ import annotations

import json
import logging
import os
import ssl
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter()

USAGE_API_URL = "https://opencode.ai/zen/go/v1/usage"
TIMEOUT_SECONDS = 15
MAX_RESPONSE_BYTES = 4096
MAX_ENV_FILE_BYTES = 65536
WINDOWS = [
    {"id": "rolling", "label": "5h"},
    {"id": "weekly", "label": "W"},
    {"id": "monthly", "label": "M"},
]


def _hermes_home() -> Path:
    return Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes")).expanduser()


def _read_api_key() -> str | None:
    """Read the key from the process environment or active Hermes profile."""
    direct = os.environ.get("OPENCODE_GO_API_KEY", "").strip()
    if direct:
        return direct

    env_path = _hermes_home() / ".env"
    try:
        if not env_path.is_file() or env_path.stat().st_size > MAX_ENV_FILE_BYTES:
            return None
        text = env_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        if key.strip() == "OPENCODE_GO_API_KEY":
            parsed = value.strip().strip("'\"")
            return parsed or None
    return None


def _normalize_usage(body: Any) -> dict[str, dict[str, Any] | None] | None:
    raw_usage = body.get("usage") if isinstance(body, dict) else None
    if not isinstance(raw_usage, dict):
        return None

    normalized: dict[str, dict[str, Any] | None] = {}
    for window in WINDOWS:
        window_id = window["id"]
        raw = raw_usage.get(window_id)
        if not isinstance(raw, dict):
            normalized[window_id] = None
            continue

        try:
            percent = round(float(raw["percent"]), 1) if raw.get("percent") is not None else None
        except (TypeError, ValueError):
            percent = None

        normalized[window_id] = {
            "status": raw.get("status") if isinstance(raw.get("status"), str) else None,
            "percent": percent,
            "resetsAt": raw.get("resetsAt") if isinstance(raw.get("resetsAt"), str) else None,
        }
    return normalized


def _request_usage(api_key: str) -> Any:
    # OpenCode's edge rejects the default Python-urllib User-Agent with 403,
    # so we send a browser-like one.
    request = urllib.request.Request(
        USAGE_API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Hermes-Agent; opencode-usage)",
        },
    )
    context = ssl.create_default_context()
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS, context=context) as response:
        raw = response.read(MAX_RESPONSE_BYTES + 1)
        if len(raw) > MAX_RESPONSE_BYTES:
            raise ValueError("response-too-large")
    return json.loads(raw.decode("utf-8", errors="replace"))


def _payload(*, error: str | None, usage: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "id": "opencode-go",
        "name": "OpenCode Go",
        "windows": WINDOWS,
        "error": error,
        "usage": usage,
    }


@router.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "api_key_configured": _read_api_key() is not None}


@router.get("/usage")
def usage() -> dict[str, Any]:
    api_key = _read_api_key()
    if not api_key:
        return _payload(error="no-api-key", usage=None)

    try:
        body = _request_usage(api_key)
    except urllib.error.HTTPError as exc:
        logger.warning("OpenCode usage request returned HTTP %s", exc.code)
        return _payload(error="upstream-error", usage=None)
    except (urllib.error.URLError, TimeoutError, OSError):
        logger.warning("OpenCode usage request failed", exc_info=True)
        return _payload(error="network-error", usage=None)
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
        logger.warning("OpenCode usage response was invalid", exc_info=True)
        return _payload(error="unexpected-response", usage=None)

    normalized = _normalize_usage(body)
    if normalized is None:
        return _payload(error="unexpected-response", usage=None)
    return _payload(error=None, usage=normalized)
