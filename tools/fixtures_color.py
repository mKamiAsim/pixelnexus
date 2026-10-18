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


# White balance and chromatic adaptation ----------------------------------------------------

ILLUMINANTS = {
    "A": (1.09850, 1.0, 0.35585),
    "D50": (0.96422, 1.0, 0.82521),
    "D55": (0.95682, 1.0, 0.92149),
    "D65": (0.95047, 1.0, 1.08883),
    "D75": (0.94972, 1.0, 1.22638),
    "F2": (0.99186, 1.0, 0.67393),
    "F7": (0.95041, 1.0, 1.08747),
    "F11": (1.00962, 1.0, 0.64350),
}
CONE = {
    "bradford": [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]],
    "von-kries": [[0.40024, 0.7076, -0.08081], [-0.2263, 1.16532, 0.0457], [0.0, 0.0, 0.91822]],
    "xyz-scaling": [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
}
RGB_TO_XYZ = np.array(
    [[0.412453, 0.35758, 0.180423], [0.212671, 0.71516, 0.072169], [0.019334, 0.119193, 0.950227]]
)
# Lindbloom's precomputed XYZ matrices from illuminant A to D65.
LINDBLOOM_A_TO_D65 = {
    "bradford": [
        [0.8446965, -0.1179225, 0.3948108],
        [-0.1366303, 1.1041226, 0.1291718],
        [0.0798489, -0.1348999, 3.1924009],
    ],
    "von-kries": [
        [0.9394987, -0.2339150, 0.4281177],
        [-0.0256939, 1.0263828, 0.0051761],
        [0.0, 0.0, 3.0598005],
    ],
    "xyz-scaling": [[0.8652435, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 3.0598005]],
}


def srgb_to_linear(v: Any) -> FloatArray:
    c = np.asarray(v, dtype=np.float64) / 255
    return np.asarray(
        np.where(c <= 0.04045, c / 12.92, ((np.maximum(c, 0) + 0.055) / 1.055) ** 2.4)
    )


def linear_to_srgb(v: Any) -> FloatArray:
    v = np.asarray(v, dtype=np.float64)
    c = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.maximum(v, 0) ** (1 / 2.4) - 0.055)
    return np.asarray(c * 255)


def xyz_adaptation(source: Any, target: Any, method: str) -> FloatArray:
    ma = np.array(CONE[method])
    scale = np.diag((ma @ np.array(target)) / (ma @ np.array(source)))
    return np.asarray(np.linalg.inv(ma) @ scale @ ma)


def rgb_adaptation(source: Any, target: Any, method: str) -> FloatArray:
    inverse = np.linalg.inv(RGB_TO_XYZ)
    return np.asarray(inverse @ xyz_adaptation(source, target, method) @ RGB_TO_XYZ)


def _check_against_lindbloom() -> None:
    for method, expected in LINDBLOOM_A_TO_D65.items():
        ours = xyz_adaptation(ILLUMINANTS["A"], ILLUMINANTS["D65"], method)
        if np.abs(ours - np.array(expected)).max() > 1e-6:
            raise SystemExit(f"the {method} matrix from A to D65 differs from Lindbloom's table")


def planckian_xy(kelvin: float) -> tuple[float, float]:
    """The spline of Kang, Moon, Hong, Lee, Cho and Kim (2002)."""
    t = min(25000.0, max(1667.0, kelvin))
    if t <= 4000:
        x = -0.2661239e9 / t**3 - 0.2343589e6 / t**2 + 0.8776956e3 / t + 0.179910
    else:
        x = -3.0258469e9 / t**3 + 2.1070379e6 / t**2 + 0.2226347e3 / t + 0.240390
    if t <= 2222:
        y = -1.1063814 * x**3 - 1.34811020 * x**2 + 2.18555832 * x - 0.20219683
    elif t <= 4000:
        y = -0.9549476 * x**3 - 1.37418593 * x**2 + 2.09137015 * x - 0.16748867
    else:
        y = 3.0817580 * x**3 - 5.87338670 * x**2 + 3.75112997 * x - 0.37001483
    return x, y


