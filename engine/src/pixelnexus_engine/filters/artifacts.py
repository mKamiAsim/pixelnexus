"""Artifact removal: haze, banding, halftone screens, JPEG blocks and ringing.

* dehaze: the dark channel prior of He, Sun and Tang (2011). The transmission is refined with
  the guided filter of He, Sun and Tang (2013), guided by the luma, instead of the soft matting
  of the first paper.
* deband: each pixel is compared with four pixels at a random distance and angle, in two
  mirrored pairs. Where all four are close to it, it takes their mean. This follows the idea of
  the deband filters of flash3kyuu_deband and FFmpeg. The details are PixelNexus's own.
* descreen: isolated peaks of the log spectrum, away from the center, are pulled down to the
  median of a ring around them. The phase is kept. This is a notch filter with automatic
  notches. The peak rule is PixelNexus's own.
* deblock: Nosratinia's re-application of JPEG (2001). The image is shifted by every offset of
  the 8 x 8 grid that is asked for, compressed again with the JPEG quantization tables of the
  chosen quality (8 x 8 DCT, rounding to multiples of the table, inverse DCT), shifted back, and
  the results are averaged. As in JPEG, this happens on the Y'CbCr of JFIF (BT.601 weights),
  with the luminance table for Y and the chrominance table for Cb and Cr.
* dering: strong edges are found on the luma, and a zone around them is smoothed with a
  bilateral filter, blended in softly. This rule is PixelNexus's own.
* jpeg-cleanup: deblock, then dering.
"""

from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np
import scipy.fft
from numpy.typing import NDArray
from scipy import ndimage

from pixelnexus_engine.filters.wavelets import PAD
from pixelnexus_engine.planes import (
    KB,
    KG,
    KR,
    Plane,
    filter_by_scope,
    to_uint8,
)
from pixelnexus_engine.psf import crop, extend
from pixelnexus_engine.registry import Progress, Rgba, register

Mask = NDArray[np.bool_]

# SciPy ndimage modes for the studio's border modes.
NDIMAGE = {
    "reflect": "reflect",
    "reflect101": "mirror",
    "replicate": "nearest",
    "constant": "constant",
    "wrap": "wrap",
}


def luma(rgb: NDArray[np.float64]) -> Plane:
    out: Plane = KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2]
    return out


def with_color(image: Rgba, rgb: NDArray[np.float64]) -> Rgba:
    result = image.copy()
    for channel in range(3):
        result[..., channel] = to_uint8(rgb[..., channel])
    return result


def gray(image: Rgba, plane: Plane) -> Rgba:
    return with_color(image, np.repeat(plane[..., None], 3, axis=2))


# Dehazing -------------------------------------------------------------------------------------


def box_mean(values: Plane, radius: int, border: str) -> Plane:
    out: Plane = ndimage.uniform_filter(values, 2 * radius + 1, mode=NDIMAGE[border])
    return out


def guided_filter(guide: Plane, source: Plane, radius: int, eps: float, border: str) -> Plane:
    """He, Sun and Tang's guided filter with box windows of 2r + 1 pixels."""
    mean_i = box_mean(guide, radius, border)
    mean_p = box_mean(source, radius, border)
    var_i = box_mean(guide * guide, radius, border) - mean_i * mean_i
    cov_ip = box_mean(guide * source, radius, border) - mean_i * mean_p
    a = cov_ip / (var_i + eps)
    b = mean_p - a * mean_i
    out: Plane = box_mean(a, radius, border) * guide + box_mean(b, radius, border)
    return out


def dark_channel(rgb: NDArray[np.float64], patch: int, border: str) -> Plane:
    """The minimum over the color channels, then over a square patch."""
    out: Plane = ndimage.minimum_filter(rgb.min(axis=2), size=patch, mode=NDIMAGE[border])
    return out


def atmospheric_light(rgb: NDArray[np.float64], dark: Plane) -> NDArray[np.float64]:
    """Among the brightest 0.1 percent of the dark channel, the pixel with the highest mean of
    red, green and blue. Ties go to the first in row order."""
    count = max(1, math.ceil(dark.size * 0.001))
    flat = dark.ravel()
    candidates = np.argsort(-flat, kind="stable")[:count]
    intensity = rgb.reshape(-1, 3).mean(axis=1)[candidates]
    best = candidates[int(np.argmax(intensity))]
    light: NDArray[np.float64] = rgb.reshape(-1, 3)[best]
    return light


