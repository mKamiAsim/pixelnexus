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


def as_float32(r: FloatArray) -> FloatArray:
    """The filter keeps responses as 32-bit floats. Rounding the same way before neighbors are
    compared makes ties, such as mirrored pixels next to a reflected border, agree."""
    return np.asarray(r.astype(np.float32), dtype=np.float64)


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
        r = as_float32(r)
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


MORAVEC_SHIFTS = [(1, 0), (1, 1), (0, 1), (-1, 1)]
FAST_CIRCLE = [
    (0, -3), (1, -3), (2, -2), (3, -1), (3, 0), (3, 1), (2, 2), (1, 3),
    (0, 3), (-1, 3), (-2, 2), (-3, 1), (-3, 0), (-3, -1), (-2, -2), (-1, -3),
]  # fmt: skip


def moravec_response(p: FloatArray, half: int, shifts: list[tuple[int, int]]) -> FloatArray:
    """The smallest windowed sum of squared differences over the shifts (dx, dy)."""
    e = np.pad(p, 1, mode="edge")
    h, w = p.shape
    size = 2 * half + 1
    best = np.full(p.shape, np.inf)
    for dx, dy in shifts:
        moved = e[1 + dy : 1 + dy + h, 1 + dx : 1 + dx + w]
        sums = ndimage.uniform_filter((p - moved) ** 2, size, mode="nearest") * size * size
        best = np.minimum(best, sums)
    return np.asarray(best, dtype=np.float64)


def _has_run(flags: list[bool], n: int) -> bool:
    run = 0
    for v in flags + flags:
        run = run + 1 if v else 0
        if run >= n:
            return True
    return False


def fast_score(p: FloatArray, n: int, t: float) -> FloatArray:
    e = np.pad(p, 3, mode="edge")
    h, w = p.shape
    out = np.zeros_like(p)
    for y in range(h):
        for x in range(w):
            v = p[y, x]
            ring = np.array([e[y + 3 + dy, x + 3 + dx] for dx, dy in FAST_CIRCLE])
            bright = ring > v + t
            dark = ring < v - t
            if _has_run(bright.tolist(), n) or _has_run(dark.tolist(), n):
                out[y, x] = max((ring[bright] - v - t).sum(), (v - ring[dark] - t).sum())
    return out


def points(
    plane: FloatArray,
    measure: str,
    size: int,
    output: str,
    distance: int,
    threshold: float,
    border: str,
) -> FloatArray:
    """Moravec (size is the window half width) or FAST (size is n), extended once."""
    reach = (size + 1 if measure == "moravec" else 3) + (distance if output == "corners" else 0)
    p = np.pad(plane / 255, reach, mode=PAD_MODES[border])  # type: ignore[call-overload]
    if measure == "moravec":
        r = moravec_response(p, size, MORAVEC_SHIFTS)
    else:
        r = fast_score(p, size, threshold)
        threshold = float(np.finfo(np.float64).tiny)
    if output == "corners":
        r = as_float32(r)
        largest = ndimage.maximum_filter(r, size=2 * distance + 1, mode="nearest")
        r = np.where((r >= threshold) & (r >= largest), 255.0, 0.0)
    return np.asarray(r[reach:-reach, reach:-reach], dtype=np.float64)


def _check_points() -> None:
    rng = np.random.default_rng(5)
    image = rng.integers(0, 256, size=(24, 26)).astype(np.float64)
    # scikit-image compares only the four diagonal shifts. With those, the window rule agrees.
    diagonal = [(-1, -1), (1, -1), (-1, 1), (1, 1)]
    ours = moravec_response(image, 1, diagonal)[2:-2, 2:-2]
    theirs = feature.corner_moravec(image, window_size=1)[2:-2, 2:-2]  # type: ignore[no-untyped-call]
    if not np.allclose(ours, theirs):
        _fail("The Moravec window rule disagrees with skimage.feature.corner_moravec")
    found = fast_score(image / 255, 9, 0.15)[3:-3, 3:-3] > 0
    theirs = feature.corner_fast(image / 255, n=9, threshold=0.15)[3:-3, 3:-3] > 0  # type: ignore[no-untyped-call]
    if not np.array_equal(found, theirs) or not found.any():
        _fail("The FAST segment test disagrees with skimage.feature.corner_fast")


def add_corner_cases(plane: FloatArray, add: Add) -> None:
    _checks()
    _check_points()
    for border in SCIPY_MODES:
        for half in (1, 2):
            for output in ("response", "corners"):
                add(
                    "moravec",
                    {
                        "window": half,
                        "output": output,
                        "distance": 2,
                        "threshold": 0.3,
                        "border": border,
                    },
                    points(plane, "moravec", half, output, 2, 0.3, border),
                    "NumPy and scipy.ndimage, with the four shifts of Moravec",
                )
        for n, t in ((9, 0.1), (12, 0.05)):
            for output in ("response", "corners"):
                add(
                    "fast",
                    {"n": n, "threshold": t, "output": output, "distance": 1, "border": border},
                    points(plane, "fast", n, output, 1, t, border),
                    "NumPy, with the segment test checked against skimage.feature.corner_fast",
                )
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
