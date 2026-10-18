"""Segmentation from seeds: graph cuts, the random walker and GrabCut. The inside of the result can
become the selection.

Seeds come from the selection, in one of two ways:

* border: the selected pixels (above 127) are object seeds, and the pixels on the image edge
  outside the selection are background seeds. The rest is unknown.
* map: the selection is read as a map with three levels. Pixels at 192 or above are object
  seeds, pixels at 63 or below are background seeds, and the levels between are unknown. A
  feathered selection gives such a map, and so does the click-select tool.

Each filter works on the luma (BT.709) in pixel levels or, for GrabCut, on the RGB image.

* graph-cut: our own graph after Boykov and Jolly, cut with SciPy's maximum flow (Dinic). Each
  pixel is joined to its 8 neighbors with B = exp(-(Ip - Iq)^2 / (2 sigma^2)) / dist(p, q). The
  region terms are -ln Pr(I | object) and -ln Pr(I | background) from histograms of the seeds
  with 32 bins of 8 levels, with one count added to every bin (our choice, so no bin is 0).
  Unknown pixels link to the source with lambda R(background) and to the sink with
  lambda R(object). Seeds link with K = 1 + the largest sum of B at a pixel to their own
  terminal and with 0 to the other, as in the paper. SciPy needs whole-number capacities, so
  all weights are multiplied by 1000 and rounded (our choice). The object is every pixel that
  the source still reaches in the residual graph.
* random-walker: skimage.segmentation.random_walker on the luma from 0 to 1, with labels 1 for
  object seeds and 2 for background seeds, scikit-image's conjugate gradient with a Jacobi
  preconditioner (mode cg_j), and the probability of the object label.
* grabcut: cv2.grabCut on the 8-bit image in OpenCV's BGR order. With the box start it begins
  from the rectangle around the selection (GC_INIT_WITH_RECT). With the map start, 192 or above
  is certain object, 128 to 191 probable object, 64 to 127 probable background and 63 or below
  certain background (GC_INIT_WITH_MASK).

The result is a label map with the object as label 1 and the rest as 0.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy.sparse import csr_array
from scipy.sparse.csgraph import breadth_first_order, maximum_flow
from skimage.segmentation import random_walker

from pixelnexus_engine.filters.contours import gray
from pixelnexus_engine.filters.segmentation import show
from pixelnexus_engine.planes import KB, KG, KR
from pixelnexus_engine.registry import Progress, Rgba, register

# These functions have no type hints, or stubs that lag behind OpenCV 5.
SKIMAGE: dict[str, Any] = {"random_walker": random_walker}
CV: Any = cv2
OBJECT_LEVEL = 192
BACKGROUND_LEVEL = 63
BINS = 32
SCALE = 1000
FLOOR = 1e-4
NEIGHBORS = ((0, 1), (1, 0), (1, 1), (1, -1))


def luma(image: Rgba) -> NDArray[np.float64]:
    rgb = image[..., :3].astype(np.float64)
    out: NDArray[np.float64] = KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2]
    return out


def seeds(mask: NDArray[np.uint8], mode: str) -> tuple[NDArray[np.bool_], NDArray[np.bool_]]:
    """The object and background seeds, from the selection by the border or the map rule."""
    values = np.asarray(mask)
    if mode == "map":
        inside = values >= OBJECT_LEVEL
        outside = values <= BACKGROUND_LEVEL
    else:
        inside = values > 127
        outside = np.zeros(values.shape, bool)
        outside[[0, -1], :] = True
        outside[:, [0, -1]] = True
        outside &= ~inside
    if not inside.any():
        raise ValueError("There are no object seeds. Select a part of the object first.")
    if not outside.any():
        raise ValueError(
            "There are no background seeds. With the border rule, leave part of the image edge "
            "unselected. With the map rule, some pixels must be unselected."
        )
    if not (~inside & ~outside).any():
        raise ValueError(
            "Every pixel is a seed, so there is nothing to decide. With the map rule, feather "
            "the selection to leave a band of partly selected pixels."
        )
    return inside, outside


# Graph cuts -------------------------------------------------------------------------------------


def neighbor_pairs(
    shape: tuple[int, int],
) -> list[tuple[NDArray[np.intp], NDArray[np.intp], float]]:
    """The pixel index pairs in 4 directions, which join each pixel to its 8 neighbors, and the
    distance of each direction."""
    h, w = shape
    index = np.arange(h * w).reshape(h, w)
    out = []
    for dy, dx in NEIGHBORS:
        a = index[0 : h - dy, max(0, -dx) : w - max(0, dx)]
        b = index[dy:h, max(0, dx) : w + min(0, dx)]
        out.append((a.ravel(), b.ravel(), float(np.hypot(dy, dx))))
    return out


def region_costs(y: NDArray[np.float64], sample: NDArray[np.bool_]) -> NDArray[np.float64]:
    """-ln Pr(I | sample) at each pixel, from a histogram of the sample with one count added to
    every bin."""
    bins = np.minimum((y / (256 / BINS)).astype(np.intp), BINS - 1)
    counts = np.bincount(bins[sample], minlength=BINS).astype(np.float64)
    probability = np.maximum(counts / counts.sum(), FLOOR)
    cost: NDArray[np.float64] = -np.log(probability)[bins]
    return cost


def graph_cut_inside(image: Rgba, params: dict[str, Any]) -> NDArray[np.bool_]:
    inside, outside = seeds(params["mask"], params["seeds"])
    y = luma(image)
    h, w = y.shape
    n = h * w
    source, sink = n, n + 1
    rows, cols, caps = [], [], []
    total = np.zeros(n)
    flat = y.ravel()
    for a, b, dist in neighbor_pairs((h, w)):
        weight = np.exp(-((flat[a] - flat[b]) ** 2) / (2 * params["sigma"] ** 2)) / dist
        rows += [a, b]
        cols += [b, a]
        caps += [weight, weight]
        total += np.bincount(a, weights=weight, minlength=n)
        total += np.bincount(b, weights=weight, minlength=n)
    k = 1 + float(total.max())
    lam = params["lambda"]
    to_source = lam * region_costs(y, outside).ravel()
    to_sink = lam * region_costs(y, inside).ravel()
    obj, bkg = inside.ravel(), outside.ravel()
    to_source = np.where(obj, k, np.where(bkg, 0, to_source))
    to_sink = np.where(bkg, k, np.where(obj, 0, to_sink))
    pixels = np.arange(n)
    rows += [np.full(n, source), pixels]
    cols += [pixels, np.full(n, sink)]
    caps += [to_source, to_sink]
    capacity = np.rint(np.concatenate(caps) * SCALE).astype(np.int32)
    graph = csr_array(
        (capacity, (np.concatenate(rows), np.concatenate(cols))), shape=(n + 2, n + 2)
    )
    flow = maximum_flow(graph, source, sink).flow
    residual = csr_array(graph - flow)
    residual.data = (residual.data > 0).astype(np.int8)
    residual.eliminate_zeros()
    reached = breadth_first_order(residual, source, return_predecessors=False)
    side = np.zeros(n + 2, bool)
    side[reached] = True
    out: NDArray[np.bool_] = side[:n].reshape(h, w)
    return out


def graph_cut_representation(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "stages",
        "stages": [
            seed_stage(params),
            {
                "name": "Boundary",
                "formula": f"B_{{pq}} = \\exp\\left(-\\frac{{(I_p - I_q)^2}}{{2 \\cdot "
                f"{params['sigma']:g}^2}}\\right) \\frac{{1}}{{\\operatorname{{dist}}(p, q)}}",
                "note": "Each pixel joins its 8 neighbors. Similar neighbors cost more to cut.",
            },
            {
                "name": "Region",
                "formula": f"\\lambda = {params['lambda']:g},\\ R_p = -\\ln \\Pr(I_p \\mid "
                "\\text{seeds})",
                "note": f"From histograms of the object and background seeds with {BINS} bins.",
            },
            {
                "name": "Minimum cut",
                "formula": "\\min_A \\ \\lambda \\sum_p R_p(A_p) + \\sum_{A_p \\ne A_q} B_{pq}",
                "note": "SciPy's maximum flow finds the cheapest cut. Seeds keep their side.",
            },
        ],
    }


def seed_stage(params: dict[str, Any]) -> dict[str, Any]:
    if params["seeds"] == "map":
        return {
            "name": "Seeds",
            "formula": f"\\text{{object}} \\ge {OBJECT_LEVEL},\\ \\text{{background}} \\le "
            f"{BACKGROUND_LEVEL}",
            "note": "The selection as a map. Partly selected pixels are unknown.",
        }
    return {
        "name": "Seeds",
        "formula": "\\text{object} = \\text{selection},\\ \\text{background} = \\text{image edge}",
        "note": "The selected pixels and the unselected pixels on the image edge.",
    }


@register("graph-cut", representation=graph_cut_representation, mask=True)
def graph_cut(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba | dict[str, Any]:
    inside = graph_cut_inside(image, params)
    progress(0.9)
    return show(image, inside.astype(np.int64), params, "region")


# Random walker ----------------------------------------------------------------------------------


def walker_probability(image: Rgba, params: dict[str, Any]) -> NDArray[np.float64]:
    """The probability that a walker from each pixel first reaches an object seed."""
    inside, outside = seeds(params["mask"], params["seeds"])
    labels = np.zeros(inside.shape, np.int32)
    labels[inside] = 1
    labels[outside] = 2
    probability = SKIMAGE["random_walker"](
        luma(image) / 255,
        labels,
        beta=params["beta"],
        mode="cg_j",
        tol=params["tolerance"],
        return_full_prob=True,
    )
    out: NDArray[np.float64] = np.asarray(probability[0], dtype=np.float64)
    return out


def random_walker_representation(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "stages",
        "stages": [
            seed_stage(params),
            {
                "name": "Edge weights",
                "formula": f"w_{{ij}} = \\exp\\left(-\\frac{{{params['beta']:g}}}{{10\\, "
                "\\sigma_Y}} (Y_i - Y_j)^2\\right)",
                "note": "Each pixel joins its 4 neighbors. scikit-image divides beta by 10 times "
                "the standard deviation of the luma.",
            },
            {
                "name": "Solve",
                "formula": "L_U x = -B^T m",
                "note": "The probabilities solve a sparse linear system, with conjugate gradients "
                f"to a tolerance of {params['tolerance']:g}.",
            },
            {
                "name": "Decide",
                "formula": "\\text{object where } x \\ge 0.5",
                "note": "Each pixel joins the seed label its walker most likely reaches first.",
            },
        ],
    }


@register("random-walker", representation=random_walker_representation, mask=True)
def random_walker_filter(
    image: Rgba, params: dict[str, Any], progress: Progress
) -> Rgba | dict[str, Any]:
    probability = walker_probability(image, params)
    progress(0.9)
    if params["output"] == "probability":
        return gray(image, probability * 255)
    # scikit-image assigns the label with the largest probability, and the object label wins a
    # tie because it comes first.
    inside = probability >= 1 - probability
    return show(image, inside.astype(np.int64), params, "region")


# GrabCut ----------------------------------------------------------------------------------------


def box_of(mask: NDArray[np.uint8]) -> tuple[int, int, int, int]:
    """The rectangle around the selected pixels, as x, y, width and height."""
    rows, cols = np.nonzero(np.asarray(mask) > 127)
    if rows.size == 0:
        raise ValueError("The selection is empty. Select the area around the object first.")
    x, y = int(cols.min()), int(rows.min())
    box = (x, y, int(cols.max()) - x + 1, int(rows.max()) - y + 1)
    height, width = mask.shape
    if box[2] >= width and box[3] >= height:
        raise ValueError(
            "The box covers the whole image, so GrabCut has no background to learn from. "
            "Select a smaller area around the object."
        )
    return box


def grabcut_start(mask: NDArray[np.uint8]) -> NDArray[np.uint8]:
    """OpenCV's four classes from the map levels."""
    values = np.asarray(mask)
    out = np.full(values.shape, cv2.GC_PR_BGD, np.uint8)
    out[values >= 128] = cv2.GC_PR_FGD
    out[values >= OBJECT_LEVEL] = cv2.GC_FGD
    out[values <= BACKGROUND_LEVEL] = cv2.GC_BGD
    if not np.isin(out, (cv2.GC_FGD, cv2.GC_PR_FGD)).any():
        raise ValueError("There are no object pixels in the map. Select the object first.")
    if not np.isin(out, (cv2.GC_BGD, cv2.GC_PR_BGD)).any():
        raise ValueError("There are no background pixels in the map. Leave some unselected.")
    return out


