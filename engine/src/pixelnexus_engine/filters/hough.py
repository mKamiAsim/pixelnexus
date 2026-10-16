"""Hough transforms for lines and circles, and edge linking with the probabilistic Hough
transform, all with scikit-image on Canny edges.

* Edges: skimage.feature.canny on the luma (BT.709) from 0 to 1, with its sigma and its low and
  high thresholds on the Sobel magnitude of the smoothed luma. The border mode reaches the
  smoothing. Here scikit-image drops edges on the outermost pixels.
* hough-lines: skimage.transform.hough_line with angles in steps of 180 / n degrees, and
  hough_line_peaks. scikit-image measures its normal angle theta with y down, so it turns
  clockwise on screen. The table gives the direction of each line instead, counterclockwise
  from the x axis from 0 to 180 degrees, its distance from the center of the top-left pixel,
  its votes, and the two points where it leaves the image. The accumulator view is turned to
  our angles: from left to right, the normal turns counterclockwise from -90 to 90 degrees, and
  from bottom to top the signed distance grows. It shows log(1 + votes), our choice, so weak
  lines stay visible, resampled to the size of the image and stretched.
* hough-circles: skimage.transform.hough_circle with normalized accumulators, so each vote count
  is divided by the number of points on the circle, and hough_circle_peaks with an absolute
  threshold on that share. The table gives the center, the radius and the share. The
  accumulator view is the largest share over the radii at each center, stretched.
* hough-linking: skimage.transform.probabilistic_hough_line with a fixed seed, so a run gives
  the same segments every time. It keeps a segment when its extent in x or in y reaches the
  shortest length. The view draws the segments in white over the edges in gray.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from numpy.typing import NDArray
from skimage.draw import line as draw_line
from skimage.feature import canny
from skimage.transform import (
    hough_circle,
    hough_circle_peaks,
    hough_line,
    hough_line_peaks,
    probabilistic_hough_line,
    resize,
)

from pixelnexus_engine.filters.artifacts import NDIMAGE
from pixelnexus_engine.planes import KB, KG, KR, Plane, to_uint8
from pixelnexus_engine.registry import Progress, Rgba, register

Edges = NDArray[np.bool_]

# These functions of scikit-image have no type hints.
SKIMAGE: dict[str, Any] = {
    "canny": canny,
    "hough_line": hough_line,
    "hough_line_peaks": hough_line_peaks,
    "hough_circle": hough_circle,
    "hough_circle_peaks": hough_circle_peaks,
    "probabilistic_hough_line": probabilistic_hough_line,
    "resize": resize,
    "line": draw_line,
}
EDGE_GRAY = 96
SEED = 0

LINE_COLUMNS = [
    {"key": "angle", "label": "Direction", "unit": "deg"},
    {"key": "distance", "label": "Distance", "unit": "px"},
    {"key": "votes", "label": "Votes", "unit": ""},
    {"key": "x1", "label": "x1", "unit": "px"},
    {"key": "y1", "label": "y1", "unit": "px"},
    {"key": "x2", "label": "x2", "unit": "px"},
    {"key": "y2", "label": "y2", "unit": "px"},
]
CIRCLE_COLUMNS = [
    {"key": "x", "label": "x", "unit": "px"},
    {"key": "y", "label": "y", "unit": "px"},
    {"key": "radius", "label": "Radius", "unit": "px"},
    {"key": "score", "label": "Share", "unit": ""},
]
SEGMENT_COLUMNS = [
    {"key": "x1", "label": "x1", "unit": "px"},
    {"key": "y1", "label": "y1", "unit": "px"},
    {"key": "x2", "label": "x2", "unit": "px"},
    {"key": "y2", "label": "y2", "unit": "px"},
    {"key": "length", "label": "Length", "unit": "px"},
    {"key": "angle", "label": "Direction", "unit": "deg"},
]


def luma01(image: Rgba) -> Plane:
    rgb = image[..., :3].astype(np.float64) / 255
    y: Plane = KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2]
    return y


def edges(image: Rgba, params: dict[str, Any]) -> Edges:
    low = params["lowThreshold"]
    high = max(low, params["highThreshold"])
    out: Edges = SKIMAGE["canny"](
        luma01(image),
        sigma=params["sigma"],
        low_threshold=low,
        high_threshold=high,
        mode=NDIMAGE[params["border"]],
    )
    return out


def gray_image(image: Rgba, plane: Plane) -> Rgba:
    out = image.copy()
    out[..., :3] = to_uint8(plane)[..., None]
    return out


def stretched(values: Plane) -> Plane:
    top = float(values.max())
    out: Plane = values * (255 / top) if top > 0 else np.zeros_like(values)
    return out


def draw(canvas: Plane, x1: float, y1: float, x2: float, y2: float) -> None:
    """A white line of 1 pixel between two points, clipped to the canvas."""
    rows, cols = SKIMAGE["line"](round(y1), round(x1), round(y2), round(x2))
    inside = (rows >= 0) & (rows < canvas.shape[0]) & (cols >= 0) & (cols < canvas.shape[1])
    canvas[rows[inside], cols[inside]] = 255


def table(columns: list[dict[str, str]], rows: list[list[float]], noun: str) -> dict[str, Any]:
    word = noun if len(rows) == 1 else f"{noun}s"
    return {"kind": "features", "columns": columns, "rows": rows, "summary": f"{len(rows)} {word}"}


# Lines ------------------------------------------------------------------------------------------


def line_angles(count: int) -> NDArray[np.float64]:
    """scikit-image's normal angles theta, from -pi / 2 in count steps."""
    angles: NDArray[np.float64] = np.linspace(-np.pi / 2, np.pi / 2, count, endpoint=False)
    return angles


