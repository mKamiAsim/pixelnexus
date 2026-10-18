"""Tone mapping with OpenCV: Reinhard and Devlin, Drago et al., and Mantiuk et al.

The 8-bit image is decoded with the sRGB curve to linear light from 0 to 1, since the operators
expect radiance, and passed to OpenCV in BGR order as float32. OpenCV's operators end by
stretching their result from its minimum to its maximum and raising it to 1 / gamma (read in
OpenCV's tonemap.cpp). The result from 0 to 1 is scaled to 8 bits. A plain 8-bit image has a
small dynamic range, so the operators mostly change the tone curve and the local contrast.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray

from pixelnexus_engine.planes import to_uint8
from pixelnexus_engine.registry import Progress, Rgba, register

# The type stubs of OpenCV lag behind OpenCV 5.
CV: Any = cv2


def srgb_to_linear(values: NDArray[np.uint8]) -> NDArray[np.float32]:
    """The sRGB decoding curve, from 8-bit codes to linear light from 0 to 1."""
    c = values.astype(np.float64) / 255
    linear = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    out: NDArray[np.float32] = linear.astype(np.float32)
    return out


def tonemapper(params: dict[str, Any]) -> Any:
    gamma = params["gamma"]
    if params["operator"] == "drago":
        return CV.createTonemapDrago(gamma, params["saturation"], params["bias"])
    if params["operator"] == "mantiuk":
        return CV.createTonemapMantiuk(gamma, params["scale"], params["saturation"])
    return CV.createTonemapReinhard(
        gamma, params["intensity"], params["lightAdapt"], params["colorAdapt"]
    )


def tone_mapped(image: Rgba, params: dict[str, Any]) -> NDArray[np.uint8]:
    bgr = np.ascontiguousarray(srgb_to_linear(image[..., 2::-1]))
    out = np.asarray(tonemapper(params).process(bgr), dtype=np.float64)
    out = np.nan_to_num(out, nan=0.0)
    return to_uint8(out[..., ::-1] * 255)


def tone_mapping_representation(params: dict[str, Any]) -> dict[str, Any]:
    operator = params["operator"]
    if operator == "drago":
        stage = {
            "name": "Drago",
            "formula": "L_d \\propto \\frac{\\log(L + 1)}{\\log\\left(2 + 8 (L / L_{max})^"
            "{\\log b / \\log 0.5}\\right)}",
            "note": f"Adaptive logarithmic mapping, bias b {params['bias']:g}.",
        }
    elif operator == "mantiuk":
        stage = {
            "name": "Mantiuk",
            "formula": f"R' = {params['scale']:g}\\, R",
            "note": "The contrast response R in a pyramid of gradients of the log luminance is "
            "multiplied by the scale, and the image is rebuilt from it.",
        }
    else:
        stage = {
            "name": "Reinhard",
            "formula": "L_d = \\frac{L}{L + (f\\, I_a)^m}",
            "note": "A photoreceptor curve, with adaptation I a mixed from the pixel and the "
            f"image mean by light adaptation {params['lightAdapt']:g} and color adaptation "
            f"{params['colorAdapt']:g}, intensity {params['intensity']:g}.",
        }
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Linear light",
                "formula": "L = \\text{sRGB}^{-1}(I / 255)",
                "note": "The 8-bit codes are decoded to linear light.",
            },
            stage,
            {
                "name": "Display",
                "formula": f"\\left(\\frac{{L_d - \\min}}{{\\max - \\min}}\\right)^{{1 / "
                f"{params['gamma']:g}}}",
                "note": "OpenCV stretches the result and applies the gamma.",
            },
        ],
    }


@register("tone-mapping", representation=tone_mapping_representation)
def tone_mapping(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    out = image.copy()
    out[..., :3] = tone_mapped(image, params)
    progress(1.0)
    return out
