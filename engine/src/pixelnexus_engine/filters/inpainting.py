"""Inpainting: fill the selected area from the pixels around it.

The selection arrives as ``params["mask"]`` (see registry.py). The hole is every pixel the
selection touches, so a soft selection edge is filled too, and the studio then blends the
result in through the selection. Three methods:

* telea: the fast marching method of Telea (2004), with OpenCV's cv2.inpaint and INPAINT_TELEA.
  Pixels are filled in order of their distance from the edge of the hole. Each one is a
  weighted mean of the known pixels within the radius, each moved on by its gradient.
* ns: the Navier-Stokes method of Bertalmio, Bertozzi and Sapiro (2001), with cv2.inpaint and
  INPAINT_NS. It carries the smoothness of the image into the hole along the lines of equal
  brightness.
* biharmonic: the smoothest surface that meets the image at the edge of the hole, from
  scikit-image's inpaint_biharmonic, after Damelin and Hoang (2018).

Red, green and blue are filled together. Alpha is kept.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray
from skimage.restoration import inpaint_biharmonic

from pixelnexus_engine.planes import to_uint8
from pixelnexus_engine.registry import Progress, Rgba, register

Hole = NDArray[np.bool_]

OPENCV_FLAGS = {"telea": cv2.INPAINT_TELEA, "ns": cv2.INPAINT_NS}


def hole_of(mask: NDArray[np.uint8]) -> Hole:
    """The pixels to fill: every pixel the selection touches."""
    return np.asarray(mask) > 0


def fill(rgb: NDArray[np.uint8], hole: Hole, method: str, radius: int) -> NDArray[np.uint8]:
    """Fill the hole of an 8-bit RGB image. Pixels outside the hole stay exactly as they are."""
    if not hole.any():
        return rgb.copy()
    if hole.all():
        raise ValueError(
            "The selection covers the whole image, so there are no pixels to fill it from."
        )
    if method == "biharmonic":
        filled = inpaint_biharmonic(rgb / 255.0, hole, channel_axis=-1) * 255
        out = to_uint8(filled)
    else:
        source = np.ascontiguousarray(rgb)
        marks = np.where(hole, 255, 0).astype(np.uint8)
        out = np.asarray(cv2.inpaint(source, marks, radius, OPENCV_FLAGS[method]), np.uint8)
    # The libraries leave known pixels alone. Keep them exactly, whatever the rounding.
    return np.where(hole[..., None], out, rgb).astype(np.uint8)


def inpaint_image(image: Rgba, params: dict[str, Any]) -> Rgba:
    hole = hole_of(params["mask"])
    result = image.copy()
    if params["output"] == "hole":
        result[..., :3] = np.where(hole, 255, 0)[..., None].astype(np.uint8)
        return result
    result[..., :3] = fill(image[..., :3], hole, params["method"], params["radius"])
    return result


# Representation -------------------------------------------------------------------------------

METHODS: dict[str, list[dict[str, str]]] = {
    "telea": [
        {
            "name": "Fill order",
            "formula": "\\lvert \\nabla T \\rvert = 1 \\text{ in } \\Omega,\\quad T = 0 "
            "\\text{ on } \\partial\\Omega",
            "note": "Fast marching finds T, the distance of each hole pixel from the edge of the "
            "hole. Pixels are filled from the smallest T up, so the hole closes from its edge "
            "inward.",
        },
        {
            "name": "Estimate",
            "formula": "I(p) = \\frac{\\sum_{q \\in B_\\varepsilon(p)} w(p, q) \\big[I(q) + "
            "\\nabla I(q) \\cdot (p - q)\\big]}{\\sum_{q \\in B_\\varepsilon(p)} w(p, q)},\\quad "
            "w = \\underbrace{\\tfrac{p - q}{\\lvert p - q \\rvert} \\cdot N(p)}_{\\text{dir}}\\,"
            "\\underbrace{\\tfrac{1}{\\lvert p - q \\rvert^2}}_{\\text{dst}}\\,"
            "\\underbrace{\\tfrac{1}{1 + \\lvert T(p) - T(q) \\rvert}}_{\\text{lev}}",
            "note": "Each known pixel q near p predicts I(p) from its value and gradient. Pixels "
            "along the direction N = grad T, close by and at the same distance from the edge "
            "count most. OpenCV cv2.inpaint with INPAINT_TELEA.",
        },
    ],
    "ns": [
        {
            "name": "Equation",
            "formula": "\\nabla^{\\perp} I \\cdot \\nabla (\\Delta I) = 0 \\text{ in } \\Omega,"
            "\\quad I = I_0 \\text{ outside } \\Omega",
            "note": "The smoothness Delta I stays the same along the lines of equal brightness, as "
            "the vorticity of a 2D fluid is carried along its stream lines. So edges that meet "
            "the hole are continued into it. OpenCV cv2.inpaint with INPAINT_NS solves it in "
            "its own discrete way.",
        },
    ],
    "biharmonic": [
        {
            "name": "Equation",
            "formula": "\\Delta^2 I = 0 \\text{ in } \\Omega,\\quad I = I_0 "
            "\\text{ outside } \\Omega",
            "note": "The smoothest surface that meets the image at the edge of the hole, with "
            "its slope. scikit-image inpaint_biharmonic solves the discrete equation as a "
            "sparse linear system.",
        },
    ],
}


def inpaint_representation(params: dict[str, Any]) -> dict[str, Any]:
    method = params["method"]
    radius = f" The radius is {params['radius']} px." if method != "biharmonic" else ""
    hole = {
        "name": "Hole",
        "formula": "\\Omega = \\{ x : m(x) > 0 \\}",
        "note": "Every pixel the selection m touches. The studio blends the filled pixels in "
        "through the selection, so a soft edge fades.",
    }
    stages = [{**stage} for stage in METHODS[method]]
    stages[-1]["note"] += radius
    return {"kind": "stages", "stages": [hole, *stages]}


@register("inpaint", representation=inpaint_representation, mask=True)
def inpaint(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    result = inpaint_image(image, params)
    progress(1.0)
    return result