def border_points(
    theta: float, rho: float, width: int, height: int
) -> tuple[float, float, float, float] | None:
    """Where the line x cos theta + y sin theta = rho, with y down, leaves the rectangle of
    pixel centers [0, width - 1] x [0, height - 1]."""
    c, s = math.cos(theta), math.sin(theta)
    points: list[tuple[float, float]] = []
    if abs(s) > 1e-12:
        for x in (0.0, width - 1.0):
            y = (rho - x * c) / s
            if -1e-9 <= y <= height - 1 + 1e-9:
                points.append((x, y))
    if abs(c) > 1e-12:
        for y in (0.0, height - 1.0):
            x = (rho - y * s) / c
            if -1e-9 <= x <= width - 1 + 1e-9:
                points.append((x, y))
    unique: list[tuple[float, float]] = []
    for p in points:
        if all(math.dist(p, q) > 1e-6 for q in unique):
            unique.append(p)
    if len(unique) < 2:
        return None
    (x1, y1), (x2, y2) = max(
        ((p, q) for i, p in enumerate(unique) for q in unique[i + 1 :]),
        key=lambda pair: math.dist(*pair),
    )
    return x1, y1, x2, y2


def find_lines(found: Edges, params: dict[str, Any]) -> tuple[Any, Any, Any, Any]:
    space, angles, distances = SKIMAGE["hough_line"](found, theta=line_angles(params["angles"]))
    top = float(space.max())
    votes, thetas, rhos = SKIMAGE["hough_line_peaks"](
        space,
        angles,
        distances,
        min_distance=params["minDistance"],
        min_angle=params["minAngle"],
        threshold=params["threshold"] * top,
        num_peaks=params["lines"],
    )
    if top == 0:
        votes, thetas, rhos = [], [], []
    return space, votes, thetas, rhos


def line_rows(found: Edges, params: dict[str, Any]) -> list[list[float]]:
    height, width = found.shape
    _, votes, thetas, rhos = find_lines(found, params)
    rows = []
    for count, theta, rho in zip(votes, thetas, rhos, strict=True):
        ends = border_points(float(theta), float(rho), width, height)
        if ends is None:
            continue
        # theta turns clockwise on screen. The line runs at 90 degrees to its normal.
        direction = (90 - math.degrees(float(theta))) % 180
        rows.append(
            [
                round(direction, 3),
                round(abs(float(rho)), 3),
                int(count),
                *(round(v, 3) for v in ends),
            ]
        )
    return rows


def accumulator_view(space: NDArray[Any], shape: tuple[int, int]) -> Plane:
    """log(1 + votes) with our angles from left to right and distances from bottom to top."""
    turned = np.log1p(space.astype(np.float64))[::-1, ::-1]
    out: Plane = SKIMAGE["resize"](turned, shape, order=1, mode="edge", anti_aliasing=False)
    return stretched(out)


def hough_lines_representation(params: dict[str, Any]) -> dict[str, Any]:
    step = 180 / params["angles"]
    return {
        "kind": "stages",
        "stages": [
            canny_stage(params),
            {
                "name": "Voting",
                "formula": "\\rho = x \\cos\\theta + y \\sin\\theta",
                "note": f"Every edge pixel votes for all lines through it, at {params['angles']} "
                f"angles theta in steps of {step:g} degrees and distances rho in steps of 1 px.",
            },
            {
                "name": "Peaks",
                "formula": f"H(\\theta, \\rho) \\ge {params['threshold']:g} \\max H",
                "note": f"At most {params['lines']} lines, at least {params['minDistance']} px "
                f"and {params['minAngle']} angle steps apart.",
            },
        ],
    }


