"""Directional filters from banks of smooth frequency tiles, inspired by curvelets and shearlets.

These are not curvelet or shearlet transforms. They borrow the tilings: polar wedges for the
curvelet-inspired filter, after the frequency tiling of Candes, Demanet, Donoho and Ying, and
sheared trapezoids in a horizontal and a vertical cone for the shearlet-inspired filter. Every
tile is a smooth mask W on the spectrum, and the squares of all masks add up to 1 at every
frequency. So filtering each tile with W, and once more with W on the way back, rebuilds the
image exactly when nothing is changed in between.

Smooth edges use Meyer's auxiliary polynomial nu(x) = x^4 (35 - 84 x + 70 x^2 - 20 x^3). Since
nu(x) + nu(1 - x) = 1, the windows cos(pi/2 nu(x)) and cos(pi/2 nu(1 - x)) have squares that add
up to 1 across every transition.

The plane is extended with the border mode by half its size, at most 256 pixels, on each side,
and a little more at the far sides to reach a fast FFT size, as in the browser frequency filters.
"""

from __future__ import annotations

import math
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import numpy as np
import pywt
import scipy.fft
from numpy.typing import NDArray

from pixelnexus_engine.filters.wavelets import PAD, estimate_sigma
from pixelnexus_engine.planes import Plane, filter_by_scope
from pixelnexus_engine.registry import Progress, Rgba, register

Grid = NDArray[np.float64]
MAX_MARGIN = 256


def meyer_nu(x: Grid) -> Grid:
    """Meyer's auxiliary polynomial on [0, 1], 0 below and 1 above."""
    t = np.clip(x, 0.0, 1.0)
    result: Grid = t**4 * (35 - 84 * t + 70 * t**2 - 20 * t**3)
    return result


def falling(x: Grid) -> Grid:
    """1 for x <= 0, 0 for x >= 1, and cos(pi/2 nu(x)) in between."""
    result: Grid = np.where(x >= 1, 0.0, np.maximum(np.cos(np.pi / 2 * meyer_nu(x)), 0.0))
    return result


def lowpass(radius: Grid, cutoff: float) -> Grid:
    """1 up to the cutoff, falling smoothly to 0 at twice the cutoff."""
    return falling((radius - cutoff) / cutoff)


@dataclass(frozen=True)
class Tile:
    """One mask of the bank, with the orientation of the frequencies it passes."""

    mask: Grid
    # The frequency angle at the center of the tile, in radians from 0 to pi, or None for the
    # coarse low-pass tile.
    angle: float | None
    scale: int


def radial_bands(radius: Grid, scales: int) -> list[Grid]:
    """The square roots of a telescoping partition of 1: the finest band first, the low-pass last.

    With Phi_j the low-pass with cutoff 0.125 / 2^j: W_0^2 = 1 - Phi_0^2,
    W_j^2 = Phi_(j-1)^2 - Phi_j^2, and the low-pass Phi_(S-1)^2.
    """
    phis = [lowpass(radius, 0.125 / 2**j) for j in range(scales)]
    bands = [np.sqrt(np.maximum(1 - phis[0] ** 2, 0))]
    for j in range(1, scales):
        bands.append(np.sqrt(np.maximum(phis[j - 1] ** 2 - phis[j] ** 2, 0)))
    bands.append(phis[-1])
    return bands


