"""Reference results for the gradient, compass, line and texture filters of Phase 5c.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. Every
kernel is checked against a library or a published form before the cases are written.
"""

from __future__ import annotations

import math
from collections.abc import Callable

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy import ndimage
from skimage import filters as skfilters

from fixtures_rank import PAD_MODES, SCIPY_MODES

FloatArray = NDArray[np.float64]
Add = Callable[..., None]


def _fail(message: str) -> None:
    raise SystemExit(message)


def outer(column: list[float], row: list[float]) -> FloatArray:
    return np.outer(np.array(column, dtype=np.float64), np.array(row, dtype=np.float64))


FARID_D = [-0.109603762960254, -0.276690988455557, 0.0, 0.276690988455557, 0.109603762960254]
FARID_P = [
    0.0376593171958126,
    0.249153396177344,
    0.426374573253687,
    0.249153396177344,
    0.0376593171958126,
]

PAIRS: dict[str, tuple[FloatArray, FloatArray]] = {
    "prewitt": (outer([1, 1, 1], [-1, 0, 1]), outer([-1, 0, 1], [1, 1, 1])),
    "scharr": (outer([3, 10, 3], [-1, 0, 1]), outer([-1, 0, 1], [3, 10, 3])),
    "roberts": (
        np.array([[0, 0, 0], [0, 1, 0], [0, 0, -1]], dtype=np.float64),
        np.array([[0, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=np.float64),
    ),
    "farid-simoncelli": (outer(FARID_P, FARID_D), outer(FARID_D, FARID_P)),
}

RING = [(0, 0), (0, 1), (0, 2), (1, 2), (2, 2), (2, 1), (2, 0), (1, 0)]


def turn(mask: FloatArray, k: int) -> FloatArray:
    out = mask.copy()
    for i, (r, c) in enumerate(RING):
        fr, fc = RING[(i + k) % 8]
        out[r, c] = mask[fr, fc]
    return out


KIRSCH_N = np.array([[5, 5, 5], [-3, 0, -3], [-3, -3, -3]], dtype=np.float64)
ROBINSON_N = np.array([[1, 2, 1], [0, 0, 0], [-1, -2, -1]], dtype=np.float64)

S2 = math.sqrt(2)
FREI_CHEN = [
    np.array(m, dtype=np.float64) * f
    for m, f in (
        ([[1, S2, 1], [0, 0, 0], [-1, -S2, -1]], 1 / (2 * S2)),
        ([[1, 0, -1], [S2, 0, -S2], [1, 0, -1]], 1 / (2 * S2)),
        ([[0, -1, S2], [1, 0, -1], [-S2, 1, 0]], 1 / (2 * S2)),
        ([[S2, -1, 0], [-1, 0, 1], [0, 1, -S2]], 1 / (2 * S2)),
        ([[0, 1, 0], [-1, 0, -1], [0, 1, 0]], 1 / 2),
        ([[-1, 0, 1], [0, 0, 0], [1, 0, -1]], 1 / 2),
        ([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], 1 / 6),
        ([[-2, 1, -2], [1, 4, 1], [-2, 1, -2]], 1 / 6),
        ([[1, 1, 1], [1, 1, 1], [1, 1, 1]], 1 / 3),
    )
]

LINES = {
    "horizontal": [[-1, -1, -1], [2, 2, 2], [-1, -1, -1]],
    "vertical": [[-1, 2, -1], [-1, 2, -1], [-1, 2, -1]],
    "falling": [[2, -1, -1], [-1, 2, -1], [-1, -1, 2]],
    "rising": [[-1, -1, 2], [-1, 2, -1], [2, -1, -1]],
}

LAWS = {
    "L5": [1, 4, 6, 4, 1],
    "E5": [-1, -2, 0, 2, 1],
    "S5": [-1, 0, 2, 0, -1],
    "W5": [-1, 2, 0, -2, 1],
    "R5": [1, -4, 6, -4, 1],
}


def compass(plane: FloatArray, north: FloatArray, output: str, mode: str) -> FloatArray:
    responses = np.stack([ndimage.correlate(plane, turn(north, k), mode=mode) for k in range(8)])
    best = np.argmax(responses, axis=0)
    if output == "direction":
        angles = np.array([(-90 - 45 * k) + (360 if -90 - 45 * k <= -180 else 0) for k in range(8)])
        return np.asarray(angles[best], dtype=np.float64)
    return np.asarray(np.take_along_axis(responses, best[None], axis=0)[0], dtype=np.float64)


def frei_chen(plane: FloatArray, output: str, mode: str) -> FloatArray:
    p = np.stack([ndimage.correlate(plane, m, mode=mode) ** 2 for m in FREI_CHEN])
    total = p.sum(axis=0)
    part = p[4:8].sum(axis=0) if output == "line" else p[:4].sum(axis=0)
    return np.asarray(np.where(total > 0, 255 * np.sqrt(part / np.where(total > 0, total, 1)), 0.0))


def laws(
    plane: FloatArray, vertical: str, horizontal: str, size: int, remove_mean: bool, border: str
) -> FloatArray:
    reach = size - 1 + 2
    p = np.pad(plane, reach, mode=PAD_MODES[border])  # type: ignore[call-overload]
    if remove_mean:
        p = p - ndimage.uniform_filter(p, size, mode="nearest")
    r = ndimage.correlate1d(p, np.array(LAWS[horizontal], dtype=np.float64), axis=1, mode="nearest")
    r = ndimage.correlate1d(r, np.array(LAWS[vertical], dtype=np.float64), axis=0, mode="nearest")
    e = ndimage.uniform_filter(np.abs(r), size, mode="nearest")
    return np.asarray(e[reach:-reach, reach:-reach], dtype=np.float64)


def _cross_checks(plane: FloatArray) -> None:
    gx = ndimage.correlate(plane, PAIRS["scharr"][0], mode="mirror")
    if not np.allclose(gx, cv2.Scharr(plane, cv2.CV_64F, 1, 0, borderType=cv2.BORDER_REFLECT_101)):
        _fail("Scharr kernel disagrees with cv2.Scharr")
    gx = ndimage.correlate(plane, PAIRS["prewitt"][0], mode="reflect")
    if not np.allclose(gx, 3 * skfilters.prewitt(plane, axis=1, mode="reflect")):  # type: ignore[no-untyped-call]
        _fail("Prewitt kernel disagrees with skimage.filters.prewitt_v")
    gx = ndimage.correlate(plane, PAIRS["farid-simoncelli"][0], mode="reflect")
    gy = ndimage.correlate(plane, PAIRS["farid-simoncelli"][1], mode="reflect")
    theirs = skfilters.farid(plane, mode="reflect")  # type: ignore[no-untyped-call]
    if not np.allclose(np.sqrt((gx**2 + gy**2) / 2), theirs):
        _fail("Farid-Simoncelli kernels disagree with skimage.filters.farid")
    g1 = ndimage.correlate(plane, PAIRS["roberts"][0], mode="reflect")
    g2 = ndimage.correlate(plane, PAIRS["roberts"][1], mode="reflect")
    theirs = skfilters.roberts(plane)  # type: ignore[no-untyped-call]
    if not np.allclose(np.sqrt((g1**2 + g2**2) / 2), theirs):
        _fail("Roberts kernels disagree with skimage.filters.roberts")
    if not np.array_equal(turn(KIRSCH_N, 2), [[5, -3, -3], [5, 0, -3], [5, -3, -3]]):
        _fail("Kirsch west mask is wrong")
    if not np.array_equal(turn(KIRSCH_N, 1), [[5, 5, -3], [5, 0, -3], [-3, -3, -3]]):
        _fail("Kirsch north-west mask is wrong")
    if not np.allclose(sum(turn(KIRSCH_N, k) for k in range(8)), 0):
        _fail("Kirsch masks do not add up to 0")
    sobel_y = ndimage.sobel(plane, axis=0, mode="mirror")
    if not np.allclose(ndimage.correlate(plane, turn(ROBINSON_N, 4), mode="mirror"), sobel_y):
        _fail("Robinson south mask disagrees with scipy.ndimage.sobel")
    gram = np.array([[np.sum(a * b) for b in FREI_CHEN] for a in FREI_CHEN])
    if not np.allclose(gram, np.eye(9)):
        _fail("Frei-Chen masks are not orthonormal")
    if not np.allclose(laws(np.full((10, 13), 90.0), "L5", "L5", 5, True, "reflect101"), 0):
        _fail("Laws L5L5 energy of a flat image is not 0")


def dog(plane: FloatArray, sigma: float, ratio: float, mode: str) -> FloatArray:
    narrow = ndimage.gaussian_filter(plane, sigma, truncate=3.0, mode=mode)
    wide = ndimage.gaussian_filter(plane, sigma * ratio, truncate=3.0, mode=mode)
    return np.asarray(narrow - wide, dtype=np.float64)


def zero_crossings(values: FloatArray, threshold: float) -> FloatArray:
    """255 where v < 0 and a 4-neighbor is above 0 with a jump above the threshold."""
    e = np.pad(values, 1, mode="edge")
    out = np.zeros_like(values)
    for sl in (np.s_[1:-1, 2:], np.s_[1:-1, :-2], np.s_[2:, 1:-1], np.s_[:-2, 1:-1]):
        q = e[sl]
        out = np.where((values < 0) & (q > 0) & (q - values > threshold), 255.0, out)
    return out


def zero_crossing_filter(
    plane: FloatArray, level: float, threshold: float, border: str
) -> FloatArray:
    p = np.pad(plane, 1, mode=PAD_MODES[border]) - level  # type: ignore[call-overload]
    return zero_crossings(p, threshold)[1:-1, 1:-1]


def marr_hildreth(plane: FloatArray, sigma: float, threshold: float, border: str) -> FloatArray:
    reach = int(4 * sigma + 0.5) + 1
    p = np.pad(plane, reach, mode=PAD_MODES[border])  # type: ignore[call-overload]
    response = ndimage.gaussian_laplace(p, sigma, mode="nearest")
    return zero_crossings(response, threshold)[reach:-reach, reach:-reach]


def sobel_nms(plane: FloatArray, border: str) -> FloatArray:
    p = np.pad(plane, 2, mode=PAD_MODES[border])  # type: ignore[call-overload]
    gx = ndimage.sobel(p, axis=1, mode="nearest")
    gy = ndimage.sobel(p, axis=0, mode="nearest")
    return suppress(gx, gy, np.hypot(gx, gy))[2:-2, 2:-2]


def suppress(gx: FloatArray, gy: FloatArray, m: FloatArray) -> FloatArray:
    """Keep m where it is at least both neighbors along the gradient, in four sectors."""
    a = np.degrees(np.arctan2(gy, gx)) % 180
    sector = np.where(
        (a < 22.5) | (a >= 157.5), 0, np.where(a < 67.5, 1, np.where(a < 112.5, 2, 3))
    )
    e = np.pad(m, 1, mode="edge")
    h, w = m.shape
    out = np.zeros_like(m)
    for s, (dx, dy) in enumerate(((1, 0), (1, 1), (0, 1), (-1, 1))):
        ahead = e[1 + dy : 1 + dy + h, 1 + dx : 1 + dx + w]
        behind = e[1 - dy : 1 - dy + h, 1 - dx : 1 - dx + w]
        keep = (sector == s) & (m >= ahead) & (m >= behind)
        out = np.where(keep, m, out)
    return np.asarray(out, dtype=np.float64)


def _check_dog_log(plane: FloatArray) -> None:
    step = np.tile(np.r_[np.full(6, 40.0), np.full(7, 200.0)], (10, 1))
    edges = marr_hildreth(step, 1.5, 0.0, "reflect")
    # The LoG is positive on the dark side and negative on the bright side, so the rule marks
    # the first bright column, 6, and nothing far from the step.
    if not (edges[:, 6] == 255).all() or edges[:, [0, 1, 2, 3, 9, 10, 11, 12]].any():
        _fail("Marr-Hildreth does not mark the step at its bright side")
    theirs = skfilters.difference_of_gaussians(plane, 1.5, 2.4, mode="reflect", truncate=3.0)  # type: ignore[no-untyped-call]
    if not np.allclose(dog(plane, 1.5, 1.6, "reflect"), theirs):
        _fail("DoG disagrees with skimage.filters.difference_of_gaussians")


def add_gradient_cases(plane: FloatArray, add: Add) -> None:
    _cross_checks(plane)
    _check_dog_log(plane)
    for border, mode in SCIPY_MODES.items():
        for name, (kx, ky) in PAIRS.items():
            gx = ndimage.correlate(plane, kx, mode=mode)
            gy = ndimage.correlate(plane, ky, mode=mode)
            outputs = {
                ("magnitude", "l2"): np.hypot(gx, gy),
                ("magnitude", "l1"): np.abs(gx) + np.abs(gy),
                ("gx", "l2"): gx,
                ("gy", "l2"): gy,
                ("direction", "l2"): np.degrees(np.arctan2(gy, gx)),
            }
            if name == "farid-simoncelli":
                # Farid's taps are not whole numbers, so Gy is often a tiny value near 0 and its
                # sign, and with it an angle near 180 or -180 degrees, depends on rounding.
                del outputs[("direction", "l2")]
            for (output, norm), values in outputs.items():
                add(
                    name,
                    {"output": output, "norm": norm, "border": border},
                    values,
                    "scipy.ndimage.correlate, checked with OpenCV and scikit-image",
                )
        for name, north in (("kirsch", KIRSCH_N), ("robinson", ROBINSON_N)):
            for output in ("magnitude", "direction"):
                add(
                    name,
                    {"output": output, "border": border},
                    compass(plane, north, output, mode),
                    "scipy.ndimage.correlate with the eight turned masks",
                )
        for output in ("edge", "line"):
            add(
                "frei-chen",
                {"output": output, "border": border},
                frei_chen(plane, output, mode),
                "scipy.ndimage.correlate with the orthonormal Frei-Chen masks",
            )
        responses = {
            k: ndimage.correlate(plane, np.array(v, dtype=np.float64), mode=mode)
            for k, v in LINES.items()
        }
        add(
            "line-detector",
            {"output": "max", "border": border},
            np.max(np.stack(list(responses.values())), axis=0),
            "scipy.ndimage.correlate with the four line masks",
        )
        add(
            "line-detector",
            {"output": "falling", "border": border},
            responses["falling"],
            "scipy.ndimage.correlate with the line mask",
        )
        for sigma, ratio in ((1.0, 1.6), (1.5, 2.0)):
            add(
                "dog",
                {"sigma": sigma, "ratio": ratio, "border": border},
                dog(plane, sigma, ratio, mode),
                "scipy.ndimage.gaussian_filter, checked with skimage difference_of_gaussians",
            )
        for level, threshold in ((128.0, 0.0), (100.0, 20.0)):
            add(
                "zero-crossing",
                {"level": level, "threshold": threshold, "border": border},
                zero_crossing_filter(plane, level, threshold, border),
                "NumPy, the rule of the docs page",
            )
        for sigma, threshold in ((1.5, 0.0), (2.0, 3.0)):
            add(
                "marr-hildreth",
                {"sigma": sigma, "threshold": threshold, "border": border},
                marr_hildreth(plane, sigma, threshold, border),
                "scipy.ndimage.gaussian_laplace and the zero-crossing rule",
            )
        add(
            "sobel-nms",
            {"border": border},
            sobel_nms(plane, border),
            "scipy.ndimage.sobel and the four-sector rule",
        )
        for sigma in (1.0, 1.7):
            add(
                "log",
                {"sigma": sigma, "border": border},
                ndimage.gaussian_laplace(plane, sigma, mode=mode),
                "scipy.ndimage.gaussian_laplace",
            )
        for vertical, horizontal, size, remove in (
            ("E5", "L5", 5, True),
            ("S5", "S5", 7, True),
            ("R5", "W5", 5, False),
        ):
            add(
                "laws",
                {
                    "vertical": vertical,
                    "horizontal": horizontal,
                    "window": size,
                    "removeMean": remove,
                    "border": border,
                },
                laws(plane, vertical, horizontal, size, remove, border),
                "SciPy on the extended plane",
            )
