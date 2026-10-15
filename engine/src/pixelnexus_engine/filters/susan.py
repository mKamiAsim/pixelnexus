"""The SUSAN corner detector of Smith and Brady (1997), in PixelNexus's own code.

Around each pixel, the nucleus, a circular mask of 37 pixels (radius 3.4) is placed. Each
pixel of the mask counts as similar to the nucleus by c = exp(-((I - I_0) / t)^6), and the
sum n of these counts is the USAN area, the Univalue Segment Assimilating Nucleus. A flat area
gives n = 37, a straight edge about half of it, and a corner less. The corner response is
R = g - n where n < g, and 0 elsewhere, with the geometric threshold g a share of 37. Corners
are the pixels with R above 0 that are the largest in their 5 x 5 neighborhood.

The paper adds further tests on the shape of the USAN to remove false corners. This code
leaves them out. The 5 x 5 window of the non-maximum suppression is our choice.

The input is the luma (BT.709) in pixel levels, and the border mode fills the mask past the
edge.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage

from pixelnexus_engine.planes import KB, KG, KR, Plane
from pixelnexus_engine.registry import Progress, Rgba, register

MASK_RADIUS = 3.4
SUPPRESSION = 5
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
    {"key": "score", "label": "Response", "unit": ""},
    {"key": "usan", "label": "USAN area", "unit": "px"},
]


def mask_offsets() -> list[tuple[int, int]]:
    """The 37 offsets (dy, dx) of the circular mask, the nucleus included."""
    reach = int(MASK_RADIUS)
    return [
        (dy, dx)
        for dy in range(-reach, reach + 1)
        for dx in range(-reach, reach + 1)
        if dy * dy + dx * dx <= MASK_RADIUS * MASK_RADIUS
    ]


OFFSETS = mask_offsets()


def luma(image: Rgba) -> Plane:
    rgb = image[..., :3].astype(np.float64)
    y: Plane = KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2]
    return y


def usan_area(plane: Plane, t: float, border: str) -> Plane:
    """n(r_0), the sum over the mask of exp(-((I(r) - I(r_0)) / t)^6)."""
    reach = int(MASK_RADIUS)
    padded = np.pad(plane, reach, mode=PAD[border])  # type: ignore[call-overload]
    height, width = plane.shape
    total = np.zeros_like(plane)
    for dy, dx in OFFSETS:
        shifted = padded[reach + dy : reach + dy + height, reach + dx : reach + dx + width]
        total += np.exp(-(((shifted - plane) / t) ** 6))
    return total


def corners(
    plane: Plane, params: dict[str, Any]
) -> tuple[NDArray[np.intp], NDArray[np.intp], Plane, Plane]:
    """Rows, columns, responses and USAN areas of the corners."""
    n = usan_area(plane, params["brightness"], params["border"])
    g = params["geometric"] * len(OFFSETS)
    response = np.where(n < g, g - n, 0.0)
    peaks = (response > 0) & (
        response == ndimage.maximum_filter(response, size=SUPPRESSION, mode="nearest")
    )
    # Touching equal maxima, as on symmetric shapes, give one corner: the first of each group.
    groups, count = ndimage.label(peaks, structure=np.ones((3, 3)))
    firsts = np.atleast_1d(
        ndimage.minimum(np.arange(peaks.size).reshape(peaks.shape), groups, range(1, count + 1))
    ).astype(np.intp)
    rows, cols = np.unravel_index(firsts, peaks.shape)
    return rows, cols, response, n


def susan_table(image: Rgba, params: dict[str, Any], progress: Progress) -> dict[str, Any]:
    rows, cols, response, n = corners(luma(image), params)
    progress(0.9)
    table = [
        [int(c), int(r), round(float(response[r, c]), 4), round(float(n[r, c]), 4)]
        for r, c in zip(rows, cols, strict=True)
    ]
    table.sort(key=lambda row: -row[2])
    progress(1.0)
    noun = "corner" if len(table) == 1 else "corners"
    return {
        "kind": "features",
        "columns": COLUMNS,
        "rows": table,
        "summary": f"{len(table)} {noun}",
    }


def susan_representation(params: dict[str, Any]) -> dict[str, Any]:
    t, share = params["brightness"], params["geometric"]
    g = share * len(OFFSETS)
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Mask",
                "formula": "\\lvert r - r_0 \\rvert \\le 3.4",
                "note": f"A circle of {len(OFFSETS)} pixels around each nucleus r_0.",
            },
            {
                "name": "USAN area",
                "formula": f"n(r_0) = \\sum_r \\exp\\!\\left(-\\left(\\frac{{I(r) - I(r_0)}}"
                f"{{{t:g}}}\\right)^6\\right)",
                "note": "How many pixels of the mask are about as bright as the nucleus. Flat "
                f"areas give {len(OFFSETS)}, straight edges about half, corners less.",
            },
            {
                "name": "Response",
                "formula": f"R(r_0) = \\begin{{cases}} g - n(r_0) & n(r_0) < g \\\\ 0 & "
                f"\\text{{otherwise}} \\end{{cases}},\\quad g = {share:g} \\cdot "
                f"{len(OFFSETS)} = {g:g}",
            },
            {
                "name": "Corners",
                "formula": f"R(r_0) > 0,\\quad R(r_0) = \\max_{{{SUPPRESSION} \\times "
                f"{SUPPRESSION}}} R",
                "note": "The further tests of the paper against false corners are left out.",
            },
        ],
    }


@register("susan-corner", representation=susan_representation)
def susan_corner(image: Rgba, params: dict[str, Any], progress: Progress) -> dict[str, Any]:
    return susan_table(image, params, progress)
