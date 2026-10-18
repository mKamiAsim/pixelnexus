"""Reference results for the painterly and lens effects of Phase 5f part 9.

Oil painting, pencil sketch, cartoon, bloom and bokeh need all three channels, so
tools/fixtures_impulse.py adds them to the color cases of web/tests/fixtures/filters.json.
Halftone and tilt-shift are one-plane cases from tools/fixtures_filters.py. Each effect is written
again here with NumPy and SciPy. Their rules are PixelNexus's own, apart from the color dodge of
the W3C Compositing and Blending spec and the oil painting rule that OpenCV's xphoto module
cites from Holzmann.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage

from fixtures_color import linear_to_srgb, srgb_to_linear
from fixtures_edge import bilateral
from fixtures_rank import PAD_MODES, SCIPY_MODES

FloatArray = NDArray[np.float64]
Add = Callable[..., None]

LUMA = np.array([0.2126, 0.7152, 0.0722])
# A value this close to a decision boundary could fall either way in 32-bit planes.
MARGIN = 1e-3


def _fail(message: str) -> None:
    raise SystemExit(message)


def _luma(image: FloatArray) -> FloatArray:
    return np.asarray(image @ LUMA)


# Oil painting --------------------------------------------------------------------------------


def oil_paint(image: FloatArray, radius: int, levels: int, border: str) -> FloatArray:
    luma = _luma(image)
    scaled = luma * levels / 256
    near = np.abs(scaled - np.rint(scaled))
    if np.any((near < MARGIN) & (np.rint(scaled) > 0) & (np.rint(scaled) < levels)):
        _fail("oil painting: a luma value lies on a bin edge, choose other settings")
    bins = np.clip(np.floor(scaled), 0, levels - 1).astype(int)
    pad = ((radius, radius), (radius, radius))
    mode = PAD_MODES[border]
    pb = np.pad(bins, pad, mode=mode)  # type: ignore[call-overload]
    pc = np.stack([np.pad(image[..., c], pad, mode=mode) for c in range(3)], axis=-1)  # type: ignore[call-overload]
    h, w = luma.shape
    out = np.zeros_like(image)
    size = 2 * radius + 1
    for y in range(h):
        for x in range(w):
            wb = pb[y : y + size, x : x + size].ravel()
            wc = pc[y : y + size, x : x + size].reshape(-1, 3)
            counts = np.bincount(wb, minlength=levels)
            best = int(np.argmax(counts))
            out[y, x] = wc[wb == best].mean(axis=0)
    return out


# Pencil sketch -------------------------------------------------------------------------------


def color_dodge(backdrop: FloatArray, source: FloatArray) -> FloatArray:
    with np.errstate(divide="ignore", invalid="ignore"):
        ratio = np.minimum(1.0, backdrop / (1 - source))
    return np.asarray(np.where(backdrop <= 0, 0.0, np.where(source >= 1, 1.0, ratio)))


def pencil_sketch(image: FloatArray, sigma: float, colored: bool, border: str) -> FloatArray:
    luma = _luma(image)
    blurred = ndimage.gaussian_filter(255 - luma, sigma, mode=SCIPY_MODES[border], truncate=3.0)
    sketch = 255 * color_dodge(luma / 255, blurred / 255)
    if colored:
        return np.asarray(image - luma[..., None] + sketch[..., None])
    return np.repeat(sketch[..., None], 3, axis=-1)


# Cartoon -------------------------------------------------------------------------------------


def cartoon(
    image: FloatArray,
    sigma_s: float,
    sigma_r: float,
    passes: int,
    size: int,
    offset: float,
    border: str,
) -> FloatArray:
    smooth = image
    for _ in range(passes):
        smooth = bilateral(smooth, sigma_s, sigma_r, "color", border)
    luma = _luma(image)
    if np.min(np.abs(luma - np.floor(luma) - 0.5)) < MARGIN:
        _fail("cartoon: a luma value lies halfway between two levels")
    # The median works on whole levels, rounded half up as JavaScript's Math.round does.
    levels = np.clip(np.floor(luma + 0.5), 0, 255)
    median = ndimage.median_filter(levels, size=5, mode=SCIPY_MODES[border])
    mean = ndimage.uniform_filter(median, size, mode=SCIPY_MODES[border])
    if np.min(np.abs(median - (mean - offset))) < MARGIN:
        _fail("cartoon: a pixel lies on the line threshold, choose another offset")
    lines = median < mean - offset
    return np.asarray(np.where(lines[..., None], 0.0, smooth))


# Bloom and bokeh -----------------------------------------------------------------------------


def _smoothstep(t: Any) -> FloatArray:
    c = np.clip(t, 0.0, 1.0)
    return np.asarray(c * c * (3 - 2 * c))


def bloom(
    image: FloatArray, threshold: float, sigma: float, strength: float, border: str
) -> FloatArray:
    lin = srgb_to_linear(image)
    y = lin @ LUMA
    share = np.clip((y - threshold) / (1 - threshold), 0, 1) if threshold < 1 else np.zeros_like(y)
    out = np.empty_like(image)
    for c in range(3):
        glow = ndimage.gaussian_filter(
            lin[..., c] * share, sigma, mode=SCIPY_MODES[border], truncate=3.0
        )
        out[..., c] = linear_to_srgb(lin[..., c] + strength * glow)
    return out


def bokeh(
    image: FloatArray, radius: float, threshold: float, boost: float, border: str
) -> FloatArray:
    from fixtures_filters import disk_kernel  # the two modules import each other

    lin = srgb_to_linear(image)
    y = lin @ LUMA
    gain = 1 + boost * (_smoothstep((y - threshold) / (1 - threshold)) if threshold < 1 else 0)
    kernel = disk_kernel(radius)
    out = np.empty_like(image)
    for c in range(3):
        blurred = ndimage.correlate(lin[..., c] * gain, kernel, mode=SCIPY_MODES[border])
        out[..., c] = linear_to_srgb(blurred)
    return out


# Halftone and tilt-shift (one plane) ---------------------------------------------------------


def circle_in_square(r: float) -> float:
    h = 0.5
    if r <= h:
        return math.pi * r * r
    if r >= math.sqrt(0.5):
        return 1.0
    segment = r * r * math.acos(h / r) - h * math.sqrt(r * r - h * h)
    return math.pi * r * r - 4 * segment


def dot_radius(ink: float) -> float:
    if ink <= 0:
        return 0.0
    if ink >= 1:
        return math.sqrt(0.5)
    lo, hi = 0.0, math.sqrt(0.5)
    for _ in range(50):
        mid = (lo + hi) / 2
        if circle_in_square(mid) < ink:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def _bilinear(p: FloatArray, x: float, y: float) -> float:
    h, w = p.shape
    cx, cy = min(w - 1.0, max(0.0, x)), min(h - 1.0, max(0.0, y))
    x0, y0 = math.floor(cx), math.floor(cy)
    x1, y1 = min(w - 1, x0 + 1), min(h - 1, y0 + 1)
    fx, fy = cx - x0, cy - y0
    top = p[y0, x0] * (1 - fx) + p[y0, x1] * fx
    bottom = p[y1, x0] * (1 - fx) + p[y1, x1] * fx
    return float(top * (1 - fy) + bottom * fy)


def halftone(plane: FloatArray, cell: float, angle: float, border: str) -> FloatArray:
    theta = math.radians(angle)
    cos, sin = math.cos(theta), math.sin(theta)
    size = 2 * math.floor(cell / 2) + 1
    box = ndimage.uniform_filter(plane, size, mode=SCIPY_MODES[border])
    out = np.zeros_like(plane)
    h, w = plane.shape
    for y in range(h):
        for x in range(w):
            px, py = x + 0.5, y + 0.5
            u = cos * px + sin * py
            v = -sin * px + cos * py
            uc = (math.floor(u / cell) + 0.5) * cell
            vc = (math.floor(v / cell) + 0.5) * cell
            cx = cos * uc - sin * vc
            cy = sin * uc + cos * vc
            ink = 1 - min(255.0, max(0.0, _bilinear(box, cx - 0.5, cy - 0.5))) / 255
            radius = dot_radius(ink) * cell
            coverage = min(1.0, max(0.0, radius - math.hypot(u - uc, v - vc) + 0.5))
            out[y, x] = 255 * (1 - coverage)
    return out


def tilt_shift(
    plane: FloatArray, center: float, band: float, ramp: float, max_sigma: float, border: str
) -> FloatArray:
    levels = 9
    sigmas = [max_sigma * k / (levels - 1) for k in range(levels)]
    stack = [
        ndimage.gaussian_filter(plane, s, mode=SCIPY_MODES[border], truncate=3.0)
        if s > 0
        else plane
        for s in sigmas
    ]
    out = np.zeros_like(plane)
    h = plane.shape[0]
    for y in range(h):
        d = abs((y + 0.5) / h - center) - band
        sigma = 0.0 if d <= 0 else max_sigma * (1.0 if ramp <= 0 else float(_smoothstep(d / ramp)))
        pos = sigma / max_sigma * (levels - 1) if max_sigma > 0 else 0.0
        k = min(levels - 2, math.floor(pos))
        weight = pos - k
        out[y] = (1 - weight) * stack[k][y] + weight * stack[k + 1][y]
    return out


def add_painterly_color_cases(image: FloatArray, add: Add) -> None:
    for radius, levels, border in ((2, 8, "reflect101"), (1, 20, "replicate"), (3, 5, "constant")):
        add(
            "oil-painting",
            {"radius": radius, "levels": levels, "border": border},
            oil_paint(image, radius, levels, border),
            "NumPy windows: the most common luma bin and its mean color",
        )
    for sigma, colored, border in ((2.0, False, "reflect101"), (3.5, True, "reflect")):
        add(
            "pencil-sketch",
            {"sigma": sigma, "colored": colored, "border": border},
            pencil_sketch(image, sigma, colored, border),
            "scipy.ndimage.gaussian_filter and the W3C color dodge",
        )
    for sigma_s, sigma_r, passes, size, offset in ((1.0, 40.0, 2, 5, 4.3), (1.5, 25.0, 1, 7, 2.7)):
        params = {
            "sigmaSpace": sigma_s,
            "sigmaRange": sigma_r,
            "passes": passes,
            "lineSize": size,
            "lineOffset": offset,
            "border": "reflect101",
        }
        add(
            "cartoon",
            params,
            cartoon(image, sigma_s, sigma_r, passes, size, offset, "reflect101"),
            "the bilateral reference, scipy.ndimage.median_filter and uniform_filter",
        )
    for threshold, sigma, strength in ((70, 2.0, 80), (40, 1.5, 150)):
        add(
            "bloom",
            {"threshold": threshold, "sigma": sigma, "strength": strength, "border": "reflect101"},
            bloom(image, threshold / 100, sigma, strength / 100, "reflect101"),
            "NumPy in linear light, scipy.ndimage.gaussian_filter",
        )
    for disk, threshold, boost in ((2.5, 75, 4.0), (1.5, 50, 10.0)):
        add(
            "bokeh",
            {"radius": disk, "threshold": threshold, "boost": boost, "border": "reflect"},
            bokeh(image, disk, threshold / 100, boost, "reflect"),
            "NumPy in linear light, scipy.ndimage.correlate with the disk kernel",
        )


def add_painterly_plane_cases(plane: FloatArray, add: Add) -> None:
    for cell, angle in ((4.0, 45.0), (5.0, 0.0), (6.5, 15.0)):
        add(
            "halftone",
            {"cell": cell, "angle": angle, "border": "reflect101"},
            halftone(plane, cell, angle, "reflect101"),
            "NumPy, the same screen and dot rules",
        )
    for center, band, ramp, max_sigma in ((50, 15, 25, 2.0), (30, 5, 40, 3.5)):
        add(
            "tilt-shift",
            {
                "center": center,
                "band": band,
                "ramp": ramp,
                "maxBlur": max_sigma,
                "border": "reflect",
            },
            tilt_shift(plane, center / 100, band / 100, ramp / 100, max_sigma, "reflect"),
            "scipy.ndimage.gaussian_filter at nine sigmas, blended by row",
        )
