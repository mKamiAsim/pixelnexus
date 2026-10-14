"""Reference results for bilateral tone mapping, detail enhancement and chroma denoising (5f).

tools/fixtures_impulse.py adds the color cases and tools/fixtures_filters.py the plane cases to
web/tests/fixtures/filters.json.

Tone mapping follows
Durand and Dorsey, "Fast bilateral filtering for the display of high-dynamic-range images"
(SIGGRAPH 2002): the piecewise-linear bilateral filter of their Fig. 10 and 12, and the recipe on
Durand's page for the paper (intensity (20 R + 40 G + B) / 61, logs in base 10, the base scaled to
log10 of the target contrast). The Gaussian is the exact one on the mirrored image of
fixtures_retinex. PixelNexus's own choices are kept the same as in the browser code: linear light
as an option, intensities at least 1e-4, sigma_s as a percent of the longer side, bilinear
upsampling, and a level whose weights vanish keeps its own value.

Before the cases are written, two limits are checked: with a huge sigma_r the piecewise filter is
the plain Gaussian blur, and on an image with only two values far apart it keeps them apart.

Detail enhancement is q + k (p - q) with the guided filter of fixtures_edge (checked there against
cv2.ximgproc.guidedFilter) or the piecewise bilateral filter as the base q, as He, Sun and Tang
describe. Chroma denoising smooths the BT.601 Cb and Cr with scipy.ndimage.gaussian_filter or
median_filter and keeps Y.
"""

from __future__ import annotations

import math
from collections.abc import Callable

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage

from fixtures_color import linear_to_srgb, srgb_to_linear
from fixtures_edge import guided
from fixtures_rank import SCIPY_MODES
from fixtures_retinex import mirror_gaussian

FloatArray = NDArray[np.float64]
Add = Callable[..., None]

MIN_INTENSITY = 1e-4
MIN_WEIGHT = 1e-10


def piecewise_bilateral(values: FloatArray, sigma_s: float, sigma_r: float, z: int) -> FloatArray:
    lo, hi = float(values.min()), float(values.max())
    if not hi - lo > 0:
        return values.copy()
    segments = max(1, math.ceil((hi - lo) / sigma_r))
    step = (hi - lo) / segments
    h, w = values.shape
    small = values[::z, ::z]
    sh, sw = small.shape
    ys = np.arange(h) / z
    xs = np.arange(w) / z
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    y1 = np.minimum(y0 + 1, sh - 1)
    x1 = np.minimum(x0 + 1, sw - 1)
    ay = (ys - y0)[:, None]
    ax = (xs - x0)[None, :]
    out = np.zeros_like(values)
    for j in range(segments + 1):
        level = lo + j * step
        g = np.exp(-((small - level) ** 2) / (2 * sigma_r**2))
        k = mirror_gaussian(g, sigma_s / z)
        hh = mirror_gaussian(g * small, sigma_s / z)
        with np.errstate(divide="ignore", invalid="ignore"):
            filtered = np.where(k > MIN_WEIGHT, hh / k, level)
        top = filtered[y0][:, x0] * (1 - ax) + filtered[y0][:, x1] * ax
        bottom = filtered[y1][:, x0] * (1 - ax) + filtered[y1][:, x1] * ax
        up = top * (1 - ay) + bottom * ay
        t = 1 - np.abs(values - level) / step
        out += np.where(t > 0, t * up, 0.0)
    return out


def bilateral_tonemap(
    image: FloatArray, contrast: float, spatial: float, sigma_r: float, z: int, linear: bool
) -> FloatArray:
    rgb = srgb_to_linear(image) if linear else image / 255
    intensity = np.maximum(MIN_INTENSITY, (20 * rgb[..., 0] + 40 * rgb[..., 1] + rgb[..., 2]) / 61)
    logs = np.log10(intensity)
    sigma_s = spatial / 100 * max(image.shape[0], image.shape[1])
    base = piecewise_bilateral(logs, sigma_s, sigma_r, z)
    lo, hi = float(base.min()), float(base.max())
    factor = math.log10(contrast) / (hi - lo) if hi - lo > 1e-12 else 1.0
    level = base * factor + (logs - base) - hi * factor
    value = np.clip(rgb / intensity[..., None] * 10 ** level[..., None], 0, 1)
    return linear_to_srgb(value) if linear else value * 255


