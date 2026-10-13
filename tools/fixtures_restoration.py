"""Reference results for the known blur and the direct deconvolution filters of Phase 5e.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. The
blur is a correlation with the PSF kernel. Deconvolution multiplies the spectrum of the plane,
extended as in tools/fixtures_frequency.py, by a gain built from the transform of the PSF.
Before the cases are written, the script checks that Wiener deconvolution undoes most of a
known blur.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage

from fixtures_frequency import ComplexArray, spectral_filter

FloatArray = NDArray[np.float64]
Add = Callable[..., None]
Gain = Callable[[ComplexArray, FloatArray, FloatArray], ComplexArray]

TRUNCATE = 4.0
SCIPY_MODES = {
    "reflect101": "mirror",
    "reflect": "reflect",
    "replicate": "nearest",
    "constant": "constant",
    "wrap": "grid-wrap",
}


def _fail(message: str) -> None:
    raise SystemExit(message)


def gaussian_psf(sigma: float) -> FloatArray:
    radius = math.floor(TRUNCATE * sigma + 0.5)
    x = np.arange(-radius, radius + 1, dtype=np.float64)
    g = np.exp(-(x * x) / (2 * sigma * sigma))
    g /= g.sum()
    return np.asarray(np.outer(g, g), dtype=np.float64)


def psf(params: dict[str, Any]) -> FloatArray:
    # Imported here, since tools/fixtures_filters.py imports this module.
    from fixtures_filters import disk_kernel, motion_kernel

    shape = params.get("psf", "gaussian")
    if shape == "motion":
        return motion_kernel(params.get("length", 9), params.get("angle", 0))
    if shape == "defocus":
        return disk_kernel(params.get("radius", 3))
    return gaussian_psf(params.get("sigma", 2))


def transfer(kernel: FloatArray, width: int, height: int) -> ComplexArray:
    """The FFT of the kernel placed with its center at the origin of a width x height grid."""
    grid = np.zeros((height, width))
    ry, rx = kernel.shape[0] // 2, kernel.shape[1] // 2
    for j in range(kernel.shape[0]):
        for i in range(kernel.shape[1]):
            grid[(j - ry) % height, (i - rx) % width] += kernel[j, i]
    return np.fft.fft2(grid)


def deconvolve(plane: FloatArray, border: str, kernel: FloatArray, gain: Gain) -> FloatArray:
    def build(spectrum: ComplexArray, fx: FloatArray, fy: FloatArray) -> ComplexArray:
        h = transfer(kernel, spectrum.shape[1], spectrum.shape[0])
        return gain(h, fx[None, :], fy[:, None])

    return spectral_filter(plane, border, build)  # type: ignore[arg-type]


def inverse_gain(cutoff: float, threshold: float) -> Gain:
    def gain(h: ComplexArray, fx: FloatArray, fy: FloatArray) -> ComplexArray:
        power = (h.real**2 + h.imag**2).astype(np.float64)
        keep = (np.sqrt(fx * fx + fy * fy) <= cutoff) & (np.sqrt(power) >= threshold)
        return np.where(keep, np.conj(h) / np.where(keep, power, 1), 0)

    return gain


def wiener_gain(k: float) -> Gain:
    def gain(h: ComplexArray, _fx: FloatArray, _fy: FloatArray) -> ComplexArray:
        return np.asarray(np.conj(h) / (h.real**2 + h.imag**2 + k), dtype=np.complex128)

    return gain


def blur(plane: FloatArray, kernel: FloatArray, border: str) -> FloatArray:
    return np.asarray(ndimage.correlate(plane, kernel, mode=SCIPY_MODES[border]), dtype=np.float64)


def _checks() -> None:
    # A Gaussian blur of a random plane: Wiener deconvolution with a small K brings the center of
    # the image at least twice as close to the original as the blurred plane is.
    rng = np.random.default_rng(3)
    plane = ndimage.gaussian_filter(rng.uniform(0, 255, (48, 40)), 1.0)
    kernel = gaussian_psf(1.5)
    blurred = blur(plane, kernel, "reflect")
    restored = deconvolve(blurred, "reflect", kernel, wiener_gain(1e-4))
    center = np.s_[8:-8, 8:-8]
    before = np.sqrt(((blurred - plane)[center] ** 2).mean())
    after = np.sqrt(((restored - plane)[center] ** 2).mean())
    if not after < 0.5 * before:
        _fail(f"Wiener deconvolution does not undo a known blur: {before:.3f} -> {after:.3f}")


def add_restoration_cases(plane: FloatArray, add: Add) -> None:
    _checks()
    psfs: list[dict[str, Any]] = [
        {"psf": "gaussian", "sigma": 1.5},
        {"psf": "motion", "length": 7, "angle": 30},
        {"psf": "defocus", "radius": 2.3},
    ]
    for params in psfs:
        for border in ("reflect101", "wrap"):
            add(
                "degrade-blur",
                {**params, "border": border},
                blur(plane, psf(params), border),
                "scipy.ndimage.correlate with the PSF kernel",
            )
    source = "numpy.fft on the plane extended with numpy.pad, divided by the PSF transform"
    for params, cutoff, threshold, border in (
        (psfs[0], 0.3, 0.05, "reflect"),
        (psfs[1], 0.5, 0.1, "reflect101"),
    ):
        output = deconvolve(plane, border, psf(params), inverse_gain(cutoff, threshold))
        case = {**params, "cutoff": cutoff, "threshold": threshold, "border": border}
        add("inverse-filter", case, output, source)
    for params, k, border in (
        (psfs[0], 0.01, "reflect"),
        (psfs[2], 0.005, "replicate"),
        (psfs[1], 0.02, "wrap"),
    ):
        output = deconvolve(plane, border, psf(params), wiener_gain(k))
        add("wiener-deconv", {**params, "noiseRatio": k, "border": border}, output, source)
