"""The Shen-Castan edge detector, after Shen and Castan (1992), with the discrete kernel and the
steps as Orhei et al. (2021) give them.

* Smoothing: the infinite symmetric exponential filter (ISEF), f(x, y) = (1 - b) / (1 + b)
  b^(|x| + |y|), which sums to 1. It is separable. Along each row and then each column we run a
  forward recursion y+[n] = (1 - b) x[n] + b y+[n - 1] and a backward one y-[n] = (1 - b) x[n]
  + b y-[n + 1], and combine them as (y+ + y- - (1 - b) x) / (1 + b), which is the kernel above.
  Each recursion starts in the steady state of the first value, so the image is extended by
  its edge pixels without end.
* Band-limited Laplacian: the smoothed image minus the original. The binary Laplacian is 1
  where it is positive and 0 elsewhere.
* Zero crossings: the pixels of the binary Laplacian that are 1 and have a 4-neighbor that is 0.
* Our choice for the last steps, which the sources describe only in outline (an adaptive
  gradient in a window, hysteresis and thinning): the gradient magnitude of the smoothed image
  by central differences (numpy.gradient), kept at the zero crossings, and
  skimage.filters.apply_hysteresis_threshold with a low and a high threshold in levels.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy.signal import lfilter
from skimage.filters import apply_hysteresis_threshold as skimage_hysteresis

from pixelnexus_engine.planes import KB, KG, KR, to_uint8
from pixelnexus_engine.registry import Progress, Rgba, register

Float = NDArray[np.float64]
# scikit-image has no type hints.
hysteresis: Any = skimage_hysteresis


def isef_axis(values: Float, b: float, axis: int) -> Float:
    """The ISEF along one axis, as a forward and a backward first order recursion."""
    moved = np.moveaxis(values, axis, -1)
    coefficients = ([1 - b], [1, -b])
    forward, _ = lfilter(*coefficients, moved, axis=-1, zi=b * moved[..., :1])
    backward, _ = lfilter(*coefficients, moved[..., ::-1], axis=-1, zi=b * moved[..., -1:])
    combined = (forward + backward[..., ::-1] - (1 - b) * moved) / (1 + b)
    out: Float = np.moveaxis(combined, -1, axis)
    return out


def isef(values: Float, b: float) -> Float:
    return isef_axis(isef_axis(values, b, 1), b, 0)


def luma(image: Rgba) -> Float:
    rgb = image[..., :3].astype(np.float64)
    out: Float = KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2]
    return out


def zero_crossings(positive: NDArray[np.bool_]) -> NDArray[np.bool_]:
    """The pixels of the positive region that have a 4-neighbor outside it."""
    padded = np.pad(positive, 1, mode="edge")
    outside = ~padded[:-2, 1:-1] | ~padded[2:, 1:-1] | ~padded[1:-1, :-2] | ~padded[1:-1, 2:]
    out: NDArray[np.bool_] = positive & outside
    return out


def shen_castan_stages(image: Rgba, params: dict[str, Any]) -> dict[str, NDArray[Any]]:
    y = luma(image)
    smoothed = isef(y, params["b"])
    laplacian = smoothed - y
    crossings = zero_crossings(laplacian > 0)
    gy, gx = np.gradient(smoothed)
    strength = np.where(crossings, np.hypot(gx, gy), 0.0)
    edges = hysteresis(strength, params["low"], params["high"])
    return {
        "smoothed": smoothed,
        "laplacian": laplacian,
        "binary": laplacian > 0,
        "crossings": crossings,
        "strength": strength,
        "edges": np.asarray(edges, bool),
    }


def shen_castan_representation(params: dict[str, Any]) -> dict[str, Any]:
    b = params["b"]
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Smooth",
                "formula": f"S = f * Y,\\quad f(x, y) = \\frac{{1 - {b:g}}}{{1 + {b:g}}}\\, "
                f"{b:g}^{{\\lvert x \\rvert + \\lvert y \\rvert}}",
                "note": "The ISEF, run as a forward and a backward recursion along each row and "
                "column.",
            },
            {
                "name": "Binary Laplacian",
                "formula": "B = [\\, S - Y > 0 \\,]",
                "note": "The smoothed image minus the original is a band-limited Laplacian. "
                "Its edges are where B changes.",
            },
            {
                "name": "Edges",
                "formula": f"\\lvert \\nabla S \\rvert \\text{{ at crossings, hysteresis }} "
                f"{params['low']:g}, {params['high']:g}",
                "note": "Our choice: the gradient of the smoothed image at the zero crossings, "
                "kept by hysteresis.",
            },
        ],
    }


@register("shen-castan", representation=shen_castan_representation)
def shen_castan(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    stages = shen_castan_stages(image, params)
    progress(0.9)
    output = params["output"]
    if output == "smoothed":
        values: Float = stages["smoothed"]
    elif output == "binary":
        values = np.where(stages["binary"], 255.0, 0.0)
    elif output == "laplacian":
        values = 128 + 4 * stages["laplacian"]
    else:
        values = np.where(stages["edges"], 255.0, 0.0)
    out = image.copy()
    out[..., :3] = to_uint8(values)[..., None]
    progress(1.0)
    return out
