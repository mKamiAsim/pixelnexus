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

Boundaries come from skimage.segmentation.mark_boundaries in yellow, scikit-image's default,
with its default mode "outer".
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray
from skimage.filters import threshold_multiotsu
from skimage.segmentation import (
    felzenszwalb,
    mark_boundaries,
    quickshift,
    relabel_sequential,
    slic,
)

from pixelnexus_engine.filters.keypoints import luma8
from pixelnexus_engine.labels import Labels, label_result, mean_colors
from pixelnexus_engine.planes import to_uint8
from pixelnexus_engine.registry import Progress, Rgba, register

# These functions of scikit-image have no type hints.
SKIMAGE: dict[str, Any] = {
    "slic": slic,
    "felzenszwalb": felzenszwalb,
    "quickshift": quickshift,
    "threshold_multiotsu": threshold_multiotsu,
    "mark_boundaries": mark_boundaries,
    "relabel_sequential": relabel_sequential,
}


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
