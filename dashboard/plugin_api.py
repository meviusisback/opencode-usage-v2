"""OpenCode Usage dashboard plugin — backend API routes.

Mounted at /api/plugins/opencode-usage/ by the dashboard plugin system.

Fetches OpenCode Go usage data from https://opencode.ai/zen/go/v1/usage
using a Bearer token from ~/.hermes/.env (OPENCODE_GO_API_KEY).
"""

from __future__ import annotations

import os
import logging
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

log = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

USAGE_API_URL = "https://opencode.ai/zen/go/v1/usage"


def _get_api_key() -> Optional[str]:
    """Load the OpenCode Go API key from ~/.hermes/.env or environment."""
    # Try environment first
    key = os.environ.get("OPENCODE_GO_API_KEY")
    if key:
        return key

    # Try loading from ~/.hermes/.env
    try:
        hermes_home = Path.home() / ".hermes"
        env_file = hermes_home / ".env"
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("OPENCODE_GO_API_KEY="):
                    value = line.split("=", 1)[1].strip()
                    # Remove quotes if present
                    if len(value) >= 2 and value[0] in ('"', "'") and value[-1] == value[0]:
                        value = value[1:-1]
                    return value
    except Exception as exc:
        log.debug("Failed to read .env file: %s", exc)

    return None


def _fetch_usage_data() -> dict[str, Any]:
    """Fetch usage data from the OpenCode API."""
    import httpx

    api_key = _get_api_key()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENCODE_GO_API_KEY not configured. Set it in ~/.hermes/.env or environment."
        )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(USAGE_API_URL, headers=headers)
            response.raise_for_status()
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="OpenCode API timeout")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"OpenCode API error: {exc.response.text}"
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch usage: {exc}")


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@router.get("/usage")
async def get_usage():
    """Get current OpenCode Go usage data.

    Returns usage information with three windows:
    - rolling: Last 5 hours usage
    - weekly: Current week usage
    - monthly: Current month usage

    Each window includes percent used and status (ok/warning/critical).
    """
    data = _fetch_usage_data()
    return data


@router.get("/health")
async def health():
    """Health check endpoint."""
    api_key = _get_api_key()
    return {
        "status": "ok",
        "api_key_configured": api_key is not None,
    }