def grabcut_inside(image: Rgba, params: dict[str, Any]) -> NDArray[np.bool_]:
    bgr = np.ascontiguousarray(image[..., 2::-1])
    background = np.zeros((1, 65), np.float64)
    foreground = np.zeros((1, 65), np.float64)
    if params["start"] == "box":
        classes = np.zeros(bgr.shape[:2], np.uint8)
        CV.grabCut(
            bgr,
            classes,
            box_of(params["mask"]),
            background,
            foreground,
            params["iterations"],
            cv2.GC_INIT_WITH_RECT,
        )
    else:
        classes = grabcut_start(params["mask"])
        CV.grabCut(
            bgr, classes, None, background, foreground, params["iterations"], cv2.GC_INIT_WITH_MASK
        )
    out: NDArray[np.bool_] = np.isin(classes, (cv2.GC_FGD, cv2.GC_PR_FGD))
    return out


def grabcut_representation(params: dict[str, Any]) -> dict[str, Any]:
    if params["start"] == "box":
        start = {
            "name": "Start",
            "formula": "\\text{outside the box} = \\text{background}",
            "note": "The rectangle around the selection. Inside it, every pixel may be object.",
        }
    else:
        start = {
            "name": "Start",
            "formula": f"\\ge {OBJECT_LEVEL} \\text{{ object}},\\ \\le {BACKGROUND_LEVEL} "
            "\\text{ background}",
            "note": "The selection as a map. The levels between are probable object or background.",
        }
    return {
        "kind": "stages",
        "stages": [
            start,
            {
                "name": "Color models",
                "formula": "p(z \\mid \\alpha) = \\sum_{k=1}^{5} \\pi_k \\mathcal{N}(z;\\ "
                "\\mu_k, \\Sigma_k)",
                "note": "A Gaussian mixture of 5 colors for the object and one for the background.",
            },
            {
                "name": "Graph cut",
                "formula": "\\min_\\alpha \\ U(\\alpha, z) + V(\\alpha, z)",
                "note": "Color costs plus edge costs between neighbors, cut with a maximum flow.",
            },
            {
                "name": "Repeat",
                "formula": f"{params['iterations']} \\text{{ rounds}}",
                "note": "Each round fits the color models to the last result and cuts again.",
            },
        ],
    }


@register("grabcut", representation=grabcut_representation, mask=True)
def grabcut(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba | dict[str, Any]:
    inside = grabcut_inside(image, params)
    progress(0.9)
    return show(image, inside.astype(np.int64), params, "region")
