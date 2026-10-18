"""Reference results for the rank and mean filters of Phase 5b.

tools/fixtures_filters.py adds these cases to web/tests/fixtures/filters.json. Each reference is
written from its textbook definition with NumPy windows, and checked against SciPy, scikit-image
or a second definition before it is used. A disagreement stops the script.
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from numpy.typing import NDArray
from scipy import ndimage, stats
from skimage.filters import rank

FloatArray = NDArray[np.float64]
Add = Callable[..., None]

# PixelNexus border mode -> numpy.pad mode. The constant mode pads with 0.
PAD_MODES = {
    "reflect101": "reflect",
    "reflect": "symmetric",
    "replicate": "edge",
    "constant": "constant",
    "wrap": "wrap",
}
SCIPY_MODES = {
    "reflect101": "mirror",
    "reflect": "reflect",
    "replicate": "nearest",
    "constant": "constant",
    "wrap": "grid-wrap",
}


def windows(plane: FloatArray, rows: int, cols: int, border: str) -> FloatArray:
    """Every rows x cols window of the padded plane, shape (H, W, rows, cols)."""
    pad = ((rows // 2, rows // 2), (cols // 2, cols // 2))
    padded = np.pad(plane, pad, mode=PAD_MODES[border])  # type: ignore[call-overload]
    return np.asarray(sliding_window_view(padded, (rows, cols)), dtype=np.float64)


def flat_windows(plane: FloatArray, size: int, border: str) -> FloatArray:
    w = windows(plane, size, size, border)
    return w.reshape(*w.shape[:2], -1)


def _fail(message: str) -> None:
    raise SystemExit(message)


def geometric_mean(plane: FloatArray, size: int, border: str) -> FloatArray:
    w = flat_windows(plane, size, border)
    with np.errstate(divide="ignore"):
        logs = np.log(w)
    return np.asarray(np.exp(logs.mean(axis=-1)), dtype=np.float64)


def harmonic_mean(plane: FloatArray, size: int, border: str) -> FloatArray:
    w = flat_windows(plane, size, border)
    with np.errstate(divide="ignore"):
        inverse = (1.0 / w).sum(axis=-1)
    return np.asarray(w.shape[-1] / inverse, dtype=np.float64)


def contraharmonic_mean(plane: FloatArray, size: int, order: float, border: str) -> FloatArray:
    w = flat_windows(plane, size, border)
    has_zero = (w == 0).any(axis=-1)
    with np.errstate(divide="ignore", invalid="ignore"):
        top = np.where(w > 0, w ** (order + 1), 0.0 if order + 1 != 0 else 1.0).sum(axis=-1)
        bottom = np.where(w > 0, w**order, 0.0 if order != 0 else 1.0).sum(axis=-1)
        out = np.where(bottom > 0, top / np.where(bottom > 0, bottom, 1), 0.0)
    if order < 0:
        out = np.where(has_zero, 0.0, out)
    return np.asarray(out, dtype=np.float64)


def alpha_trimmed_mean(plane: FloatArray, size: int, trim: int, border: str) -> FloatArray:
    w = np.sort(flat_windows(plane, size, border), axis=-1)
    n = w.shape[-1]
    return np.asarray(w[..., trim : n - trim].mean(axis=-1), dtype=np.float64)


def mode(plane: FloatArray, size: int, border: str) -> FloatArray:
    w = flat_windows(plane, size, border).astype(np.int64)
    out = np.zeros(w.shape[:2])
    for y in range(w.shape[0]):
        for x in range(w.shape[1]):
            # argmax returns the first maximum, so the smallest value wins a tie.
            out[y, x] = np.bincount(w[y, x], minlength=256).argmax()
    return out


def weighted_median(plane: FloatArray, weights: FloatArray, border: str) -> FloatArray:
    w = windows(plane, weights.shape[0], weights.shape[1], border)
    flat_w = weights.reshape(-1)
    total = flat_w.sum()
    out = np.zeros(w.shape[:2])
    for y in range(w.shape[0]):
        for x in range(w.shape[1]):
            values = w[y, x].reshape(-1)
            order = np.argsort(values, kind="stable")
            running = np.cumsum(flat_w[order])
            out[y, x] = values[order][np.argmax(running >= total / 2 - 1e-9)]
    return out


def parse_weights(text: str) -> FloatArray:
    rows = [line.replace(",", " ").split() for line in text.replace("\n", ";").split(";")]
    return np.array([[float(v) for v in row] for row in rows if row], dtype=np.float64)


def _cross_checks(plane: FloatArray, zplane: FloatArray) -> None:
    for border in PAD_MODES:
        mode_name = SCIPY_MODES[border]
        for size in (3, 5):
            w = flat_windows(plane, size, border)
            if not np.array_equal(
                w.min(axis=-1), ndimage.minimum_filter(plane, size, mode=mode_name)
            ):
                _fail(f"window min disagrees with scipy.ndimage.minimum_filter ({border})")
            if not np.allclose(
                alpha_trimmed_mean(plane, size, 0, border),
                ndimage.uniform_filter(plane, size, mode=mode_name),
            ):
                _fail("alpha-trimmed mean with no trim disagrees with the box mean")
            middle = (size * size - 1) // 2
            if not np.allclose(
                alpha_trimmed_mean(plane, size, middle, border),
                ndimage.median_filter(plane, size, mode=mode_name),
            ):
                _fail("alpha-trimmed mean with the most trim disagrees with the median")
            ones = np.ones((size, size))
            if not np.array_equal(
                weighted_median(plane, ones, border),
                ndimage.median_filter(plane, size, mode=mode_name),
            ):
                _fail("weighted median with equal weights disagrees with the median")
            if not np.allclose(
                contraharmonic_mean(plane, size, 0.0, border),
                ndimage.uniform_filter(plane, size, mode=mode_name),
            ):
                _fail("contraharmonic mean with Q = 0 disagrees with the box mean")
            if not np.allclose(
                contraharmonic_mean(zplane, size, -1.0, border), harmonic_mean(zplane, size, border)
            ):
                _fail("contraharmonic mean with Q = -1 disagrees with the harmonic mean")

    # SciPy's own means on windows without zeros.
    w = flat_windows(plane + 1, 3, "reflect101")
    if not np.allclose(geometric_mean(plane + 1, 3, "reflect101"), stats.gmean(w, axis=-1)):
        _fail("geometric mean disagrees with scipy.stats.gmean")
    if not np.allclose(harmonic_mean(plane + 1, 3, "reflect101"), stats.hmean(w, axis=-1)):
        _fail("harmonic mean disagrees with scipy.stats.hmean")

    # Whole weights with an odd total: the median of the list with repeats.
    weights = parse_weights("1 1 1; 1 3 1; 1 1 1")
    wins = windows(plane, 3, 3, "reflect101")
    repeated = np.array(
        [
            [
                np.median(np.repeat(wins[y, x].reshape(-1), weights.reshape(-1).astype(int)))
                for x in range(wins.shape[1])
            ]
            for y in range(wins.shape[0])
        ]
    )
    if not np.array_equal(weighted_median(plane, weights, "reflect101"), repeated):
        _fail("weighted median disagrees with the median of repeated values")

    # skimage's modal filter counts only pixels inside the image, so compare away from the edge.
    for size in (3, 5):
        r = size // 2
        theirs = rank.modal(plane.astype(np.uint8), np.ones((size, size), dtype=np.uint8))  # type: ignore[no-untyped-call]
        ours = mode(plane, size, "reflect101")
        if not np.array_equal(ours[r:-r, r:-r], theirs[r:-r, r:-r]):
            _fail("mode filter disagrees with skimage.filters.rank.modal")


def add_rank_cases(plane: FloatArray, add: Add) -> dict[str, FloatArray]:
    """Add the rank and mean filter cases. `plane` holds whole values from 0 to 255.

    Returns the extra input planes that some cases name with `input`.
    """
    # A copy with a few zeros, so the zero rules of the means are tested.
    zplane = plane.copy()
    zplane[2, 3] = 0
    zplane[7, 9] = 0
    zplane[0, 0] = 0
    _cross_checks(plane, zplane)

    for border in PAD_MODES:
        scipy_mode = SCIPY_MODES[border]
        for size in (3, 5):
            low = ndimage.minimum_filter(plane, size, mode=scipy_mode)
            high = ndimage.maximum_filter(plane, size, mode=scipy_mode)
            params = {"size": size, "border": border}
            add("min", params, low, "scipy.ndimage.minimum_filter")
            add("max", params, high, "scipy.ndimage.maximum_filter")
            add("midpoint", params, (low + high) / 2, "scipy.ndimage minimum and maximum filters")
            add(
                "mode",
                params,
                mode(plane, size, border),
                "NumPy windows, checked with skimage.filters.rank.modal",
            )
        for size, ranks in ((3, (1, 4, 9)), (5, (7, 20))):
            for k in ranks:
                add(
                    "rank-order",
                    {"size": size, "by": "rank", "rank": k, "border": border},
                    ndimage.rank_filter(plane, k - 1, size, mode=scipy_mode),
                    "scipy.ndimage.rank_filter",
                )
        for size, p in ((3, 25.0), (5, 90.0), (3, 100.0), (5, 0.0)):
            add(
                "rank-order",
                {"size": size, "by": "percentile", "percentile": p, "border": border},
                ndimage.percentile_filter(plane, p, size, mode=scipy_mode),
                "scipy.ndimage.percentile_filter",
            )
        for size, trim in ((3, 1), (3, 2), (5, 5)):
            add(
                "alpha-trimmed-mean",
                {"size": size, "trim": trim, "border": border},
                alpha_trimmed_mean(plane, size, trim, border),
                "NumPy windows, checked with the box mean and the median",
            )

    for border in ("reflect101", "constant", "wrap"):
        for size in (3, 5):
            params = {"size": size, "border": border}
            add(
                "geometric-mean",
                params,
                geometric_mean(zplane, size, border),
                "NumPy windows, checked with scipy.stats.gmean",
                "zeros",
            )
            add(
                "harmonic-mean",
                params,
                harmonic_mean(zplane, size, border),
                "NumPy windows, checked with scipy.stats.hmean",
                "zeros",
            )
            for order in (1.5, -1.5, 0.0, 2.5):
                add(
                    "contraharmonic-mean",
                    {"size": size, "order": order, "border": border},
                    contraharmonic_mean(zplane, size, order, border),
                    "NumPy windows, checked with the box and harmonic means",
                    "zeros",
                )
        for text in (
            "1 1 1; 1 3 1; 1 1 1",
            "0 1 0; 1 1 1; 0 1 0",
            "1 2 3 2 1",
            "0.5 1 0.5; 1 2 1; 0.5 1 0.5",
        ):
            add(
                "weighted-median",
                {"weights": text, "border": border},
                weighted_median(plane, parse_weights(text), border),
                "NumPy windows, checked with the median of repeated values",
            )
    return {"zeros": zplane}
