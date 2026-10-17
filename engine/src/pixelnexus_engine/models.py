"""Optional model files, listed in catalog/models.yaml.

A model downloads only when the user asks for it: through POST /api/v1/models/{id}/download,
which the studio sends from the Download model button after showing the size and license. The
file goes to the engine's models folder (PIXELNEXUS_MODELS_DIR, by default ``models`` in the
folder the engine starts in, which git ignores), as ``<models folder>/<id>/<file name>``.

A model can have extra files (extraFiles in the catalog), such as an ONNX data file or a second
network. Every file is written to ``<name>.part`` and checked against its SHA-256. Only a file
that matches is moved into place, so a model on disk has always been checked once. A download
that breaks off keeps its ``.part`` file and continues from there next time, over HTTPS with a
Range request. A file that does not match is deleted.

``pixelnexus-engine models`` lists, downloads and deletes models from the command line, and
PIXELNEXUS_MODELS_DIR sets where they go.
"""

from __future__ import annotations

import functools
import hashlib
import os
import shutil
import urllib.request
from collections.abc import Callable
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


def file_name(url: str) -> str:
    return Path(urlparse(url).path).name


def model_files(entry: dict[str, Any]) -> list[dict[str, Any]]:
    """Every file of a model: the main file first, then the extra files."""
    main = {"sourceUrl": entry["sourceUrl"], "sha256": entry["sha256"], "sizeMB": entry["sizeMB"]}
    return [main, *(entry.get("extraFiles") or [])]


def model_path(entry: dict[str, Any], folder: Path | None = None) -> Path:
    """The main file of a model. Its extra files sit next to it."""
    return (folder or models_dir()) / str(entry["id"]) / file_name(entry["sourceUrl"])


def is_downloaded(entry: dict[str, Any], folder: Path | None = None) -> bool:
    base = model_path(entry, folder).parent
    return all((base / file_name(f["sourceUrl"])).is_file() for f in model_files(entry))


def total_mb(entry: dict[str, Any]) -> float:
    return round(sum(float(f["sizeMB"]) for f in model_files(entry)), 2)


def model_view(entry: dict[str, Any], folder: Path | None = None) -> dict[str, Any]:
    """What the studio shows about a model, and whether it is on disk."""
    keys = (
        "id",
        "name",
        "task",
        "license",
        "licenseUrl",
        "sourceUrl",
        "sizeMB",
        "sha256",
        "format",
        "runtimes",
        "nonCommercial",
    )
    return {
        **{k: entry[k] for k in keys if k in entry},
        "files": len(model_files(entry)),
        "totalMB": total_mb(entry),
        "downloaded": is_downloaded(entry, folder),
    }


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        while chunk := file.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


Progress = Callable[[int, int], None]


def _fetch(url: str, part: Path, total: int, done: int, progress: Progress) -> None:
    """Append the rest of a file to its .part file."""
    request = urllib.request.Request(url)
    resume = part.stat().st_size if part.exists() and url.startswith("https://") else 0
    if resume:
        request.add_header("Range", f"bytes={resume}-")
    with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
        # A server that ignores the Range header sends the whole file again.
        append = resume > 0 and getattr(response, "status", 200) == 206
        written = resume if append else 0
        with part.open("ab" if append else "wb") as out:
            while chunk := response.read(CHUNK):
                out.write(chunk)
                written += len(chunk)
                progress(done + written, total)


def download(
    entry: dict[str, Any], folder: Path | None = None, progress: Progress | None = None
) -> Path:
    """Fetch every missing file of a model, check each SHA-256, and move it into place.
    Raises ValueError when a file does not match the catalog, and OSError when the network
    fails. Returns the path of the main file."""
    report = progress or (lambda _done, _total: None)
    target = model_path(entry, folder)
    target.parent.mkdir(parents=True, exist_ok=True)
    files = model_files(entry)
    total = sum(int(float(f["sizeMB"]) * 1e6) for f in files)
    done = 0
    for item in files:
        final = target.parent / file_name(item["sourceUrl"])
        size = int(float(item["sizeMB"]) * 1e6)
        if final.is_file():
            done += size
            report(done, total)
            continue
        part = final.with_name(final.name + ".part")
        _fetch(item["sourceUrl"], part, total, done, report)
        if sha256_of(part) != item["sha256"]:
            part.unlink()
            raise ValueError(
                f"The downloaded file {final.name} does not match the checksum in the catalog, "
                "so it was not kept."
            )
        os.replace(part, final)
        done += size
        report(done, total)
    return target


def delete(entry: dict[str, Any], folder: Path | None = None) -> None:
    """Remove every file of a model, including unfinished downloads."""
    base = model_path(entry, folder).parent
    if base.is_dir():
        shutil.rmtree(base)


def require(model_id: str) -> Path:
    """The path of a downloaded model, or a ValueError that tells the user to download it."""
    entry = model_entry(model_id)
    if entry is None:
        raise ValueError(f"The model '{model_id}' is not in the catalog.")
    path = model_path(entry)
    if not is_downloaded(entry):
        raise ValueError(
            f"This filter needs the model '{entry['name']}' ({total_mb(entry):g} MB). Click "
            "Download model in the Properties panel first."
        )
    return path


@functools.lru_cache(maxsize=32)
def _onnx_tensors(path: str, mtime: float) -> dict[str, Any]:
    import onnx  # only with the models extra

    model = onnx.load(path, load_external_data=False)
    weights = {init.name for init in model.graph.initializer}

    def describe(values: Any) -> list[dict[str, Any]]:
        out = []
        for value in values:
            if value.name in weights:
                continue
            tensor = value.type.tensor_type
            shape = [
                d.dim_value if d.HasField("dim_value") else (d.dim_param or "?")
                for d in tensor.shape.dim
            ]
            dtype = onnx.TensorProto.DataType.Name(tensor.elem_type).lower()
            out.append({"name": value.name, "type": dtype, "shape": shape})
        return out

    return {"inputs": describe(model.graph.input), "outputs": describe(model.graph.output)}


def tensors(entry: dict[str, Any], folder: Path | None = None) -> list[dict[str, Any]]:
    """The input and output tensors of each ONNX network file of a downloaded model, read from
    the files themselves. PyTorch and Caffe weights are read from their exported model.onnx.
    TensorFlow files and external weight files are left out."""
    base = model_path(entry, folder).parent
    out = []
    exported = base / "model.onnx"
    if entry.get("format") in ("pytorch", "caffe"):
        if exported.is_file():
            out.append(
                {"file": exported.name, **_onnx_tensors(str(exported), exported.stat().st_mtime)}
            )
        return out
    for item in model_files(entry):
        name = file_name(item["sourceUrl"])
        path = base / name
        if path.suffix != ".onnx" or not path.is_file():
            continue
        out.append({"file": name, **_onnx_tensors(str(path), path.stat().st_mtime)})
    return out