def light_white(kelvin: float, duv: float) -> tuple[float, float, float]:
    def uv(t: float) -> FloatArray:
        x, y = planckian_xy(t)
        d = -2 * x + 12 * y + 3
        return np.array([4 * x / d, 6 * y / d])

    tangent = uv(kelvin * 1.01) - uv(kelvin * 0.99)
    normal = np.array([-tangent[1], tangent[0]]) / np.hypot(*tangent)
    if normal[1] < 0:
        normal = -normal
    u, v = uv(kelvin) + duv * normal
    d = 2 * u - 8 * v + 4
    x, y = 3 * u / d, 2 * v / d
    return x / y, 1.0, (1 - x - y) / y


def _adapt_image(image: FloatArray, m: FloatArray) -> FloatArray:
    return linear_to_srgb(srgb_to_linear(image) @ m.T)


def _scale_image(image: FloatArray, gains: Any, linear: bool) -> FloatArray:
    if linear:
        return linear_to_srgb(srgb_to_linear(image) * np.asarray(gains))
    return np.asarray(image * np.asarray(gains))


def _gains(top: FloatArray, over: Any) -> FloatArray:
    safe = np.where(top > 0, top, 1)
    return np.asarray(np.where(top > 0, over / safe, 1.0))


def white_balance(image: FloatArray, neutral: str, linear: bool) -> FloatArray:
    n = np.array([int(neutral[i : i + 2], 16) for i in (1, 3, 5)], dtype=np.float64)
    if linear:
        n = srgb_to_linear(n)
    y = float(n @ np.array([0.2126, 0.7152, 0.0722]))
    return _scale_image(image, _gains(n, y), linear)


def gray_world(image: FloatArray, linear: bool) -> FloatArray:
    values = srgb_to_linear(image) if linear else image
    means = values.reshape(-1, 3).mean(axis=0)
    return _scale_image(image, _gains(means, means.mean()), linear)


def white_patch(image: FloatArray, percentile: float, linear: bool) -> FloatArray:
    levels = np.clip(np.rint(image), 0, 255).reshape(-1, 3)
    tops = np.percentile(levels, percentile, axis=0)
    level = srgb_to_linear(tops) if linear else tops / 255
    return _scale_image(image, _gains(level, 1.0), linear)


def add_white_balance_cases(image: FloatArray, add: Add) -> None:
    _check_against_lindbloom()
    for neutral, linear in (("#d2c8b4", True), ("#808080", True), ("#a0b4c8", False)):
        params: dict[str, Any] = {"neutral": neutral, "linearLight": linear}
        add("white-balance", params, white_balance(image, neutral, linear), "NumPy gains")
    for linear in (True, False):
        add("gray-world", {"linearLight": linear}, gray_world(image, linear), "NumPy means")
    for percentile, linear in ((99.0, True), (100.0, False), (90.0, True)):
        params = {"percentile": percentile, "linearLight": linear}
        add("white-patch", params, white_patch(image, percentile, linear), "numpy.percentile")
    for source, target, method in (
        ("A", "D65", "bradford"),
        ("D50", "D65", "von-kries"),
        ("F11", "D50", "xyz-scaling"),
        ("D65", "D65", "bradford"),
    ):
        m = rgb_adaptation(ILLUMINANTS[source], ILLUMINANTS[target], method)
        params = {"source": source, "target": target, "method": method}
        add(
            "chromatic-adaptation",
            params,
            _adapt_image(image, m),
            "NumPy, with the A to D65 matrices checked against Lindbloom's table",
        )
    for kelvin, tint in ((4500, 0), (3000, 10), (8000, -20), (2000, 0), (12000, 5)):
        m = rgb_adaptation(light_white(kelvin, tint / 1000), ILLUMINANTS["D65"], "bradford")
        add(
            "temperature-tint",
            {"temperature": kelvin, "tint": tint},
            _adapt_image(image, m),
            "NumPy, Planckian locus spline of Kang and colleagues, Bradford adaptation",
        )
