"""Plug-and-play restoration: deblurring with a denoiser in place of a prior.

Both filters undo a known blur h (see psf.py) on the plane extended with the border mode, and
crop the result back. The denoiser is one of three that take the noise sigma as an input:

* wavelet: wavelet thresholding with BayesShrink, sym4, 3 levels and soft shrinking,
* stationary: the same rule on the stationary wavelet transform,
* nlm: non-local means of scikit-image, with h = 0.8 sigma, 5 x 5 patches, a search distance of
  6 pixels and the fast mode, the settings of the scikit-image example.

pnp-admm follows Venkatakrishnan, Bouman and Wohlberg (2013): ADMM for
1/2 ||h * x - g||^2 + lambda phi(x), where the proximal step of the prior is replaced by the
denoiser with sigma = sqrt(lambda / rho). After Chan, Wang and Elgendy (2017), rho grows by a
factor gamma in every step, so the steps shrink and the iteration settles. Here rho grows in
every step, a simple form of their rule.

red follows the fixed-point algorithm of Romano, Elad and Milanfar (2017) for
1 / (2 sigma_n^2) ||h * x - g||^2 + lambda / 2 x^T (x - D(x)). Each step solves
(H^T H / sigma_n^2 + lambda) x = H^T g / sigma_n^2 + lambda D(x_k) exactly with the FFT.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

import numpy as np
import scipy.fft
from skimage.restoration import denoise_nl_means

from pixelnexus_engine.filters.wavelets import stationary_plane, wavelet_threshold_plane
from pixelnexus_engine.planes import Plane, filter_by_scope
from pixelnexus_engine.psf import Spectrum, crop, extend, psf_kernel, transfer
from pixelnexus_engine.registry import Progress, Rgba, register

WAVELET_DENOISER = {
    "wavelet": "sym4",
    "levels": 3,
    "rule": "bayesshrink",
    "mode": "soft",
    "threshold": 0,
    "border": "reflect",
}
NLM_H = 0.8
NLM_PATCH = 5
NLM_DISTANCE = 6

# A denoiser: a plane and the noise sigma in, the denoised plane out.
Denoiser = Callable[[Plane, float], Plane]


def denoise(plane: Plane, kind: str, sigma: float) -> Plane:
    """The denoiser for Gaussian noise of the given sigma, in pixel values."""
    if sigma <= 0:
        return plane
    if kind == "nlm":
        out: Plane = denoise_nl_means(
            plane,
            h=NLM_H * sigma,
            sigma=sigma,
            patch_size=NLM_PATCH,
            patch_distance=NLM_DISTANCE,
            fast_mode=True,
        )
        return out
    params = {**WAVELET_DENOISER, "sigma": sigma}
    if kind == "stationary":
        return stationary_plane(plane, params)
    return wavelet_threshold_plane(plane, params)


def chosen(kind: str) -> Denoiser:
    return lambda plane, sigma: denoise(plane, kind, sigma)


def data_solve(numerator: Spectrum, h: Spectrum, weight: float) -> Plane:
    """Solve (H^T H + weight) x = n in the Fourier domain, for n given by its FFT."""
    out: Plane = scipy.fft.ifft2(numerator / (np.abs(h) ** 2 + weight)).real
    return out


def pnp_admm(
    g: Plane,
    h: Spectrum,
    lam: float,
    rho: float,
    gamma: float,
    iterations: int,
    denoiser: Denoiser,
) -> Plane:
    """ADMM with the denoiser as the prior step. Returns v, the last denoised estimate."""
    hg = np.conj(h) * scipy.fft.fft2(g)
    v = g.copy()
    u = np.zeros_like(g)
    for _ in range(iterations):
        x = data_solve(hg + rho * scipy.fft.fft2(v - u), h, rho)
        v = denoiser(x + u, math.sqrt(lam / rho))
        u = u + x - v
        rho *= gamma
    return v


def red_fixed_point(
    g: Plane,
    h: Spectrum,
    lam: float,
    noise: float,
    strength: float,
    iterations: int,
    denoiser: Denoiser,
) -> Plane:
    """RED by fixed-point steps: x = (H^T H + lam sigma_n^2)^-1 (H^T g + lam sigma_n^2 D(x))."""
    weight = lam * noise * noise
    hg = np.conj(h) * scipy.fft.fft2(g)
    x = g.copy()
    for _ in range(iterations):
        x = data_solve(hg + weight * scipy.fft.fft2(denoiser(x, strength)), h, weight)
    return x


def pnp_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    g, offset = extend(plane, params["border"])
    h = transfer(psf_kernel(params), g.shape)
    v = pnp_admm(
        g,
        h,
        params["lambda"],
        params["rho"],
        params["gamma"],
        params["iterations"],
        chosen(params["denoiser"]),
    )
    return crop(v, plane.shape, offset)


def red_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    g, offset = extend(plane, params["border"])
    h = transfer(psf_kernel(params), g.shape)
    x = red_fixed_point(
        g,
        h,
        params["lambda"],
        params["noise"],
        params["strength"],
        params["iterations"],
        chosen(params["denoiser"]),
    )
    return crop(x, plane.shape, offset)


# Representations ------------------------------------------------------------------------------

DENOISERS = {
    "wavelet": "wavelet thresholding (BayesShrink, sym4, 3 levels, soft)",
    "stationary": "stationary wavelet thresholding (BayesShrink, sym4, 3 levels, soft)",
    "nlm": "non-local means of scikit-image (h = 0.8 sigma, 5 x 5 patches, distance 6)",
}


def psf_note(params: dict[str, Any]) -> str:
    shape = params["psf"]
    if shape == "motion":
        return f"Straight motion of {params['length']:g} px at {params['angle']:g} degrees."
    if shape == "defocus":
        return f"A defocus disk of radius {params['radius']:g} px."
    return f"A Gaussian of sigma {params['sigma']:g} px, cut at 4 sigma."


def pnp_representation(params: dict[str, Any]) -> dict[str, Any]:
    lam, rho, gamma = params["lambda"], params["rho"], params["gamma"]
    return {
        "kind": "stages",
        "stages": [
            {"name": "PSF", "formula": "h", "note": psf_note(params)},
            {
                "name": "Data step",
                "formula": "x = \\mathcal{F}^{-1}\\!\\left(\\frac{\\overline{H}\\, \\mathcal{F} g "
                "+ \\rho_k\\, \\mathcal{F}(v - u)}{\\lvert H \\rvert^2 + \\rho_k}\\right)",
            },
            {
                "name": "Denoiser step",
                "formula": f"v = D_{{\\sigma_k}}(x + u),\\quad \\sigma_k = \\sqrt{{{lam:g} / "
                "\\rho_k}}",
                "note": f"D is {DENOISERS[params['denoiser']]}.",
            },
            {
                "name": "Dual update",
                "formula": f"u \\leftarrow u + x - v,\\quad \\rho_{{k+1}} = {gamma:g}\\, "
                f"\\rho_k,\\quad \\rho_0 = {rho:g}",
                "note": f"{params['iterations']} iterations, starting from v = g and u = 0. "
                "The result is the last v.",
            },
        ],
    }


def red_representation(params: dict[str, Any]) -> dict[str, Any]:
    lam, noise, strength = params["lambda"], params["noise"], params["strength"]
    return {
        "kind": "stages",
        "stages": [
            {"name": "PSF", "formula": "h", "note": psf_note(params)},
            {
                "name": "Energy",
                "formula": f"\\tfrac{{1}}{{2 \\cdot {noise:g}^2}} \\lVert h * x - g \\rVert^2 + "
                f"\\tfrac{{{lam:g}}}{{2}}\\, x^T \\big(x - D(x)\\big)",
                "note": f"D is {DENOISERS[params['denoiser']]}, with sigma {strength:g}.",
            },
            {
                "name": "Fixed-point step",
                "formula": "x_{k+1} = \\mathcal{F}^{-1}\\!\\left(\\frac{\\overline{H}\\, "
                "\\mathcal{F} g + \\lambda \\sigma_n^2\\, \\mathcal{F} D(x_k)}{\\lvert H "
                "\\rvert^2 + \\lambda \\sigma_n^2}\\right)",
                "note": f"{params['iterations']} iterations, starting from x_0 = g.",
            },
        ],
    }


@register("pnp-admm", representation=pnp_representation)
def pnp_admm_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image, params["channelScope"], lambda p, _c: pnp_plane(p, params), progress
    )


@register("red", representation=red_representation)
def red_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image, params["channelScope"], lambda p, _c: red_plane(p, params), progress
    )
