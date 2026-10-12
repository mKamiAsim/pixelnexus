"""Reference results for the browser filters, made with SciPy, NumPy and scikit-image.

tools/make_fixtures.py writes them to web/tests/fixtures/filters.json. The TypeScript tests
compare the browser filters with these values within the stated tolerance.

Where a second library offers the same operation, this module checks that both libraries agree
before it writes anything. A disagreement stops the script, so a wrong reference never lands.
"""

from __future__ import annotations

import math
from typing import Any, cast

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy import ndimage
from skimage import exposure, filters

FloatArray = NDArray[np.float64]

# PixelNexus border mode -> SciPy ndimage mode. "grid-wrap" is SciPy's exact periodic extension.
SCIPY_MODES = {
    "reflect101": "mirror",
    "reflect": "reflect",
    "replicate": "nearest",
    "constant": "constant",
    "wrap": "grid-wrap",
}

# PixelNexus border mode -> numpy.pad mode, used to check the border index rule itself.
NUMPY_PAD_MODES = {
    "reflect101": "reflect",
    "reflect": "symmetric",
    "replicate": "edge",
    "constant": "constant",
    "wrap": "wrap",
}

BORDERS = list(SCIPY_MODES)
WIDTH = 13
HEIGHT = 10


def input_plane(seed: int) -> FloatArray:
    """A random 8-bit plane with an odd, non-square size."""
    rng = np.random.default_rng(seed)
    return rng.integers(0, 256, size=(HEIGHT, WIDTH)).astype(np.float64)


def _values(array: FloatArray) -> list[float]:
    return [round(float(v), 6) for v in array.reshape(-1)]


# Motion blur kernel. The same definition as web/src/core/filters/linear/motion-blur.ts,
# written again here so that an indexing or orientation mistake in either one shows up.


def _direction(angle_deg: float) -> tuple[float, float]:
    theta = math.radians(angle_deg)
    dx, dy = math.cos(theta), -math.sin(theta)
    return (0.0 if abs(dx) < 1e-12 else dx, 0.0 if abs(dy) < 1e-12 else dy)


def motion_kernel(length: float, angle_deg: float) -> FloatArray:
    dx, dy = _direction(angle_deg)
    reach = length / 2 * max(abs(dx), abs(dy))
    radius = max(0, math.ceil(reach - 0.5))
    size = 2 * radius + 1
    kernel = np.zeros((size, size))
    for j in range(size):
        for i in range(size):
            x, y = i - radius, j - radius
            lo, hi = -length / 2, length / 2
            inside = True
            for d, a, b in ((dx, x - 0.5, x + 0.5), (dy, y - 0.5, y + 0.5)):
                if d == 0:
                    if not a <= 0 <= b:
                        inside = False
                    continue
                ta, tb = a / d, b / d
                lo, hi = max(lo, min(ta, tb)), min(hi, max(ta, tb))
            in_cell = max(0.0, hi - lo) if inside else 0.0
            kernel[j, i] = 0.0 if in_cell < 1e-12 else in_cell
    return np.asarray(kernel / kernel.sum(), dtype=np.float64)


def _unsharp(
    plane: FloatArray,
    sigma: float,
    amount: float,
    threshold: float,
    mode: str,
    truncate: float = 3.0,
) -> Any:
    blurred = ndimage.gaussian_filter(plane, sigma, truncate=truncate, mode=mode)
    detail = plane - blurred
    return np.where(np.abs(detail) < threshold, plane, plane + amount * detail)


def _check_unsharp_against_skimage(plane: FloatArray) -> None:
    """skimage blurs with mode "reflect" and truncate 4, and clips. Compare on that setup."""
    ours = np.clip(_unsharp(plane, 1.5, 1.0, 0.0, "reflect", truncate=4.0), 0, 255)
    theirs = filters.unsharp_mask(plane / 255, radius=1.5, amount=1.0) * 255  # type: ignore[no-untyped-call]
    if not np.allclose(ours, theirs, atol=1e-6):
        raise SystemExit("unsharp mask reference disagrees with skimage.filters.unsharp_mask")


def _check_luma601_against_opencv() -> None:
    rng = np.random.default_rng(7)
    rgb = rng.integers(0, 256, size=(4, 8, 3)).astype(np.uint8)
    ours = rgb.astype(np.float64) @ np.array([0.299, 0.587, 0.114])
    theirs = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float64)
    # OpenCV rounds with fixed-point arithmetic, so allow one level.
    if np.max(np.abs(np.round(ours) - theirs)) > 1:
        raise SystemExit("BT.601 luma reference disagrees with OpenCV")


def _check_laplace_against_scipy(plane: FloatArray) -> None:
    four = ndimage.correlate(plane, np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]]), mode="mirror")
    if not np.allclose(four, ndimage.laplace(plane, mode="mirror")):
        raise SystemExit("4-neighbor Laplacian kernel disagrees with scipy.ndimage.laplace")


def _check_sobel_against_opencv(plane: FloatArray) -> None:
    ours = ndimage.sobel(plane, axis=1, mode="mirror")
    theirs = cv2.Sobel(plane, cv2.CV_64F, 1, 0, ksize=3, borderType=cv2.BORDER_REFLECT_101)
    if not np.allclose(ours, theirs):
        raise SystemExit("SciPy Sobel disagrees with OpenCV Sobel")


def _srgb_to_linear(v: FloatArray) -> FloatArray:
    c = v / 255
    return np.asarray(np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4))


