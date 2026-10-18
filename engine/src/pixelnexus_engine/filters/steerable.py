"""Steerable pyramid filters, with the frequency-domain steerable pyramid of pyrtools.

pyrtools is an optional package (engine extra ``optional``). Without it, this module registers
nothing, and the engine lists the entry as not available.

The pyramid of Simoncelli and Freeman splits a plane into a high-pass residual, K + 1 oriented
bands at each level, and a low-pass residual. The masks are built in the frequency domain, and
their squares add up to 1, so the pyramid rebuilds the plane. pyrtools reads its masks from
lookup tables, which limits the rebuild to about 1e-5 of the plane's range. The bands are real,
and their angular masks are cos^K of the angle from the band's direction, so any rotated band is
a mix of the K + 1 bands (pyrtools steer).

The pyramid wraps around at the edges and is exact only for even sizes. So each plane is
extended with the border mode by half its size, at most 256 pixels, on each side, and a little
more at the far sides to reach a multiple of 2^J for J levels, with small prime factors. Then
sample k of level j sits exactly on pixel 2^j k.
"""

from __future__ import annotations

import math
from functools import lru_cache
from typing import Any

import numpy as np
import scipy.fft
from numpy.typing import NDArray
from scipy.ndimage import map_coordinates

from pixelnexus_engine.filters.directional import line_angle_to_frequency, noise_sigma
from pixelnexus_engine.filters.wavelets import PAD, shrink
from pixelnexus_engine.planes import Plane, filter_by_scope
from pixelnexus_engine.registry import Progress, Rgba, register

try:
    from pyrtools.pyramids import SteerablePyramidFreq
    from pyrtools.pyramids.steer import steer
except ImportError:  # pragma: no cover, the optional package is missing
    SteerablePyramidFreq = None

MAX_MARGIN = 256
Key = tuple[int, int] | str


def extend(plane: Plane, border: str, levels: int) -> tuple[Plane, tuple[int, int]]:
    """The plane extended for the pyramid, and the row and column where the plane starts.
    Both sides of the result are multiples of 2^levels, and at least 2."""
    step = 2 ** max(levels, 1)
    pads = []
    for size in plane.shape:
        margin = min(math.ceil(size / 2), MAX_MARGIN)
        total = step * scipy.fft.next_fast_len(math.ceil((size + 2 * margin) / step))
        pads.append((margin, total - size - margin))
    extended = np.pad(plane, pads, mode=PAD[border])  # type: ignore[call-overload]
    return extended, (pads[0][0], pads[1][0])


def pyramid_levels(shape: tuple[int, ...], wanted: int) -> int:
    """The levels asked for, capped at the most pyrtools allows: log2 of the short side, less 2."""
    return max(0, min(wanted, math.floor(math.log2(min(shape))) - 2))


def build(plane: Plane, levels: int, orientations: int) -> Any:
    return SteerablePyramidFreq(plane, height=levels, order=orientations - 1)


