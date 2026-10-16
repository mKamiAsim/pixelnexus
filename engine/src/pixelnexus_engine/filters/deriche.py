"""The Deriche edge operator, with OpenCV's ximgproc module.

cv2.ximgproc.GradientDericheX and GradientDericheY filter the 8-bit luma (BT.709, rounded) with
Deriche's recursive derivative filter along x and smooth along y, or the other way around. The
filter of the paper is f(x) = -c exp(-alpha |x|) sin(omega x). At alpha 1 and above, OpenCV's
scaling makes a step of h levels peak at h (checked on a step of 150). At smaller alpha the peak
is higher on a 40 pixel wide step image (184 at alpha 0.25), which we did not trace. The
magnitude is shown in levels, clipped at 255, with no stretch. The signed outputs show
128 + g / 2.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray

from pixelnexus_engine.planes import KB, KG, KR, to_uint8
from pixelnexus_engine.registry import Progress, Rgba, register

# The type stubs of OpenCV lag behind OpenCV 5.
CV: Any = cv2


def deriche_gradients(image: Rgba, params: dict[str, Any]) -> tuple[NDArray[Any], NDArray[Any]]:
    rgb = image[..., :3].astype(np.float64)
    luma = to_uint8(KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2])
    alpha, omega = params["alpha"], params["omega"]
    gx = np.asarray(CV.ximgproc.GradientDericheX(luma, alpha, omega), np.float64)
    gy = np.asarray(CV.ximgproc.GradientDericheY(luma, alpha, omega), np.float64)
    return gx, gy


def deriche_representation(params: dict[str, Any]) -> dict[str, Any]:
    a, w = params["alpha"], params["omega"]
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Operator",
                "formula": f"f(x) = -c\\, e^{{-{a:g} \\lvert x \\rvert}} \\sin({w:g}\\, x)",
                "note": "Deriche's derivative filter, run as a recursive filter forward and "
                "backward along each row or column.",
            },
            {
                "name": "Gradients",
                "formula": "g_x = f_x * s_y * Y,\\quad g_y = f_y * s_x * Y",
                "note": "Each derivative is paired with Deriche's smoothing filter across it.",
            },
            {
                "name": "Magnitude",
                "formula": "\\lvert g \\rvert = \\sqrt{g_x^2 + g_y^2}",
                "note": "At alpha 1 and above, a step of h levels peaks at h.",
            },
        ],
    }


@register("deriche", representation=deriche_representation)
def deriche(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    gx, gy = deriche_gradients(image, params)
    progress(0.9)
    output = params["output"]
    if output == "gx":
        values = 128 + gx / 2
    elif output == "gy":
        values = 128 + gy / 2
    else:
        values = np.hypot(gx, gy)
    out = image.copy()
    out[..., :3] = to_uint8(values)[..., None]
    progress(1.0)
    return out