def dehaze_parts(
    rgb: NDArray[np.float64], params: dict[str, Any]
) -> tuple[NDArray[np.float64], Plane, Plane]:
    """The dehazed image, the refined transmission and the dark channel, for values 0 to 1."""
    border = params["border"]
    dark = dark_channel(rgb, params["patch"], border)
    light = np.maximum(atmospheric_light(rgb, dark), 1e-6)
    raw = 1 - params["omega"] * dark_channel(rgb / light, params["patch"], border)
    transmission = guided_filter(luma(rgb), raw, params["radius"], params["eps"], border)
    t = np.maximum(transmission, params["t0"])[..., None]
    dehazed: NDArray[np.float64] = (rgb - light) / t + light
    return dehazed, transmission, dark


def dehaze_image(image: Rgba, params: dict[str, Any]) -> Rgba:
    rgb = image[..., :3].astype(np.float64) / 255
    dehazed, transmission, dark = dehaze_parts(rgb, params)
    output = params["output"]
    if output == "transmission":
        return gray(image, np.clip(transmission, 0, 1) * 255)
    if output == "dark":
        return gray(image, dark * 255)
    return with_color(image, dehazed * 255)


# Debanding ------------------------------------------------------------------------------------


def deband_offsets(
    shape: tuple[int, ...], reach: int, seed: int
) -> tuple[NDArray[np.int64], NDArray[np.int64]]:
    """For every pixel, a random distance from 1 to reach and a random angle, as row and column
    offsets rounded to whole pixels. The same seed gives the same offsets."""
    rng = np.random.default_rng(seed)
    distance = rng.uniform(1, reach, shape)
    angle = rng.uniform(0, math.pi, shape)
    dy = np.rint(distance * np.sin(angle)).astype(np.int64)
    dx = np.rint(distance * np.cos(angle)).astype(np.int64)
    return dy, dx


def deband_plane(
    plane: Plane, offsets: tuple[NDArray[np.int64], NDArray[np.int64]], params: dict[str, Any]
) -> Plane:
    """Average four mirrored references where all lie within the threshold of the pixel."""
    dy, dx = offsets
    reach = params["range"]
    padded = np.pad(plane, reach, mode=PAD[params["border"]])  # type: ignore[call-overload]
    rows, columns = np.indices(plane.shape)
    rows = rows + reach
    columns = columns + reach
    references = [
        padded[rows + dy, columns + dx],
        padded[rows - dy, columns - dx],
        padded[rows - dx, columns + dy],
        padded[rows + dx, columns - dy],
    ]
    close = np.all([np.abs(r - plane) < params["threshold"] for r in references], axis=0)
    out: Plane = np.where(close, np.mean(references, axis=0), plane)
    return out