@lru_cache(maxsize=8)
def band_noise(shape: tuple[int, int], levels: int, orientations: int) -> dict[Key, float]:
    """The standard deviation of each band for white noise of standard deviation 1.

    A band coefficient is a linear function of the pixels, so for white noise its standard
    deviation is the norm of that function. The bands are circular filters, followed by taking
    every 2^j-th sample, so every coefficient of a band has the same norm. The sum of the
    squared norms over a band of M coefficients is N times the energy of the band for a single
    pixel of 1, for N pixels. So the norm is the square root of N / M times that energy.
    """
    impulse = np.zeros(shape)
    impulse[shape[0] // 2, shape[1] // 2] = 1.0
    pyramid = build(impulse, levels, orientations)
    pixels = shape[0] * shape[1]
    return {
        key: math.sqrt(pixels / band.size * float(np.sum(band**2)))
        for key, band in pyramid.pyr_coeffs.items()
        if key != "residual_lowpass"
    }


def denoise_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    """Shrink every band but the low-pass residual at k times its noise level, then rebuild."""
    extended, (top, left) = extend(plane, params["border"], params["levels"])
    orientations = int(params["orientations"])
    levels = pyramid_levels(extended.shape, params["levels"])
    pyramid = build(extended, levels, orientations)
    sigma = noise_sigma(plane, params["sigma"])
    levels_of_noise = band_noise(extended.shape, levels, orientations)
    for key, level in levels_of_noise.items():
        threshold = params["factor"] * sigma * level
        pyramid.pyr_coeffs[key] = shrink(pyramid.pyr_coeffs[key], threshold, params["mode"])
    rebuilt = pyramid.recon_pyr()
    out: Plane = rebuilt[top : top + plane.shape[0], left : left + plane.shape[1]]
    return out


def steered_band(pyramid: Any, level: int, frequency_angle: float) -> NDArray[np.float64]:
    """The band of one level steered to a frequency angle, from the K + 1 bands of that level.

    Band b points at the frequency angle pi b / (K + 1), measured from the f_x axis toward
    f_y, with f_y growing downward, so pyrtools steer can use its default angles.
    """
    shape = pyramid.pyr_coeffs[(level, 0)].shape
    basis = np.stack(
        [pyramid.pyr_coeffs[(level, b)].ravel() for b in range(pyramid.num_orientations)], axis=1
    )
    steered: NDArray[np.float64] = steer(basis, frequency_angle).reshape(shape)
    return steered


def band_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    """One band, steered to the line angle, enlarged to the plane and shown around mid gray."""
    extended, (top, left) = extend(plane, params["border"], params["levels"])
    orientations = int(params["orientations"])
    levels = pyramid_levels(extended.shape, params["levels"])
    level = min(params["level"], levels) - 1
    if level < 0:
        return np.full(plane.shape, 128.0)
    pyramid = build(extended, levels, orientations)
    band = steered_band(pyramid, level, line_angle_to_frequency(params["direction"]))
    # Sample k of level j sits on pixel 2^j k. Between samples, interpolate linearly, wrapping
    # around as the pyramid does.
    rows, columns = np.mgrid[top : top + plane.shape[0], left : left + plane.shape[1]]
    scale = 2.0**level
    cut = map_coordinates(band, [rows / scale, columns / scale], order=1, mode="grid-wrap")
    peak = float(np.abs(cut).max())
    if peak < 1e-12:
        return np.full(plane.shape, 128.0)
    shown: Plane = 128.0 + cut * (127.0 / peak)
    return shown


# Representations ----------------------------------------------------------------------------

RADIAL = (
    "H(r) = \\cos\\!\\big(\\tfrac{\\pi}{2} \\log_2 r\\big)\\ \\text{for}\\ "
    "\\tfrac{1}{2} \\le r \\le 1,\\quad L(r) = \\sqrt{1 - H(r)^2}"
)


def angular(orientations: int) -> str:
    k = orientations - 1
    return (
        f"G_b(\\theta) = \\alpha_{{{k}}} \\cos^{{{k}}}\\!\\big(\\theta - \\tfrac{{\\pi b}}"
        f"{{{orientations}}}\\big),\\quad b = 0 \\ldots {k},\\quad "
        f"\\alpha_{{{k}}} = {angular_scale(orientations):.4f}"
    )


def angular_scale(orientations: int) -> float:
    """alpha_K, from alpha_K^2 = 2^(2K) (K!)^2 / ((K + 1) (2K)!), so that the squares of the
    K + 1 angular masks add up to 1."""
    k = orientations - 1
    return math.sqrt(4**k * math.factorial(k) ** 2 / (orientations * math.factorial(2 * k)))


def steerable_representation(params: dict[str, Any]) -> dict[str, Any]:
    orientations = int(params["orientations"])
    levels = params["levels"]
    stages = [
        {
            "name": "Fourier transform",
            "formula": "\\hat{I}(r, \\theta) = \\mathcal{F}(I)",
            "note": "The plane is first extended with the border mode to an even size, since "
            "the pyramid wraps around at the edges.",
        },
        {
            "name": "Radial masks",
            "formula": RADIAL,
            "note": "r is the frequency radius, 1 at the Nyquist frequency. H is 0 below the "
            "range and 1 above it. H(r) splits off the high-pass residual. Level j takes "
            "H(2^{j+1} r) of what is left, and the rest, times L(2^{j+1} r), is cropped to "
            "half the size.",
        },
        {
            "name": "Angular masks",
            "formula": angular(orientations),
            "note": f"{orientations} oriented bands per level, {levels} levels at most. "
            "The squares of the angular masks add up to 1.",
        },
    ]
    if params["output"] == "band":
        stages.append(
            {
                "name": "Steer",
                "formula": f"B_\\phi = \\sum_{{b=0}}^{{{orientations - 1}}} w_b(\\phi)\\, B_b",
                "note": f"The band of level {params['level']} steered to the frequency angle "
                f"phi of lines at {params['direction']:g} degrees, with the weights of "
                "pyrtools steer. Shown around mid gray, stretched so the largest value "
                "reaches 0 or 255.",
            }
        )
    else:
        factor = params["factor"]
        stages += [
            {
                "name": "Noise per band",
                "formula": f"T_b = {factor:g}\\, \\sigma\\, \\lVert a_b \\rVert",
                "note": "The noise level of a band is sigma times the norm of its filter a_b, "
                "measured from the pyramid of a single bright pixel. Sigma is given, or "
                "estimated from the finest diagonal db2 details.",
            },
            {
                "name": "Shrink",
                "formula": "\\eta_{T_b}(c)",
                "note": "Every band and the high-pass residual. The low-pass residual is kept.",
            },
            {
                "name": "Rebuild",
                "formula": "\\hat{I} = \\sum_b \\mathcal{F}^{-1}\\big(\\overline{M_b}\\, "
                "\\mathcal{F}\\, \\eta_{T_b}(c_b)\\big) + \\text{low-pass residual}",
                "note": "M_b is the whole mask of band b. Each band is filtered once more with "
                "it and the results are added up.",
            },
        ]
    return {"kind": "stages", "stages": stages}


if SteerablePyramidFreq is not None:

    @register("steerable-pyramid", representation=steerable_representation)
    def steerable_pyramid(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
        band = params["output"] == "band"
        return filter_by_scope(
            image,
            params["channelScope"],
            lambda plane, _channel: (band_plane if band else denoise_plane)(plane, params),
            progress,
            derived=band,
        )
