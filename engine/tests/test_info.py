from fastapi.testclient import TestClient

from pixelnexus_engine import __version__
from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings


def make_client(**overrides: object) -> TestClient:
    return TestClient(create_app(Settings(**overrides)))  # type: ignore[arg-type]


def test_info_reports_version_and_limits() -> None:
    response = make_client(max_upload_mb=12, max_pixels=1000).get("/api/v1/info")
    assert response.status_code == 200
    body = response.json()
    assert body["version"] == __version__
    assert body["api_version"] == "v1"
    assert body["limits"] == {"max_upload_mb": 12, "max_pixels": 1000}
    assert body["dependencies"]["numpy"] is not None


def test_info_exposes_no_file_paths() -> None:
    text = make_client().get("/api/v1/info").text
    assert "/home/" not in text
    assert "site-packages" not in text


def test_cors_allows_only_configured_origins() -> None:
    client = make_client(allowed_origins=("http://localhost:5173",))
    allowed = client.get("/api/v1/info", headers={"Origin": "http://localhost:5173"})
    blocked = client.get("/api/v1/info", headers={"Origin": "https://example.com"})
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in blocked.headers


def test_settings_from_env() -> None:
    settings = Settings.from_env(
        {
            "PIXELNEXUS_ENGINE_PORT": "9000",
            "PIXELNEXUS_ALLOWED_ORIGINS": "http://a.test, http://b.test",
        }
    )
    assert settings.port == 9000
    assert settings.allowed_origins == ("http://a.test", "http://b.test")
    assert settings.host == "127.0.0.1"