def deband_image(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    offsets = deband_offsets(image.shape[:2], params["range"], params["seed"])
    return filter_by_scope(
        image, params["channelScope"], lambda p, _c: deband_plane(p, offsets, params), progress
    )


# Descreening ----------------------------------------------------------------------------------


def ring_footprint(params: dict[str, Any]) -> Mask:
    """The ring of frequency bins around a bin that it is compared with: from the spread plus 1
    to half the window, so the bin's own peak stays out."""
    outer = params["window"] // 2
    inner = params["spread"] + 1
    yy, xx = np.mgrid[-outer : outer + 1, -outer : outer + 1]
    radius = np.hypot(yy, xx)
    ring: Mask = (radius > inner) & (radius <= outer)
    return ring


def peak_mask(log_magnitude: Plane, params: dict[str, Any]) -> tuple[Mask, Plane]:
    """Isolated peaks of the log spectrum, widened, and the background to lower them to.

    A bin is the core of a peak where its log magnitude stands more than the threshold above the
    highest value on the ring around it, and it lies at least the minimum radius from the
    center, in cycles per pixel. Lines and rings of the image spectrum have neighbors as high
    as themselves on that ring, so only isolated peaks pass. The cores are widened by the
    spread. The background is the median on the ring. All filters wrap around, since the
    spectrum is periodic."""
    ring = ring_footprint(params)
    highest = ndimage.maximum_filter(log_magnitude, footprint=ring, mode="wrap")
    background = ndimage.median_filter(log_magnitude, footprint=ring, mode="wrap")
    fy = np.fft.fftfreq(log_magnitude.shape[0])[:, None]
    fx = np.fft.fftfreq(log_magnitude.shape[1])[None, :]
    far = np.hypot(fx, fy) >= params["minRadius"]
    peaks = (log_magnitude - highest > params["threshold"]) & far
    spread = params["spread"]
    if spread > 0:
        # Widen with wrap-around, since the spectrum is periodic.
        peaks = ndimage.maximum_filter(peaks, size=2 * spread + 1, mode="wrap") & far
    return peaks, background


def descreen_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    extended, offset = extend(plane, params["border"])
    spectrum = scipy.fft.fft2(extended)
    log_magnitude = np.log1p(np.abs(spectrum))
    peaks, background = peak_mask(log_magnitude, params)
    # Where there is a peak, scale the magnitude down to the background and keep the phase.
    scale = np.where(peaks, np.expm1(np.minimum(background, log_magnitude)), 1.0)
    scale = np.where(peaks, scale / np.maximum(np.abs(spectrum), 1e-300), 1.0)
    result = scipy.fft.ifft2(spectrum * scale).real
    cleaned = crop(result, plane.shape, offset)
    if params["output"] == "removed":
        removed: Plane = plane - cleaned + 128
        return removed
    return cleaned


# Deblocking -----------------------------------------------------------------------------------

# ITU-T T.81 Annex K, tables K.1 (luminance) and K.2 (chrominance), in row order.
LUMA_TABLE = np.array(
    [
        [16, 11, 10, 16, 24, 40, 51, 61],
        [12, 12, 14, 19, 26, 58, 60, 55],
        [14, 13, 16, 24, 40, 57, 69, 56],
        [14, 17, 22, 29, 51, 87, 80, 62],
        [18, 22, 37, 56, 68, 109, 103, 77],
        [24, 35, 55, 64, 81, 104, 113, 92],
        [49, 64, 78, 87, 103, 121, 120, 101],
        [72, 92, 95, 98, 112, 100, 103, 99],
    ],
    dtype=np.int64,
)
CHROMA_TABLE = np.full((8, 8), 99, dtype=np.int64)
CHROMA_TABLE[:4, :4] = [
    [17, 18, 24, 47],
    [18, 21, 26, 66],
    [24, 26, 56, 99],
    [47, 66, 99, 99],
]


def quantization_table(quality: int, chroma: bool) -> NDArray[np.int64]:
    """The table of the IJG library for a quality from 1 to 100: the Annex K table scaled by
    5000 / q below 50 and by 200 - 2q from 50, rounded, and kept from 1 to 255."""
    scale = 5000 // quality if quality < 50 else 200 - 2 * quality
    base = CHROMA_TABLE if chroma else LUMA_TABLE
    table: NDArray[np.int64] = np.clip((base * scale + 50) // 100, 1, 255)
    return table


def requantize(blocks: NDArray[np.float64], table: NDArray[np.int64]) -> NDArray[np.float64]:
    """JPEG's lossy step on 8 x 8 blocks: orthonormal DCT, rounding to multiples of the
    table, inverse DCT. blocks has shape (rows, columns, 8, 8)."""
    coefficients = scipy.fft.dctn(blocks, type=2, norm="ortho", axes=(2, 3))
    coefficients = np.rint(coefficients / table) * table
    out: NDArray[np.float64] = scipy.fft.idctn(coefficients, type=2, norm="ortho", axes=(2, 3))
    return out


def shift_offsets(shifts: int) -> list[tuple[int, int]]:
    step = 8 // shifts
    return [(dy, dx) for dy in range(0, 8, step) for dx in range(0, 8, step)]


def deblock_plane(
    plane: Plane, table: NDArray[np.int64], level: float, params: dict[str, Any]
) -> Plane:
    """Average JPEG re-application over shifted 8 x 8 grids. Shift (0, 0) is the grid of the
    image itself, with blocks starting at its top left pixel."""
    height, width = plane.shape
    rows = 8 * math.ceil(height / 8) + 8
    columns = 8 * math.ceil(width / 8) + 8
    pads = ((8, rows + 8 - height - 8), (8, columns + 8 - width - 8))
    padded = np.pad(plane - level, pads, mode=PAD[params["border"]])  # type: ignore[call-overload]
    total = np.zeros_like(plane)
    offsets = shift_offsets(int(params["shifts"]))
    for dy, dx in offsets:
        window = padded[8 - dy : 8 - dy + rows, 8 - dx : 8 - dx + columns]
        blocks = window.reshape(rows // 8, 8, columns // 8, 8).transpose(0, 2, 1, 3)
        rebuilt = requantize(blocks, table).transpose(0, 2, 1, 3).reshape(rows, columns)
        total += rebuilt[dy : dy + height, dx : dx + width]
    out: Plane = total / len(offsets) + level
    return out


def jfif_ycbcr(rgb: NDArray[np.float64]) -> NDArray[np.float64]:
    """Y, Cb and Cr of JFIF, each from 0 to 255, with Cb and Cr centered on 128."""
    matrix = np.array(
        [
            [0.299, 0.587, 0.114],
            [-0.168736, -0.331264, 0.5],
            [0.5, -0.418688, -0.081312],
        ]
    )
    out: NDArray[np.float64] = rgb @ matrix.T + np.array([0.0, 128.0, 128.0])
    return out


def jfif_rgb(ycc: NDArray[np.float64]) -> NDArray[np.float64]:
    """The inverse of jfif_ycbcr."""
    y, cb, cr = ycc[..., 0], ycc[..., 1] - 128, ycc[..., 2] - 128
    r = y + 1.402 * cr
    g = y - 0.344136 * cb - 0.714136 * cr
    b = y + 1.772 * cb
    out: NDArray[np.float64] = np.stack([r, g, b], axis=-1)
    return out


def deblock_image(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    """Re-apply JPEG to Y, and to Cb and Cr unless only luma is asked for. Each plane is level
    shifted by 128, as in JPEG."""
    ycc = jfif_ycbcr(image[..., :3].astype(np.float64))
    channels = 1 if params["channels"] == "luma" else 3
    for channel in range(channels):
        table = quantization_table(params["quality"], channel > 0)
        ycc[..., channel] = deblock_plane(ycc[..., channel], table, 128.0, params)
        progress((channel + 1) / channels)
    return with_color(image, jfif_rgb(ycc))


# Deringing ------------------------------------------------------------------------------------


def edge_zone(y: Plane, params: dict[str, Any]) -> tuple[Plane, Mask]:
    """Strong edges of the luma and the soft zone around them where ringing lives.

    The gradient is the Sobel gradient of the luma smoothed with a Gaussian of sigma 1, divided
    by 8 so it is in levels per pixel. Edges are where it reaches the threshold. The zone is the
    edges widened by the radius, then smoothed with a Gaussian of sigma 1 for a soft blend."""
    border = NDIMAGE[params["border"]]
    smooth = ndimage.gaussian_filter(y, 1.0, mode=border)
    gradient = (
        np.hypot(
            ndimage.sobel(smooth, axis=1, mode=border), ndimage.sobel(smooth, axis=0, mode=border)
        )
        / 8
    )
    edges = gradient >= params["threshold"]
    radius = params["radius"]
    disk = np.hypot(*np.mgrid[-radius : radius + 1, -radius : radius + 1]) <= radius
    zone = ndimage.binary_dilation(edges, structure=disk)
    weight: Plane = np.clip(ndimage.gaussian_filter(zone.astype(np.float64), 1.0), 0, 1)
    return weight, edges


def bilateral(plane: Plane, params: dict[str, Any]) -> Plane:
    """OpenCV's bilateral filter with a window radius of ceil(2 sigma_s), on the plane
    extended with the border mode."""
    radius = math.ceil(2 * params["sigmaSpace"])
    padded = np.pad(plane, radius, mode=PAD[params["border"]]).astype(np.float32)  # type: ignore[call-overload]
    filtered = cv2.bilateralFilter(
        padded, 2 * radius + 1, float(params["sigmaColor"]), float(params["sigmaSpace"])
    )
    out: Plane = filtered[radius:-radius, radius:-radius].astype(np.float64)
    return out


def dering_planes(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    weight, _ = edge_zone(luma(image[..., :3].astype(np.float64)), params)
    if params.get("output") == "zone":
        return gray(image, weight * 255)

    def plane_function(plane: Plane, _channel: int) -> Plane:
        out: Plane = weight * bilateral(plane, params) + (1 - weight) * plane
        return out

    return filter_by_scope(image, params["channelScope"], plane_function, progress)


# Representations ------------------------------------------------------------------------------


def dehaze_representation(params: dict[str, Any]) -> dict[str, Any]:
    patch, omega, t0 = params["patch"], params["omega"], params["t0"]
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Dark channel",
                "formula": "I^{\\text{dark}}(x) = \\min_{y \\in \\Omega(x)} \\min_c I_c(y)",
                "note": f"Omega is a square of {patch} x {patch} pixels. Values are from 0 to 1.",
            },
            {
                "name": "Air light",
                "formula": "A = I(x^*),\\quad x^* = \\arg\\max_{x \\in \\text{top } 0.1\\%} "
                "\\bar{I}(x)",
                "note": "Among the brightest 0.1 percent of the dark channel, the pixel with the "
                "highest mean of red, green and blue.",
            },
            {
                "name": "Transmission",
                "formula": f"\\tilde{{t}}(x) = 1 - {omega:g} \\min_{{y \\in \\Omega(x)}} "
                "\\min_c \\frac{I_c(y)}{A_c}",
            },
            {
                "name": "Refine",
                "formula": "t = \\operatorname{guided}(Y, \\tilde{t})",
                "note": f"The guided filter with radius {params['radius']} and eps "
                f"{params['eps']:g}, guided by the luma Y.",
            },
            {
                "name": "Recover",
                "formula": f"J(x) = \\frac{{I(x) - A}}{{\\max(t(x), {t0:g})}} + A",
            },
        ],
    }


def deband_representation(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "References",
                "formula": "r_{1,2} = p \\pm (d \\cos\\theta, d \\sin\\theta),\\quad "
                "r_{3,4} = p \\pm (-d \\sin\\theta, d \\cos\\theta)",
                "note": f"d from 1 to {params['range']} and theta from 0 to 180 degrees, random "
                f"for every pixel with seed {params['seed']}, rounded to whole pixels.",
            },
            {
                "name": "Replace",
                "formula": "q(p) = \\begin{cases} \\tfrac{1}{4} \\sum_i I(r_i) & "
                f"\\max_i \\lvert I(r_i) - I(p) \\rvert < {params['threshold']:g} \\\\ I(p) & "
                "\\text{otherwise} \\end{cases}",
            },
        ],
    }