@register("hough-lines", representation=hough_lines_representation)
def hough_lines(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba | dict[str, Any]:
    found = edges(image, params)
    progress(0.3)
    if params["output"] == "table":
        rows = line_rows(found, params)
        progress(1.0)
        return table(LINE_COLUMNS, rows, "line")
    if params["output"] == "accumulator":
        space, *_ = find_lines(found, params)
        progress(1.0)
        return gray_image(image, accumulator_view(space, found.shape))
    canvas = np.where(found, float(EDGE_GRAY), 0.0)
    for row in line_rows(found, params):
        draw(canvas, *row[3:])
    progress(1.0)
    return gray_image(image, canvas)


def canny_stage(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": "Canny edges",
        "formula": f"\\sigma = {params['sigma']:g},\\quad T_{{\\text{{low}}}} = "
        f"{params['lowThreshold']:g},\\quad T_{{\\text{{high}}}} = "
        f"{max(params['lowThreshold'], params['highThreshold']):g}",
        "note": "scikit-image's Canny on the luma from 0 to 1. The thresholds apply to the Sobel "
        "magnitude of the smoothed luma.",
    }


# Circles ----------------------------------------------------------------------------------------


def radii(params: dict[str, Any]) -> NDArray[np.int64]:
    low = params["minRadius"]
    high = max(low, params["maxRadius"])
    out: NDArray[np.int64] = np.arange(low, high + 1, params["radiusStep"])
    return out


def circle_spaces(found: Edges, params: dict[str, Any]) -> NDArray[np.float64]:
    out: NDArray[np.float64] = SKIMAGE["hough_circle"](found, radii(params), normalize=True)
    return out


def circle_rows(found: Edges, params: dict[str, Any]) -> list[list[float]]:
    spaces = circle_spaces(found, params)
    shares, xs, ys, found_radii = SKIMAGE["hough_circle_peaks"](
        spaces,
        radii(params),
        min_xdistance=params["minDistance"],
        min_ydistance=params["minDistance"],
        threshold=params["threshold"],
        total_num_peaks=params["circles"],
    )
    rows = [
        [int(x), int(y), int(r), round(float(share), 4)]
        for share, x, y, r in zip(shares, xs, ys, found_radii, strict=True)
    ]
    rows.sort(key=lambda row: -row[3])
    return rows


def hough_circles_representation(params: dict[str, Any]) -> dict[str, Any]:
    rs = radii(params)
    return {
        "kind": "stages",
        "stages": [
            canny_stage(params),
            {
                "name": "Voting",
                "formula": "(x - a)^2 + (y - b)^2 = r^2",
                "note": f"Every edge pixel votes for the centers (a, b) of all circles through it, "
                f"for {len(rs)} radii from {rs[0]} to {rs[-1]} px. Each count is divided by the "
                "number of points on its circle.",
            },
            {
                "name": "Peaks",
                "formula": f"H(a, b, r) \\ge {params['threshold']:g}",
                "note": f"At most {params['circles']} circles, with centers at least "
                f"{params['minDistance']} px apart in x or y.",
            },
        ],
    }


@register("hough-circles", representation=hough_circles_representation)
def hough_circles(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba | dict[str, Any]:
    found = edges(image, params)
    progress(0.3)
    if params["output"] == "accumulator":
        spaces = circle_spaces(found, params)
        progress(1.0)
        return gray_image(image, stretched(spaces.max(axis=0)))
    rows = circle_rows(found, params)
    progress(1.0)
    return table(CIRCLE_COLUMNS, rows, "circle")


# Edge linking -----------------------------------------------------------------------------------


def segment_rows(found: Edges, params: dict[str, Any]) -> list[list[float]]:
    segments = SKIMAGE["probabilistic_hough_line"](
        found,
        threshold=params["threshold"],
        line_length=params["minLength"],
        line_gap=params["maxGap"],
        theta=line_angles(params["angles"]),
        rng=SEED,
    )
    rows = []
    for (x1, y1), (x2, y2) in segments:
        length = math.hypot(x2 - x1, y2 - y1)
        # y points down. Counterclockwise angles count upward.
        direction = math.degrees(math.atan2(-(y2 - y1), x2 - x1)) % 180
        rows.append([int(x1), int(y1), int(x2), int(y2), round(length, 3), round(direction, 3)])
    rows.sort(key=lambda row: -row[4])
    return rows


def hough_linking_representation(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "stages",
        "stages": [
            canny_stage(params),
            {
                "name": "Random voting",
                "formula": f"H(\\theta, \\rho) \\ge {params['threshold']}",
                "note": "Edge pixels vote in random order. When a line reaches the threshold, "
                "the segment along it is followed and its pixels are removed.",
            },
            {
                "name": "Segments",
                "formula": f"\\max(\\lvert \\Delta x \\rvert, \\lvert \\Delta y \\rvert) \\ge "
                f"{params['minLength']},\\quad \\text{{gap}} \\le {params['maxGap']}",
                "note": "A segment may jump over gaps of edge pixels up to this size. Segments "
                "that span fewer pixels in x and in y are dropped.",
            },
        ],
    }


@register("hough-linking", representation=hough_linking_representation)
def hough_linking(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba | dict[str, Any]:
    found = edges(image, params)
    progress(0.3)
    rows = segment_rows(found, params)
    progress(1.0)
    if params["output"] == "table":
        return table(SEGMENT_COLUMNS, rows, "segment")
    canvas = np.where(found, float(EDGE_GRAY), 0.0)
    for x1, y1, x2, y2, *_ in rows:
        draw(canvas, x1, y1, x2, y2)
    return gray_image(image, canvas)
