"""Edge-preserving denoising: non-local means, total variation, the domain transform, the rolling
guidance filter and SUSAN smoothing.

Plane filters work on the planes of the channel scope in pixel levels (see planes.py).

* nlm: skimage.restoration.denoise_nl_means on the plane from 0 to 1, after Buades, Coll and
  Morel, with h and sigma given in levels and divided by 255. The fast mode is the one of Darbon
  et al. scikit-image pads the plane by reflection.
* tv-denoise: the ROF problem of Rudin, Osher and Fatemi on the plane from 0 to 1, with
  skimage.restoration.denoise_tv_chambolle (weight w = 1 / lambda) or denoise_tv_bregman
  (weight lambda / 2, so 1 / (2 w)), as their docstrings define the weights. Each solver keeps
  scikit-image's stop rule and tolerance. The two do not give the same image: on a noisy disk,
  even after 2000 steps, no split Bregman weight came within 22 levels of Chambolle's result
  everywhere, so the solvers are not interchangeable.
* domain-transform: cv2.ximgproc.dtFilter on the 8-bit RGB image, guided by itself, after Gastal
  and Oliveira, with the normalized convolution (NC), interpolated convolution (IC) or recursive
  filter (RF) mode.
* rolling-guidance: Zhang, Shen, Xu and Jia start from a Gaussian blur of sigma s, which removes
  small structures, then repeat a joint bilateral filter of the image guided by the last result.
  The paper start does this with cv2.GaussianBlur and cv2.ximgproc.jointBilateralFilter.
  cv2.ximgproc.rollingGuidanceFilter starts from the image itself instead (read in its source),
  so its first step is a plain bilateral filter. The OpenCV start calls it as it is.
* susan-smoothing: our own code after Smith and Brady. Each pixel becomes the mean of its
  neighbors, weighted by exp(-r^2 / (2 sigma^2) - (I - I0)^2 / t^2), with the center pixel left
  out, over a square of radius ceil(2 sigma) (our choice). Where the weights sum to 0, the pixel
  becomes the median of its 8 neighbors. The plane is padded by repeating its edge pixels.
"""

from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray
from skimage.restoration import denoise_nl_means, denoise_tv_bregman, denoise_tv_chambolle

from pixelnexus_engine.planes import Plane, filter_by_scope
from pixelnexus_engine.registry import Progress, Rgba, register

# These functions have no type hints, or stubs that lag behind OpenCV 5.
SKIMAGE: dict[str, Any] = {
    "nl_means": denoise_nl_means,
    "tv_chambolle": denoise_tv_chambolle,
    "tv_bregman": denoise_tv_bregman,
}
CV: Any = cv2
DT_MODES = {"nc": cv2.ximgproc.DTF_NC, "ic": cv2.ximgproc.DTF_IC, "rf": cv2.ximgproc.DTF_RF}


def with_rgb(image: Rgba, rgb: NDArray[np.uint8]) -> Rgba:
    out = image.copy()
    out[..., :3] = rgb
    return out


# Non-local means --------------------------------------------------------------------------------


def nlm_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    out = SKIMAGE["nl_means"](
        plane / 255,
        patch_size=params["patchSize"],
        patch_distance=params["patchDistance"],
        h=params["h"] / 255,
        fast_mode=params["fastMode"],
        sigma=params["sigma"] / 255,
    )
    result: Plane = np.asarray(out, dtype=np.float64) * 255
    return result


def nlm_representation(params: dict[str, Any]) -> dict[str, Any]:
    p, d = params["patchSize"], params["patchDistance"]
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Patches",
                "formula": f"{p} \\times {p} \\text{{ patches, searched within }} {d} "
                "\\text{ pixels}",
                "note": "Each pixel compares the patch around it with the patches around its "
                "neighbors in the search window.",
            },
            {
                "name": "Weights",
                "formula": f"w = \\exp\\left(-\\frac{{d^2}}{{h^2}}\\right),\\ h = {params['h']:g}",
                "note": "Similar patches weigh more, wherever they are."
                + (
                    f" With sigma {params['sigma']:g}, scikit-image subtracts the expected noise "
                    "variance from the patch distance."
                    if params["sigma"] > 0
                    else ""
                ),
            },
            {
                "name": "Average",
                "formula": "u(x) = \\frac{\\sum_y w(x, y)\\, f(y)}{\\sum_y w(x, y)}",
                "note": "The fast mode of Darbon et al. averages the patch distance with a flat "
                "kernel."
                if params["fastMode"]
                else "The classic mode weighs the patch distance with a Gaussian.",
            },
        ],
    }


