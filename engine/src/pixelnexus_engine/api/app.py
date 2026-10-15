"""FastAPI application factory, with the routes of PLAN.md section 3.8.

Images travel as raw RGBA bytes with their size, never as JSON arrays. Jobs run in their own
processes (see jobs.py) and report progress as server-sent events. The selection and model
routes arrive with Phase 6e and Phase 7.
"""

from __future__ import annotations

import asyncio
import json
import platform
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from importlib.metadata import PackageNotFoundError, version
from typing import Any

import numpy as np
from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from pixelnexus_engine import API_VERSION, __version__
from pixelnexus_engine.config import Settings
from pixelnexus_engine.images import ImageError, ImageStore, decode_rgba
from pixelnexus_engine.jobs import TERMINAL, JobManager
from pixelnexus_engine.params import ParamError, check_params, resolve_params
from pixelnexus_engine.registry import (
    FILTERS,
    common_params,
    find_catalog,
    load_filters,
    science_entries,
)

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
    "pyrtools",
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


class JobRequest(BaseModel):
    filter: str
    image: str
    params: dict[str, Any] = Field(default_factory=dict)


def _installed_version(distribution: str) -> str | None:
    try:
        return version(distribution)
    except PackageNotFoundError:
        return None


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"There is no {what}.")


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create the engine application."""
    settings = settings or Settings.from_env()
    load_filters()
    catalog_dir = settings.catalog_dir or find_catalog()
    catalog = science_entries(catalog_dir)
    shared = common_params(catalog_dir)
    definitions = {entry["id"]: resolve_params(entry, shared) for entry in catalog}
    images = ImageStore(settings.cache_mb * 1024 * 1024)
    managers: dict[str, JobManager] = {}

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        managers["jobs"] = JobManager(settings.max_workers)
        yield
        managers.pop("jobs").shutdown()

    def jobs() -> JobManager:
        manager = managers.get("jobs")
        if manager is None:
            raise HTTPException(status_code=503, detail="The engine is starting or stopping.")
        return manager

    app = FastAPI(
        title="PixelNexus science engine",
        version=__version__,
        docs_url=f"/api/{API_VERSION}/docs",
        openapi_url=f"/api/{API_VERSION}/openapi.json",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type"],
        expose_headers=["X-Width", "X-Height"],
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

    def checked_params(filter_id: str, values: dict[str, Any]) -> dict[str, Any]:
        """Values checked against the catalog entry, with defaults filled in.

        Diagnostics, whose ids start with an underscore, have no catalog entry.
        """
        if filter_id.startswith("_"):
            return values
        if filter_id not in definitions:
            raise HTTPException(
                status_code=404,
                detail=f'The engine found no catalog entry for "{filter_id}". Start it from '
                "the repository folder, or set PIXELNEXUS_CATALOG_DIR.",
            )
        try:
            return check_params(definitions[filter_id], values)
        except ParamError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    def entry_view(entry: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": entry["id"],
            "name": entry.get("name"),
            "phase": entry.get("phase"),
            "status": entry.get("status"),
            "available": entry["id"] in FILTERS,
        }

    @router.get("/filters")
    def list_filters() -> list[dict[str, Any]]:
        """The catalog entries that run in this engine, and whether this engine can run them."""
        return [entry_view(entry) for entry in catalog]

    @router.get("/filters/{filter_id}")
    def get_filter(filter_id: str) -> dict[str, Any]:
        for entry in catalog:
            if entry["id"] == filter_id:
                return entry_view(entry)
        raise _not_found(f'catalog entry "{filter_id}" for this engine')

    @router.post("/filters/{filter_id}/representation")
    def representation(filter_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """The operator for the Inspector, built by the same code that runs the filter."""
        spec = FILTERS.get(filter_id)
        if spec is None:
            raise _not_found(f'filter "{filter_id}" in this engine')
        if spec.representation is None:
            raise HTTPException(status_code=501, detail="This filter has no representation.")
        return spec.representation(checked_params(filter_id, params))

    @router.post("/images")
    async def upload(request: Request, width: int, height: int) -> dict[str, Any]:
        """Upload raw RGBA bytes once. The content hash is the image id."""
        limit = settings.max_upload_mb * 1024 * 1024
        too_large = HTTPException(
            status_code=413, detail=f"Uploads are limited to {settings.max_upload_mb} MB."
        )
        declared = request.headers.get("content-length")
        if declared is not None and int(declared) > limit:
            raise too_large
        data = await request.body()
        if len(data) > limit:
            raise too_large
        try:
            pixels = decode_rgba(data, width, height, settings.max_pixels)
        except ImageError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        stored = images.put(pixels)
        return {"id": stored.id, "width": stored.width, "height": stored.height}

    @router.get("/images/{image_id}/metadata")
    def metadata(image_id: str) -> dict[str, Any]:
        stored = images.get(image_id)
        if stored is None:
            raise _not_found("image with this id. Upload it again")
        return {"id": stored.id, "width": stored.width, "height": stored.height, "channels": 4}

    @router.post("/jobs", status_code=202)
    def submit(request: JobRequest) -> dict[str, Any]:
        if request.filter not in FILTERS:
            raise _not_found(f'filter "{request.filter}" in this engine')
        params = checked_params(request.filter, request.params)
        stored = images.get(request.image)
        if stored is None:
            raise _not_found("image with this id. Upload it again")
        return jobs().submit(request.filter, stored, params).status()

    @router.get("/jobs/{job_id}")
    def job_status(job_id: str) -> dict[str, Any]:
        job = jobs().get(job_id)
        if job is None:
            raise _not_found("job with this id")
        return job.status()

    @router.get("/jobs/{job_id}/events")
    async def job_events(job_id: str) -> StreamingResponse:
        """Server-sent events with the job status, until the job ends."""
        manager = jobs()
        if manager.get(job_id) is None:
            raise _not_found("job with this id")

        async def stream() -> AsyncIterator[str]:
            seen = -1
            while True:
                job = manager.get(job_id)
                if job is None:
                    return
                if job.version != seen:
                    seen = job.version
                    yield f"event: status\ndata: {json.dumps(job.status())}\n\n"
                if job.state in TERMINAL:
                    return
                await asyncio.sleep(0.05)

        return StreamingResponse(stream(), media_type="text/event-stream")

    @router.get("/jobs/{job_id}/result", response_model=None)
    def job_result(job_id: str) -> Response | dict[str, Any]:
        """The result image as raw RGBA with X-Width and X-Height, or JSON for tables."""
        job = jobs().get(job_id)
        if job is None:
            raise _not_found("job with this id")
        if job.state != "done":
            raise HTTPException(status_code=409, detail=f"The job is {job.state}, not done.")
        result = job.result
        if isinstance(result, dict):
            return result
        pixels = np.ascontiguousarray(result, dtype=np.uint8)
        height, width = pixels.shape[:2]
        return Response(
            content=pixels.tobytes(),
            media_type="application/octet-stream",
            headers={"X-Width": str(width), "X-Height": str(height)},
        )

    @router.delete("/jobs/{job_id}")
    def cancel(job_id: str) -> dict[str, Any]:
        job = jobs().cancel(job_id)
        if job is None:
            raise _not_found("job with this id")
        return job.status()

    app.include_router(router)
    return app
