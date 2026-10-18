"""ONNX Runtime for the engine's AI models.

The engine never depends on CUDA. ONNX Runtime itself is optional: the "models" extra installs
the CPU build, which runs on every platform, and the "cuda" extra the GPU build with NVIDIA's
libraries. Without either, the engine runs and model filters say how to add one.

PIXELNEXUS_DEVICE chooses the device: "auto" (the default), "cpu" or "cuda". With "auto", the
engine uses CUDA when the runtime offers it and a tiny test model really runs on it, and the CPU
otherwise. A CUDA session can open and still fail on its first run, for example when cuDNN is
missing, so the check runs the model. With "cuda", a failed check is reported, not hidden.

Each job process makes its own choice once, since a GPU context belongs to one process.
"""

from __future__ import annotations

import base64
import contextlib
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from pixelnexus_engine.probe_model import PROBE_ONNX_BASE64

PREFERENCES = ("auto", "cpu", "cuda")
CPU = "CPUExecutionProvider"
CUDA = "CUDAExecutionProvider"
INSTALL_HINT = (
    "The engine has no model runtime. Install one with `uv sync --extra cpu`, or "
    "`uv sync --extra cuda` on a computer with an NVIDIA GPU, then restart the engine."
)


@dataclass(frozen=True)
class Device:
    """Where models run in this process."""

    name: str  # "cuda", "cpu" or "none"
    providers: tuple[str, ...]
    note: str


def runtime() -> Any | None:
    """The onnxruntime module, or None when it is not installed."""
    try:
        import onnxruntime

        return onnxruntime
    except ImportError:
        return None


def preference() -> str:
    value = os.environ.get("PIXELNEXUS_DEVICE", "auto").strip().lower()
    return value if value in PREFERENCES else "auto"


def _probe(ort: Any, providers: list[str]) -> str | None:
    """Run the probe model with these providers. Returns an error message, or None."""
    try:
        session = ort.InferenceSession(base64.b64decode(PROBE_ONNX_BASE64), providers=providers)
        if session.get_providers()[0] != providers[0]:
            return f"{providers[0]} could not start."
        x = np.ones((1, 3, 8, 8), np.float32)
        session.run(None, {"x": x})
        return None
    except Exception as error:
        # Any failure means the device does not work.
        return str(error).splitlines()[0][:300]


@lru_cache(maxsize=1)
def device() -> Device:
    """Choose the device once per process."""
    ort = runtime()
    if ort is None:
        return Device("none", (), INSTALL_HINT)
    wanted = preference()
    available = set(ort.get_available_providers())
    if wanted != "cpu" and CUDA in available:
        # The GPU build can load the NVIDIA libraries installed as Python packages.
        preload = getattr(ort, "preload_dlls", None)
        if preload is not None:
            # The probe below reports anything that is still missing.
            with contextlib.suppress(Exception):
                preload()
        error = _probe(ort, [CUDA, CPU])
        if error is None:
            return Device("cuda", (CUDA, CPU), "Models run on the NVIDIA GPU with CUDA.")
        reason = f"CUDA did not work, so models run on the CPU. {error}"
        if wanted == "cuda":
            return Device(
                "cpu", (CPU,), f"PIXELNEXUS_DEVICE is cuda, but {reason[0].lower()}{reason[1:]}"
            )
        return Device("cpu", (CPU,), reason)
    if wanted == "cuda":
        return Device(
            "cpu",
            (CPU,),
            "PIXELNEXUS_DEVICE is cuda, but this ONNX Runtime has no CUDA support, so models "
            "run on the CPU. Install it with `uv sync --extra cuda`.",
        )
    return Device("cpu", (CPU,), "Models run on the CPU.")


def describe() -> dict[str, Any]:
    """What /info reports about the model runtime."""
    ort = runtime()
    chosen = device()
    return {
        "runtime": None if ort is None else f"onnxruntime {ort.__version__}",
        "preference": preference(),
        "device": chosen.name,
        "providers": list(chosen.providers),
        "note": chosen.note,
    }


@lru_cache(maxsize=8)
def _session(path: str, mtime: float) -> Any:
    ort = runtime()
    if ort is None:
        raise ValueError(INSTALL_HINT)
    options = ort.SessionOptions()
    options.log_severity_level = 3
    return ort.InferenceSession(path, sess_options=options, providers=list(device().providers))


def session(path: Path) -> Any:
    """An ONNX Runtime session for a model file, cached while the file is unchanged."""
    return _session(str(path), path.stat().st_mtime)


def relaxed_model(path: Path) -> bytes:
    """The model with its image height and width made free, so it runs at any size.

    Some published models declare a fixed size, such as 224 x 224, although they are fully
    convolutional. The downloaded file stays unchanged. Initializers that are also listed as
    graph inputs are dropped from the inputs, as old exporters wrote them.
    """
    import onnx

    model = onnx.load(str(path))
    initializers = {i.name for i in model.graph.initializer}
    inputs = [i for i in model.graph.input if i.name not in initializers]
    del model.graph.input[:]
    model.graph.input.extend(inputs)
    for value in [*model.graph.input, *model.graph.output]:
        dims = value.type.tensor_type.shape.dim
        for dim, name in zip(dims[2:], ("height", "width"), strict=False):
            dim.ClearField("dim_value")
            dim.dim_param = name
    data: bytes = model.SerializeToString()
    return data


@lru_cache(maxsize=8)
def _relaxed_session(path: str, mtime: float) -> Any:
    ort = runtime()
    if ort is None:
        raise ValueError(INSTALL_HINT)
    options = ort.SessionOptions()
    options.log_severity_level = 3
    return ort.InferenceSession(
        relaxed_model(Path(path)), sess_options=options, providers=list(device().providers)
    )


def relaxed_session(path: Path) -> Any:
    """A session for a model whose declared image size is made free, see relaxed_model."""
    return _relaxed_session(str(path), path.stat().st_mtime)