def _check_limits(image: FloatArray) -> None:
    logs = np.log10(np.maximum(MIN_INTENSITY, srgb_to_linear(image[..., 1])))
    wide = piecewise_bilateral(logs, 2.5, 1e6, 1)
    if not np.allclose(wide, mirror_gaussian(logs, 2.5), rtol=0, atol=1e-9):
        raise SystemExit("Piecewise bilateral: a huge sigma_r should give the Gaussian blur")
    two = np.where(np.arange(13 * 10).reshape(10, 13) % 13 < 6, -3.0, 0.0)
    kept = piecewise_bilateral(two, 3.0, 0.4, 1)
    if np.max(np.abs(kept - two)) > 1e-6:
        raise SystemExit("Piecewise bilateral: two far levels should stay apart")


def add_tone_cases(image: FloatArray, add: Add) -> None:
    _check_limits(image)
    source = "NumPy, Durand and Dorsey's piecewise-linear bilateral filter and tone mapping"
    for contrast, spatial, sigma_r, z, linear in (
        (5.0, 20.0, 0.4, 1, True),
        (3.0, 30.0, 0.25, 2, True),
        (8.0, 15.0, 0.5, 3, False),
    ):
        add(
            "bilateral-tonemap",
            {
                "contrast": contrast,
                "spatial": spatial,
                "range": sigma_r,
                "downsample": z,
                "linearLight": linear,
            },
            bilateral_tonemap(image, contrast, spatial, sigma_r, z, linear),
            source,
        )


def detail_enhance(
    plane: FloatArray, base: str, boost: float, settings: dict[str, float], border: str
) -> FloatArray:
    if base == "guided":
        q = guided(plane, int(settings["radius"]), settings["eps"] * 255**2, border)
    else:
        q = piecewise_bilateral(
            plane, settings["sigmaSpace"], settings["sigmaRange"], int(settings["downsample"])
        )
    return q + boost * (plane - q)


def add_detail_cases(plane: FloatArray, add: Add) -> None:
    for base, boost, settings, border in (
        ("guided", 5.0, {"radius": 2, "eps": 0.01}, "reflect101"),
        ("guided", 2.5, {"radius": 3, "eps": 0.04}, "reflect"),
        ("bilateral", 5.0, {"sigmaSpace": 2.0, "sigmaRange": 25.5, "downsample": 1}, "reflect"),
        ("bilateral", 3.0, {"sigmaSpace": 3.0, "sigmaRange": 40.0, "downsample": 2}, "reflect"),
    ):
        add(
            "detail-enhance",
            {"base": base, "boost": boost, **settings, "border": border},
            detail_enhance(plane, base, boost, settings, border),
            "NumPy, base and boosted detail as He, Sun and Tang describe",
        )


def chroma_denoise(image: FloatArray, method: str, amount: float, border: str) -> FloatArray:
    r, g, b = image[..., 0], image[..., 1], image[..., 2]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cb = 128 + (b - y) / 1.772
    cr = 128 + (r - y) / 1.402
    mode = SCIPY_MODES[border]
    if method == "median":
        size = int(amount)
        cb = ndimage.median_filter(np.round(cb), size=size, mode=mode)
        cr = ndimage.median_filter(np.round(cr), size=size, mode=mode)
    else:
        cb = ndimage.gaussian_filter(cb, amount, truncate=3.0, mode=mode)
        cr = ndimage.gaussian_filter(cr, amount, truncate=3.0, mode=mode)
    r2 = y + 1.402 * (cr - 128)
    b2 = y + 1.772 * (cb - 128)
    g2 = (y - 0.299 * r2 - 0.114 * b2) / 0.587
    return np.stack([r2, g2, b2], axis=-1)


def add_chroma_cases(image: FloatArray, add: Add) -> None:
    for method, amount, border in (
        ("gaussian", 2.0, "reflect101"),
        ("gaussian", 1.2, "constant"),
        ("median", 3, "replicate"),
        ("median", 5, "wrap"),
    ):
        key = "size" if method == "median" else "sigma"
        smoother = "median_filter" if method == "median" else "gaussian_filter"
        add(
            "chroma-denoise",
            {"method": method, key: amount, "border": border},
            chroma_denoise(image, method, amount, border),
            f"scipy.ndimage.{smoother} on BT.601 Cb and Cr",
        )