def descreen_representation(params: dict[str, Any]) -> dict[str, Any]:
    ring = f"from {params['spread'] + 1} to {params['window'] // 2} bins away"
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Log spectrum",
                "formula": "L(f) = \\ln\\big(1 + \\lvert \\mathcal{F} I(f) \\rvert\\big)",
                "note": "On the image extended with the border mode.",
            },
            {
                "name": "Peaks",
                "formula": f"L(f) - \\max_{{R(f)}} L > {params['threshold']:g},\\quad "
                f"\\lvert f \\rvert \\ge {params['minRadius']:g}",
                "note": f"R(f) is the ring of bins {ring}, with wrap-around. The cores are "
                f"widened by {params['spread']} bins. |f| is in cycles per pixel.",
            },
            {
                "name": "Suppress",
                "formula": "\\mathcal{F} I'(f) = \\mathcal{F} I(f)\\, \\frac{e^{B(f)} - 1}"
                "{\\lvert \\mathcal{F} I(f) \\rvert},\\quad B(f) = \\operatorname{median}_"
                "{R(f)} L",
                "note": "At the peaks, the magnitude drops to the median on the ring. The phase "
                "is kept.",
            },
        ],
    }


def deblock_stages(params: dict[str, Any]) -> list[dict[str, str]]:
    shifts = int(params["shifts"])
    table = quantization_table(params["quality"], False)
    first = " ".join(str(v) for v in table[0])
    which = "Y only" if params["channels"] == "luma" else "Y, Cb and Cr"
    return [
        {
            "name": "Color",
            "formula": "Y = 0.299 R + 0.587 G + 0.114 B",
            "note": f"The Y'CbCr of JFIF. Here {which} are processed.",
        },
        {
            "name": "Quantization table",
            "formula": f"Q = \\left\\lfloor \\frac{{Q_K\\, s + 50}}{{100}} \\right\\rfloor,"
            f"\\quad q = {params['quality']}",
            "note": f"Q_K is the table of T.81 Annex K. s = 5000 / q below 50 and 200 - 2q "
            "from 50, and Q is kept from 1 to 255. The first row of the luminance table "
            f"is {first}.",
        },
        {
            "name": "Re-apply JPEG",
            "formula": "B' = \\operatorname{IDCT}\\!\\left(Q \\cdot "
            "\\operatorname{round}\\!\\left(\\frac{\\operatorname{DCT}(B - 128)}{Q}"
            "\\right)\\right) + 128",
            "note": "On every 8 x 8 block B of the shifted image.",
        },
        {
            "name": "Average",
            "formula": f"\\hat{{I}} = \\frac{{1}}{{{shifts * shifts}}} \\sum_{{s}} "
            "S_{-s}\\, J\\big(S_s I\\big)",
            "note": f"Over {shifts * shifts} shifts s of the 8 x 8 grid, {8 // shifts} pixels "
            "apart.",
        },
    ]


