"""Point spread functions and the FFT grid for the deconvolution filters of the engine.

The PSFs are the same as in web/src/core/filters/restoration/deconvolve.ts: the Gaussian kernel
cut at 4 sigma, the motion blur kernel and the defocus disk kernel of the browser filters. All
three are symmetric under a half turn. The engine tests compare them with the fixture
references in tools/, which the browser tests also use, so both engines blur alike.

The grid follows the browser frequency filters: each plane is extended with the border mode by
half its size, at most 256 pixels, on each side, and a little more at the far sides to reach a
size with no prime factor above 5. Filters that also need a multiple of 2^J, such as wavelet
priors, ask for it.
"""

from __future__ import annotations

import itertools
import math
from typing import Any

import numpy as np
import scipy.fft
from numpy.typing import NDArray

from pixelnexus_engine.filters.wavelets import PAD
from pixelnexus_engine.planes import Plane

Kernel = NDArray[np.float64]
Spectrum = NDArray[np.complex128]

PSF_TRUNCATE = 4
MAX_MARGIN = 256


def gaussian_kernel(sigma: float) -> Kernel:
    """exp(-x^2 / (2 sigma^2)) on a radius of floor(4 sigma + 1/2), normalized, as an outer
    product."""
    radius = math.floor(PSF_TRUNCATE * sigma + 0.5)
    x = np.arange(-radius, radius + 1, dtype=np.float64)
    g = np.exp(-(x * x) / (2 * sigma * sigma))
    g /= g.sum()
    return np.outer(g, g)


def _direction(angle: float) -> tuple[float, float]:
    """The unit direction of the motion, counterclockwise on screen, with rows growing down."""
    theta = math.radians(angle)
    dx, dy = math.cos(theta), -math.sin(theta)
    return (0.0 if abs(dx) < 1e-12 else dx, 0.0 if abs(dy) < 1e-12 else dy)


def motion_kernel(length: float, angle: float) -> Kernel:
    """The length of the segment of the given length, centered on the origin, inside each cell,
    normalized. Liang-Barsky clipping, as in motion-blur.ts."""
    dx, dy = _direction(angle)
    radius = max(0, math.ceil(length / 2 * max(abs(dx), abs(dy)) - 0.5))
    size = 2 * radius + 1
    kernel = np.zeros((size, size))
    for j in range(size):
        for i in range(size):
            x, y = i - radius, j - radius
            lo, hi = -length / 2, length / 2
            inside = True
            for d, a, b in ((dx, x - 0.5, x + 0.5), (dy, y - 0.5, y + 0.5)):
                if d == 0:
                    inside = inside and a <= 0 <= b
                    continue
                lo, hi = max(lo, min(a / d, b / d)), min(hi, max(a / d, b / d))
            length_in_cell = max(0.0, hi - lo) if inside else 0.0
            # A line through a cell corner leaves rounding dust of about 1e-17. It is 0.
            kernel[j, i] = 0.0 if length_in_cell < 1e-12 else length_in_cell
    kernel /= kernel.sum()
    return kernel


def disk_box_area(radius: float, x0: float, x1: float, y0: float, y1: float) -> float:
    """The area of the disk of the radius around the origin inside the box, in closed form, as
    diskBoxArea in disk-average.ts."""
    a, b = max(x0, -radius), min(x1, radius)
    if b <= a or y1 <= y0:
        return 0.0

    def h(x: float) -> float:
        return math.sqrt(max(0.0, radius * radius - x * x))

    def antiderivative(x: float) -> float:
        return (x * h(x) + radius * radius * math.asin(min(1.0, max(-1.0, x / radius)))) / 2

    cuts = [a, b]
    for y in (y0, y1):
        if abs(y) <= radius:
            c = math.sqrt(radius * radius - y * y)
            cuts += [x for x in (-c, c) if a < x < b]
    cuts.sort()
    area = 0.0
    for u, v in itertools.pairwise(cuts):
        if v <= u:
            continue
        hm = h((u + v) / 2)
        top_is_h, bottom_is_h = hm < y1, -hm > y0
        if (hm if top_is_h else y1) <= (-hm if bottom_is_h else y0):
            continue
        top = antiderivative(v) - antiderivative(u) if top_is_h else y1 * (v - u)
        bottom = -(antiderivative(v) - antiderivative(u)) if bottom_is_h else y0 * (v - u)
        area += top - bottom
    return area


def disk_kernel(radius: float) -> Kernel:
    """The area of the disk inside each cell, normalized."""
    r = max(0, math.ceil(radius - 0.5))
    kernel = np.array(
        [
            [
                disk_box_area(radius, i - r - 0.5, i - r + 0.5, j - r - 0.5, j - r + 0.5)
                for i in range(2 * r + 1)
            ]
            for j in range(2 * r + 1)
        ]
    )
    kernel /= kernel.sum()
    return kernel


def psf_kernel(params: dict[str, Any]) -> Kernel:
    """The PSF of the parameters psf, and sigma, length and angle, or radius."""
    shape = params.get("psf", "gaussian")
    if shape == "motion":
        return motion_kernel(params["length"], params["angle"])
    if shape == "defocus":
        return disk_kernel(params["radius"])
    return gaussian_kernel(params["sigma"])


def transfer(kernel: Kernel, shape: tuple[int, int]) -> Spectrum:
    """The FFT of the kernel placed with its center at the origin of the grid."""
    grid = np.zeros(shape)
    ry, rx = kernel.shape[0] // 2, kernel.shape[1] // 2
    rows = (np.arange(kernel.shape[0]) - ry) % shape[0]
    columns = (np.arange(kernel.shape[1]) - rx) % shape[1]
    np.add.at(grid, np.ix_(rows, columns), kernel)
    spectrum: Spectrum = scipy.fft.fft2(grid)
    return spectrum


def extend(plane: Plane, border: str, multiple: int = 1) -> tuple[Plane, tuple[int, int]]:
    """The plane extended for the FFT, and the row and column where the plane starts. Each side
    is a fast FFT size and a multiple of `multiple`, a power of 2."""
    pads = []
    for size in plane.shape:
        margin = min(math.ceil(size / 2), MAX_MARGIN)
        total = multiple * scipy.fft.next_fast_len(
            math.ceil((size + 2 * margin) / multiple), real=True
        )
        pads.append((margin, total - size - margin))
    extended = np.pad(plane, pads, mode=PAD[border])  # type: ignore[call-overload]
    return extended, (pads[0][0], pads[1][0])


def crop(grid: Plane, plane_shape: tuple[int, ...], offset: tuple[int, int]) -> Plane:
    top, left = offset
    out: Plane = grid[top : top + plane_shape[0], left : left + plane_shape[1]]
    return out


def convolve(values: Plane, h: Spectrum, adjoint: bool = False) -> Plane:
    """Circular convolution with the PSF on the grid, or with the PSF turned by a half turn."""
    factor = np.conj(h) if adjoint else h
    out: Plane = scipy.fft.ifft2(scipy.fft.fft2(values) * factor).real
    return out
