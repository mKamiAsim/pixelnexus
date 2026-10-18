"""Regularized and blind deconvolution: total variation, a sparse wavelet prior, and blind
Richardson-Lucy.

All three work on the plane extended with the border mode (see psf.py), with circular
convolutions through the FFT of the extended grid, and crop the result back to the plane. The
blurred plane g, extended, is the first estimate. Values are pixel values from 0 to 255, so the
weights lambda are in the same units.

* tv-deblur minimizes 1/2 ||h * f - g||^2 + lambda TV(f) with the primal-dual algorithm of
  Chambolle and Pock (2011), with theta = 1 and tau = sigma = 1 / sqrt(8). TV is the isotropic
  total variation with forward differences that wrap around at the grid edges. The data term is
  solved exactly in the Fourier domain in each step.
* sparse-fista minimizes 1/2 ||h * f - g||^2 + lambda ||D W f||_1 with FISTA of Beck and
  Teboulle (2009). W is an orthogonal wavelet transform (PyWavelets, periodization mode, on a
  grid whose sides are multiples of 2^J), and D keeps the detail coefficients, so the coarse
  approximation is not penalized. The PSF is normalized and has no negative weights, so
  |H| <= 1, and the step is 1.
* blind-deconv alternates Richardson-Lucy steps for the PSF and for the image, after Fish,
  Brinicombe, Pike and Walker (1995). After each PSF step, the PSF is kept inside a square
  support, made non-negative and scaled to sum 1. The support and these constraints are
  PixelNexus's choices.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pywt
import scipy.fft
from numpy.typing import NDArray

from pixelnexus_engine.filters.wavelets import shrink
from pixelnexus_engine.planes import Plane, filter_by_scope
from pixelnexus_engine.psf import (
    Spectrum,
    convolve,
    crop,
    extend,
    gaussian_kernel,
    psf_kernel,
    transfer,
)
from pixelnexus_engine.registry import Progress, Rgba, register

Field = NDArray[np.float64]

# Denominators of Richardson-Lucy below this count as this, as in the browser.
RL_EPSILON = 1e-12
CP_STEP = 1 / math.sqrt(8)


# Total variation ------------------------------------------------------------------------------


def gradient(f: Plane) -> tuple[Field, Field]:
    """Forward differences that wrap around at the grid edges."""
    return np.roll(f, -1, axis=1) - f, np.roll(f, -1, axis=0) - f


def divergence(px: Field, py: Field) -> Plane:
    """Backward differences that wrap around, the negative adjoint of gradient."""
    out: Plane = (px - np.roll(px, 1, axis=1)) + (py - np.roll(py, 1, axis=0))
    return out


def total_variation(f: Plane) -> float:
    gx, gy = gradient(f)
    return float(np.sum(np.hypot(gx, gy)))


def tv_deconvolve(g: Plane, h: Spectrum, lam: float, iterations: int) -> Plane:
    """Chambolle and Pock's algorithm 1 for min 1/2 ||h * f - g||^2 + lam TV(f) on the grid."""
    tau = sigma = CP_STEP
    g_hat = scipy.fft.fft2(g)
    numerator_g = tau * np.conj(h) * g_hat
    denominator = 1 + tau * np.abs(h) ** 2
    f = g.copy()
    f_bar = f.copy()
    px = np.zeros_like(g)
    py = np.zeros_like(g)
    for _ in range(iterations):
        # Dual step: ascend, then project onto the ball of radius lam at every pixel.
        gx, gy = gradient(f_bar)
        px += sigma * gx
        py += sigma * gy
        scale = np.maximum(1.0, np.hypot(px, py) / lam) if lam > 0 else np.inf
        px /= scale
        py /= scale
        # Primal step: the proximal map of the data term, solved in the Fourier domain.
        v = f + tau * divergence(px, py)
        f_new = scipy.fft.ifft2((scipy.fft.fft2(v) + numerator_g) / denominator).real
        f_bar = 2 * f_new - f
        f = f_new
    return f


def tv_energy(f: Plane, g: Plane, h: Spectrum, lam: float) -> float:
    residual = convolve(f, h) - g
    return 0.5 * float(np.sum(residual**2)) + lam * total_variation(f)