def dering_stages(params: dict[str, Any]) -> list[dict[str, str]]:
    return [
        {
            "name": "Strong edges",
            "formula": "E = \\left\\{ \\tfrac{1}{8} \\lvert \\nabla_{\\text{Sobel}} "
            f"(G_1 * Y) \\rvert \\ge {params['threshold']:g} \\right\\}}",
            "note": "On the luma, smoothed with a Gaussian of sigma 1.",
        },
        {
            "name": "Zone",
            "formula": "w = G_1 * \\big(E \\oplus D_r\\big)",
            "note": f"The edges widened by a disk of radius {params['radius']}, then blurred "
            "with a Gaussian of sigma 1 for a soft blend.",
        },
        {
            "name": "Blend",
            "formula": "q = w\\, \\operatorname{bilateral}(I) + (1 - w)\\, I",
            "note": f"OpenCV's bilateral filter with sigma_s {params['sigmaSpace']:g} and "
            f"sigma_r {params['sigmaColor']:g}.",
        },
    ]


def deblock_representation(params: dict[str, Any]) -> dict[str, Any]:
    return {"kind": "stages", "stages": deblock_stages(params)}


def dering_representation(params: dict[str, Any]) -> dict[str, Any]:
    return {"kind": "stages", "stages": dering_stages(params)}


def jpeg_cleanup_representation(params: dict[str, Any]) -> dict[str, Any]:
    return {"kind": "stages", "stages": deblock_stages(params) + dering_stages(params)}


# Filters --------------------------------------------------------------------------------------


@register("dehaze", representation=dehaze_representation)
def dehaze(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    result = dehaze_image(image, params)
    progress(1.0)
    return result


@register("deband", representation=deband_representation)
def deband(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return deband_image(image, params, progress)


@register("descreen", representation=descreen_representation)
def descreen(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda p, _c: descreen_plane(p, params),
        progress,
        derived=params["output"] == "removed",
    )


@register("deblock", representation=deblock_representation)
def deblock(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return deblock_image(image, params, progress)


@register("dering", representation=dering_representation)
def dering(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return dering_planes(image, params, progress)


@register("jpeg-cleanup", representation=jpeg_cleanup_representation)
def jpeg_cleanup(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    deblocked = deblock_image(image, params, lambda f: progress(f / 2))
    return dering_planes(deblocked, params, lambda f: progress(0.5 + f / 2))
