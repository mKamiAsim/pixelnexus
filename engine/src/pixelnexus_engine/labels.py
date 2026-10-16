"""Label maps as results: every pixel gets the number of its region, from 1, or 0 for none.

A filter returns ``label_result(labels, image, noun)``, a JSON dict of kind "labels". It holds
the width and height, the labels as base64 of little-endian unsigned integers of 8, 16 or 32
bits (the smallest that fits), and a feature table with one row per region: its label, its
area, its centroid (x and y, with the center of the top-left pixel at 0, 0) and the mean of its
luma (BT.709) in pixel levels. The table's summary is the region count.
"""

from __future__ import annotations

import base64
from typing import Any

import numpy as np
from numpy.typing import NDArray

from pixelnexus_engine.planes import KB, KG, KR
from pixelnexus_engine.registry import Rgba

Labels = NDArray[np.int64]

COLUMNS = [
    {"key": "label", "label": "Label", "unit": ""},
    {"key": "area", "label": "Area", "unit": "px"},
    {"key": "x", "label": "x", "unit": "px"},
    {"key": "y", "label": "y", "unit": "px"},
    {"key": "mean", "label": "Mean", "unit": "levels"},
]


def bits_for(count: int) -> int:
    return 8 if count < 2**8 else 16 if count < 2**16 else 32


def encode(labels: Labels) -> tuple[int, str]:
    bits = bits_for(int(labels.max(initial=0)))
    dtype = {8: "<u1", 16: "<u2", 32: "<u4"}[bits]
    return bits, base64.b64encode(labels.astype(dtype).tobytes()).decode("ascii")


def region_rows(labels: Labels, image: Rgba) -> list[list[float]]:
    count = int(labels.max(initial=0))
    flat = labels.ravel()
    rgb = image[..., :3].astype(np.float64)
    luma = (KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2]).ravel()
    rows, cols = np.indices(labels.shape)
    area = np.bincount(flat, minlength=count + 1)
    sum_x = np.bincount(flat, weights=cols.ravel(), minlength=count + 1)
    sum_y = np.bincount(flat, weights=rows.ravel(), minlength=count + 1)
    sum_luma = np.bincount(flat, weights=luma, minlength=count + 1)
    out = []
    for k in range(1, count + 1):
        if area[k] == 0:
            continue
        n = float(area[k])
        out.append(
            [
                k,
                int(area[k]),
                round(sum_x[k] / n, 3),
                round(sum_y[k] / n, 3),
                round(sum_luma[k] / n, 3),
            ]
        )
    return out


def label_result(labels: Labels, image: Rgba, noun: str) -> dict[str, Any]:
    """The JSON result for a label map with labels from 0 (none) up."""
    height, width = labels.shape
    bits, data = encode(labels)
    rows = region_rows(labels, image)
    word = noun if len(rows) == 1 else f"{noun}es" if noun.endswith("s") else f"{noun}s"
    return {
        "kind": "labels",
        "width": width,
        "height": height,
        "bits": bits,
        "data": data,
        "table": {
            "kind": "features",
            "columns": COLUMNS,
            "rows": rows,
            "summary": f"{len(rows)} {word}",
        },
    }


def mean_colors(labels: Labels, image: Rgba) -> Rgba:
    """Each region filled with its mean color, rounded. Pixels with label 0 keep their color."""
    count = int(labels.max(initial=0))
    flat = labels.ravel()
    area = np.bincount(flat, minlength=count + 1).astype(np.float64)
    out = image.copy()
    for c in range(3):
        sums = np.bincount(
            flat, weights=image[..., c].astype(np.float64).ravel(), minlength=count + 1
        )
        means = np.rint(sums / np.maximum(area, 1)).clip(0, 255).astype(np.uint8)
        channel = means[flat].reshape(labels.shape)
        out[..., c] = np.where(labels > 0, channel, image[..., c])
    return out
