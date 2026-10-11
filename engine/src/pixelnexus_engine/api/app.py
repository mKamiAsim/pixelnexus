"""FastAPI application factory.

Phase 1 exposes only ``GET /api/v1/info``.
The other routes in PLAN.md section 3.8 arrive in Phase 6a.
"""

from __future__ import annotations

import platform
from importlib.metadata import PackageNotFoundError, version

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pixelnexus_engine import API_VERSION, __version__
from pixelnexus_engine.config import Settings

# Distribution names whose versions are reported by /info.
# Only versions are reported. File system paths are never exposed.
REPORTED_DISTRIBUTIONS = (
    "numpy",
    "scipy",
    "scikit-image",
    "opencv-contrib-python-headless",
    "pywavelets",
    "pillow",
    "fastapi",
)


class Limits(BaseModel):
    max_upload_mb: int
    max_pixels: int


class EngineInfo(BaseModel):
    name: str
    version: str
    api_version: str
    python: str
    dependencies: dict[str, str | None]
    devices: list[str]
    limits: Limits


def _installed_version(distribution: str) -> str | None:
    try:
        return version(distribution)
    except PackageNotFoundError:
        return None


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create the engine application."""
    settings = settings or Settings.from_env()
    app = FastAPI(
        title="PixelNexus science engine",
        version=__version__,
        docs_url=f"/api/{API_VERSION}/docs",
        openapi_url=f"/api/{API_VERSION}/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type"],
    )

    router = APIRouter(prefix=f"/api/{API_VERSION}")

    @router.get("/info", response_model=EngineInfo)
    def info() -> EngineInfo:
        """Engine version, dependency versions, devices and limits."""
        return EngineInfo(
            name="pixelnexus-engine",
            version=__version__,
            api_version=API_VERSION,
            python=platform.python_version(),
            dependencies={name: _installed_version(name) for name in REPORTED_DISTRIBUTIONS},
            devices=["cpu"],
            limits=Limits(max_upload_mb=settings.max_upload_mb, max_pixels=settings.max_pixels),
        )

    app.include_router(router)
    return app