def tv_deblur_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    g, offset = extend(plane, params["border"])
    h = transfer(psf_kernel(params), g.shape)
    f = tv_deconvolve(g, h, params["lambda"], params["iterations"])
    return crop(f, plane.shape, offset)


# Sparse wavelet prior -------------------------------------------------------------------------


def wavelet_prox(v: Plane, wavelet: str, levels: int, threshold: float) -> Plane:
    """Soft-threshold the detail coefficients of an orthogonal wavelet transform."""
    coeffs = pywt.wavedec2(v, wavelet, mode="periodization", level=levels)
    shrunk = [coeffs[0]] + [
        tuple(shrink(band, threshold, "soft") for band in detail) for detail in coeffs[1:]
    ]
    out: Plane = pywt.waverec2(shrunk, wavelet, mode="periodization")
    return out


def wavelet_l1(f: Plane, wavelet: str, levels: int) -> float:
    coeffs = pywt.wavedec2(f, wavelet, mode="periodization", level=levels)
    return float(sum(np.sum(np.abs(band)) for detail in coeffs[1:] for band in detail))


def fista(g: Plane, h: Spectrum, lam: float, wavelet: str, levels: int, iterations: int) -> Plane:
    """Beck and Teboulle's FISTA with step 1 for min 1/2 ||h * f - g||^2 + lam ||D W f||_1."""
    x = g.copy()
    y = g.copy()
    t = 1.0
    for _ in range(iterations):
        step = y - convolve(convolve(y, h) - g, h, adjoint=True)
        x_new = wavelet_prox(step, wavelet, levels, lam)
        t_new = (1 + math.sqrt(1 + 4 * t * t)) / 2
        y = x_new + ((t - 1) / t_new) * (x_new - x)
        x, t = x_new, t_new
    return x


def sparse_energy(f: Plane, g: Plane, h: Spectrum, lam: float, wavelet: str, levels: int) -> float:
    residual = convolve(f, h) - g
    return 0.5 * float(np.sum(residual**2)) + lam * wavelet_l1(f, wavelet, levels)


def wavelet_levels(shape: tuple[int, ...], wavelet: str, wanted: int) -> int:
    """The levels asked for, capped where the coarsest band would be smaller than the filter."""
    return max(1, min(wanted, int(pywt.dwtn_max_level(shape, wavelet))))


def sparse_fista_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    wanted = params["levels"]
    g, offset = extend(plane, params["border"], 2**wanted)
    levels = wavelet_levels(g.shape, params["wavelet"], wanted)
    h = transfer(psf_kernel(params), g.shape)
    f = fista(g, h, params["lambda"], params["wavelet"], levels, params["iterations"])
    return crop(f, plane.shape, offset)


# Blind Richardson-Lucy ------------------------------------------------------------------------


def support_mask(shape: tuple[int, ...], radius: int) -> Field:
    """1 on the square of the given radius around the origin of the grid, wrapping around."""
    rows = np.minimum(np.arange(shape[0]), shape[0] - np.arange(shape[0])) <= radius
    columns = np.minimum(np.arange(shape[1]), shape[1] - np.arange(shape[1])) <= radius
    mask: Field = np.outer(rows, columns).astype(np.float64)
    return mask


def centered_grid(kernel: Field, shape: tuple[int, ...]) -> Field:
    """A kernel placed with its center at the origin of the grid."""
    grid = np.zeros(shape)
    ry, rx = kernel.shape[0] // 2, kernel.shape[1] // 2
    rows = (np.arange(kernel.shape[0]) - ry) % shape[0]
    columns = (np.arange(kernel.shape[1]) - rx) % shape[1]
    np.add.at(grid, np.ix_(rows, columns), kernel)
    return grid


def ratio(g: Plane, blurred: Plane) -> Plane:
    out: Plane = g / np.maximum(blurred, RL_EPSILON)
    return out


