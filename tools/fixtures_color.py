"""Reference results for the color adjustments of Phase 5f.

tools/fixtures_impulse.py adds these RGB cases to the color cases of
web/tests/fixtures/filters.json. The matrices are those of the CSS filter functions in the W3C
Filter Effects Module Level 1. HSV and HSL come from Python's colorsys module, so they do not
share code with the browser version. Color balance follows the tone masks of GIMP's Color
Balance.
"""

from __future__ import annotations

import colorsys
import math
from collections.abc import Callable
from typing import Any

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]
Add = Callable[..., None]


def _apply(image: FloatArray, m: Any) -> FloatArray:
    return np.asarray(image @ np.asarray(m, dtype=np.float64).T)


def bw_mix(image: FloatArray, red: float, green: float, blue: float) -> FloatArray:
    gray = image @ np.array([red, green, blue]) / 100
    return np.repeat(gray[..., None], 3, axis=2)


def sepia(amount: float) -> list[list[float]]:
    k = 1 - min(1.0, max(0.0, amount))
    return [
        [0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k],
        [0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k],
        [0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k],
    ]


def saturate(s: float) -> list[list[float]]:
    return [
        [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
        [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
        [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
    ]


def hue_rotate(degrees: float) -> FloatArray:
    c, s = math.cos(math.radians(degrees)), math.sin(math.radians(degrees))
    base = np.array([[0.213, 0.715, 0.072]] * 3)
    cos_part = np.array([[0.787, -0.715, -0.072], [-0.213, 0.285, -0.072], [-0.213, -0.715, 0.928]])
    sin_part = np.array([[-0.213, -0.715, 0.928], [0.143, 0.140, -0.283], [-0.787, 0.715, 0.072]])
    return np.asarray(base + c * cos_part + s * sin_part)


def vibrance(image: FloatArray, amount: float) -> FloatArray:
    out = np.empty_like(image)
    for idx in np.ndindex(image.shape[:2]):
        r, g, b = image[idx]
        top = max(r, g, b)
        saturation = (top - min(r, g, b)) / top if top > 0 else 0.0
        gain = 1 + amount / 100 * (1 - saturation)
        y = 0.213 * r + 0.715 * g + 0.072 * b
        out[idx] = [y + gain * (c - y) for c in (r, g, b)]
    return out


def hsv_adjust(image: FloatArray, hue: float, saturation: float, value: float) -> FloatArray:
    out = np.empty_like(image)
    for idx in np.ndindex(image.shape[:2]):
        h, s, v = colorsys.rgb_to_hsv(*(image[idx] / 255))
        h = (h + hue / 360) % 1.0
        s = min(1.0, s * saturation / 100)
        v = min(1.0, v * value / 100)
        out[idx] = np.array(colorsys.hsv_to_rgb(h, s, v)) * 255
    return out


def tone_masks(lightness: float) -> tuple[float, float, float]:
    a, b, scale = 0.25, 0.333, 0.7

    def clamp(v: float) -> float:
        return min(1.0, max(0.0, v))

    return (
        clamp((lightness - b) / -a + 0.5) * scale,
        clamp((lightness - b) / a + 0.5) * clamp((lightness + b - 1) / -a + 0.5) * scale,
        clamp((lightness + b - 1) / a + 0.5) * scale,
    )


def color_balance(image: FloatArray, shifts: dict[str, float], preserve: bool) -> FloatArray:
    out = np.empty_like(image)
    for idx in np.ndindex(image.shape[:2]):
        rgb = image[idx] / 255
        _, lightness, _ = colorsys.rgb_to_hls(*rgb)
        masks = tone_masks(lightness)
        new = []
        for c, axis in enumerate(("CyanRed", "MagentaGreen", "YellowBlue")):
            value = rgb[c]
            for t, tone in enumerate(("shadows", "midtones", "highlights")):
                value += shifts.get(f"{tone}{axis}", 0.0) / 100 * masks[t]
            new.append(min(1.0, max(0.0, value)))
        if preserve:
            h, _, s = colorsys.rgb_to_hls(*new)
            new = list(colorsys.hls_to_rgb(h, lightness, s))
        out[idx] = np.array(new) * 255
    return out


def add_color_adjust_cases(image: FloatArray, add: Add) -> None:
    for red, green, blue in ((30, 59, 11), (100, 0, 0), (-50, 120, 30)):
        add(
            "bw-mix",
            {"red": red, "green": green, "blue": blue},
            bw_mix(image, red, green, blue),
            "weighted sum, NumPy",
        )
    for amount in (100, 40, 0):
        add("sepia", {"amount": amount}, _apply(image, sepia(amount / 100)), "W3C sepia() matrix")
    for s in (150, 0, 300):
        add("saturation", {"saturation": s}, _apply(image, saturate(s / 100)), "W3C saturate()")
    for angle in (90, -45, 180):
        add("hue-rotate", {"angle": angle}, _apply(image, hue_rotate(angle)), "W3C hue-rotate()")
    for amount in (50, -80, 100):
        add("vibrance", {"vibrance": amount}, vibrance(image, amount), "NumPy")
    for hue, sat, val in ((0, 130, 100), (120, 50, 80), (-200, 300, 150)):
        add(
            "hsv-adjust",
            {"hue": hue, "saturation": sat, "value": val},
            hsv_adjust(image, hue, sat, val),
            "Python colorsys HSV",
        )
    mixer = {
        "redFromRed": 60,
        "redFromGreen": 40,
        "redFromBlue": 0,
        "greenFromRed": -20,
        "greenFromGreen": 100,
        "greenFromBlue": 20,
        "blueFromRed": 0,
        "blueFromGreen": 30,
        "blueFromBlue": 90,
    }
    matrix = [
        [mixer["redFromRed"], mixer["redFromGreen"], mixer["redFromBlue"]],
        [mixer["greenFromRed"], mixer["greenFromGreen"], mixer["greenFromBlue"]],
        [mixer["blueFromRed"], mixer["blueFromGreen"], mixer["blueFromBlue"]],
    ]
    add("channel-mixer", mixer, _apply(image, np.array(matrix) / 100), "matrix product, NumPy")
    defaults = {"midtonesCyanRed": 20.0, "midtonesYellowBlue": -20.0}
    strong = {
        "shadowsCyanRed": -60.0,
        "shadowsMagentaGreen": 30.0,
        "shadowsYellowBlue": 45.0,
        "midtonesCyanRed": 0.0,
        "midtonesMagentaGreen": -25.0,
        "highlightsCyanRed": 70.0,
        "highlightsYellowBlue": -100.0,
    }
    keys = [
        f"{t}{a}"
        for t in ("shadows", "midtones", "highlights")
        for a in ("CyanRed", "MagentaGreen", "YellowBlue")
    ]
    for given, preserve in ((defaults, True), (strong, True), (strong, False)):
        shifts = {key: given.get(key, 0.0) for key in keys}
        params: dict[str, Any] = {**shifts, "preserveLuminosity": preserve}
        add(
            "color-balance",
            params,
            color_balance(image, shifts, preserve),
            "tone masks of GIMP's Color Balance, colorsys HLS",
        )
