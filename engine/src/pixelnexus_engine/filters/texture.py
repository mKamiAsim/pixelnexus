"""Texture descriptors: local binary and ternary patterns, gray-level co-occurrence, and HOG.

All work on the 8-bit luma (BT.709 weights, rounded).

* lbp: skimage.feature.local_binary_pattern with P points on a circle of radius R, after Ojala
  et al. (2002). The codes become an image, or a histogram table.
* ltp: local ternary patterns after Tan and Triggs (2010), in PixelNexus's own code, on the 8
  neighbors of each pixel. A neighbor n of the center c counts as +1 when n >= c + t, as -1
  when n <= c - t, and as 0 otherwise. The upper pattern has a bit for each +1 and the lower
  pattern a bit for each -1. Bit k belongs to the neighbor at 45 k degrees, counterclockwise
  from the right.
* glcm: skimage.feature.graycomatrix and graycoprops, after Haralick et al. (1973), on the luma
  quantized to a number of levels. The table gives every property for the whole image. The map
  gives one property in a sliding window. It counts the pairs whose two pixels both lie in the
  window, which is what graycomatrix counts on the window cut out, so each window equals
  scikit-image. Angles count counterclockwise from the x axis, so 90 degrees pairs a pixel with
  the one above. scikit-image counts its angles the other way, so it gets the negated angle.
* hog: skimage.feature.hog with its visualization, after Dalal and Triggs (2005).
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from numpy.typing import NDArray
from skimage.feature import graycomatrix, graycoprops, hog, local_binary_pattern

from pixelnexus_engine.filters.keypoints import luma8
from pixelnexus_engine.planes import Plane, to_uint8
from pixelnexus_engine.registry import Progress, Rgba, register

Gray8 = NDArray[np.uint8]

# These functions of scikit-image have no type hints.
SKIMAGE: dict[str, Any] = {
    "lbp": local_binary_pattern,
    "graycomatrix": graycomatrix,
    "graycoprops": graycoprops,
    "hog": hog,
}

PROPERTIES = ["contrast", "dissimilarity", "homogeneity", "ASM", "energy", "correlation", "entropy"]
# The 8 neighbors as (dy, dx), counterclockwise from the right. y points down.
NEIGHBORS = [(0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1)]
PAD = {
    "reflect101": "reflect",
    "reflect": "symmetric",
    "replicate": "edge",
    "constant": "constant",
    "wrap": "wrap",
}


def gray_image(image: Rgba, plane: Plane) -> Rgba:
    """An 8-bit gray result with the alpha of the image."""
    out = image.copy()
    out[..., :3] = to_uint8(plane)[..., None]
    return out


def histogram_table(codes: NDArray[np.int64], size: int, noun: str) -> dict[str, Any]:
    counts = np.bincount(codes.ravel(), minlength=size)
    total = max(1, int(counts.sum()))
    rows = [[k, int(c), round(float(c) / total, 6)] for k, c in enumerate(counts)]
    return {
        "kind": "features",
        "columns": [
            {"key": "code", "label": "Code", "unit": ""},
            {"key": "count", "label": "Pixels", "unit": ""},
            {"key": "share", "label": "Share", "unit": ""},
        ],
        "rows": rows,
        "summary": f"{size} {noun}",
    }


# Representations ------------------------------------------------------------------------------

LBP_METHODS = {
    "default": "All 2^P codes. Not rotation invariant.",
    "ror": "Each code turned to its smallest rotation, so it is rotation invariant.",
    "uniform": "Codes with at most 2 changes between 0 and 1 around the circle, labeled by "
    "their number of 1s, and one label for all others: P + 2 labels.",
    "nri_uniform": "Uniform codes kept apart by rotation, and one label for all others: "
    "P (P - 1) + 3 labels.",
    "var": "The variance of the P samples, a measure of contrast, not a code.",
}


def lbp_representation(params: dict[str, Any]) -> dict[str, Any]:
    points, radius = params["points"], params["radius"]
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Samples",
                "formula": f"g_p = I\\big(x + {radius:g} \\cos \\tfrac{{2\\pi p}}{{{points}}},\\ "
                f"y - {radius:g} \\sin \\tfrac{{2\\pi p}}{{{points}}}\\big),\\quad p = 0, \\dots, "
                f"{points - 1}",
                "note": "Points between pixels are interpolated bilinearly by scikit-image.",
            },
            {
                "name": "Code",
                "formula": r"\mathrm{LBP} = \sum_p s(g_p - g_c)\, 2^p,\quad s(z) = "
                r"\begin{cases} 1 & z \ge 0 \\ 0 & z < 0 \end{cases}",
                "note": LBP_METHODS[params["method"]],
            },
        ],
    }


def ltp_representation(params: dict[str, Any]) -> dict[str, Any]:
    t = params["threshold"]
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Ternary code",
                "formula": f"s(n) = \\begin{{cases}} +1 & n \\ge c + {t:g} \\\\ 0 & \\lvert n - c "
                f"\\rvert < {t:g} \\\\ -1 & n \\le c - {t:g} \\end{{cases}}",
                "note": "For each of the 8 neighbors n of the center c.",
            },
            {
                "name": "Upper and lower",
                "formula": r"U = \sum_k [s_k = +1]\, 2^k,\quad L = \sum_k [s_k = -1]\, 2^k",
                "note": "Bit k belongs to the neighbor at 45 k degrees, counterclockwise from "
                "the right.",
            },
        ],
    }


def glcm_representation(params: dict[str, Any]) -> dict[str, Any]:
    levels = params["levels"]
    dy, dx = offset(params["distance"], float(params["angle"]))
    stages = [
        {
            "name": "Levels",
            "formula": f"q = \\lfloor {levels}\\, Y / 256 \\rfloor",
            "note": f"The 8-bit luma in {levels} levels.",
        },
        {
            "name": "Co-occurrence",
            "formula": r"P(i, j) = \frac{\#\{p : q(p) = i,\ q(p + d) = j\}}{\#\{p\}}",
            "note": f"d = ({dx}, {-dy}) px, x to the right and y up"
            + (". Counted both ways, so P is symmetric." if params["symmetric"] else "."),
        },
    ]
    if params["output"] == "table":
        stages.append(
            {
                "name": "Properties",
                "formula": r"\text{contrast} = \sum_{i,j} P_{ij} (i - j)^2,\quad \text{ASM} = "
                r"\sum_{i,j} P_{ij}^2,\ \dots",
                "note": "Every property of graycoprops, for distances 1 and the chosen one "
                "and the angles 0, 45, 90 and 135 degrees.",
            }
        )
    else:
        stages.append(
            {
                "name": "Map",
                "formula": f"\\text{{{params['property']}}}\\big(P_{{\\text{{window}}}}\\big)",
                "note": f"P of the {params['window']} x {params['window']} window around each "
                "pixel, counting pairs with both pixels inside it. The map is stretched to "
                "the full gray range.",
            }
        )
    return {"kind": "stages", "stages": stages}


def hog_representation(params: dict[str, Any]) -> dict[str, Any]:
    cell, block, bins = params["cellSize"], params["blockSize"], params["orientations"]
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Gradients",
                "formula": r"G_x = I(x + 1) - I(x - 1),\quad G_y = I(y + 1) - I(y - 1)",
                "note": "Centered differences, with their magnitude and an angle from 0 to "
                "180 degrees.",
            },
            {
                "name": "Cells",
                "formula": rf"h_c(b),\quad b = 1, \dots, {bins}",
                "note": f"A histogram of {bins} orientation bins in each {cell} x {cell} cell, "
                "weighted by magnitude.",
            },
            {
                "name": "Blocks",
                "formula": f"v \\leftarrow \\text{{{params['blockNorm']}}}(v)",
                "note": f"Blocks of {block} x {block} cells, each normalized on its own.",
            },
            {
                "name": "View",
                "formula": r"\text{one line per bin, as long as its weight}",
                "note": "The visualization of scikit-image. Each line lies across the gradient, "
                "along the edge.",
            },
        ],
    }


# Local binary patterns --------------------------------------------------------------------------


def lbp_codes(gray: Gray8, params: dict[str, Any]) -> Plane:
    out: Plane = SKIMAGE["lbp"](gray, params["points"], params["radius"], params["method"])
    return out


def lbp_code_count(points: int, method: str) -> int:
    """How many codes a method can give, for scaling them to 0 to 255."""
    if method == "uniform":
        return points + 2
    if method == "nri_uniform":
        return points * (points - 1) + 3
    return int(2**points)


@register("lbp", representation=lbp_representation)
def lbp(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba | dict[str, Any]:
    codes = lbp_codes(luma8(image), params)
    progress(1.0)
    method = params["method"]
    if method == "var":
        top = float(np.nanmax(codes)) if np.isfinite(codes).any() else 0.0
        values = np.nan_to_num(codes)
        return gray_image(image, values * (255 / top) if top > 0 else values)
    count = lbp_code_count(params["points"], method)
    if params["output"] == "histogram":
        return histogram_table(codes.astype(np.int64), count, "codes")
    return gray_image(image, codes * (255 / max(1, count - 1)))


# Local ternary patterns -------------------------------------------------------------------------


def ltp_codes(gray: Gray8, t: float, border: str) -> tuple[NDArray[np.int64], NDArray[np.int64]]:
    """The upper and lower pattern codes of every pixel."""
    values = gray.astype(np.float64)
    padded = np.pad(values, 1, mode=PAD[border])  # type: ignore[call-overload]
    height, width = values.shape
    upper = np.zeros(values.shape, dtype=np.int64)
    lower = np.zeros(values.shape, dtype=np.int64)
    for bit, (dy, dx) in enumerate(NEIGHBORS):
        neighbor = padded[1 + dy : 1 + dy + height, 1 + dx : 1 + dx + width]
        upper |= (neighbor >= values + t).astype(np.int64) << bit
        lower |= (neighbor <= values - t).astype(np.int64) << bit
    return upper, lower


@register("ltp", representation=ltp_representation)
def ltp(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba | dict[str, Any]:
    upper, lower = ltp_codes(luma8(image), params["threshold"], params["border"])
    progress(1.0)
    if params["output"] == "histogram":
        up = np.bincount(upper.ravel(), minlength=256)
        down = np.bincount(lower.ravel(), minlength=256)
        return {
            "kind": "features",
            "columns": [
                {"key": "code", "label": "Code", "unit": ""},
                {"key": "upper", "label": "Upper pixels", "unit": ""},
                {"key": "lower", "label": "Lower pixels", "unit": ""},
            ],
            "rows": [[k, int(up[k]), int(down[k])] for k in range(256)],
            "summary": "256 codes",
        }
    codes = upper if params["output"] == "upper" else lower
    return gray_image(image, codes.astype(np.float64))


# Gray-level co-occurrence -----------------------------------------------------------------------


def quantized(gray: Gray8, levels: int) -> NDArray[np.int64]:
    """Levels 0 to levels - 1, each covering 256 / levels gray values."""
    return (gray.astype(np.int64) * levels) // 256


def offset(distance: int, degrees: float) -> tuple[int, int]:
    """(dy, dx) of the partner pixel. Angles count counterclockwise, and y points down."""
    theta = math.radians(degrees)
    return -round(math.sin(theta) * distance), round(math.cos(theta) * distance)


def glcm_table(q: NDArray[np.int64], params: dict[str, Any]) -> dict[str, Any]:
    levels = params["levels"]
    rows = []
    for distance in sorted({1, params["distance"]}):
        for degrees in (0, 45, 90, 135):
            matrix = SKIMAGE["graycomatrix"](
                q.astype(np.uint8),
                [distance],
                [-math.radians(degrees)],
                levels=levels,
                symmetric=params["symmetric"],
                normed=True,
            )
            values = [float(SKIMAGE["graycoprops"](matrix, p)[0, 0]) for p in PROPERTIES]
            rows.append([distance, degrees, *[round(v, 6) for v in values]])
    return {
        "kind": "features",
        "columns": [
            {"key": "distance", "label": "Distance", "unit": "px"},
            {"key": "angle", "label": "Angle", "unit": "deg"},
            *({"key": p.lower(), "label": p, "unit": ""} for p in PROPERTIES),
        ],
        "rows": rows,
        "summary": f"{len(rows)} offsets",
    }


def window_sum(values: Plane, top: Any, left: Any, bottom: Any, right: Any) -> Plane:
    """Sums of values over rows top..bottom - 1 and columns left..right - 1, clipped."""
    s = np.zeros((values.shape[0] + 1, values.shape[1] + 1))
    s[1:, 1:] = values.cumsum(axis=0).cumsum(axis=1)
    height, width = values.shape
    t, b = np.clip(top, 0, height), np.clip(bottom, 0, height)
    lf, r = np.clip(left, 0, width), np.clip(right, 0, width)
    b, r = np.maximum(b, t), np.maximum(r, lf)
    out: Plane = s[b, r] - s[t, r] - s[b, lf] + s[t, lf]
    return out


def glcm_map(q: NDArray[np.int64], params: dict[str, Any], progress: Progress) -> Plane:
    """One property of the co-occurrence matrix of the window around every pixel."""
    levels, size = params["levels"], params["window"]
    dy, dx = offset(params["distance"], float(params["angle"]))
    height, width = q.shape
    half = size // 2
    rows, cols = np.mgrid[0:height, 0:width]
    # The window of pixel (r, c) is rows r - half .. r + half, clipped to the image. A pair
    # (p, p + d) counts when both lie in it, so p lies in the window shifted by -d as well.
    top = np.maximum(rows - half, 0)
    bottom = np.minimum(rows + half + 1, height)
    left = np.maximum(cols - half, 0)
    right = np.minimum(cols + half + 1, width)
    p_top, p_bottom = np.maximum(top, top - dy), np.minimum(bottom, bottom - dy)
    p_left, p_right = np.maximum(left, left - dx), np.minimum(right, right - dx)
    # The partner of each first pixel p, where it exists.
    partner = np.full(q.shape, -1, dtype=np.int64)
    src_r = slice(max(0, -dy), height - max(0, dy))
    src_c = slice(max(0, -dx), width - max(0, dx))
    dst_r = slice(max(0, dy), height - max(0, -dy))
    dst_c = slice(max(0, dx), width - max(0, -dx))
    partner[src_r, src_c] = q[dst_r, dst_c]

    def count(mask: NDArray[np.bool_]) -> Plane:
        return window_sum(mask.astype(np.float64), p_top, p_left, p_bottom, p_right)

    counts = {}
    for i in range(levels):
        first = q == i
        for j in range(levels):
            counts[i, j] = count(first & (partner == j))
        progress((i + 1) / levels * 0.9)
    total: Plane = np.sum(list(counts.values()), axis=0)
    if params["symmetric"]:
        counts = {(i, j): counts[i, j] + counts[j, i] for i, j in counts}
        total = 2 * total
    safe = np.where(total > 0, total, 1.0)
    p = {key: value / safe for key, value in counts.items()}
    prop = params["property"]
    out = np.zeros(q.shape)
    if prop in ("contrast", "dissimilarity", "homogeneity"):
        for (i, j), value in p.items():
            weight = {"contrast": (i - j) ** 2, "dissimilarity": abs(i - j)}.get(
                prop, 1 / (1 + (i - j) ** 2)
            )
            out += weight * value
    elif prop in ("ASM", "energy"):
        for value in p.values():
            out += value * value
        if prop == "energy":
            out = np.sqrt(out)
    elif prop == "entropy":
        for value in p.values():
            out -= np.where(value > 0, value * np.log(np.where(value > 0, value, 1)), 0.0)
    else:
        mean_i = sum(i * v for (i, _), v in p.items())
        mean_j = sum(j * v for (_, j), v in p.items())
        var_i = sum((i - mean_i) ** 2 * v for (i, _), v in p.items())
        var_j = sum((j - mean_j) ** 2 * v for (_, j), v in p.items())
        cov = sum((i - mean_i) * (j - mean_j) * v for (i, j), v in p.items())
        spread = np.sqrt(var_i * var_j)
        # scikit-image gives 1 where a window has no spread in its levels.
        out = np.where(spread > 1e-15, cov / np.where(spread > 1e-15, spread, 1.0), 1.0)
    return out


@register("glcm", representation=glcm_representation)
def glcm(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba | dict[str, Any]:
    q = quantized(luma8(image), params["levels"])
    if params["output"] == "table":
        table = glcm_table(q, params)
        progress(1.0)
        return table
    values = glcm_map(q, params, progress)
    low, high = float(values.min()), float(values.max())
    progress(1.0)
    scaled = (values - low) * (255 / (high - low)) if high > low else np.zeros_like(values)
    return gray_image(image, scaled)


# Histogram of oriented gradients ----------------------------------------------------------------


def hog_view(gray: Gray8, params: dict[str, Any]) -> tuple[NDArray[np.float64], Plane]:
    cell, block = params["cellSize"], params["blockSize"]
    features, view = SKIMAGE["hog"](
        gray,
        orientations=params["orientations"],
        pixels_per_cell=(cell, cell),
        cells_per_block=(block, block),
        block_norm=params["blockNorm"],
        visualize=True,
    )
    return np.asarray(features), np.asarray(view, dtype=np.float64)


@register("hog", representation=hog_representation)
def hog_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    _, view = hog_view(luma8(image), params)
    progress(1.0)
    top = float(view.max())
    return gray_image(image, view * (255 / top) if top > 0 else view)
