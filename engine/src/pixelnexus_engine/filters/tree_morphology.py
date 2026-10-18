"""Morphology with distances and max-trees: the medial axis and attribute openings and closings.

* medial-axis: skimage.morphology.medial_axis of the binary image, luma (BT.709) at or above
  128, as for the skeleton filter. It returns the axis and the distance transform, with a fixed
  random seed of 0 for its tie breaking. The distance output shows each axis pixel's distance to
  the background, stretched so the largest is white.
* area-opening and area-closing: skimage.morphology.area_opening and area_closing on each plane
  of the channel scope as 8-bit values, after Vincent. An area opening removes the bright
  connected components of every threshold level that have fewer pixels than the area, and an
  area closing the dark ones. scikit-image builds a max-tree, after Salembier, Oliveras and
  Garrido.
* attribute-opening: the area opening, or skimage.morphology.diameter_opening, whose attribute is
  the longer side of the bounding box of a component.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray
from skimage.morphology import area_closing, area_opening, diameter_opening, medial_axis

from pixelnexus_engine.planes import KB, KG, KR, Plane, filter_by_scope, to_uint8
from pixelnexus_engine.registry import Progress, Rgba, register

# These functions of scikit-image have no type hints.
SKIMAGE: dict[str, Any] = {
    "medial_axis": medial_axis,
    "area_opening": area_opening,
    "area_closing": area_closing,
    "diameter_opening": diameter_opening,
}
SEED = 0
AXIS_COLOR = (255, 214, 10)


# Medial axis ------------------------------------------------------------------------------------


def foreground(image: Rgba) -> NDArray[np.bool_]:
    rgb = image[..., :3].astype(np.float64)
    luma = KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2]
    out: NDArray[np.bool_] = np.rint(luma) >= 128
    return out


def axis_and_distance(image: Rgba) -> tuple[NDArray[np.bool_], NDArray[np.float64]]:
    axis, distance = SKIMAGE["medial_axis"](foreground(image), return_distance=True, rng=SEED)
    return np.asarray(axis, bool), np.asarray(distance, np.float64)


def medial_axis_representation(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Binary",
                "formula": "X = \\{ p : Y(p) \\ge 128 \\}",
                "note": "The foreground, the pixels with a luma of at least 128.",
            },
            {
                "name": "Distance",
                "formula": "D(p) = \\min_{q \\notin X} \\lVert p - q \\rVert",
                "note": "The Euclidean distance of each foreground pixel to the background.",
            },
            {
                "name": "Axis",
                "formula": "\\text{centers of maximal disks}",
                "note": "scikit-image thins the foreground, the pixels with the smallest "
                "distance first, keeping it connected.",
            },
        ],
    }


@register("medial-axis", representation=medial_axis_representation)
def medial_axis_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    axis, distance = axis_and_distance(image)
    progress(0.8)
    out = image.copy()
    output = params["output"]
    if output == "overlay":
        shown = image[..., :3] // 2
        shown[axis] = AXIS_COLOR
        out[..., :3] = shown
    elif output == "distance":
        on_axis = np.where(axis, distance, 0.0)
        top = float(on_axis.max())
        out[..., :3] = to_uint8(on_axis * (255 / top) if top > 0 else on_axis)[..., None]
    else:
        out[..., :3] = np.where(axis, 255, 0).astype(np.uint8)[..., None]
    progress(1.0)
    return out


# Attribute openings and closings ----------------------------------------------------------------


def attribute_plane(plane: Plane, kind: str, threshold: int, connectivity: int | str) -> Plane:
    values = to_uint8(plane)
    out = SKIMAGE[kind](values, threshold, connectivity=1 if int(connectivity) == 4 else 2)
    result: Plane = np.asarray(out, dtype=np.float64)
    return result


def attribute_stages(params: dict[str, Any], kind: str) -> dict[str, Any]:
    closing = kind == "area_closing"
    attribute = "diameter" if kind == "diameter_opening" else "area"
    unit = "px across" if attribute == "diameter" else "pixels"
    threshold = params.get("threshold", params.get("area"))
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Tree",
                "formula": "\\text{max-tree}" if not closing else "\\text{max-tree of } 255 - I",
                "note": f"Every {'dark' if closing else 'bright'} connected component of every "
                f"threshold level becomes a node, with {params['connectivity']}-connectivity.",
            },
            {
                "name": "Attribute",
                "formula": f"\\text{{{attribute}}}(C) < {threshold}",
                "note": f"Nodes smaller than {threshold} {unit} are marked for removal.",
            },
            {
                "name": "Filter",
                "formula": "\\gamma(I)" if not closing else "\\phi(I)",
                "note": "Each pixel takes the level of its nearest node that is kept, so small "
                f"{'pits fill' if closing else 'peaks flatten'} and nothing else changes.",
            },
        ],
    }


@register(
    "area-opening",
    representation=lambda params: attribute_stages(params, "area_opening"),
)
def area_opening_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda plane, _c: attribute_plane(
            plane, "area_opening", params["area"], params["connectivity"]
        ),
        progress,
    )


@register(
    "area-closing",
    representation=lambda params: attribute_stages(params, "area_closing"),
)
def area_closing_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda plane, _c: attribute_plane(
            plane, "area_closing", params["area"], params["connectivity"]
        ),
        progress,
    )


def attribute_kind(params: dict[str, Any]) -> str:
    return "diameter_opening" if params["attribute"] == "diameter" else "area_opening"


@register(
    "attribute-opening",
    representation=lambda params: attribute_stages(params, attribute_kind(params)),
)
def attribute_opening(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    kind = attribute_kind(params)
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda plane, _c: attribute_plane(plane, kind, params["threshold"], params["connectivity"]),
        progress,
    )
