"""Maximally stable extremal regions with OpenCV, as a feature table.

An extremal region is a connected set of pixels that are all brighter, or all darker, than
every pixel on its border. As a threshold sweeps through the gray levels, such regions grow
and merge. MSER keeps the regions whose area changes least over a range of delta levels,
after Matas et al. (2004). OpenCV's cv2.MSER_create finds bright and dark regions in one run,
on the 8-bit luma.

Each region becomes one row: its centroid, the radius of a disk of the same area, the angle of
its long axis from the second moments of its pixels (counterclockwise from the x axis, from 0
to 180 degrees), its area and the ratio of its axes. The rows are sorted by area, largest
first. The pixels of the regions themselves are not returned.
"""

from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray

from pixelnexus_engine.filters.keypoints import luma8
from pixelnexus_engine.registry import Progress, Rgba, register

# The type stubs of OpenCV lag behind OpenCV 5.
CV: Any = cv2

COLUMNS = [
    {"key": "x", "label": "x", "unit": "px"},
    {"key": "y", "label": "y", "unit": "px"},
    {"key": "radius", "label": "Radius", "unit": "px"},
    {"key": "angle", "label": "Angle", "unit": "deg"},
    {"key": "area", "label": "Area", "unit": "px"},
    {"key": "elongation", "label": "Axis ratio", "unit": ""},
]


def detector(params: dict[str, Any]) -> Any:
    return CV.MSER_create(
        delta=params["delta"],
        min_area=params["minArea"],
        max_area=max(params["minArea"], params["maxArea"]),
        max_variation=params["maxVariation"],
        min_diversity=params["minDiversity"],
    )


def region_row(points: NDArray[np.int32]) -> list[float]:
    """Centroid, equal-area radius, long-axis angle, area and axis ratio of a region."""
    xy = points.astype(np.float64)
    cx, cy = xy.mean(axis=0)
    area = len(xy)
    dx, dy = xy[:, 0] - cx, xy[:, 1] - cy
    cxx, cyy, cxy = float(np.mean(dx * dx)), float(np.mean(dy * dy)), float(np.mean(dx * dy))
    # y points down in the image. Counterclockwise angles count upward.
    angle = math.degrees(0.5 * math.atan2(-2 * cxy, cxx - cyy)) % 180
    spread = math.sqrt(((cxx - cyy) / 2) ** 2 + cxy * cxy)
    major = (cxx + cyy) / 2 + spread
    minor = (cxx + cyy) / 2 - spread
    ratio = math.sqrt(major / minor) if minor > 1e-12 else math.inf
    return [
        round(float(cx), 3),
        round(float(cy), 3),
        round(math.sqrt(area / math.pi), 3),
        round(angle, 2),
        area,
        round(ratio, 3) if math.isfinite(ratio) else 0.0,
    ]


def mser_table(image: Rgba, params: dict[str, Any], progress: Progress) -> dict[str, Any]:
    regions, _boxes = detector(params).detectRegions(luma8(image))
    progress(0.9)
    rows = sorted((region_row(np.asarray(r)) for r in regions), key=lambda row: -row[4])
    progress(1.0)
    noun = "region" if len(rows) == 1 else "regions"
    return {"kind": "features", "columns": COLUMNS, "rows": rows, "summary": f"{len(rows)} {noun}"}


def mser_representation(params: dict[str, Any]) -> dict[str, Any]:
    delta = params["delta"]
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Extremal regions",
                "formula": "Q_t = \\{\\text{connected } x : I(x) \\le t\\}",
                "note": "As the threshold t sweeps the 8-bit luma, regions grow and merge. "
                "OpenCV finds dark and bright regions in one run.",
            },
            {
                "name": "Stability",
                "formula": f"v(Q_t) = \\frac{{\\lvert Q_{{t + {delta}}} \\rvert - \\lvert "
                f"Q_{{t - {delta}}} \\rvert}}{{\\lvert Q_t \\rvert}}",
                "note": "How fast the area changes, as Matas et al. define it. Regions where v "
                f"is a local minimum and at most {params['maxVariation']:g} are stable. "
                "OpenCV measures the change in its own way.",
            },
            {
                "name": "Limits",
                "formula": f"{params['minArea']} \\le \\lvert Q_t \\rvert \\le "
                f"{max(params['minArea'], params['maxArea'])}",
                "note": f"Of nested regions closer than the diversity {params['minDiversity']:g}"
                ", only one stays.",
            },
            {
                "name": "Table",
                "formula": "r = \\sqrt{\\lvert Q \\rvert / \\pi},\\quad \\theta = \\tfrac12 "
                "\\operatorname{atan2}(-2 \\mu_{11}, \\mu_{20} - \\mu_{02})",
                "note": "The centroid, the radius of a disk of the same area, and the long axis "
                "from the second moments mu of the pixels.",
            },
        ],
    }


@register("mser", representation=mser_representation)
def mser(image: Rgba, params: dict[str, Any], progress: Progress) -> dict[str, Any]:
    return mser_table(image, params, progress)
