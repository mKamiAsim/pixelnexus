"""Reference results for the corner detectors of Phase 5c.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. The
responses are checked against scikit-image before the cases are written.
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage
from skimage import feature

from fixtures_rank import PAD_MODES, SCIPY_MODES

FloatArray = NDArray[np.float64]
Add = Callable[..., None]


def _fail(message: str) -> None:
    raise SystemExit(message)


def response(p: FloatArray, sigma: float, measure: str, k: float) -> FloatArray:
    """The corner response of a plane already on a 0 to 1 scale, with replicated edges."""
    ix = ndimage.sobel(p, axis=1, mode="nearest")
    iy = ndimage.sobel(p, axis=0, mode="nearest")

    def g(a: FloatArray) -> FloatArray:
        return np.asarray(
            ndimage.gaussian_filter(a, sigma, mode="nearest", truncate=4.0), dtype=np.float64
        )

    a, b, c = g(ix * ix), g(ix * iy), g(iy * iy)
    if measure == "harris":
        return np.asarray(a * c - b * b - k * (a + c) ** 2, dtype=np.float64)
    return np.asarray((a + c - np.sqrt((a - c) ** 2 + 4 * b * b)) / 2, dtype=np.float64)


def corners(
    plane: FloatArray,
    sigma: float,
    measure: str,
    k: float,
    output: str,
    distance: int,
    threshold: float,
    border: str,
) -> FloatArray:
    reach = 1 + int(4 * sigma + 0.5) + (distance if output == "corners" else 0)
    p = np.pad(plane / 255, reach, mode=PAD_MODES[border])  # type: ignore[call-overload]
    r = response(p, sigma, measure, k)
    if output == "corners":
        largest = ndimage.maximum_filter(r, size=2 * distance + 1, mode="nearest")
        r = np.where((r >= threshold) & (r >= largest), 255.0, 0.0)
    return np.asarray(r[reach:-reach, reach:-reach], dtype=np.float64)


def _checks() -> None:
    rng = np.random.default_rng(3)
    image = rng.integers(0, 256, size=(40, 44)).astype(np.float64)
    inner = np.s_[6:-6, 6:-6]
    ours = corners(image, 1.0, "harris", 0.05, "response", 3, 0.0, "constant")
    theirs = feature.corner_harris(image / 255, k=0.05, sigma=1)  # type: ignore[no-untyped-call]
    if not np.allclose(ours[inner], theirs[inner]):
        _fail("Harris disagrees with skimage.feature.corner_harris away from the border")
    ours = corners(image, 1.5, "shi-tomasi", 0.0, "response", 3, 0.0, "constant")
    theirs = feature.corner_shi_tomasi(image / 255, sigma=1.5)  # type: ignore[no-untyped-call]
    inner = np.s_[8:-8, 8:-8]
    if not np.allclose(ours[inner], theirs[inner]):
        _fail("Shi-Tomasi disagrees with skimage.feature.corner_shi_tomasi away from the border")
    # A bright square gives exactly four corners, one next to each of its corners.
    square = np.zeros((30, 30))
    square[10:20, 10:20] = 255
    for measure in ("harris", "shi-tomasi"):
        found = np.argwhere(corners(square, 1.0, measure, 0.05, "corners", 3, 0.01, "constant"))
        near = all(
            min(abs(r - a) + abs(c - b) for a in (9.5, 19.5) for b in (9.5, 19.5)) <= 1.5
            for r, c in found
        )
        if len(found) != 4 or not near:
            _fail(f"{measure} does not find the four corners of a square: {found.tolist()}")


def add_corner_cases(plane: FloatArray, add: Add) -> None:
    _checks()
    for border in SCIPY_MODES:
        for measure, k, sigma in (
            ("harris", 0.05, 1.0),
            ("harris", 0.04, 1.5),
            ("shi-tomasi", 0.0, 1.0),
        ):
            params = {"sigma": sigma, "border": border} | ({"k": k} if measure == "harris" else {})
            add(
                measure,
                params | {"output": "response"},
                corners(plane, sigma, measure, k, "response", 3, 0.0, border),
                "scipy.ndimage sobel and gaussian_filter, checked with skimage.feature",
            )
            add(
                measure,
                params | {"output": "corners", "distance": 2, "threshold": 0.02},
                corners(plane, sigma, measure, k, "corners", 2, 0.02, border),
                "scipy.ndimage, with maximum_filter for the peaks",
            )
