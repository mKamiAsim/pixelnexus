"""Reference results for the impulse noise filters of Phase 5b.

tools/fixtures_filters.py adds the one-plane cases to web/tests/fixtures/filters.json, and
writes the color cases (vector median, dead pixels, MAD outliers) to its "color" section. Each
reference follows its published definition with NumPy windows and is checked against SciPy
before it is used.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage, stats

from fixtures_color import add_color_adjust_cases, add_white_balance_cases
from fixtures_edge import add_edge_color_cases
from fixtures_rank import PAD_MODES, SCIPY_MODES, flat_windows, windows

FloatArray = NDArray[np.float64]
Add = Callable[..., None]

# 1 / Phi^-1(3/4), as in scipy.stats.median_abs_deviation(scale="normal").
MAD_SCALE = 1.482602218505602


def _fail(message: str) -> None:
    raise SystemExit(message)


def impulse_plane(plane: FloatArray) -> FloatArray:
    """The plane with salt and pepper pixels, some of them next to each other."""
    out = plane.copy()
    for y, x, v in (
        (1, 2, 255),
        (4, 6, 0),
        (4, 7, 0),
        (7, 3, 255),
        (8, 10, 0),
        (0, 12, 255),
        (5, 5, 255),
    ):
        out[y, x] = v
    return out


def adaptive_median(plane: FloatArray, max_size: int, border: str) -> FloatArray:
    """Gonzalez and Woods, section 5.3: stage A grows the window, stage B keeps or replaces."""
    sizes = list(range(3, max_size + 1, 2))
    stats_by_size = []
    for size in sizes:
        w = flat_windows(plane, size, border)
        stats_by_size.append((w.min(axis=-1), np.median(w, axis=-1), w.max(axis=-1)))
    out = np.zeros_like(plane)
    for y in range(plane.shape[0]):
        for x in range(plane.shape[1]):
            z = plane[y, x]
            value = stats_by_size[-1][1][y, x]
            for lo, med, hi in stats_by_size:
                if lo[y, x] < med[y, x] < hi[y, x]:
                    value = z if lo[y, x] < z < hi[y, x] else med[y, x]
                    break
            out[y, x] = value
    return out


def switching_median(plane: FloatArray, size: int, threshold: float, mode: str) -> FloatArray:
    median = ndimage.median_filter(plane, size, mode=mode)
    return np.asarray(np.where(np.abs(plane - median) > threshold, median, plane), dtype=np.float64)


def _check_plane_filters(plane: FloatArray) -> None:
    for border, mode in SCIPY_MODES.items():
        median = ndimage.median_filter(plane, 3, mode=mode)
        if not np.array_equal(switching_median(plane, 3, 0, mode), median):
            _fail("switching median with T = 0 disagrees with the median")
        if not np.array_equal(switching_median(plane, 3, 255, mode), plane):
            _fail("switching median with T = 255 changes the image")
        # With no impulses (all values strictly inside every window range) stage B keeps the pixel.
        smooth = np.add.outer(np.arange(plane.shape[0]), 3 * np.arange(plane.shape[1])).astype(
            float
        )
        if not np.array_equal(adaptive_median(smooth, 3, border)[1:-1, 1:-1], smooth[1:-1, 1:-1]):
            _fail("adaptive median changes a plane without impulses")


def add_impulse_cases(plane: FloatArray, add: Add) -> dict[str, FloatArray]:
    """Add the adaptive and switching median cases. Returns their extra input."""
    noisy = impulse_plane(plane)
    _check_plane_filters(noisy)
    for border, mode in SCIPY_MODES.items():
        for max_size in (3, 5, 7):
            add(
                "adaptive-median",
                {"maxSize": max_size, "border": border},
                adaptive_median(noisy, max_size, border),
                "NumPy windows, the two stages of Gonzalez and Woods",
                "impulses",
            )
        for size, threshold in ((3, 40), (3, 0), (5, 80)):
            add(
                "switching-median",
                {"size": size, "threshold": threshold, "border": border},
                switching_median(noisy, size, threshold, mode),
                "scipy.ndimage.median_filter with the switching rule",
                "impulses",
            )
    return {"impulses": noisy}


# Color filters ----------------------------------------------------------------------------


def color_input() -> FloatArray:
    """A 10 x 13 RGB image with impulses in one channel and in all three."""
    rng = np.random.default_rng(20261013)
    image = rng.integers(60, 200, size=(10, 13, 3)).astype(np.float64)
    image[2, 4] = (255, 255, 255)
    image[6, 8] = (0, 0, 0)
    image[3, 10, 1] = 255
    image[8, 2, 0] = 0
    image[0, 0] = (250, 10, 240)
    return image


def vector_median(image: FloatArray, size: int, norm: str, border: str) -> FloatArray:
    h, w, _ = image.shape
    win = np.stack([windows(image[..., c], size, size, border) for c in range(3)], axis=-1)
    out = np.zeros_like(image)
    for y in range(h):
        for x in range(w):
            vectors = win[y, x].reshape(-1, 3)
            diff = vectors[:, None, :] - vectors[None, :, :]
            d = np.abs(diff).sum(-1) if norm == "l1" else np.sqrt((diff**2).sum(-1))
            sums = d.sum(axis=1)
            # The first index with the smallest sum, within float noise.
            best = int(np.flatnonzero(sums <= sums.min() + 1e-9)[0])
            out[y, x] = vectors[best]
    return out


def neighbor_median(plane: FloatArray, size: int, border: str) -> FloatArray:
    ring = np.ones((size, size), dtype=bool)
    ring[size // 2, size // 2] = False
    w = windows(plane, size, size, border)
    return np.asarray(np.median(w[..., ring], axis=-1), dtype=np.float64)


def dead_pixel(
    image: FloatArray, size: int, threshold: float, output: str, border: str
) -> FloatArray:
    medians = np.stack([neighbor_median(image[..., c], size, border) for c in range(3)], axis=-1)
    bad = (np.abs(image - medians) > threshold).any(axis=-1)
    if output == "mask":
        return np.repeat(np.where(bad, 255.0, 0.0)[..., None], 3, axis=-1)
    return np.asarray(np.where(bad[..., None], medians, image), dtype=np.float64)


def mad_outlier(image: FloatArray, size: int, t: float, output: str, border: str) -> FloatArray:
    outlier = np.zeros(image.shape, dtype=bool)
    medians = np.zeros_like(image)
    for c in range(3):
        w = flat_windows(image[..., c], size, border)
        m = np.median(w, axis=-1)
        s = MAD_SCALE * np.median(np.abs(w - m[..., None]), axis=-1)
        medians[..., c] = m
        outlier[..., c] = np.abs(image[..., c] - m) > t * s
    if output == "mark":
        return np.repeat(np.where(outlier.any(axis=-1), 255.0, 0.0)[..., None], 3, axis=-1)
    return np.asarray(np.where(outlier, medians, image), dtype=np.float64)


def _check_color_filters(image: FloatArray) -> None:
    gray = np.repeat(image[..., :1], 3, axis=-1)
    for border, mode in SCIPY_MODES.items():
        theirs = ndimage.median_filter(gray[..., 0], 3, mode=mode)
        for norm in ("l1", "l2"):
            if not np.array_equal(vector_median(gray, 3, norm, border)[..., 0], theirs):
                _fail("vector median of a gray image disagrees with the median")
        ring = np.ones((3, 3), dtype=bool)
        ring[1, 1] = False
        generic = ndimage.generic_filter(image[..., 1], np.median, footprint=ring, mode=mode)
        if not np.allclose(neighbor_median(image[..., 1], 3, border), generic):
            _fail("neighbor median disagrees with scipy.ndimage.generic_filter")
    w = flat_windows(image[..., 2], 5, "reflect101")
    ours = MAD_SCALE * np.median(np.abs(w - np.median(w, axis=-1)[..., None]), axis=-1)
    if not np.allclose(ours, stats.median_abs_deviation(w, axis=-1, scale="normal")):
        _fail("scaled MAD disagrees with scipy.stats.median_abs_deviation")


def _rgb_values(image: FloatArray) -> list[float]:
    return [round(float(v), 6) for v in image.reshape(-1)]


def color_cases() -> dict[str, Any]:
    image = color_input()
    _check_color_filters(image)
    cases: list[dict[str, Any]] = []

    def add(
        filter_id: str,
        params: dict[str, Any],
        output: FloatArray,
        source: str,
        guided: bool = False,
    ) -> None:
        case: dict[str, Any] = {
            "filter": filter_id,
            "params": params,
            "source": source,
            "output": _rgb_values(output),
        }
        if guided:
            case["guide"] = True
        cases.append(case)

    for border in PAD_MODES:
        for size, norm in ((3, "l2"), (3, "l1"), (5, "l2")):
            add(
                "vector-median",
                {"size": size, "norm": norm, "border": border},
                vector_median(image, size, norm, border),
                "NumPy windows, checked with scipy.ndimage.median_filter on a gray image",
            )
        for size, threshold, output in ((3, 50, "repaired"), (3, 50, "mask"), (5, 30, "repaired")):
            add(
                "dead-pixel",
                {"size": size, "threshold": threshold, "output": output, "border": border},
                dead_pixel(image, size, threshold, output, border),
                "numpy.median of the neighbors, checked with scipy.ndimage.generic_filter",
            )
        for size, t, output in ((3, 3.0, "repair"), (5, 3.0, "repair"), (5, 2.0, "mark")):
            add(
                "mad-outlier",
                {"size": size, "t": t, "output": output, "border": border},
                mad_outlier(image, size, t, output, border),
                "NumPy windows, checked with scipy.stats.median_abs_deviation",
            )
    guide = add_edge_color_cases(image, add)
    add_color_adjust_cases(image, add)
    add_white_balance_cases(image, add)
    return {
        "guide": guide.astype(int).reshape(-1).tolist(),
        "width": image.shape[1],
        "height": image.shape[0],
        "input": image.astype(int).reshape(-1).tolist(),
        "cases": cases,
    }
