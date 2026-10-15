"""Reference results for the geometric distortions of Phase 5f part 10.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. Each
mapping is written again here with NumPy, and the source is read with
scipy.ndimage.map_coordinates at order 1, bilinear, so the sampler is not shared with the browser
code. Before the cases are written, the swirl is checked against skimage.transform.swirl with the
same center.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage
from skimage import transform

FloatArray = NDArray[np.float64]
Add = Callable[..., None]

# PixelNexus border mode -> map_coordinates mode, with zeros outside for the constant border.
SAMPLE_MODES = {
    "reflect101": "mirror",
    "reflect": "reflect",
    "replicate": "nearest",
    "constant": "grid-constant",
    "wrap": "grid-wrap",
}
# PixelNexus border mode -> scikit-image warp mode.
SKIMAGE_MODES = {
    "reflect101": "reflect",
    "reflect": "symmetric",
    "replicate": "edge",
    "constant": "constant",
    "wrap": "wrap",
}


def _grid(plane: FloatArray) -> tuple[FloatArray, FloatArray, float, float]:
    h, w = plane.shape
    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    return x, y, (w - 1) / 2, (h - 1) / 2


def _sample(plane: FloatArray, xs: Any, ys: Any, border: str) -> FloatArray:
    coords = np.array([ys.ravel(), xs.ravel()])
    out = ndimage.map_coordinates(plane, coords, order=1, mode=SAMPLE_MODES[border], cval=0.0)
    return np.asarray(out.reshape(plane.shape))


def _radial(
    plane: FloatArray, source: Callable[[FloatArray], FloatArray], border: str
) -> FloatArray:
    x, y, cx, cy = _grid(plane)
    h, w = plane.shape
    big_r = math.hypot(w, h) / 2
    dx, dy = x - cx, y - cy
    r = np.hypot(dx, dy) / big_r
    safe = np.where(r > 0, r, 1.0)
    scale = np.where(r > 0, source(safe) / safe, 1.0)
    return _sample(plane, cx + dx * scale, cy + dy * scale, border)


def fisheye(plane: FloatArray, fov: float, border: str) -> FloatArray:
    half = math.radians(min(170.0, max(1.0, fov))) / 2
    return _radial(plane, lambda r: np.tan(r * half) / math.tan(half), border)


def polynomial(plane: FloatArray, k: float, fit: bool, border: str) -> FloatArray:
    scale = 1 + k if fit else 1.0
    return _radial(plane, lambda r: r * (1 + k * r * r) / scale, border)


def _swirl_coords(
    plane: FloatArray, strength: float, radius: float, rotation: float
) -> tuple[Any, Any]:
    x, y, cx, cy = _grid(plane)
    rho = np.hypot(x - cx, y - cy)
    decay = radius / 5 * math.log(2)
    theta = math.radians(rotation) + strength * np.exp(-rho / decay) + np.arctan2(y - cy, x - cx)
    return cx + rho * np.cos(theta), cy + rho * np.sin(theta)


def swirl(
    plane: FloatArray, strength: float, radius: float, rotation: float, border: str
) -> FloatArray:
    xs, ys = _swirl_coords(plane, strength, radius, rotation)
    return _sample(plane, xs, ys, border)


def _check_swirl_against_skimage(plane: FloatArray) -> None:
    h, w = plane.shape
    for border in ("reflect101", "replicate", "constant"):
        ours = swirl(plane, 2.5, 6.0, 20.0, border)
        theirs = transform.swirl(  # type: ignore[no-untyped-call]
            plane,
            center=((w - 1) / 2, (h - 1) / 2),
            strength=2.5,
            radius=6.0,
            rotation=math.radians(20.0),
            order=1,
            mode=SKIMAGE_MODES[border],
            cval=0.0,
            preserve_range=True,
        )
        if not np.allclose(ours, theirs, atol=1e-9):
            raise SystemExit(f"swirl disagrees with skimage.transform.swirl, {border}")


def ripple(
    plane: FloatArray, amplitude: float, wavelength: float, phase: float, border: str
) -> FloatArray:
    x, y, cx, cy = _grid(plane)
    dx, dy = x - cx, y - cy
    rho = np.hypot(dx, dy)
    safe = np.where(rho > 0, rho, 1.0)
    moved = rho + amplitude * np.sin(2 * math.pi * rho / wavelength + math.radians(phase))
    scale = np.where(rho > 0, moved / safe, 1.0)
    return _sample(plane, cx + dx * scale, cy + dy * scale, border)


def wave(
    plane: FloatArray,
    amplitude: float,
    wavelength: float,
    phase: float,
    direction: str,
    border: str,
) -> FloatArray:
    x, y, _, _ = _grid(plane)

    def shift(t: FloatArray) -> FloatArray:
        return np.asarray(amplitude * np.sin(2 * math.pi * t / wavelength + math.radians(phase)))

    xs = x if direction == "vertical" else x + shift(y)
    ys = y if direction == "horizontal" else y + shift(x)
    return _sample(plane, xs, ys, border)


def add_distort_cases(plane: FloatArray, add: Add) -> None:
    _check_swirl_against_skimage(plane)
    source = "NumPy mappings read with scipy.ndimage.map_coordinates, order 1"
    for fov, border in ((120.0, "reflect101"), (60.0, "replicate"), (165.0, "constant")):
        add("fisheye", {"fov": fov, "border": border}, fisheye(plane, fov, border), source)
    for k, fit, border in (
        (0.3, True, "reflect101"),
        (0.8, False, "reflect"),
        (0.05, True, "wrap"),
    ):
        add(
            "barrel",
            {"strength": k, "fit": fit, "border": border},
            polynomial(plane, k, fit, border),
            source,
        )
    for k, fit, border in ((0.15, True, "reflect101"), (0.3, False, "constant")):
        add(
            "pincushion",
            {"strength": k, "fit": fit, "border": border},
            polynomial(plane, -k, fit, border),
            source,
        )
    for strength, radius, rotation, border in (
        (3.0, 8.0, 0.0, "reflect101"),
        (-1.5, 20.0, 45.0, "wrap"),
    ):
        add(
            "swirl",
            {"strength": strength, "radius": radius, "rotation": rotation, "border": border},
            swirl(plane, strength, radius, rotation, border),
            source + ", checked against skimage.transform.swirl",
        )
    for amplitude, wavelength, phase, border in (
        (1.5, 4.0, 0.0, "reflect101"),
        (3.0, 7.5, 90.0, "replicate"),
    ):
        add(
            "ripple",
            {"amplitude": amplitude, "wavelength": wavelength, "phase": phase, "border": border},
            ripple(plane, amplitude, wavelength, phase, border),
            source,
        )
    for amplitude, wavelength, phase, direction, border in (
        (2.0, 6.0, 0.0, "horizontal", "reflect101"),
        (1.5, 5.0, 30.0, "vertical", "constant"),
        (2.5, 8.0, 0.0, "both", "wrap"),
    ):
        add(
            "wave",
            {
                "amplitude": amplitude,
                "wavelength": wavelength,
                "phase": phase,
                "direction": direction,
                "border": border,
            },
            wave(plane, amplitude, wavelength, phase, direction, border),
            source,
        )