@register("nlm", representation=nlm_representation)
def nlm(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image, params["channelScope"], lambda plane, _c: nlm_plane(plane, params), progress
    )


# Total variation --------------------------------------------------------------------------------


def tv_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    weight = params["weight"]
    if params["solver"] == "bregman":
        out = SKIMAGE["tv_bregman"](
            plane / 255,
            weight=1 / (2 * weight),
            max_num_iter=params["iterations"],
            isotropic=params["isotropic"],
        )
    else:
        out = SKIMAGE["tv_chambolle"](plane / 255, weight=weight, max_num_iter=params["iterations"])
    result: Plane = np.asarray(out, dtype=np.float64) * 255
    return result


def tv_representation(params: dict[str, Any]) -> dict[str, Any]:
    w = params["weight"]
    solver = (
        "Split Bregman of Goldstein and Osher"
        + ("" if params["isotropic"] else ", with the anisotropic total variation")
        if params["solver"] == "bregman"
        else "Chambolle's dual projection"
    )
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Energy",
                "formula": "\\min_u \\sum \\lvert \\nabla u \\rvert + \\frac{\\lambda}{2} "
                "(f - u)^2",
                "note": "Rudin, Osher and Fatemi: a small total variation, close to the image.",
            },
            {
                "name": "Weight",
                "formula": f"\\lambda = 1 / w = {1 / w:g}",
                "note": f"The smoothing weight is {w:g}, on the image from 0 to 1.",
            },
            {
                "name": "Solver",
                "formula": f"\\text{{at most }} {params['iterations']} \\text{{ steps}}",
                "note": f"{solver}, as in scikit-image.",
            },
        ],
    }


@register("tv-denoise", representation=tv_representation)
def tv_denoise(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image, params["channelScope"], lambda plane, _c: tv_plane(plane, params), progress
    )


# Domain transform -------------------------------------------------------------------------------


def domain_transform_rgb(image: Rgba, params: dict[str, Any]) -> NDArray[np.uint8]:
    rgb = np.ascontiguousarray(image[..., :3])
    out: NDArray[np.uint8] = CV.ximgproc.dtFilter(
        rgb,
        rgb,
        params["sigmaSpatial"],
        params["sigmaColor"],
        mode=DT_MODES[params["mode"]],
        numIters=params["iterations"],
    )
    return out


def domain_transform_representation(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Transform",
                "formula": f"ct(u) = \\int_0^u 1 + \\frac{{{params['sigmaSpatial']:g}}}"
                f"{{{params['sigmaColor']:g}}} \\sum_k \\lvert I_k'(x) \\rvert \\, dx",
                "note": "Each row and column is stretched where the colors change, so edges "
                "become long distances.",
            },
            {
                "name": "Filter",
                "formula": f"\\text{{mode }} {params['mode'].upper()}",
                "note": "A 1-D filter in the stretched domain, along rows and then columns.",
            },
            {
                "name": "Repeat",
                "formula": f"{params['iterations']} \\text{{ passes}}",
                "note": "Each pass uses a smaller sigma, so the passes add up to sigma H.",
            },
        ],
    }