def _linear_to_srgb(v: FloatArray) -> FloatArray:
    c = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
    return np.asarray(c * 255)


def filter_cases() -> dict[str, Any]:
    plane = input_plane(20261012)
    _check_unsharp_against_skimage(plane)
    _check_luma601_against_opencv()
    _check_laplace_against_scipy(plane)
    _check_sobel_against_opencv(plane)

    cases: list[dict[str, Any]] = []

    def add(filter_id: str, params: dict[str, Any], output: FloatArray, source: str) -> None:
        cases.append(
            {"filter": filter_id, "params": params, "source": source, "output": _values(output)}
        )

    for border in BORDERS:
        mode = SCIPY_MODES[border]
        for size in (3, 5):
            add(
                "box",
                {"size": size, "border": border},
                ndimage.uniform_filter(plane, size, mode=mode),
                "scipy.ndimage.uniform_filter",
            )
        for sigma, truncate in ((1.0, 3.0), (2.2, 3.0), (0.7, 4.0)):
            add(
                "gaussian",
                {"sigma": sigma, "truncate": truncate, "border": border},
                ndimage.gaussian_filter(plane, sigma, truncate=truncate, mode=mode),
                "scipy.ndimage.gaussian_filter",
            )
        for size in (3, 5, 7):
            add(
                "median",
                {"size": size, "border": border},
                ndimage.median_filter(plane, size=size, mode=mode),
                "scipy.ndimage.median_filter",
            )
        gx = ndimage.sobel(plane, axis=1, mode=mode)
        gy = ndimage.sobel(plane, axis=0, mode=mode)
        sobel_outputs = {
            ("gx", "l2"): gx,
            ("gy", "l2"): gy,
            ("magnitude", "l2"): np.hypot(gx, gy),
            ("magnitude", "l1"): np.abs(gx) + np.abs(gy),
            ("direction", "l2"): np.degrees(np.arctan2(gy, gx)),
        }
        for (output, norm), values in sobel_outputs.items():
            add(
                "sobel",
                {"output": output, "norm": norm, "border": border},
                values,
                "scipy.ndimage.sobel",
            )

    for border in ("reflect101", "constant", "wrap"):
        mode = SCIPY_MODES[border]
        for neighbors, kernel in (
            ("4", np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float64)),
            ("8", np.array([[1, 1, 1], [1, -8, 1], [1, 1, 1]], dtype=np.float64)),
        ):
            for sign, factor in (("negative-center", 1.0), ("positive-center", -1.0)):
                add(
                    "laplacian",
                    {"neighbors": neighbors, "sign": sign, "border": border},
                    ndimage.correlate(plane, factor * kernel, mode=mode),
                    "scipy.ndimage.correlate",
                )
        for length, angle in ((9, 0), (5, 90), (7, 30), (10.5, 135), (4, 0)):
            add(
                "motion-blur",
                {"length": length, "angle": angle, "border": border},
                ndimage.correlate(plane, motion_kernel(length, angle), mode=mode),
                "scipy.ndimage.correlate with the motion kernel",
            )
        for sigma, amount, threshold in ((1.5, 1.0, 0.0), (2.0, 0.6, 10.0)):
            add(
                "unsharp-mask",
                {"sigma": sigma, "amount": amount, "threshold": threshold, "border": border},
                _unsharp(plane, sigma, amount, threshold, mode),
                "scipy.ndimage.gaussian_filter",
            )

    levels = np.arange(256, dtype=np.float64)
    gamma_cases = [
        {"gamma": g, "output": _values(exposure.adjust_gamma(levels / 255, g) * 255)}  # type: ignore[no-untyped-call]
        for g in (0.45, 1.0, 2.2)
    ]

    rng = np.random.default_rng(11)
    rgb = rng.integers(0, 256, size=(24, 3)).astype(np.float64)
    linear = _srgb_to_linear(rgb) @ np.array([0.2126, 0.7152, 0.0722])
    grayscale = {
        "rgb": rgb.astype(int).reshape(-1).tolist(),
        "luma709": _values(rgb @ np.array([0.2126, 0.7152, 0.0722])),
        "luma601": _values(rgb @ np.array([0.299, 0.587, 0.114])),
        "luminance": _values(_linear_to_srgb(linear)),
    }

    borders = {}
    for border, pad_mode in NUMPY_PAD_MODES.items():
        for n in (1, 2, 5):
            if pad_mode == "constant":
                padded = np.pad(np.arange(n), 7, mode="constant", constant_values=-1)
            else:
                padded = np.pad(np.arange(n), 7, mode=cast(Any, pad_mode))
            borders[f"{border}-{n}"] = padded.tolist()

    motion_kernels = [
        {"length": length, "angle": angle, "rows": motion_kernel(length, angle).round(12).tolist()}
        for length, angle in ((9, 0), (4, 0), (5, 90), (7, 30), (10.5, 135), (3, 45))
    ]

    return {
        "generator": "tools/make_fixtures.py",
        "description": "Reference outputs for the browser filters on one random 8-bit plane.",
        "tolerance": 1e-4,
        "width": WIDTH,
        "height": HEIGHT,
        "input": plane.astype(int).reshape(-1).tolist(),
        "cases": cases,
        "gamma": gamma_cases,
        "grayscale": grayscale,
        "borders": {"pad": 7, "constant": -1, "tables": borders},
        "motionKernels": motion_kernels,
    }
