"""Reference results for demosaicing and the color threshold (Phase 5f part 6).

tools/fixtures_impulse.py adds these color cases to web/tests/fixtures/filters.json.

Demosaicing simulates a Bayer mosaic and fills in the missing channels with bilinear means or
the 5 x 5 filters of Malvar, He and Cutler (2004), as Getreuer's IPOL article shows them, with
the reflect 101 rule outside the image. Before the cases are written, two checks run: the
bilinear result matches OpenCV's Bayer conversion away from the edges for all four patterns, and
both methods give back an image whose channels are affine functions of the position.

The color threshold uses Python's colorsys for HSV, and the cases avoid values on a bound.
"""

from __future__ import annotations

import colorsys
from collections.abc import Callable

import cv2
import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]
Add = Callable[..., None]
Taps = list[tuple[int, int, float]]

CHANNEL = {"r": 0, "g": 1, "b": 2}
PATTERNS = ("rggb", "bggr", "grbg", "gbrg")

MALVAR_G: Taps = [
    (0, -2, -1), (0, -1, 2), (-2, 0, -1), (-1, 0, 2), (0, 0, 4),
    (1, 0, 2), (2, 0, -1), (0, 1, 2), (0, 2, -1),
]  # fmt: skip
MALVAR_ROW: Taps = [
    (0, -2, 0.5), (-1, -1, -1), (1, -1, -1), (-2, 0, -1), (-1, 0, 4), (0, 0, 5),
    (1, 0, 4), (2, 0, -1), (-1, 1, -1), (1, 1, -1), (0, 2, 0.5),
]  # fmt: skip
MALVAR_CROSS: Taps = [
    (0, -2, -1.5), (-1, -1, 2), (1, -1, 2), (-2, 0, -1.5), (0, 0, 6),
    (2, 0, -1.5), (-1, 1, 2), (1, 1, 2), (0, 2, -1.5),
]  # fmt: skip
BILINEAR_G: Taps = [(0, -1, 2), (-1, 0, 2), (1, 0, 2), (0, 1, 2)]
BILINEAR_ROW: Taps = [(-1, 0, 4), (1, 0, 4)]
BILINEAR_CROSS: Taps = [(-1, -1, 2), (1, -1, 2), (-1, 1, 2), (1, 1, 2)]


def _transpose(taps: Taps) -> Taps:
    return [(dy, dx, w) for dx, dy, w in taps]


TAPS = {
    "malvar": {
        "g": MALVAR_G,
        "row": MALVAR_ROW,
        "column": _transpose(MALVAR_ROW),
        "cross": MALVAR_CROSS,
    },
    "bilinear": {
        "g": BILINEAR_G,
        "row": BILINEAR_ROW,
        "column": _transpose(BILINEAR_ROW),
        "cross": BILINEAR_CROSS,
    },
}


def cfa_channels(pattern: str, height: int, width: int) -> NDArray[np.int64]:
    ys, xs = np.mgrid[0:height, 0:width]
    letters = np.array([CHANNEL[c] for c in pattern])
    return np.asarray(letters[(ys & 1) * 2 + (xs & 1)])


def demosaic(image: FloatArray, pattern: str, method: str, output: str) -> FloatArray:
    h, w, _ = image.shape
    channels = cfa_channels(pattern, h, w)
    mosaic = np.take_along_axis(image, channels[..., None], axis=-1)[..., 0]
    out = np.zeros_like(image)
    if output == "mosaic":
        for c in range(3):
            out[..., c] = np.where(channels == c, mosaic, 0.0)
        return out
    padded = np.pad(mosaic, 2, mode="reflect")

    def apply(taps: Taps) -> FloatArray:
        total = np.zeros_like(mosaic)
        for dx, dy, wt in taps:
            total += wt * padded[2 + dy : 2 + dy + h, 2 + dx : 2 + dx + w]
        return total / 8

    filters = {name: apply(taps) for name, taps in TAPS[method].items()}
    right = np.roll(cfa_channels(pattern, h, w + 1), -1, axis=1)[:, :w]
    for c in range(3):
        green_estimate = filters["g"]
        side = np.where(right == c, filters["row"], filters["column"])
        other = np.where(channels == 1, side, filters["cross"])
        estimate = green_estimate if c == 1 else other
        out[..., c] = np.where(channels == c, mosaic, estimate)
    return out


