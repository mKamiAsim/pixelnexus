"""FastAPI application factory, with the routes of PLAN.md section 3.8.

Images travel as raw RGBA bytes with their size, never as JSON arrays. Jobs run in their own
processes (see jobs.py) and report progress as server-sent events. A job for a filter that
reads the selection names a mask, uploaded like an image. Results may have another size than
the image, and say their size in X-Width and X-Height. Optional models are listed under
/models, and one downloads only when the studio posts to /models/{id}/download, after the user
clicks Download model (see models.py).
"""

from __future__ import annotations

import asyncio
import json
import multiprocessing as mp
import os
import platform
import threading
from collections.abc import AsyncIterator
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager
from importlib.metadata import PackageNotFoundError, version
from typing import Any

import numpy as np
from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from numpy.typing import NDArray
from pydantic import BaseModel, Field

from pixelnexus_engine import API_VERSION, __version__
from pixelnexus_engine.config import Settings
from pixelnexus_engine.images import ImageError, ImageStore, StoredImage, decode_rgba
from pixelnexus_engine.inference import describe
from pixelnexus_engine.jobs import TERMINAL, JobManager
from pixelnexus_engine.models import delete, download, is_downloaded, model_entries, model_view
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
    "onnxruntime",
    "onnxruntime-gpu",
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
    # The model runtime and the device it chose, from a check in a child process. None until
    # that check has finished, a few seconds after the engine starts.
    inference: dict[str, Any] | None = None


class JobRequest(BaseModel):
    filter: str
    image: str
    params: dict[str, Any] = Field(default_factory=dict)
    # An uploaded image of the same size whose red channel is the selection, from 0 to 255.
    # Only filters that read the selection, such as inpainting, take one, and they need it.
    mask: str | None = None


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

    models_folder = settings.models_dir
    models = {m["id"]: m for m in model_entries(catalog_dir)}

    runtime: dict[str, Any] = {}
    downloads: dict[str, dict[str, Any]] = {}
    lock = threading.Lock()

    def check_runtime() -> None:
        """Choose the device in a child process, as the job processes do, so the API process
        never holds a GPU context."""
        try:
            with ProcessPoolExecutor(1, mp_context=mp.get_context("spawn")) as pool:
                runtime.update(pool.submit(describe).result(timeout=120))
        except Exception as error:
            runtime.update({"runtime": None, "device": "none", "providers": [], "note": str(error)})

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Job processes find the models folder in the environment they inherit.
        os.environ["PIXELNEXUS_MODELS_DIR"] = str(models_folder)
        managers["jobs"] = JobManager(settings.max_workers)
        threading.Thread(target=check_runtime, daemon=True).start()
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
            devices=["cpu"] if runtime.get("device") != "cuda" else ["cpu", "cuda"],
            limits=Limits(max_upload_mb=settings.max_upload_mb, max_pixels=settings.max_pixels),
            inference=dict(runtime) or None,
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

    def view(entry: dict[str, Any]) -> dict[str, Any]:
        with lock:
            state = downloads.get(entry["id"])
        result = model_view(entry, models_folder)
        if state is not None and not result["downloaded"]:
            result["download"] = dict(state)
        return result

    def run_download(entry: dict[str, Any]) -> None:
        def progress(done: int, total: int) -> None:
            with lock:
                downloads[entry["id"]].update(done=done, total=total)

        try:
            download(entry, models_folder, progress)
            with lock:
                downloads.pop(entry["id"], None)
        except (ValueError, OSError) as error:
            message = (
                str(error) if isinstance(error, ValueError) else f"The download failed: {error}"
            )
            with lock:
                downloads[entry["id"]].update(state="failed", error=message)

    def known(model_id: str) -> dict[str, Any]:
        entry = models.get(model_id)
        if entry is None:
            raise _not_found("model with this id")
        return entry

    @router.get("/models")
    def list_models() -> list[dict[str, Any]]:
        """The optional models, with their license and whether they are downloaded."""
        return [view(entry) for entry in models.values()]

    @router.get("/models/{model_id}")
    def get_model(model_id: str) -> dict[str, Any]:
        """One model, with the progress of a download that runs."""
        return view(known(model_id))

    @router.post("/models/{model_id}/download", status_code=202)
    def download_model(model_id: str) -> dict[str, Any]:
        """Start downloading one model on the user's request. Every file is checked against its
        SHA-256. Ask GET /models/{id} for the progress."""
        entry = known(model_id)
        with lock:
            running = downloads.get(model_id, {}).get("state") == "downloading"
            start = not running and not is_downloaded(entry, models_folder)
            if start:
                downloads[model_id] = {"state": "downloading", "done": 0, "total": 0}
        if start:
            threading.Thread(target=run_download, args=(entry,), daemon=True).start()
        return view(entry)

    @router.delete("/models/{model_id}")
    def delete_model(model_id: str) -> dict[str, Any]:
        """Remove a downloaded model and its files."""
        entry = known(model_id)
        with lock:
            if downloads.get(model_id, {}).get("state") == "downloading":
                raise HTTPException(status_code=409, detail="The model is still downloading.")
            downloads.pop(model_id, None)
        delete(entry, models_folder)
        return view(entry)

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
        return jobs().submit(request.filter, stored, params, job_mask(request, stored)).status()

    def job_mask(request: JobRequest, stored: StoredImage) -> NDArray[np.uint8] | None:
        """The selection for a filter that reads it, checked against the image."""
        wants = FILTERS[request.filter].mask
        if request.mask is None:
            if wants:
                raise HTTPException(
                    status_code=422,
                    detail="This filter needs a selection. Select the area first.",
                )
            return None
        if not wants:
            raise HTTPException(status_code=422, detail="This filter does not use a selection.")
        mask = images.get(request.mask)
        if mask is None:
            raise _not_found("mask with this id. Upload it again")
        if (mask.width, mask.height) != (stored.width, stored.height):
            raise HTTPException(
                status_code=422, detail="The mask must have the same size as the image."
            )
        return np.ascontiguousarray(mask.pixels[..., 0])

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