def psf_step(h: Field, f_hat: Spectrum, total: float, g: Plane, support: Field) -> Field:
    """One Richardson-Lucy step for the PSF with the image fixed, then the constraints. The
    image plays the role of the PSF, so the ratio is correlated with f and divided by its sum."""
    r = ratio(g, scipy.fft.ifft2(scipy.fft.fft2(h) * f_hat).real)
    h = h * scipy.fft.ifft2(scipy.fft.fft2(r) * np.conj(f_hat)).real / total
    h = np.maximum(h, 0) * support
    out: Field = h / h.sum()
    return out


def image_step(f: Plane, h_hat: Spectrum, g: Plane) -> Plane:
    """One Richardson-Lucy step for the image with the PSF fixed."""
    r = ratio(g, scipy.fft.ifft2(h_hat * scipy.fft.fft2(f)).real)
    out: Plane = f * scipy.fft.ifft2(scipy.fft.fft2(r) * np.conj(h_hat)).real
    return out


def blind_rl(
    g: Plane, psf: Field, radius: int, cycles: int, psf_steps: int, image_steps: int
) -> tuple[Plane, Field]:
    """Alternate Richardson-Lucy steps for the PSF and for the image. psf is on the grid, with
    its center at the origin. Returns the image and the PSF on the grid."""
    support = support_mask(g.shape, radius)
    f = g.copy()
    h = psf * support
    h /= h.sum()
    for _ in range(cycles):
        f_hat = scipy.fft.fft2(f)
        total = float(f.sum())
        for _ in range(psf_steps):
            h = psf_step(h, f_hat, total, g, support)
        h_hat = scipy.fft.fft2(h)
        for _ in range(image_steps):
            f = image_step(f, h_hat, g)
    return f, h


