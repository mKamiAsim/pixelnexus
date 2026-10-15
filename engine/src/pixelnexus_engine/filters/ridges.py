"""Ridge and vessel filters from the eigenvalues of the Hessian, with scikit-image.

All four run on pixel levels from 0 to 255, at the scales sigma_min, sigma_min + step, ... up
to sigma_max, and keep the largest response of each pixel over the scales. scikit-image finds
the Hessian with two first-derivative-of-Gaussian passes of sigma / sqrt(2) each, so the image
is smoothed by sigma in all.

* frangi: Frangi et al. (1998), skimage.filters.frangi. In 2D the plate term is 1.
* hessian: the hybrid Hessian filter of Ng et al. (2014), skimage.filters.hessian. It is Frangi
  with a fixed gamma, and every pixel whose response is exactly 0 is set to 1.
* sato: Sato et al. (1998), skimage.filters.sato.
* meijering: Meijering et al. (2004), skimage.filters.meijering, with alpha = 1/3.

The result is stretched so that the strongest response of each channel is 255.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from skimage.filters import frangi, hessian, meijering, sato

from pixelnexus_engine.filters.artifacts import NDIMAGE
from pixelnexus_engine.planes import Plane, filter_by_scope
from pixelnexus_engine.registry import Progress, Rgba, register

# The scikit-image functions have no type hints.
SKIMAGE: dict[str, Any] = {
    "frangi": frangi,
    "hessian": hessian,
    "sato": sato,
    "meijering": meijering,
}

NAMES = {"frangi": "Frangi", "hessian": "Hybrid Hessian", "sato": "Sato", "meijering": "Meijering"}


def scales(params: dict[str, Any]) -> list[float]:
    """sigma_min, sigma_min + step, ... up to sigma_max. Only sigma_min when max is below it."""
    low, high, step = params["sigmaMin"], params["sigmaMax"], params["sigmaStep"]
    count = max(0, int(np.floor((high - low) / step + 1e-9))) + 1
    return [round(low + k * step, 10) for k in range(count)]


def response(plane: Plane, kind: str, params: dict[str, Any]) -> Plane:
    """The ridge measure of one plane, before stretching."""
    common: dict[str, Any] = {
        "sigmas": scales(params),
        "black_ridges": params["ridges"] == "dark",
        "mode": NDIMAGE[params["border"]],
    }
    if kind == "frangi":
        common.update(beta=params["beta"], gamma=params["gamma"] or None)
    elif kind == "hessian":
        common.update(beta=params["beta"], gamma=params["gamma"])
    out: Plane = SKIMAGE[kind](plane, **common)
    return out


def stretched(values: Plane) -> Plane:
    """Scale so that the largest value is 255. All zeros stay zeros."""
    top = float(values.max())
    return values * (255 / top) if top > 0 else np.zeros_like(values)


def ridge_image(image: Rgba, kind: str, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda plane, _c: stretched(response(plane, kind, params)),
        progress,
        derived=True,
    )


# Representation -------------------------------------------------------------------------------

SIGN = {"dark": "the image is used as it is.", "bright": "the image is negated first."}

MEASURES = {
    "frangi": (
        "V = \\exp\\!\\left(-\\frac{R_B^2}{2\\beta^2}\\right)\\left(1 - \\exp\\!\\left(-"
        "\\frac{S^2}{2\\gamma^2}\\right)\\right),\\quad R_B = \\frac{\\lvert \\lambda_1 \\rvert}"
        "{\\lambda_2},\\quad S = \\sqrt{\\lambda_1^2 + \\lambda_2^2}",
        "Large when the curvature across the ridge is strong and the curvature along it is "
        "small. Where lambda_2 is negative, scikit-image clips it to 1e-10, so V is 0.",
    ),
    "hessian": (
        "V = \\begin{cases} \\exp\\!\\left(-\\frac{R_B^2}{2\\beta^2}\\right)\\left(1 - "
        "\\exp\\!\\left(-\\frac{S^2}{2\\gamma^2}\\right)\\right) & V > 0 \\\\ 1 & "
        "\\text{otherwise} \\end{cases}",
        "The Frangi measure with a fixed gamma. scikit-image sets every pixel whose "
        "response is exactly 0 to 1. That happens where the curvature has the wrong sign, "
        "so those pixels come out white.",
    ),
    "sato": (
        "T = \\sigma^2 \\max(\\lambda_{\\max}, 0)",
        "lambda_max is the larger eigenvalue. The factor sigma^2 makes the scales comparable.",
    ),
    "meijering": (
        "N = \\frac{\\max(\\lambda', 0)}{\\max_x \\max(\\lambda', 0)},\\quad \\lambda' = "
        "\\operatorname*{arg\\,max}_{\\mu \\in \\{\\lambda_1 + \\alpha\\lambda_2,\\ \\lambda_2 "
        "+ \\alpha\\lambda_1\\}} \\lvert \\mu \\rvert,\\quad \\alpha = \\tfrac{1}{3}",
        "Each eigenvalue is mixed with a third of the other. Each scale is divided by its "
        "largest value over the image.",
    ),
}


def ridge_representation(kind: str, params: dict[str, Any]) -> dict[str, Any]:
    sigmas = ", ".join(f"{s:g}" for s in scales(params))
    formula, note = MEASURES[kind]
    if kind == "frangi":
        gamma = params["gamma"]
        note += f" beta = {params['beta']:g}, gamma = " + (
            f"{gamma:g}." if gamma else "half of the largest S at each scale."
        )
    elif kind == "hessian":
        note += f" beta = {params['beta']:g}, gamma = {params['gamma']:g}."
    polarity = "dark" if params["ridges"] == "dark" else "bright"
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Hessian",
                "formula": "H_\\sigma = \\begin{pmatrix} I_{xx} & I_{xy} \\\\ I_{xy} & I_{yy} "
                "\\end{pmatrix} \\text{ of } G_\\sigma * I",
                "note": f"At the scales sigma = {sigmas} px, with Gaussian derivatives. For "
                f"{polarity} ridges, {SIGN[polarity]}",
            },
            {
                "name": "Eigenvalues",
                "formula": "\\lvert \\lambda_1 \\rvert \\le \\lvert \\lambda_2 \\rvert",
                "note": "The curvatures along and across the ridge. Across a dark ridge, "
                "lambda_2 is large and positive.",
            },
            {"name": NAMES[kind], "formula": formula, "note": note},
            {
                "name": "Scales",
                "formula": "R(x) = \\max_\\sigma V_\\sigma(x),\\quad "
                "q = 255\\, \\frac{R}{\\max_x R}",
                "note": "The largest response over the scales, stretched so the strongest is "
                "white.",
            },
        ],
    }


@register("frangi", representation=lambda p: ridge_representation("frangi", p))
def frangi_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return ridge_image(image, "frangi", params, progress)


@register("hessian", representation=lambda p: ridge_representation("hessian", p))
def hessian_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return ridge_image(image, "hessian", params, progress)


@register("sato", representation=lambda p: ridge_representation("sato", p))
def sato_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return ridge_image(image, "sato", params, progress)


@register("meijering", representation=lambda p: ridge_representation("meijering", p))
def meijering_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return ridge_image(image, "meijering", params, progress)