@register("domain-transform", representation=domain_transform_representation)
def domain_transform(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    out = with_rgb(image, domain_transform_rgb(image, params))
    progress(1.0)
    return out


# Rolling guidance -------------------------------------------------------------------------------


def rolling_guidance_rgb(image: Rgba, params: dict[str, Any]) -> NDArray[np.uint8]:
    rgb = np.ascontiguousarray(image[..., :3])
    sigma_space, sigma_color = params["sigmaSpace"], params["sigmaColor"]
    if params["start"] == "opencv":
        out: NDArray[np.uint8] = CV.ximgproc.rollingGuidanceFilter(
            rgb,
            d=-1,
            sigmaColor=sigma_color,
            sigmaSpace=sigma_space,
            numOfIter=params["iterations"],
        )
        return out
    guide = CV.GaussianBlur(rgb, (0, 0), sigma_space)
    for _ in range(params["iterations"] - 1):
        guide = CV.ximgproc.jointBilateralFilter(guide, rgb, -1, sigma_color, sigma_space)
    result: NDArray[np.uint8] = guide
    return result


def rolling_guidance_representation(params: dict[str, Any]) -> dict[str, Any]:
    first = (
        {
            "name": "Start",
            "formula": f"J^1 = G_{{{params['sigmaSpace']:g}}} * I",
            "note": "A Gaussian blur removes the structures smaller than sigma s.",
        }
        if params["start"] == "paper"
        else {
            "name": "Start",
            "formula": "J^0 = I",
            "note": "OpenCV starts from the image, so its first step is a bilateral filter.",
        }
    )
    return {
        "kind": "stages",
        "stages": [
            first,
            {
                "name": "Rolling",
                "formula": "J^{t+1}(p) = \\frac{1}{K_p} \\sum_q e^{-\\frac{\\lVert p - q "
                "\\rVert^2}{2\\sigma_s^2} - \\frac{\\lVert J^t(p) - J^t(q) \\rVert^2}"
                "{2\\sigma_r^2}} I(q)",
                "note": f"A joint bilateral filter of the image, guided by the last result, with "
                f"sigma s {params['sigmaSpace']:g} and sigma r {params['sigmaColor']:g}.",
            },
            {
                "name": "Repeat",
                "formula": f"{params['iterations']} \\text{{ steps in all}}",
                "note": "Large edges come back step by step. Small structures stay away.",
            },
        ],
    }


@register("rolling-guidance", representation=rolling_guidance_representation)
def rolling_guidance(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    out = with_rgb(image, rolling_guidance_rgb(image, params))
    progress(1.0)
    return out


# SUSAN smoothing --------------------------------------------------------------------------------


def susan_radius(sigma: float) -> int:
    return max(1, math.ceil(2 * sigma))


def susan_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    sigma, t = params["sigma"], params["threshold"]
    radius = susan_radius(sigma)
    padded = np.pad(plane, radius, mode="edge")
    h, w = plane.shape
    total = np.zeros_like(plane)
    weights = np.zeros_like(plane)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dy == 0 and dx == 0:
                continue
            shifted = padded[radius + dy : radius + dy + h, radius + dx : radius + dx + w]
            weight = np.exp(-(dy * dy + dx * dx) / (2 * sigma**2) - ((shifted - plane) / t) ** 2)
            total += weight * shifted
            weights += weight
    out = np.divide(total, weights, out=np.zeros_like(plane), where=weights > 0)
    empty = weights == 0
    if empty.any():
        ring = np.pad(plane, 1, mode="edge")
        neighbors = np.stack(
            [
                ring[1 + dy : 1 + dy + h, 1 + dx : 1 + dx + w]
                for dy in (-1, 0, 1)
                for dx in (-1, 0, 1)
                if dy or dx
            ]
        )
        out[empty] = np.median(neighbors, axis=0)[empty]
    result: Plane = out
    return result


def susan_smoothing_representation(params: dict[str, Any]) -> dict[str, Any]:
    radius = susan_radius(params["sigma"])
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Weights",
                "formula": f"w = \\exp\\left(-\\frac{{r^2}}{{2 \\cdot {params['sigma']:g}^2}} - "
                f"\\frac{{(I - I_0)^2}}{{{params['threshold']:g}^2}}\\right)",
                "note": f"Over a {2 * radius + 1} x {2 * radius + 1} square, without the center "
                "pixel.",
            },
            {
                "name": "Average",
                "formula": "J = \\frac{\\sum w\\, I}{\\sum w}",
                "note": "Neighbors of similar brightness count, those across an edge barely do.",
            },
            {
                "name": "Fallback",
                "formula": "\\sum w = 0 \\Rightarrow J = \\operatorname{median}_8",
                "note": "The median of the 8 neighbors, as in Smith and Brady.",
            },
        ],
    }


@register("susan-smoothing", representation=susan_smoothing_representation)
def susan_smoothing(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image, params["channelScope"], lambda plane, _c: susan_plane(plane, params), progress
    )
