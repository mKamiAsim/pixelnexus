"""The Structured Edge Detector of Dollar and Zitnick, with OpenCV's ximgproc module.

It needs the model structured-edge-bsds500 from catalog/models.yaml, which the user downloads
on request (see models.py). The model was trained on the BSDS500 images and their hand-drawn
edges. Its file sets 8 trees, 4 of them evaluated at each position, patches of 32 pixels that
predict edge patches of 16 pixels, a stride of 2, and 4 gradient orientations.

* edges: cv2.ximgproc StructuredEdgeDetection.detectEdges on the RGB image from 0 to 1, as
  OpenCV asks, an edge probability from 0 to 1 at each pixel.
* thin: computeOrientation of the edges, then edgesNms with the radius r, the boundary radius
  s and the multiplier m. It keeps an edge only where it is the strongest across its direction.
* orientation: computeOrientation, from 0 to pi, shown from black to white.
"""

from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray

from pixelnexus_engine.models import require
from pixelnexus_engine.planes import to_uint8
from pixelnexus_engine.registry import Progress, Rgba, register

MODEL_ID = "structured-edge-bsds500"
# The type stubs of OpenCV lag behind OpenCV 5.
CV: Any = cv2
_DETECTORS: dict[str, Any] = {}


def detector() -> Any:
    """The detector, loaded once per process from the downloaded model."""
    path = require(MODEL_ID)
    key = str(path)
    if key not in _DETECTORS:
        _DETECTORS[key] = CV.ximgproc.createStructuredEdgeDetection(key)
    return _DETECTORS[key]


def edge_maps(image: Rgba, params: dict[str, Any]) -> dict[str, NDArray[np.float32]]:
    rgb = np.ascontiguousarray(image[..., :3].astype(np.float32) / 255)
    sed = detector()
    edges = sed.detectEdges(rgb)
    out = {"edges": edges}
    if params["output"] != "edges":
        orientation = sed.computeOrientation(edges)
        out["orientation"] = orientation
        out["thin"] = sed.edgesNms(
            edges, orientation, r=params["nmsRadius"], s=params["boundaryRadius"], m=params["m"]
        )
    return out


def structured_edge_representation(params: dict[str, Any]) -> dict[str, Any]:
    stages = [
        {
            "name": "Channels",
            "formula": "\\text{LUV color},\\ \\lvert \\nabla I \\rvert,\\ 4 \\text{ orientations}",
            "note": "Color, gradient magnitude and oriented gradients at two scales, as in the "
            "paper.",
        },
        {
            "name": "Forest",
            "formula": "32 \\times 32 \\text{ patch} \\to 16 \\times 16 \\text{ edge patch}",
            "note": "Each tree maps a patch to an edge patch. 4 of the 8 trees run at each "
            "position, every 2 pixels.",
        },
        {
            "name": "Average",
            "formula": "E(x) = \\text{mean of the overlapping edge patches at } x",
            "note": "The edge probability from 0 to 1.",
        },
    ]
    if params["output"] != "edges":
        stages.append(
            {
                "name": "Thinning",
                "formula": f"r = {params['nmsRadius']},\\ s = {params['boundaryRadius']},\\ "
                f"m = {params['m']:g}",
                "note": "Non-maximum suppression across the edge orientation.",
            }
        )
    return {"kind": "stages", "stages": stages}


@register("structured-edge", representation=structured_edge_representation)
def structured_edge(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    maps = edge_maps(image, params)
    progress(0.9)
    output = params["output"]
    if output == "orientation":
        values = maps["orientation"] * (255 / math.pi)
    else:
        values = maps[output] * 255
    out = image.copy()
    out[..., :3] = to_uint8(values.astype(np.float64))[..., None]
    progress(1.0)
    return out
