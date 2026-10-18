"""Reference results for hysteresis thresholding and the Canny edge detector of Phase 5c.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. Both
filters are global, so every reference runs on the whole plane. Hysteresis is checked against
scikit-image before the cases are written.
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage
from skimage import filters as skfilters

from fixtures_gradients import suppress
from fixtures_rank import PAD_MODES, SCIPY_MODES

FloatArray = NDArray[np.float64]
Add = Callable[..., None]

STAGES = ("smoothed", "magnitude", "suppressed", "thresholds", "edges")


def _fail(message: str) -> None:
    raise SystemExit(message)


def hysteresis(values: FloatArray, low: float, high: float, connectivity: int) -> FloatArray:
    """255 where a pixel at or above low is joined to one at or above max(low, high)."""
    top = max(low, high)
    structure = ndimage.generate_binary_structure(2, 1 if connectivity == 4 else 2)
    labels, _count = ndimage.label(values >= low, structure)
    strong = np.unique(labels[values >= top])
    return np.where(np.isin(labels, strong[strong > 0]), 255.0, 0.0)


def canny(
    plane: FloatArray, sigma: float, norm: str, low: float, high: float, border: str, stage: str
) -> FloatArray:
    reach = int(4 * sigma + 0.5) + 2
    inner = np.s_[reach:-reach, reach:-reach]
    p = np.pad(plane, reach, mode=PAD_MODES[border])  # type: ignore[call-overload]
    smoothed = ndimage.gaussian_filter(p, sigma, truncate=4.0, mode="nearest")
    gx = ndimage.sobel(smoothed, axis=1, mode="nearest")
    gy = ndimage.sobel(smoothed, axis=0, mode="nearest")
    m = np.hypot(gx, gy) if norm == "l2" else np.abs(gx) + np.abs(gy)
    n = suppress(gx, gy, m)[inner]
    top = max(low, high)
    if stage == "smoothed":
        result = smoothed[inner]
    elif stage == "magnitude":
        result = m[inner]
    elif stage == "suppressed":
        result = n
    elif stage == "thresholds":
        result = np.where(n >= top, 255.0, np.where(n >= low, 128.0, 0.0))
    else:
        result = hysteresis(n, low, high, 8)
    return np.asarray(result, dtype=np.float64)


def _checks(plane: FloatArray) -> None:
    # On whole numbers, v >= t is the same as v > t - 0.5, the rule of scikit-image, which also
    # uses four neighbors.
    for low, high in ((100, 200), (60, 150)):
        theirs = skfilters.apply_hysteresis_threshold(plane, low - 0.5, high - 0.5)  # type: ignore[no-untyped-call]
        if not np.array_equal(hysteresis(plane, low, high, 4) > 0, theirs):
            _fail("hysteresis disagrees with skimage.filters.apply_hysteresis_threshold")
    # A step edge gives edges on the two columns next to the step and nowhere else. The
    # gradient is symmetric there, so both pixels of the flat ridge survive suppression.
    step = np.tile(np.r_[np.full(8, 40.0), np.full(8, 200.0)], (10, 1))
    edges = canny(step, 1.0, "l2", 20, 50, "replicate", "edges")
    if not (edges[:, 7:9] == 255).all() or edges[:, :7].any() or edges[:, 9:].any():
        _fail("Canny does not mark a step edge on the two columns next to the step")
    if not np.allclose(
        canny(plane, 1.3, "l2", 0, 0, "wrap", "smoothed"),
        ndimage.gaussian_filter(plane, 1.3, mode=SCIPY_MODES["wrap"]),
    ):
        _fail("The Canny blur disagrees with scipy.ndimage.gaussian_filter")


def add_canny_cases(plane: FloatArray, add: Add) -> None:
    _checks(plane)
    for low, high, connectivity in ((100, 200, "8"), (100, 200, "4"), (150, 120, "8")):
        add(
            "hysteresis",
            {"low": low, "high": high, "connectivity": connectivity},
            hysteresis(plane, low, high, int(connectivity)),
            "scipy.ndimage.label, checked with skimage apply_hysteresis_threshold",
        )
    for border in SCIPY_MODES:
        for sigma, norm, low, high, stages in (
            (1.0, "l2", 40, 100, STAGES),
            (1.5, "l1", 30, 120, ("thresholds", "edges")),
        ):
            for stage in stages:
                add(
                    "canny",
                    {
                        "sigma": sigma,
                        "norm": norm,
                        "low": low,
                        "high": high,
                        "stage": stage,
                        "border": border,
                    },
                    canny(plane, sigma, norm, low, high, border, stage),
                    "scipy.ndimage gaussian_filter, sobel and label with the four-sector rule",
                )