def _check_bilinear_against_opencv() -> None:
    rng = np.random.default_rng(57)
    image = rng.integers(0, 256, size=(16, 20, 3)).astype(np.float64)
    codes = [
        cv2.COLOR_BayerBG2RGB,
        cv2.COLOR_BayerGB2RGB,
        cv2.COLOR_BayerRG2RGB,
        cv2.COLOR_BayerGR2RGB,
    ]
    for pattern in PATTERNS:
        ours = demosaic(image, pattern, "bilinear", "image")[2:-2, 2:-2]
        mosaic = demosaic(image, pattern, "bilinear", "mosaic").sum(axis=-1).astype(np.uint8)
        best = min(
            float(np.max(np.abs(cv2.cvtColor(mosaic, code)[2:-2, 2:-2] - ours))) for code in codes
        )
        if best > 0.5 + 1e-9:
            raise SystemExit(f"Demosaic: OpenCV's bilinear Bayer differs by {best} for {pattern}")


def _check_affine_images() -> None:
    ys, xs = np.mgrid[0:14, 0:18].astype(np.float64)
    image = np.stack([20 + 3 * xs + 2 * ys, 200 - 4 * xs + ys, 50 + 5 * ys - xs], axis=-1)
    for pattern in PATTERNS:
        for method in ("bilinear", "malvar"):
            out = demosaic(image, pattern, method, "image")
            if np.max(np.abs(out - image)[2:-2, 2:-2]) > 1e-9:
                raise SystemExit(f"Demosaic: {method} does not keep an affine image ({pattern})")


def color_threshold(image: FloatArray, params: dict[str, float | bool]) -> FloatArray:
    h, w, _ = image.shape
    out = np.zeros_like(image)
    lo, hi = float(params["hueMin"]), float(params["hueMax"])
    bounds = [
        lo,
        hi,
        float(params["satMin"]) / 100,
        float(params["satMax"]) / 100,
        float(params["valMin"]) / 100,
        float(params["valMax"]) / 100,
    ]
    for y in range(h):
        for x in range(w):
            r, g, b = image[y, x] / 255
            hue, sat, val = colorsys.rgb_to_hsv(r, g, b)
            hue *= 360
            # 0 and 1 are exact in both languages; a value near any other bound could round
            # to either side.
            for value, bound in zip((hue, hue, sat, sat, val, val), bounds, strict=True):
                if abs(value - bound) < 1e-9 and bound not in (0.0, 1.0):
                    raise SystemExit("Color threshold: a value lies on a bound")
            in_hue = lo <= hue <= hi if lo <= hi else hue >= lo or hue <= hi
            inside = in_hue and bounds[2] <= sat <= bounds[3] and bounds[4] <= val <= bounds[5]
            out[y, x] = 255.0 if inside != bool(params["invert"]) else 0.0
    return out


def add_cfa_cases(image: FloatArray, add: Add) -> None:
    _check_bilinear_against_opencv()
    _check_affine_images()
    for pattern, method, output in (
        ("rggb", "malvar", "image"),
        ("bggr", "malvar", "image"),
        ("grbg", "malvar", "image"),
        ("gbrg", "malvar", "image"),
        ("rggb", "bilinear", "image"),
        ("gbrg", "bilinear", "image"),
        ("grbg", "malvar", "mosaic"),
    ):
        add(
            "demosaic",
            {"pattern": pattern, "method": method, "output": output},
            demosaic(image, pattern, method, output),
            "NumPy, the filters of Malvar, He and Cutler, bilinear checked against OpenCV",
        )
    for params in (
        {"hueMin": 330.5, "hueMax": 30.5, "satMin": 10.5, "satMax": 100, "valMin": 20.5,
         "valMax": 100, "invert": False},
        {"hueMin": 90.5, "hueMax": 200.5, "satMin": 5.5, "satMax": 60.5, "valMin": 30.5,
         "valMax": 90.5, "invert": True},
    ):  # fmt: skip
        add("color-threshold", params, color_threshold(image, params), "Python colorsys")
