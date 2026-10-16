"""The bitonic filter of Treece, from the definitions of his technical report CUED/F-INFENG/TR 700
(2015), published as IEEE Transactions on Image Processing 25(11), 2016.

* Rank filter r_(w,c): the c-th centile in a disk w of diameter l, with
  scipy.ndimage.percentile_filter. The disk holds the offsets with dx^2 + dy^2 <= (l / 2)^2.
* Centile opening O = r_(w,100-c)(r_(w,c)(x)) and closing C = r_(w,c)(r_(w,100-c)(x)).
* Weights: e_O = |G_sigma(x - O)| and e_C = |G_sigma(C - x)|, with a Gaussian of sigma = 0.33 l
  that reaches 2 sigma (scipy.ndimage.gaussian_filter with truncate 2).
* Output: b = (e_O C + e_C O) / (e_O + e_C), with both weights set to 0.5 where both are 0.
* The image is extended symmetrically at its edges, as in the report (scipy's reflect mode).

The report uses c = 10 percent for noisy data, and 2 percent for clean data.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage

from pixelnexus_engine.planes import Plane, filter_by_scope
from pixelnexus_engine.registry import Progress, Rgba, register

Float = NDArray[np.float64]
SIGMA_SHARE = 0.33
TRUNCATE = 2.0


def disk(length: int) -> NDArray[np.bool_]:
    reach = length // 2
    dy, dx = np.mgrid[-reach : reach + 1, -reach : reach + 1]
    out: NDArray[np.bool_] = dy * dy + dx * dx <= (length / 2) ** 2
    return out


def rank(values: Float, centile: float, footprint: NDArray[np.bool_]) -> Float:
    out: Float = ndimage.percentile_filter(
        values, centile, footprint=footprint, mode="reflect"
    ).astype(np.float64)
    return out


def bitonic_parts(plane: Plane, length: int, centile: float) -> dict[str, Float]:
    """The opening, the closing, their smoothed errors, and the output."""
    footprint = disk(length)
    low, high = rank(plane, centile, footprint), rank(plane, 100 - centile, footprint)
    opening = rank(low, 100 - centile, footprint)
    closing = rank(high, centile, footprint)
    sigma = SIGMA_SHARE * length
    error_open = np.abs(
        ndimage.gaussian_filter(plane - opening, sigma, mode="reflect", truncate=TRUNCATE)
    )
    error_close = np.abs(
        ndimage.gaussian_filter(closing - plane, sigma, mode="reflect", truncate=TRUNCATE)
    )
    both_zero = (error_open == 0) & (error_close == 0)
    error_open = np.where(both_zero, 0.5, error_open)
    error_close = np.where(both_zero, 0.5, error_close)
    output = (error_open * closing + error_close * opening) / (error_open + error_close)
    return {
        "opening": opening,
        "closing": closing,
        "errorOpen": error_open,
        "errorClose": error_close,
        "output": output,
    }


def bitonic_representation(params: dict[str, Any]) -> dict[str, Any]:
    length, centile = params["length"], params["centile"]
    sigma = SIGMA_SHARE * length
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Open and close",
                "formula": f"O = r_{{{100 - centile:g}}}(r_{{{centile:g}}}(x)),\\quad "
                f"C = r_{{{centile:g}}}(r_{{{100 - centile:g}}}(x))",
                "note": f"Rank filters over a disk of diameter {length}, with the {centile:g}th "
                f"and {100 - centile:g}th centiles.",
            },
            {
                "name": "Errors",
                "formula": f"e_O = \\lvert G_{{{sigma:g}}} * (x - O) \\rvert,\\quad "
                f"e_C = \\lvert G_{{{sigma:g}}} * (C - x) \\rvert",
                "note": "Each difference from the input, smoothed with a Gaussian of sigma 0.33 l.",
            },
            {
                "name": "Combine",
                "formula": "b = \\frac{e_O\\, C + e_C\\, O}{e_O + e_C}",
                "note": "Where the opening fits the input worse, the closing gets more weight.",
            },
        ],
    }


@register("bitonic", representation=bitonic_representation)
def bitonic(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda plane, _c: bitonic_parts(plane, params["length"], params["centile"])["output"],
        progress,
    )
