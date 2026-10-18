"""Segmentation into regions with scikit-image, as label maps.

Each filter gives regions as a label map with a table (see labels.py), the region boundaries
drawn over the image, or every region filled with its mean color.

* slic: skimage.segmentation.slic on the RGB image from 0 to 1, which scikit-image turns into
  CIELAB. Labels start at 1 and are made sequential.
* felzenszwalb: skimage.segmentation.felzenszwalb on the RGB image from 0 to 1. Its labels
  start at 0, so they are shifted to start at 1.
* quickshift: skimage.segmentation.quickshift on the RGB image from 0 to 1 in CIELAB, with
  scikit-image's fixed seed 42 for breaking ties. Its labels are shifted to start at 1.
* multi-otsu: skimage.filters.threshold_multiotsu on the 8-bit luma (BT.709) with 256 bins.
  scikit-image's thresholds are gray levels that belong to the class below them, as in
  threshold_otsu, where only pixels above the threshold are foreground. So class k (from 0)
  holds the pixels above exactly k thresholds, numpy.digitize with right=True, and becomes label
  k + 1. The example in scikit-image's documentation uses numpy.digitize without right=True,
  which puts a pixel equal to a threshold in the class above. The classes
  are not split into connected parts.

* watershed: skimage.segmentation.watershed on the elevation, the Sobel magnitude
  (skimage.filters.sobel) of the luma (BT.709) in pixel levels after a Gaussian blur. A ramp
  that rises 1 level per pixel has the elevation sqrt(2). The markers are the regional minima
  of the elevation at least h deep (skimage.morphology.h_minima), labeled with 8-connectivity.
  Exact ties in the elevation are broken first, see minima_markers.
* marker-watershed: the same elevation, with markers from the selection. Each 8-connected part
  of the selected pixels (above 127) is one marker. With the border marker on, the pixels on
  the image edge outside the selection are one more marker, for the background.
* mean-shift: cv2.pyrMeanShiftFiltering on the 8-bit RGB image, after Comaniciu and Meer, with
  OpenCV's default stop after 5 iterations or a shift below 1. The regions are the 4-connected
  parts in which neighboring filtered colors differ by at most the color tolerance in each
  channel, our choice of grouping.

Boundaries come from skimage.segmentation.mark_boundaries in yellow, scikit-image's default,
with its default mode "outer".
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from skimage.filters import sobel, threshold_multiotsu
from skimage.morphology import h_minima
from skimage.segmentation import (
    felzenszwalb,
    mark_boundaries,
    quickshift,
    relabel_sequential,
    slic,
    watershed,
)

from pixelnexus_engine.filters.keypoints import luma8
from pixelnexus_engine.labels import Labels, label_result, mean_colors
from pixelnexus_engine.planes import KB, KG, KR, to_uint8
from pixelnexus_engine.registry import Progress, Rgba, register

# These functions of scikit-image have no type hints.
SKIMAGE: dict[str, Any] = {
    "slic": slic,
    "felzenszwalb": felzenszwalb,
    "quickshift": quickshift,
    "threshold_multiotsu": threshold_multiotsu,
    "mark_boundaries": mark_boundaries,
    "relabel_sequential": relabel_sequential,
    "watershed": watershed,
    "sobel": sobel,
    "h_minima": h_minima,
}
# The type stubs of OpenCV lag behind OpenCV 5.
CV: Any = cv2
EIGHT = np.ones((3, 3), bool)


def rgb01(image: Rgba) -> NDArray[np.float64]:
    out: NDArray[np.float64] = image[..., :3].astype(np.float64) / 255
    return out


def sequential(labels: NDArray[Any]) -> Labels:
    """Labels 1, 2, 3 and so on, in the order of their old numbers, with 0 kept as 0."""
    out, _, _ = SKIMAGE["relabel_sequential"](np.asarray(labels, dtype=np.int64))
    result: Labels = np.asarray(out, dtype=np.int64)
    return result


def with_boundaries(image: Rgba, labels: Labels) -> Rgba:
    marked = SKIMAGE["mark_boundaries"](rgb01(image), labels)
    out = image.copy()
    out[..., :3] = to_uint8(np.asarray(marked) * 255)
    return out


def show(image: Rgba, labels: Labels, params: dict[str, Any], noun: str) -> Rgba | dict[str, Any]:
    output = params["output"]
    if output == "boundaries":
        return with_boundaries(image, labels)
    if output == "mean":
        return mean_colors(labels, image)
    return label_result(labels, image, noun)


# SLIC -------------------------------------------------------------------------------------------


def slic_labels(image: Rgba, params: dict[str, Any]) -> Labels:
    labels = SKIMAGE["slic"](
        rgb01(image),
        n_segments=params["segments"],
        compactness=params["compactness"],
        max_num_iter=params["iterations"],
        sigma=params["sigma"],
        start_label=1,
        channel_axis=-1,
    )
    return sequential(labels)


def slic_representation(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Seeds",
                "formula": f"S = \\sqrt{{N / {params['segments']}}}",
                "note": f"About {params['segments']} cluster centers on a grid with the step S, "
                "in CIELAB color and position.",
            },
            {
                "name": "Distance",
                "formula": "D = \\sqrt{d_{\\text{lab}}^2 + \\left(\\frac{d_{xy}}{S}\\right)^2 "
                f"{params['compactness']:g}^2}}",
                "note": "Each pixel joins the nearest center within 2 S, by color and position.",
            },
            {
                "name": "Iterations",
                "formula": f"k \\le {params['iterations']}",
                "note": "The centers move to the mean of their pixels, and the pixels are "
                "assigned again. Then small parts join their neighbors.",
            },
        ],
    }


@register("slic", representation=slic_representation)
def slic_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba | dict[str, Any]:
    labels = slic_labels(image, params)
    progress(0.9)
    return show(image, labels, params, "superpixel")


# Felzenszwalb -----------------------------------------------------------------------------------


def felzenszwalb_labels(image: Rgba, params: dict[str, Any]) -> Labels:
    labels = SKIMAGE["felzenszwalb"](
        rgb01(image),
        scale=params["scale"],
        sigma=params["sigma"],
        min_size=params["minSize"],
        channel_axis=-1,
    )
    return sequential(np.asarray(labels) + 1)


def felzenszwalb_representation(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Graph",
                "formula": "w(p, q) = \\lVert I(p) - I(q) \\rVert",
                "note": f"After a Gaussian blur of sigma {params['sigma']:g}, each pixel links "
                "to its 8 neighbors, weighted by their color difference.",
            },
            {
                "name": "Merging",
                "formula": "w \\le \\min\\Big(\\operatorname{Int}(C_1) + \\frac{"
                f"{params['scale']:g}}}{{\\lvert C_1 \\rvert}},\\ \\operatorname{{Int}}(C_2) + "
                f"\\frac{{{params['scale']:g}}}{{\\lvert C_2 \\rvert}}\\Big)",
                "note": "Edges are taken from the lightest. Two regions merge when the edge "
                "between them is no heavier than the heaviest edge inside either, plus scale "
                "over its size.",
            },
            {
                "name": "Small regions",
                "formula": f"\\lvert C \\rvert \\ge {params['minSize']}",
                "note": "Smaller regions join a neighbor.",
            },
        ],
    }


@register("felzenszwalb", representation=felzenszwalb_representation)
def felzenszwalb_filter(
    image: Rgba, params: dict[str, Any], progress: Progress
) -> Rgba | dict[str, Any]:
    labels = felzenszwalb_labels(image, params)
    progress(0.9)
    return show(image, labels, params, "region")


# Quickshift -------------------------------------------------------------------------------------


def quickshift_labels(image: Rgba, params: dict[str, Any]) -> Labels:
    labels = SKIMAGE["quickshift"](
        rgb01(image),
        ratio=params["ratio"],
        kernel_size=params["kernelSize"],
        max_dist=params["maxDist"],
        sigma=params["sigma"],
        convert2lab=True,
        rng=42,
        channel_axis=-1,
    )
    return sequential(np.asarray(labels) + 1)


def quickshift_representation(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Density",
                "formula": "P(x) = \\sum_{y} e^{-\\lVert f(x) - f(y) \\rVert^2 / (2 "
                f"\\cdot {params['kernelSize']:g}^2)}}",
                "note": f"Over CIELAB color, with the color weighted by {params['ratio']:g}, and "
                "position.",
            },
            {
                "name": "Shift",
                "formula": "x \\to \\arg\\min_{y : P(y) > P(x)} \\lVert f(x) - f(y) \\rVert",
                "note": "Each pixel links to its nearest neighbor of higher density.",
            },
            {
                "name": "Cut",
                "formula": f"\\lVert f(x) - f(y) \\rVert \\le {params['maxDist']:g}",
                "note": "Longer links are cut. The trees that remain are the regions.",
            },
        ],
    }


@register("quickshift", representation=quickshift_representation)
def quickshift_filter(
    image: Rgba, params: dict[str, Any], progress: Progress
) -> Rgba | dict[str, Any]:
    labels = quickshift_labels(image, params)
    progress(0.9)
    return show(image, labels, params, "region")


# Multi-level Otsu -------------------------------------------------------------------------------


def multi_otsu_thresholds(image: Rgba, classes: int) -> NDArray[np.float64]:
    out: NDArray[np.float64] = SKIMAGE["threshold_multiotsu"](luma8(image), classes=classes)
    return out


def multi_otsu_labels(image: Rgba, params: dict[str, Any]) -> Labels:
    thresholds = multi_otsu_thresholds(image, params["classes"])
    labels: Labels = np.digitize(luma8(image), thresholds, right=True).astype(np.int64) + 1
    return labels


def multi_otsu_representation(params: dict[str, Any]) -> dict[str, Any]:
    classes = params["classes"]
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Histogram",
                "formula": "p_i = n_i / N,\\quad i = 0, \\dots, 255",
                "note": "Of the 8-bit luma.",
            },
            {
                "name": "Thresholds",
                "formula": f"(t_1, \\dots, t_{{{classes - 1}}}) = \\arg\\max "
                f"\\sum_{{k=1}}^{{{classes}}} \\omega_k (\\mu_k - \\mu)^2",
                "note": f"The {classes - 1} thresholds that split the histogram into {classes} "
                "classes with the largest variance between the classes.",
            },
            {
                "name": "Classes",
                "formula": "c(x) = \\#\\{j : I(x) > t_j\\}",
                "note": "Each pixel gets the class of its gray level. A level equal to a "
                "threshold belongs to the class below, as in Otsu's method.",
            },
        ],
    }


@register("multi-otsu", representation=multi_otsu_representation)
def multi_otsu(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba | dict[str, Any]:
    labels = multi_otsu_labels(image, params)
    progress(0.9)
    if params["output"] == "levels":
        classes = params["classes"]
        out = image.copy()
        out[..., :3] = to_uint8((labels - 1) * (255 / (classes - 1)))[..., None]
        return out
    return show(image, labels, params, "class")


# Watershed --------------------------------------------------------------------------------------


def elevation(image: Rgba, sigma: float) -> NDArray[np.float64]:
    """The Sobel magnitude of the luma in pixel levels, after a Gaussian blur of sigma."""
    rgb = image[..., :3].astype(np.float64)
    luma = KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2]
    if sigma > 0:
        luma = ndimage.gaussian_filter(luma, sigma, mode="nearest")
    out: NDArray[np.float64] = SKIMAGE["sobel"](luma)
    return out


TIE_BREAK = 1e-6


def minima_markers(height: NDArray[np.float64], h: float) -> Labels:
    """The minima at least h deep, as markers. h_minima counts every minimum that ties exactly
    with the lowest elevation, however shallow, so exact ties are broken first by adding up to
    1e-6, growing in raster order. This is our choice."""
    ramp = np.arange(height.size, dtype=np.float64).reshape(height.shape) / height.size
    minima = SKIMAGE["h_minima"](height + TIE_BREAK * ramp, h) > 0
    markers, _ = ndimage.label(minima, structure=EIGHT)
    out: Labels = markers.astype(np.int64)
    return out


def watershed_labels(image: Rgba, params: dict[str, Any]) -> Labels:
    height = elevation(image, params["sigma"])
    markers = minima_markers(height, params["h"])
    labels = SKIMAGE["watershed"](height, markers, compactness=params["compactness"])
    return sequential(labels)


def show_elevation(image: Rgba, params: dict[str, Any]) -> Rgba:
    height = elevation(image, params["sigma"])
    top = float(height.max())
    out = image.copy()
    out[..., :3] = to_uint8(height * (255 / top) if top > 0 else height)[..., None]
    return out


def watershed_stages(params: dict[str, Any], markers: dict[str, str]) -> dict[str, Any]:
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Elevation",
                "formula": f"E = \\lvert \\nabla (G_{{{params['sigma']:g}}} * Y) \\rvert",
                "note": "The Sobel magnitude of the blurred luma, in pixel levels. Edges are "
                "ridges, flat areas are valleys.",
            },
            markers,
            {
                "name": "Flooding",
                "formula": "L(x) = \\text{label of the basin that reaches } x \\text{ first}",
                "note": "Water rises from the markers. Each pixel joins the marker whose flood "
                "reaches it at the lowest level"
                + (
                    f", with the compactness {params['compactness']:g}."
                    if params.get("compactness")
                    else "."
                ),
            },
        ],
    }


def watershed_representation(params: dict[str, Any]) -> dict[str, Any]:
    return watershed_stages(
        params,
        {
            "name": "Markers",
            "formula": f"M = \\operatorname{{HMIN}}_{{{params['h']:g}}}(E)",
            "note": "The regional minima that are at least h deep. Shallower dips merge into "
            "their neighbors.",
        },
    )


@register("watershed", representation=watershed_representation)
def watershed_filter(
    image: Rgba, params: dict[str, Any], progress: Progress
) -> Rgba | dict[str, Any]:
    if params["output"] == "elevation":
        return show_elevation(image, params)
    labels = watershed_labels(image, params)
    progress(0.9)
    return show(image, labels, params, "region")


def selection_markers(mask: NDArray[np.uint8], border: bool) -> Labels:
    """One marker for each 8-connected part of the selection, and one for the image edge."""
    selected = np.asarray(mask) > 127
    markers, count = ndimage.label(selected, structure=EIGHT)
    if count == 0:
        raise ValueError("The selection is empty, so there are no markers.")
    out: Labels = markers.astype(np.int64)
    if border:
        edge = np.zeros(selected.shape, bool)
        edge[[0, -1], :] = True
        edge[:, [0, -1]] = True
        out[edge & ~selected] = count + 1
    return out


def marker_watershed_labels(image: Rgba, params: dict[str, Any]) -> Labels:
    height = elevation(image, params["sigma"])
    markers = selection_markers(params["mask"], params["borderMarker"])
    if int(markers.max()) < 2:
        raise ValueError(
            "There is only one marker. Select at least two separate areas, or turn on the "
            "border marker."
        )
    labels = SKIMAGE["watershed"](height, markers, compactness=params["compactness"])
    out: Labels = np.asarray(labels, dtype=np.int64)
    return out


def marker_watershed_representation(params: dict[str, Any]) -> dict[str, Any]:
    note = "Each separate part of the selection is one marker."
    if params["borderMarker"]:
        note += " The image edge outside the selection is one more, for the background."
    return watershed_stages(
        params,
        {"name": "Markers", "formula": "M = \\text{parts of the selection}", "note": note},
    )


@register("marker-watershed", representation=marker_watershed_representation, mask=True)
def marker_watershed(
    image: Rgba, params: dict[str, Any], progress: Progress
) -> Rgba | dict[str, Any]:
    if params["output"] == "elevation":
        return show_elevation(image, params)
    labels = marker_watershed_labels(image, params)
    progress(0.9)
    return show(image, labels, params, "region")


# Mean shift -------------------------------------------------------------------------------------


def mean_shift_colors(image: Rgba, params: dict[str, Any]) -> NDArray[np.uint8]:
    rgb = np.ascontiguousarray(image[..., :3])
    out: NDArray[np.uint8] = CV.pyrMeanShiftFiltering(
        rgb, params["spatialRadius"], params["colorRadius"], maxLevel=params["levels"]
    )
    return out


def similar_color_labels(rgb: NDArray[np.uint8], tolerance: int) -> Labels:
    """The 4-connected parts in which neighbors differ by at most the tolerance in each channel,
    numbered in raster order of their first pixel. A tolerance of 0 joins equal colors only."""
    height, width = rgb.shape[:2]
    index = np.arange(height * width).reshape(height, width)
    color = rgb.astype(np.int64)
    rows, cols = [], []
    for a, b, ia, ib in (
        (color[:, :-1], color[:, 1:], index[:, :-1], index[:, 1:]),
        (color[:-1], color[1:], index[:-1], index[1:]),
    ):
        close = np.abs(a - b).max(axis=2) <= tolerance
        rows.append(ia[close])
        cols.append(ib[close])
    first, second = np.concatenate(rows), np.concatenate(cols)
    graph = coo_matrix(
        (np.ones(len(first)), (first, second)), shape=(height * width, height * width)
    )
    _, parts = connected_components(graph, directed=False)
    return sequential_by_position(parts.reshape(height, width).astype(np.int64))


def sequential_by_position(labels: Labels) -> Labels:
    """Renumber labels in the raster order of their first pixel."""
    flat = labels.ravel()
    _, first = np.unique(flat, return_index=True)
    order = np.argsort(first)
    values = np.unique(flat)[order]
    lookup = np.zeros(int(flat.max()) + 1, np.int64)
    lookup[values] = np.arange(1, len(values) + 1)
    out: Labels = lookup[labels]
    return out


def mean_shift_representation(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Joint space",
                "formula": "x = (p_x, p_y, R, G, B)",
                "note": f"Each pixel is a point in position and color, searched within "
                f"{params['spatialRadius']:g} px and {params['colorRadius']:g} levels.",
            },
            {
                "name": "Mean shift",
                "formula": "x \\leftarrow \\frac{\\sum_{y \\in W(x)} y}{\\lvert W(x) \\rvert}",
                "note": "Each point moves to the mean of the points in its window until it "
                "stops, after at most 5 steps or a shift below 1. It takes the color of the "
                "place it stops.",
            },
            {
                "name": "Regions",
                "formula": f"\\lVert c(p) - c(q) \\rVert_\\infty \\le {params['colorTolerance']}",
                "note": "Neighbors p and q whose filtered colors differ this little join one "
                f"region. OpenCV runs on a pyramid of {params['levels'] + 1} levels.",
            },
        ],
    }


@register("mean-shift", representation=mean_shift_representation)
def mean_shift(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba | dict[str, Any]:
    colors = mean_shift_colors(image, params)
    progress(0.7)
    if params["output"] == "filtered":
        out = image.copy()
        out[..., :3] = colors
        return out
    labels = similar_color_labels(colors, params["colorTolerance"])
    progress(0.9)
    return show(image, labels, params, "region")