def directions_at(scale: int, finest: int, smallest: int) -> int:
    """The number of directions halves every second scale toward the coarse end."""
    return int(max(smallest, finest // 2 ** (scale // 2)))


def angular_windows(theta: Grid, count: int) -> Iterator[tuple[Grid, float]]:
    """count windows over the orientation theta (mod pi), centered at l pi / count. Neighbors
    overlap by one window width, and the squares add up to 1."""
    width = np.pi / count
    for index in range(count):
        center = index * width
        delta = np.mod(theta - center + np.pi / 2, np.pi) - np.pi / 2
        yield falling(np.abs(delta) / width), center


def slope_windows(slope: Grid, shears: int) -> Iterator[tuple[int, Grid]]:
    """2 shears + 1 windows over a slope from -1 to 1, centered at k / shears, by k."""
    for k in range(-shears, shears + 1):
        yield k, falling(np.abs(slope * shears - k))


def frequency_grid(height: int, width: int) -> tuple[Grid, Grid]:
    """fx and fy in cycles per pixel for the half spectrum of rfft2, fy growing downward."""
    fy = np.fft.fftfreq(height)[:, None]
    fx = np.fft.rfftfreq(width)[None, :]
    return np.broadcast_to(fx, (height, fx.shape[1])), np.broadcast_to(fy, (height, fx.shape[1]))


def curvelet_tiles(fx: Grid, fy: Grid, scales: int, directions: int) -> list[Tile]:
    radius = np.hypot(fx, fy)
    theta = np.mod(np.arctan2(fy, fx), np.pi)
    bands = radial_bands(radius, scales)
    tiles = []
    for scale, band in enumerate(bands[:-1]):
        for window, center in angular_windows(theta, directions_at(scale, directions, 4)):
            tiles.append(Tile(band * window, center, scale))
    tiles.append(Tile(bands[-1], None, scales))
    return tiles


def shearlet_tiles(fx: Grid, fy: Grid, scales: int, directions: int) -> list[Tile]:
    """Sheared tiles in the horizontal cone (|fy| <= |fx|) and the vertical cone. The two tiles
    at each diagonal, one from each cone, are joined into one."""
    radius = np.hypot(fx, fy)
    horizontal = np.abs(fy) <= np.abs(fx)
    with np.errstate(divide="ignore", invalid="ignore"):
        slope_h = np.where(horizontal, fy / np.where(fx == 0, 1, fx), 0.0)
        slope_v = np.where(~horizontal, fx / np.where(fy == 0, 1, fy), 0.0)
    bands = radial_bands(radius, scales)
    tiles = []
    for scale, band in enumerate(bands[:-1]):
        shears = directions_at(scale, directions, 4) // 4
        cone_h = dict(slope_windows(slope_h, shears))
        cone_v = dict(slope_windows(slope_v, shears))
        for k in range(-shears, shears + 1):
            # Slope fy / fx = k / shears, so the frequency angle is atan(k / shears).
            mask = band * cone_h[k] * horizontal
            if abs(k) == shears:
                # The vertical cone tile with fx / fy = k / shears has the same diagonal.
                mask = mask + band * cone_v[k] * ~horizontal
            tiles.append(Tile(mask, float(np.mod(math.atan2(k, shears), np.pi)), scale))
        for k in range(-shears + 1, shears):
            mask = band * cone_v[k] * ~horizontal
            tiles.append(Tile(mask, float(np.mod(math.atan2(shears, k), np.pi)), scale))
    tiles.append(Tile(bands[-1], None, scales))
    return tiles


BANKS = {"curvelet": curvelet_tiles, "shearlet": shearlet_tiles}


def symmetric_nyquist(tiles: list[Tile], width: int) -> list[Tile]:
    """Make the masks agree at fy and -fy on the Nyquist column of an even width.

    rfft2 keeps that column for both fx = 0.5 and fx = -0.5, so a real result needs the same
    factor at (fy, 0.5) and (-fy, 0.5). The squares of the two values are averaged, which keeps
    the sum of squares at 1.
    """
    if width % 2:
        return tiles
    out = []
    for tile in tiles:
        mask = tile.mask.copy()
        column = mask[:, -1]
        mirrored = column[(-np.arange(column.size)) % column.size]
        mask[:, -1] = np.sqrt((column**2 + mirrored**2) / 2)
        out.append(Tile(mask, tile.angle, tile.scale))
    return out


def extend(plane: Plane, border: str) -> tuple[Plane, tuple[int, int]]:
    """The plane extended for the FFT, and the row and column where the plane starts."""
    pads = []
    for size in plane.shape:
        margin = min(math.ceil(size / 2), MAX_MARGIN)
        total = scipy.fft.next_fast_len(size + 2 * margin, real=True)
        pads.append((margin, total - size - margin))
    extended = np.pad(plane, pads, mode=PAD[border])  # type: ignore[call-overload]
    return extended, (pads[0][0], pads[1][0])


def noise_sigma(plane: Plane, given: float) -> float:
    """The given noise sigma, or the estimate from the finest diagonal db2 details."""
    if given:
        return given
    return estimate_sigma(pywt.dwt2(plane, "db2", mode="symmetric")[1][2])


def angle_distance(a: float, b: float) -> float:
    """The distance between two orientations, modulo pi."""
    d = abs(a - b) % math.pi
    return min(d, math.pi - d)


def line_angle_to_frequency(degrees: float) -> float:
    """Lines at this angle, counterclockwise from horizontal on screen, vary along the frequency
    angle 90 degrees away. On the grid fy grows downward, which flips the sign of the angle."""
    return float(np.mod(math.radians(90 - degrees), math.pi))


def directional_plane(plane: Plane, params: dict[str, Any], bank: str) -> Plane:
    extended, (top, left) = extend(plane, params["border"])
    height, width = extended.shape
    spectrum = scipy.fft.rfft2(extended)
    fx, fy = frequency_grid(height, width)
    tiles = symmetric_nyquist(
        BANKS[bank](fx, fy, params["scales"], int(params["directions"])), width
    )
    if params["mode"] == "orientation":
        target = line_angle_to_frequency(params["direction"])
        half = math.radians(params["width"])
        response = np.zeros_like(fx)
        for tile in tiles:
            if tile.angle is None:
                if params["keepCoarse"]:
                    response += tile.mask**2
            elif angle_distance(tile.angle, target) <= half:
                response += tile.mask**2
        result = scipy.fft.irfft2(spectrum * response, s=extended.shape)
        if not params["keepCoarse"]:
            # The kept detail swings around 0. Show it around mid gray, as an offset of 128.
            result = result + 128
    else:
        sigma = noise_sigma(plane, params["sigma"])
        factor = params["factor"]
        total = np.zeros_like(spectrum)
        for tile in tiles:
            coefficients = scipy.fft.irfft2(spectrum * tile.mask, s=extended.shape)
            if tile.angle is not None:
                # White noise of sigma gives tile coefficients of sigma times the RMS of the
                # mask over the whole spectrum, by Parseval's theorem.
                level = sigma * tile_rms(tile.mask, width)
                coefficients = np.where(np.abs(coefficients) >= factor * level, coefficients, 0)
            total += scipy.fft.rfft2(coefficients) * tile.mask
        result = scipy.fft.irfft2(total, s=extended.shape)
    out: Plane = result[top : top + plane.shape[0], left : left + plane.shape[1]]
    return out


def tile_rms(mask: Grid, width: int) -> float:
    """The root mean square of a mask over the full spectrum, from its rfft2 half. Columns other
    than the first and, for an even width, the last stand for two columns of the full spectrum."""
    weights = np.full(mask.shape[1], 2.0)
    weights[0] = 1.0
    if width % 2 == 0:
        weights[-1] = 1.0
    total = float(np.sum((mask**2) * weights[None, :]))
    return math.sqrt(total / (mask.shape[0] * width))


# Representations ----------------------------------------------------------------------------

TILE_FORMULAS = {
    "curvelet": "W_{j,l}(f) = W_j(|f|)\\, V\\!\\left(\\frac{\\theta - \\pi l / L_j}{\\pi / L_j}"
    "\\right),\\quad V(u) = \\cos\\!\\big(\\tfrac{\\pi}{2}\\, \\nu(|u|)\\big)",
    "shearlet": "W_{j,k}(f) = W_j(|f|)\\, V\\!\\left(K_j \\frac{f_y}{f_x} - k\\right)"
    "\\ \\text{(horizontal cone)},\\quad V(u) = \\cos\\!\\big(\\tfrac{\\pi}{2}\\, \\nu(|u|)\\big)",
}


def frequency_response(params: dict[str, Any], bank: str, size: int = 65) -> dict[str, Any]:
    """The response of the orientation mode on a grid from -0.5 to 0.5 cycles per pixel."""
    f = np.linspace(-0.5, 0.5, size)
    fy, fx = np.meshgrid(f, f, indexing="ij")
    tiles = BANKS[bank](fx, fy, params["scales"], int(params["directions"]))
    target = line_angle_to_frequency(params["direction"])
    half = math.radians(params["width"])
    grid = np.zeros_like(fx)
    for tile in tiles:
        keep = (
            params["keepCoarse"]
            if tile.angle is None
            else angle_distance(tile.angle, target) <= half
        )
        if keep:
            grid += tile.mask**2
    profile_f = np.linspace(0, 0.5, 129)[None, :]
    profile_tiles = BANKS[bank](
        profile_f, np.zeros_like(profile_f), params["scales"], int(params["directions"])
    )
    profile = np.zeros(129)
    for tile in profile_tiles:
        keep = (
            params["keepCoarse"]
            if tile.angle is None
            else angle_distance(tile.angle, target) <= half
        )
        if keep:
            profile += tile.mask[0] ** 2
    return {
        "kind": "frequency",
        "formula": "H(f) = \\sum_{\\text{kept tiles}} W(f)^2",
        "size": size,
        "values": [float(v) for v in grid.ravel()],
        "profile": [float(v) for v in profile],
        "note": f"The tiles whose orientation is within {params['width']:g} degrees of lines at "
        f"{params['direction']:g} degrees"
        + (", plus the coarse low-pass" if params["keepCoarse"] else "")
        + ". The squares of all tiles add up to 1.",
    }


def directional_representation(params: dict[str, Any], bank: str) -> dict[str, Any]:
    if params["mode"] == "orientation":
        return frequency_response(params, bank)
    count = "L_j" if bank == "curvelet" else "4 K_j"
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Spectrum",
                "formula": "F = \\operatorname{FFT}(I_{\\text{ext}})",
                "note": "The image extended with the border mode by half its size, at most 256 "
                "pixels, on each side.",
            },
            {
                "name": "Tiles",
                "formula": TILE_FORMULAS[bank],
                "note": f"{params['scales']} scales with {count} directions each, "
                f"{params['directions']} at the finest scale, halving every second scale. "
                "nu is Meyer's polynomial. The squares of all tiles add up to 1.",
            },
            {
                "name": "Tile coefficients",
                "formula": "c_t = \\operatorname{IFFT}(W_t\\, F)",
            },
            {
                "name": "Threshold",
                "formula": f"\\eta(c_t) = c_t\\, [\\,|c_t| \\ge {params['factor']:g}\\, "
                "\\sigma\\, \\lVert W_t \\rVert_{\\text{rms}}\\,]",
                "note": "Hard thresholding at a multiple of the noise in each tile. The coarse "
                "low-pass tile is kept.",
            },
            {
                "name": "Synthesis",
                "formula": "\\hat{I} = \\operatorname{IFFT}\\Big(\\sum_t W_t\\, "
                "\\operatorname{FFT}(\\eta(c_t))\\Big)",
                "note": "Cut back to the image.",
            },
        ],
    }


@register(
    "directional-curvelet",
    representation=lambda params: directional_representation(params, "curvelet"),
)
def directional_curvelet(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda plane, _channel: directional_plane(plane, params, "curvelet"),
        progress,
    )


@register(
    "directional-shearlet",
    representation=lambda params: directional_representation(params, "shearlet"),
)
def directional_shearlet(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda plane, _channel: directional_plane(plane, params, "shearlet"),
        progress,
    )
