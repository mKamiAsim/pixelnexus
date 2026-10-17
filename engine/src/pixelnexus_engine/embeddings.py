"""A disk cache of image encoder results, for click and box selection (PLAN.md Phase 7f).

SAM 2.1 and EfficientSAM split the work into a slow image encoder and a fast prompt decoder.
Every click sends a new job, and every job runs in a new process, so the encoder results are kept
on disk: in a ``.embeddings`` folder inside the models folder, keyed by the SHA-256 of the model
id, the image size and its RGB bytes. The folder stays under PIXELNEXUS_EMBEDDINGS_MB (512 by
default, our choice), and the least recently used results are dropped first. 0 turns it off.
"""

from __future__ import annotations

import hashlib
import os
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

from pixelnexus_engine.config import Settings

Arrays = dict[str, NDArray[Any]]


def folder() -> Path:
    return Settings.from_env().models_dir / ".embeddings"


def key(model_id: str, rgb: NDArray[np.uint8]) -> str:
    digest = hashlib.sha256(f"{model_id}:{rgb.shape[0]}x{rgb.shape[1]}:".encode())
    digest.update(np.ascontiguousarray(rgb).tobytes())
    return digest.hexdigest()


def prune(where: Path, budget_bytes: int) -> None:
    """Drop the least recently used files until the folder fits the budget."""
    files = sorted(where.glob("*.npz"), key=lambda f: f.stat().st_mtime, reverse=True)
    total = 0
    for file in files:
        total += file.stat().st_size
        if total > budget_bytes:
            file.unlink(missing_ok=True)


def cached(model_id: str, rgb: NDArray[np.uint8], compute: Callable[[], Arrays]) -> Arrays:
    """The encoder results for this image, from the cache or from `compute`."""
    budget = Settings.from_env().embeddings_mb * 1_000_000
    if budget <= 0:
        return compute()
    where = folder()
    path = where / f"{key(model_id, rgb)}.npz"
    if path.is_file():
        try:
            with np.load(path) as data:
                arrays = {name: data[name] for name in data.files}
            os.utime(path)
            return arrays
        except (OSError, ValueError):
            path.unlink(missing_ok=True)
    arrays = compute()
    where.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(f".{os.getpid()}.tmp")
    # numpy's stubs read **arrays as its keyword arguments, so call it untyped.
    savez: Any = np.savez
    with partial.open("wb") as out:
        savez(out, **arrays)
    partial.replace(path)
    prune(where, budget)
    return arrays
