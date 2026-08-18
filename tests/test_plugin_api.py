import importlib.util
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
MODULE_NAME = "opencode_usage_test_plugin_api"
SPEC = importlib.util.spec_from_file_location(MODULE_NAME, ROOT / "dashboard" / "plugin_api.py")
assert SPEC and SPEC.loader
plugin_api = importlib.util.module_from_spec(SPEC)
sys.modules[MODULE_NAME] = plugin_api
SPEC.loader.exec_module(plugin_api)


def make_client():
    app = FastAPI()
    app.include_router(plugin_api.router, prefix="/api/plugins/opencode-usage")
    return TestClient(app)


def test_health_route_is_mounted_at_the_desktop_namespace(monkeypatch):
    monkeypatch.delenv("OPENCODE_GO_API_KEY", raising=False)
    monkeypatch.setenv("HERMES_HOME", str(ROOT / "tests" / "fixtures" / "empty-home"))

    response = make_client().get("/api/plugins/opencode-usage/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "api_key_configured": False}


def test_usage_without_key_returns_sanitized_plugin_payload(monkeypatch):
    monkeypatch.delenv("OPENCODE_GO_API_KEY", raising=False)
    monkeypatch.setenv("HERMES_HOME", str(ROOT / "tests" / "fixtures" / "empty-home"))

    response = make_client().get("/api/plugins/opencode-usage/usage")

    assert response.status_code == 200
    assert response.json() == {
        "id": "opencode-go",
        "name": "OpenCode Go",
        "windows": plugin_api.WINDOWS,
        "error": "no-api-key",
        "usage": None,
    }


def test_usage_normalizes_upstream_response(monkeypatch):
    upstream = {
        "usage": {
            "rolling": {"percent": "39.45", "status": "ok", "resetsAt": "2026-08-18T20:00:00Z"},
            "weekly": {"percent": 15, "status": "ok"},
            "monthly": {"percent": None, "status": "ok"},
            "secret": {"token": "must-not-leak"},
        }
    }
    monkeypatch.setattr(plugin_api, "_read_api_key", lambda: "test-key")
    monkeypatch.setattr(plugin_api, "_request_usage", lambda _key: upstream)

    response = make_client().get("/api/plugins/opencode-usage/usage")

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert body["usage"] == {
        "rolling": {"status": "ok", "percent": 39.5, "resetsAt": "2026-08-18T20:00:00Z"},
        "weekly": {"status": "ok", "percent": 15.0, "resetsAt": None},
        "monthly": {"status": "ok", "percent": None, "resetsAt": None},
    }
    assert "secret" not in body["usage"]


def test_request_sends_browser_user_agent(monkeypatch):
    captured = {}

    class FakeResponse:
        status = 200

        def read(self, _n):
            return b'{"usage":{}}'

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    def fake_urlopen(request, timeout=None, context=None):
        captured["request"] = request
        return FakeResponse()

    monkeypatch.setattr(plugin_api.urllib.request, "urlopen", fake_urlopen)

    plugin_api._request_usage("test-key")

    user_agent = captured["request"].get_header("User-agent")
    assert user_agent, "request must set a User-Agent header"
    assert "Python-urllib" not in user_agent