def psf_picture(h: Field, radius: int, shape: tuple[int, ...]) -> Plane:
    """The PSF in the middle of a black plane, with its largest weight at 255. Each weight is a
    square block, as large as fits in half the short side."""
    size = 2 * radius + 1
    kernel = np.roll(h, (radius, radius), axis=(0, 1))[:size, :size]
    block = max(1, min(shape) // (2 * size))
    picture = np.kron(kernel / max(float(kernel.max()), 1e-300) * 255, np.ones((block, block)))
    out = np.zeros(shape)
    top = (shape[0] - picture.shape[0]) // 2
    left = (shape[1] - picture.shape[1]) // 2
    ph, pw = min(picture.shape[0], shape[0]), min(picture.shape[1], shape[1])
    out[max(top, 0) : max(top, 0) + ph, max(left, 0) : max(left, 0) + pw] = picture[:ph, :pw]
    return out


def blind_deconv_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    g, offset = extend(np.maximum(plane, 0), params["border"])
    radius = params["support"]
    initial = centered_grid(gaussian_kernel(params["sigma"]), g.shape)
    f, h = blind_rl(g, initial, radius, params["cycles"], params["psfSteps"], params["imageSteps"])
    if params["output"] == "psf":
        return psf_picture(h, radius, plane.shape)
    return crop(f, plane.shape, offset)


# Representations ------------------------------------------------------------------------------


def psf_stage(params: dict[str, Any]) -> dict[str, str]:
    shape = params["psf"]
    if shape == "motion":
        text = f"Straight motion of {params['length']:g} px at {params['angle']:g} degrees."
        formula = "h = \\text{motion}(L, \\theta)"
    elif shape == "defocus":
        text = f"A defocus disk of radius {params['radius']:g} px."
        formula = "h = \\text{disk}(R)"
    else:
        text = f"A Gaussian of sigma {params['sigma']:g} px, cut at 4 sigma."
        formula = "h(x, y) \\propto e^{-(x^2 + y^2) / 2\\sigma^2}"
    return {
        "name": "PSF",
        "formula": formula,
        "note": text + " The same kernels as the browser deconvolution filters.",
    }


def tv_representation(params: dict[str, Any]) -> dict[str, Any]:
    lam = params["lambda"]
    return {
        "kind": "stages",
        "stages": [
            psf_stage(params),
            {
                "name": "Energy",
                "formula": f"\\min_f \\tfrac{{1}}{{2}} \\lVert h * f - g \\rVert^2 + {lam:g}\\, "
                "\\sum \\lvert \\nabla f \\rvert",
                "note": "Isotropic total variation with forward differences.",
            },
            {
                "name": "Dual step",
                "formula": "p \\leftarrow \\frac{p + \\sigma \\nabla \\bar{f}}"
                f"{{\\max\\big(1, \\lvert p + \\sigma \\nabla \\bar{{f}} \\rvert / {lam:g}\\big)}}",
            },
            {
                "name": "Primal step",
                "formula": "f' = \\mathcal{F}^{-1}\\!\\left(\\frac{\\mathcal{F}(f + \\tau "
                "\\operatorname{div} p) + \\tau \\overline{H}\\, \\mathcal{F} g}{1 + \\tau "
                "\\lvert H \\rvert^2}\\right),\\quad \\bar{f} = 2 f' - f",
                "note": f"tau = sigma = 1 / sqrt(8). {params['iterations']} iterations, "
                "starting from f = g and p = 0.",
            },
        ],
    }


def fista_representation(params: dict[str, Any]) -> dict[str, Any]:
    lam = params["lambda"]
    return {
        "kind": "stages",
        "stages": [
            psf_stage(params),
            {
                "name": "Energy",
                "formula": f"\\min_f \\tfrac{{1}}{{2}} \\lVert h * f - g \\rVert^2 + {lam:g}\\, "
                "\\lVert D W f \\rVert_1",
                "note": f"W is the orthogonal {params['wavelet']} wavelet transform with "
                f"{params['levels']} levels at most. D keeps the details.",
            },
            {
                "name": "Gradient step",
                "formula": "z = y_k - h' * (h * y_k - g)",
                "note": "h' is the PSF turned by a half turn. The step is 1, since |H| <= 1.",
            },
            {
                "name": "Shrink",
                "formula": f"x_k = W^{{-1}} \\eta_{{{lam:g}}}(W z)",
                "note": "Soft thresholding of the details. The approximation is kept.",
            },
            {
                "name": "Momentum",
                "formula": "t_{k+1} = \\tfrac{1 + \\sqrt{1 + 4 t_k^2}}{2},\\quad y_{k+1} = x_k + "
                "\\tfrac{t_k - 1}{t_{k+1}} (x_k - x_{k-1})",
                "note": f"{params['iterations']} iterations, starting from x_0 = y_1 = g, t_1 = 1.",
            },
        ],
    }


def blind_representation(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Start",
                "formula": f"f_0 = g,\\quad h_0 \\propto e^{{-(x^2 + y^2) / 2 \\cdot "
                f"{params['sigma']:g}^2}}",
                "note": f"The first PSF is a Gaussian guess, cut to the square support of "
                f"radius {params['support']}.",
            },
            {
                "name": "PSF steps",
                "formula": "h \\leftarrow \\Pi\\!\\left(h \\cdot \\frac{f' * \\big(g / (h * f)"
                "\\big)}{\\sum f}\\right)",
                "note": f"{params['psfSteps']} per cycle. f' is f turned by a half turn. Pi "
                "keeps the support, sets negative weights to 0 and scales the sum to 1.",
            },
            {
                "name": "Image steps",
                "formula": "f \\leftarrow f \\cdot \\big(h' * (g / (h * f))\\big)",
                "note": f"{params['imageSteps']} per cycle, as in Richardson-Lucy.",
            },
            {
                "name": "Cycles",
                "formula": f"\\text{{repeat }} {params['cycles']} \\text{{ times}}",
                "note": "Experimental. The pair of image and PSF is not unique, so the result "
                "depends on the first guess.",
            },
        ],
    }


@register("tv-deblur", representation=tv_representation)
def tv_deblur(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image, params["channelScope"], lambda p, _c: tv_deblur_plane(p, params), progress
    )


@register("sparse-fista", representation=fista_representation)
def sparse_fista(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image, params["channelScope"], lambda p, _c: sparse_fista_plane(p, params), progress
    )


@register("blind-deconv", representation=blind_representation)
def blind_deconv(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda p, _c: blind_deconv_plane(p, params),
        progress,
        derived=params["output"] == "psf",
    )
