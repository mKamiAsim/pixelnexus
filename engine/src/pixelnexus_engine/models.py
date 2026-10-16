"""Optional model files, listed in catalog/models.yaml.

A model downloads only when the user asks for it: through POST /api/v1/models/{id}/download,
which the studio sends from the Download model button after showing the size and license. The
file goes to the engine's models folder (PIXELNEXUS_MODELS_DIR, by default ``models`` in the
folder the engine starts in, which git ignores), as ``<models folder>/<id>/<file name>``.

The download is written to a temporary file and checked against the SHA-256 in the catalog. Only
a file that matches is moved into place, so a model on disk has always been checked once.
"""

from __future__ import annotations

import hashlib
import os
import tempfile
import urllib.request
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

from pixelnexus_engine.config import Settings
from pixelnexus_engine.registry import find_catalog

CHUNK = 1 << 16
TIMEOUT_S = 60


def models_dir() -> Path:
    """The models folder from the environment, as the engine and its job processes see it."""
    return Settings.from_env().models_dir


def model_entries(catalog_dir: Path | None = None) -> list[dict[str, Any]]:
    filters = catalog_dir or find_catalog()
    if filters is None:
        return []
    path = filters.parent / "models.yaml"
    if not path.is_file():
        return []
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return list(data.get("models") or [])


def model_entry(model_id: str, catalog_dir: Path | None = None) -> dict[str, Any] | None:
    return next((m for m in model_entries(catalog_dir) if m.get("id") == model_id), None)


def model_path(entry: dict[str, Any], folder: Path | None = None) -> Path:
    name = Path(urlparse(entry["sourceUrl"]).path).name
    return (folder or models_dir()) / str(entry["id"]) / name


def model_view(entry: dict[str, Any], folder: Path | None = None) -> dict[str, Any]:
    """What the studio shows about a model, and whether it is on disk."""
    keys = ("id", "name", "task", "license", "licenseUrl", "sourceUrl", "sizeMB", "sha256")
    return {
        **{k: entry[k] for k in keys if k in entry},
        "downloaded": model_path(entry, folder).is_file(),
    }


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        while chunk := file.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def download(entry: dict[str, Any], folder: Path | None = None) -> Path:
    """Fetch the model, check its SHA-256, and move it into place. Raises ValueError when the
    file does not match the catalog."""
    target = model_path(entry, folder)
    target.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    handle, temporary = tempfile.mkstemp(dir=target.parent, suffix=".part")
    try:
        with (
            os.fdopen(handle, "wb") as out,
            urllib.request.urlopen(entry["sourceUrl"], timeout=TIMEOUT_S) as response,
        ):
            while chunk := response.read(CHUNK):
                digest.update(chunk)
                out.write(chunk)
        if digest.hexdigest() != entry["sha256"]:
            raise ValueError(
                "The downloaded file does not match the checksum in the catalog, so it was "
                "not kept."
            )
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.remove(temporary)
    return target


def require(model_id: str) -> Path:
    """The path of a downloaded model, or a ValueError that tells the user to download it."""
    entry = model_entry(model_id)
    if entry is None:
        raise ValueError(f"The model '{model_id}' is not in the catalog.")
    path = model_path(entry)
    if not path.is_file():
        raise ValueError(
            f"This filter needs the model '{entry['name']}' ({entry['sizeMB']:g} MB). Click "
            "Download model in the Properties panel first."
        )
    return path
