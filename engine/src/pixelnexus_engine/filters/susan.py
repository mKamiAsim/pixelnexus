"""The SUSAN corner and edge detectors of Smith and Brady (1997), in PixelNexus's own code.

Around each pixel, the nucleus, a circular mask of 37 pixels (radius 3.4) is placed. Each
pixel of the mask counts as similar to the nucleus by c = exp(-((I - I_0) / t)^6), and the
sum n of these counts is the USAN area, the Univalue Segment Assimilating Nucleus. A flat area
gives n = 37, a straight edge about half of it, and a corner less. The corner response is
R = g - n where n < g, and 0 elsewhere, with the geometric threshold g a share of 37. Corners
are the pixels with R above 0 that are the largest in their 5 x 5 neighborhood.

The paper adds further tests on the shape of the USAN to remove false corners. This code
leaves them out. The 5 x 5 window of the non-maximum suppression is our choice.

The edge detector uses the same USAN area with the geometric threshold g = 3 n_max / 4 of the
paper, and the edge response R = g - n where n < g. The edge direction comes from the USAN, as
in the paper. Where the USAN area is at least the mask diameter (7 pixels) and its center of
gravity lies at least 1 pixel from the nucleus, the vector to the center of gravity is normal to
the edge. Elsewhere the USAN is a thin line along the edge, and its longest axis of symmetry is
found from the second moments. The paper gives the moments; the angle
0.5 atan2(2 Sxy, Sxx - Syy) of the axis is our form of its rule. Non-maximum suppression keeps
the pixels whose response is at least that of both neighbors along the normal, rounded to the
nearest of four directions, our choice. The paper's binary thinning rules, which also remove
noise points, are in a report we could not read. In their place, our choice: 8-connected pieces
shorter than a minimum length are removed with skimage.morphology.remove_small_objects.

The input is the luma (BT.709) in pixel levels, and the border mode fills the mask past the
edge.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage
from skimage.morphology import remove_small_objects

from pixelnexus_engine.planes import KB, KG, KR, Plane
from pixelnexus_engine.registry import Progress, Rgba, register

MASK_RADIUS = 3.4
# The mask diameter in pixels, the USAN area below which an edge point is intra-pixel.
MASK_DIAMETER = 2 * int(MASK_RADIUS) + 1
SUPPRESSION = 5
# scikit-image has no type hints.
remove_small: Any = remove_small_objects
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


# Edges ------------------------------------------------------------------------------------------


def usan_moments(plane: Plane, t: float, border: str) -> dict[str, Plane]:
    """The USAN area n and the sums of c times dx, dy, dx^2, dy^2 and dx dy over the mask."""
    reach = int(MASK_RADIUS)
    padded = np.pad(plane, reach, mode=PAD[border])  # type: ignore[call-overload]
    height, width = plane.shape
    sums = {key: np.zeros_like(plane) for key in ("n", "x", "y", "xx", "yy", "xy")}
    for dy, dx in OFFSETS:
        shifted = padded[reach + dy : reach + dy + height, reach + dx : reach + dx + width]
        c = np.exp(-(((shifted - plane) / t) ** 6))
        sums["n"] += c
        sums["x"] += c * dx
        sums["y"] += c * dy
        sums["xx"] += c * dx * dx
        sums["yy"] += c * dy * dy
        sums["xy"] += c * dx * dy
    return sums


def edge_normal(sums: dict[str, Plane]) -> Plane:
    """The angle of the edge normal, in radians, from the USAN."""
    n = sums["n"]
    gx, gy = sums["x"] / n, sums["y"] / n
    inter = (n >= MASK_DIAMETER) & (np.hypot(gx, gy) >= 1)
    # The longest axis of the USAN runs along the edge, so the normal is at a right angle to it.
    axis = 0.5 * np.arctan2(2 * sums["xy"], sums["xx"] - sums["yy"])
    normal: Plane = np.where(inter, np.arctan2(gy, gx), axis + np.pi / 2)
    return normal


def suppress(response: Plane, normal: Plane) -> NDArray[np.bool_]:
    """Pixels with a response at least that of both neighbors along the normal."""
    sector = np.rint(normal / (np.pi / 4)).astype(int) % 4
    steps = [(0, 1), (1, 1), (1, 0), (1, -1)]
    padded = np.pad(response, 1)
    height, width = response.shape
    keep = np.zeros(response.shape, bool)
    for index, (dy, dx) in enumerate(steps):
        ahead = padded[1 + dy : 1 + dy + height, 1 + dx : 1 + dx + width]
        behind = padded[1 - dy : 1 - dy + height, 1 - dx : 1 - dx + width]
        keep |= (sector == index) & (response >= ahead) & (response >= behind)
    out: NDArray[np.bool_] = keep & (response > 0)
    return out


def susan_edge_stages(image: Rgba, params: dict[str, Any]) -> dict[str, NDArray[Any]]:
    sums = usan_moments(luma(image), params["brightness"], params["border"])
    g = params["geometric"] * len(OFFSETS)
    response = np.where(sums["n"] < g, g - sums["n"], 0.0)
    normal = edge_normal(sums)
    thin = suppress(response, normal)
    edges = remove_small(thin, max_size=params["minLength"] - 1, connectivity=2)
    return {
        "n": sums["n"],
        "response": response,
        "normal": normal,
        "thin": thin,
        "edges": np.asarray(edges, bool),
    }


def susan_edge_representation(params: dict[str, Any]) -> dict[str, Any]:
    t, share = params["brightness"], params["geometric"]
    g = share * len(OFFSETS)
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "USAN area",
                "formula": f"n(r_0) = \\sum_r \\exp\\!\\left(-\\left(\\frac{{I(r) - I(r_0)}}"
                f"{{{t:g}}}\\right)^6\\right)",
                "note": f"Over a circle of {len(OFFSETS)} pixels. Flat areas give "
                f"{len(OFFSETS)}, straight edges about half.",
            },
            {
                "name": "Response",
                "formula": f"R(r_0) = \\begin{{cases}} g - n(r_0) & n(r_0) < g \\\\ 0 & "
                f"\\text{{otherwise}} \\end{{cases}},\\quad g = {share:g} \\cdot "
                f"{len(OFFSETS)} = {g:g}",
                "note": "The smaller the USAN, the stronger the edge.",
            },
            {
                "name": "Direction",
                "formula": "\\bar{r} - r_0 \\text{ or the longest axis of the USAN}",
                "note": "The center of gravity points across the edge. A thin USAN lies along it.",
            },
            {
                "name": "Suppression",
                "formula": "R(r_0) \\ge R(r_0 \\pm \\delta)",
                "note": "A pixel stays where it is the largest along the normal, in one of four "
                f"directions. Pieces shorter than {params['minLength']} pixels are removed.",
            },
        ],
    }


@register("susan-edge", representation=susan_edge_representation)
def susan_edge(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    stages = susan_edge_stages(image, params)
    progress(0.9)
    out = image.copy()
    if params["output"] == "response":
        g = params["geometric"] * len(OFFSETS)
        values = stages["response"] * (255 / g)
    else:
        values = np.where(stages["edges"], 255.0, 0.0)
    out[..., :3] = np.clip(np.rint(values), 0, 255).astype(np.uint8)[..., None]
    progress(1.0)
    return out
