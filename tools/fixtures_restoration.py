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


def operator_power(operator: str, fx: FloatArray, fy: FloatArray) -> FloatArray:
    """|L|^2 of the identity, the forward-difference gradient or the 4-neighbor Laplacian."""
    if operator == "identity":
        return np.ones(np.broadcast_shapes(fx.shape, fy.shape))
    if operator == "gradient":
        return np.asarray(4 * (np.sin(np.pi * fx) ** 2 + np.sin(np.pi * fy) ** 2))
    return np.asarray((2 * np.cos(2 * np.pi * fx) + 2 * np.cos(2 * np.pi * fy) - 4) ** 2)


def regularized_gain(lam: float, operator: str) -> Gain:
    def gain(h: ComplexArray, fx: FloatArray, fy: FloatArray) -> ComplexArray:
        d = h.real**2 + h.imag**2 + lam * operator_power(operator, fx, fy)
        return np.where(d > 0, np.conj(h) / np.where(d > 0, d, 1), 0)

    return gain


def cls(plane: FloatArray, border: str, kernel: FloatArray, sigma: float) -> FloatArray:
    """Constrained least squares with the Laplacian, gamma by bisection on log10 gamma."""

    def build(spectrum: ComplexArray, fx: FloatArray, fy: FloatArray) -> ComplexArray:
        h = transfer(kernel, spectrum.shape[1], spectrum.shape[0])
        h2 = h.real**2 + h.imag**2
        p = operator_power("laplacian", fx[None, :], fy[:, None])
        g2 = spectrum.real**2 + spectrum.imag**2
        n = spectrum.size

        def residual(gamma: float) -> float:
            p2 = gamma * p
            share = np.where(h2 + p2 > 0, p2 / np.where(h2 + p2 > 0, h2 + p2, 1), 0)
            return float((share * share * g2).sum() / (n * n))

        low, high = -10.0, 4.0
        if residual(10**high) <= sigma * sigma:
            gamma = 10**high
        elif residual(10**low) >= sigma * sigma:
            gamma = 10**low
        else:
            for _ in range(60):
                mid = (low + high) / 2
                if residual(10**mid) < sigma * sigma:
                    low = mid
                else:
                    high = mid
            gamma = 10 ** ((low + high) / 2)
        return regularized_gain(gamma, "laplacian")(h, fx[None, :], fy[:, None])

    return spectral_filter(plane, border, build)  # type: ignore[arg-type]


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


def add_restoration_cases(plane: FloatArray, add: Add) -> dict[str, FloatArray]:
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
    for params, lam, operator, border in (
        (psfs[0], 0.02, "gradient", "reflect"),
        (psfs[1], 0.005, "laplacian", "reflect101"),
        (psfs[2], 0.01, "identity", "wrap"),
    ):
        output = deconvolve(plane, border, psf(params), regularized_gain(lam, operator))
        case = {**params, "lambda": lam, "operator": operator, "border": border}
        add("tikhonov", case, output, source)
    # The fixture stores inputs as whole numbers, so the reference uses the rounded blur too.
    defocused = np.round(blur(plane, psf(psfs[2]), "reflect"))
    for sigma, border in ((2.0, "reflect"), (8.0, "replicate")):
        output = cls(defocused, border, psf(psfs[2]), sigma)
        case = {**psfs[2], "noiseSigma": sigma, "border": border}
        add("cls", case, output, source + ", with gamma by bisection", "defocused")
    return {"defocused": defocused}
