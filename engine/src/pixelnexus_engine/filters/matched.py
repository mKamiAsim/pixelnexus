"""The matched filter: find a template, taken from the selection, everywhere in the image.

The selection arrives as ``params["mask"]``. The template is the rectangle around the selected
pixels, cut from the luma (BT.709) in pixel levels.

* ncc: skimage.feature.match_template with pad_input, the normalized cross-correlation of the
  template with the window of the same size at every pixel, from -1 to 1. The image is padded
  by the template size with the border mode. A window with no variance gives 0. The value for a
  window whose top-left pixel is (top, left) lands on pixel (top + h // 2, left + w // 2), for
  a template of h x w pixels.
* correlation: the plain matched filter, the correlation with the template less its mean,
  aligned like ncc. It is the numerator of ncc, without the division by the spread of the
  window and the template.
* matches: the peaks of ncc that reach the threshold, at least half the smaller side of the
  template apart (our choice), at most the given number. Each row gives the center of the
  matching window, a radius of half the smaller side of the template, the score, and the size
  of the template.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy.signal import fftconvolve
from skimage.feature import match_template, peak_local_max

from pixelnexus_engine.planes import KB, KG, KR, Plane, to_uint8
from pixelnexus_engine.registry import Progress, Rgba, register

# These functions of scikit-image have no type hints.
SKIMAGE: dict[str, Any] = {"match_template": match_template, "peak_local_max": peak_local_max}
# Border modes of the catalog as numpy.pad modes.
PAD = {
    "reflect101": "reflect",
    "reflect": "symmetric",
    "replicate": "edge",
    "constant": "constant",
    "wrap": "wrap",
}
COLUMNS = [
    {"key": "x", "label": "x", "unit": "px"},
    {"key": "y", "label": "y", "unit": "px"},
    {"key": "radius", "label": "Radius", "unit": "px"},
    {"key": "score", "label": "Score", "unit": ""},
    {"key": "width", "label": "Width", "unit": "px"},
    {"key": "height", "label": "Height", "unit": "px"},
]


def luma(image: Rgba) -> Plane:
    rgb = image[..., :3].astype(np.float64)
    y: Plane = KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2]
    return y


def template_box(selected: NDArray[np.bool_]) -> tuple[int, int, int, int]:
    """Top, left, height and width of the rectangle around the selected pixels."""
    rows = np.flatnonzero(selected.any(axis=1))
    cols = np.flatnonzero(selected.any(axis=0))
    if rows.size == 0:
        raise ValueError("The selection is empty, so there is no template.")
    top, left = int(rows[0]), int(cols[0])
    return top, left, int(rows[-1]) - top + 1, int(cols[-1]) - left + 1


def template_of(plane: Plane, mask: NDArray[np.uint8]) -> Plane:
    top, left, height, width = template_box(np.asarray(mask) > 0)
    template: Plane = plane[top : top + height, left : left + width]
    if float(np.ptp(template)) == 0:
        raise ValueError(
            "The template is flat, so it matches nothing. Select an area with some detail."
        )
    return template


def ncc_map(plane: Plane, template: Plane, border: str) -> Plane:
    out: Plane = SKIMAGE["match_template"](plane, template, pad_input=True, mode=PAD[border])
    return out


def correlation_map(plane: Plane, template: Plane, border: str) -> Plane:
    """The correlation with the template less its mean, aligned like match_template."""
    height, width = template.shape
    padded = np.pad(plane, ((height, height), (width, width)), mode=PAD[border])  # type: ignore[call-overload]
    kernel = (template - template.mean())[::-1, ::-1]
    full: Plane = fftconvolve(padded, kernel, mode="valid")[1:-1, 1:-1]
    top, left = (height - 1) // 2, (width - 1) // 2
    out: Plane = full[top : top + plane.shape[0], left : left + plane.shape[1]]
    return out


def match_rows(scores: Plane, template: Plane, params: dict[str, Any]) -> list[list[float]]:
    height, width = template.shape
    spacing = max(1, min(height, width) // 2)
    peaks = SKIMAGE["peak_local_max"](
        scores,
        min_distance=spacing,
        threshold_abs=params["threshold"],
        exclude_border=False,
        num_peaks=params["matches"],
    )
    rows = []
    for r, c in peaks:
        # The window's top-left pixel, then its center.
        top, left = int(r) - height // 2, int(c) - width // 2
        rows.append(
            [
                left + (width - 1) / 2,
                top + (height - 1) / 2,
                min(height, width) / 2,
                round(float(scores[r, c]), 4),
                width,
                height,
            ]
        )
    rows.sort(key=lambda row: -row[3])
    return rows


def matched_filter_representation(params: dict[str, Any]) -> dict[str, Any]:
    stages = [
        {
            "name": "Template",
            "formula": "T = I\\big|_{\\text{rectangle around the selection}}",
            "note": "The luma inside the rectangle around the selected pixels.",
        },
        {
            "name": "Matched filter",
            "formula": "C(u, v) = \\sum_{x, y} I(u + x, v + y)\\, \\big(T(x, y) - \\bar T\\big)",
            "note": "The correlation with the template less its mean. Bright areas give large "
            "values even where they do not look like the template.",
        },
    ]
    if params["output"] != "correlation":
        stages.append(
            {
                "name": "Normalized",
                "formula": "\\gamma(u, v) = \\frac{\\sum (I - \\bar I_{u,v})(T - \\bar T)}"
                "{\\sqrt{\\sum (I - \\bar I_{u,v})^2 \\sum (T - \\bar T)^2}}",
                "note": "Divided by the spread of the window and the template, so it goes from "
                "-1 to 1 and does not change with the brightness or contrast of the window.",
            }
        )
    if params["output"] == "matches":
        stages.append(
            {
                "name": "Matches",
                "formula": f"\\gamma \\ge {params['threshold']:g}",
                "note": f"At most {params['matches']} peaks, at least half the smaller side of "
                "the template apart.",
            }
        )
    return {"kind": "stages", "stages": stages}


@register("matched-filter", representation=matched_filter_representation, mask=True)
def matched_filter(
    image: Rgba, params: dict[str, Any], progress: Progress
) -> Rgba | dict[str, Any]:
    plane = luma(image)
    template = template_of(plane, params["mask"])
    progress(0.2)
    output, border = params["output"], params["border"]
    out = image.copy()
    if output == "correlation":
        values = correlation_map(plane, template, border)
        top = float(np.abs(values).max())
        shown = 127.5 + 127.5 * values / top if top > 0 else np.full_like(values, 127.5)
        out[..., :3] = to_uint8(shown)[..., None]
        progress(1.0)
        return out
    scores = ncc_map(plane, template, border)
    progress(0.8)
    if output == "matches":
        rows = match_rows(scores, template, params)
        progress(1.0)
        noun = "match" if len(rows) == 1 else "matches"
        return {
            "kind": "features",
            "columns": COLUMNS,
            "rows": rows,
            "summary": f"{len(rows)} {noun}",
        }
    out[..., :3] = to_uint8((scores + 1) * 127.5)[..., None]
    progress(1.0)
    return out
