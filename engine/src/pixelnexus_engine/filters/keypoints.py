"""Keypoint detectors of OpenCV: SIFT, ORB, BRISK and AKAZE. The results are feature tables.

Each detector runs on the 8-bit luma (BT.709 weights, rounded) and only detects. Descriptors
are not computed, since nothing in the studio matches them yet. OpenCV 5 keeps BRISK and AKAZE
in cv2.xfeatures2d.

A keypoint becomes a row of the table:

* x, y: OpenCV's keypoint position. OpenCV puts the center of the top-left pixel at (0, 0), as
  the feature tables do, so the position passes through unchanged, with its subpixel part.
* radius: half of OpenCV's size, the diameter of the meaningful neighborhood.
* angle: the orientation in degrees, counterclockwise from the x axis. OpenCV measures it
  clockwise in image coordinates, where y points down, so the table holds (360 - angle) mod 360.
* score: OpenCV's response.
* octave: the octave the keypoint comes from. SIFT packs octave, layer and scale into one
  number, and the octave is its lowest byte, read as a signed number.

Rows are sorted by score, strongest first.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray

from pixelnexus_engine.planes import KB, KG, KR, to_uint8
from pixelnexus_engine.registry import Progress, Rgba, register

COLUMNS = [
    {"key": "x", "label": "x", "unit": "px"},
    {"key": "y", "label": "y", "unit": "px"},
    {"key": "radius", "label": "Radius", "unit": "px"},
    {"key": "angle", "label": "Angle", "unit": "deg"},
    {"key": "score", "label": "Score", "unit": ""},
    {"key": "octave", "label": "Octave", "unit": ""},
]

# The type stubs of OpenCV lag behind OpenCV 5, so the detectors are reached untyped.
CV: Any = cv2
XF: Any = cv2.xfeatures2d

ORB_SCORES = {"harris": CV.ORB_HARRIS_SCORE, "fast": CV.ORB_FAST_SCORE}
DIFFUSIVITIES = {
    "pm-g1": XF.KAZE_DIFF_PM_G1,
    "pm-g2": XF.KAZE_DIFF_PM_G2,
    "weickert": XF.KAZE_DIFF_WEICKERT,
    "charbonnier": XF.KAZE_DIFF_CHARBONNIER,
}
# ORB's border and patch size. OpenCV uses 31 for both by default.
ORB_PATCH = 31


def luma8(image: Rgba) -> NDArray[np.uint8]:
    rgb = image[..., :3].astype(np.float64)
    return to_uint8(KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2])


def detector(kind: str, params: dict[str, Any]) -> Any:
    """The OpenCV detector with the catalog parameters."""
    if kind == "sift":
        return CV.SIFT_create(
            nfeatures=params["maxFeatures"],
            nOctaveLayers=params["octaveLayers"],
            contrastThreshold=params["contrastThreshold"],
            edgeThreshold=params["edgeThreshold"],
            sigma=params["sigma"],
        )
    if kind == "orb":
        return CV.ORB_create(
            nfeatures=params["maxFeatures"],
            scaleFactor=params["scaleFactor"],
            nlevels=params["levels"],
            edgeThreshold=ORB_PATCH,
            scoreType=ORB_SCORES[params["scoreType"]],
            patchSize=ORB_PATCH,
            fastThreshold=params["fastThreshold"],
        )
    if kind == "brisk":
        return XF.BRISK_create(thresh=params["threshold"], octaves=params["octaves"])
    return XF.AKAZE_create(
        threshold=params["threshold"],
        nOctaves=params["octaves"],
        nOctaveLayers=params["octaveLayers"],
        diffusivity=DIFFUSIVITIES[params["diffusivity"]],
    )


def octave_of(kind: str, packed: int) -> int:
    """The octave of a keypoint. SIFT keeps it in the lowest byte, as a signed number."""
    if kind != "sift":
        return int(packed)
    low = packed & 255
    return low - 256 if low >= 128 else low


def keypoint_table(
    image: Rgba, kind: str, params: dict[str, Any], progress: Progress
) -> dict[str, Any]:
    keypoints = detector(kind, params).detect(luma8(image), None)
    progress(0.9)
    rows = [
        [
            round(float(k.pt[0]), 3),
            round(float(k.pt[1]), 3),
            round(float(k.size) / 2, 3),
            round((360.0 - float(k.angle)) % 360.0, 2) if k.angle >= 0 else 0.0,
            round(float(k.response), 6),
            octave_of(kind, int(k.octave)),
        ]
        for k in keypoints
    ]
    rows.sort(key=lambda row: -row[4])
    progress(1.0)
    noun = "keypoint" if len(rows) == 1 else "keypoints"
    return {"kind": "features", "columns": COLUMNS, "rows": rows, "summary": f"{len(rows)} {noun}"}


# Representations ------------------------------------------------------------------------------


def sift_stages(p: dict[str, Any]) -> list[dict[str, str]]:
    layers = p["octaveLayers"]
    r = p["edgeThreshold"]
    return [
        {
            "name": "Scale space",
            "formula": f"D(x, \\sigma) = (G_{{k\\sigma}} - G_\\sigma) * I,\\quad "
            f"k = 2^{{1/{layers}}},\\quad \\sigma_0 = {p['sigma']:g}",
            "note": f"Each octave has {layers} layers. The next octave starts from the image at "
            "half size.",
        },
        {
            "name": "Extrema",
            "formula": f"\\lvert D(\\hat x) \\rvert \\ge \\frac{{{p['contrastThreshold']:g}}}"
            f"{{{layers}}}",
            "note": "A keypoint is larger or smaller than its 26 neighbors in position and scale. "
            "Its place is refined to subpixel accuracy, and weak ones go. OpenCV divides the "
            "contrast threshold by the number of layers.",
        },
        {
            "name": "Edges",
            "formula": f"\\frac{{\\operatorname{{tr}}(H)^2}}{{\\det H}} < \\frac{{({r:g} + 1)^2}}"
            f"{{{r:g}}}",
            "note": "Points on edges are dropped. H is the 2 x 2 Hessian of D.",
        },
        {
            "name": "Orientation",
            "formula": "\\theta = \\arg\\max \\text{(36-bin histogram of gradient directions)}",
            "note": "The gradients near the keypoint, weighted by a Gaussian of 1.5 sigma. Peaks "
            "within 80 percent of the highest give more keypoints at the same place.",
        },
    ]


def orb_stages(p: dict[str, Any]) -> list[dict[str, str]]:
    return [
        {
            "name": "Pyramid",
            "formula": f"s_\\ell = {p['scaleFactor']:g}^\\ell,\\quad \\ell = 0, \\dots, "
            f"{p['levels'] - 1}",
            "note": "The image shrinks by the scale factor at each level.",
        },
        {
            "name": "FAST corners",
            "formula": f"t = {p['fastThreshold']:g}",
            "note": "A pixel is a corner when 9 pixels in a row on the circle of 16 around it "
            "are all brighter or all darker than it by more than t.",
        },
        {
            "name": "Ranking",
            "formula": "\\det M - 0.04 \\operatorname{tr}(M)^2"
            if p["scoreType"] == "harris"
            else "\\text{FAST score}",
            "note": f"The {p['maxFeatures']} best corners over all levels are kept"
            + (
                ", by the Harris measure of the 7 x 7 window around each."
                if p["scoreType"] == "harris"
                else ", by FAST score."
            ),
        },
        {
            "name": "Orientation",
            "formula": "\\theta = \\operatorname{atan2}(m_{01}, m_{10}),\\quad m_{pq} = "
            "\\sum x^p y^q I(x, y)",
            "note": f"The intensity centroid of a disk of diameter {ORB_PATCH} px around the "
            "corner.",
        },
    ]


def brisk_stages(p: dict[str, Any]) -> list[dict[str, str]]:
    return [
        {
            "name": "Scale space",
            "formula": f"\\text{{{p['octaves']} octaves and the intra-octaves between them}}",
            "note": "Each octave halves the image. The intra-octaves sit between them: the "
            "first is the image shrunk by 1.5, and each next one is halved again.",
        },
        {
            "name": "AGAST corners",
            "formula": f"t = {p['threshold']:g}",
            "note": "Corners with the FAST score s above the threshold, in every octave and "
            "intra-octave.",
        },
        {
            "name": "Maxima",
            "formula": "s \\text{ is a maximum in position and scale}",
            "note": "Each corner must beat its neighbors in its layer and the layers above and "
            "below. Position and scale are refined by fitting quadratics.",
        },
        {
            "name": "Orientation",
            "formula": "\\theta = \\operatorname{atan2}\\Big(\\sum g_y, \\sum g_x\\Big)",
            "note": "The mean of the local gradients over the long-distance pairs of the BRISK "
            "sampling pattern.",
        },
    ]


DIFFUSIVITY_FORMULAS = {
    "pm-g1": "g = \\exp\\!\\left(-\\frac{\\lvert \\nabla L_\\sigma \\rvert^2}{k^2}\\right)",
    "pm-g2": "g = \\frac{1}{1 + \\lvert \\nabla L_\\sigma \\rvert^2 / k^2}",
    "weickert": "g = 1 - \\exp\\!\\left(-\\frac{3.315}{(\\lvert \\nabla L_\\sigma \\rvert / k)"
    "^8}\\right)",
    "charbonnier": "g = \\frac{1}{\\sqrt{1 + \\lvert \\nabla L_\\sigma \\rvert^2 / k^2}}",
}


def akaze_stages(p: dict[str, Any]) -> list[dict[str, str]]:
    return [
        {
            "name": "Nonlinear scale space",
            "formula": "\\frac{\\partial L}{\\partial t} = \\operatorname{div}\\big(g\\, \\nabla "
            "L\\big),\\quad " + DIFFUSIVITY_FORMULAS[p["diffusivity"]],
            "note": f"{p['octaves']} octaves of {p['octaveLayers']} layers. Fast explicit "
            "diffusion smooths flat areas and keeps edges. k is set from the gradients of the "
            "image.",
        },
        {
            "name": "Hessian",
            "formula": "R = L_{xx} L_{yy} - L_{xy}^2",
            "note": f"The determinant of the Hessian, with derivatives scaled to each level. "
            f"Keypoints are maxima above "
            f"{p['threshold']:g} over their neighbors in position and scale.",
        },
        {
            "name": "Orientation",
            "formula": "\\theta = \\arg\\max_{\\text{window of } \\pi/3} \\sum (L_x, L_y)",
            "note": "The dominant direction of the first derivatives in a circle around the "
            "keypoint, found with a sliding window of 60 degrees.",
        },
    ]


STAGES = {"sift": sift_stages, "orb": orb_stages, "brisk": brisk_stages, "akaze": akaze_stages}


def keypoint_representation(kind: str, params: dict[str, Any]) -> dict[str, Any]:
    luma = {
        "name": "Input",
        "formula": "Y = 0.2126 R + 0.7152 G + 0.0722 B",
        "note": "The 8-bit luma.",
    }
    return {"kind": "stages", "stages": [luma, *STAGES[kind](params)]}


@register("sift", representation=lambda p: keypoint_representation("sift", p))
def sift(image: Rgba, params: dict[str, Any], progress: Progress) -> dict[str, Any]:
    return keypoint_table(image, "sift", params, progress)


@register("orb", representation=lambda p: keypoint_representation("orb", p))
def orb(image: Rgba, params: dict[str, Any], progress: Progress) -> dict[str, Any]:
    return keypoint_table(image, "orb", params, progress)


@register("brisk", representation=lambda p: keypoint_representation("brisk", p))
def brisk(image: Rgba, params: dict[str, Any], progress: Progress) -> dict[str, Any]:
    return keypoint_table(image, "brisk", params, progress)


@register("akaze", representation=lambda p: keypoint_representation("akaze", p))
def akaze(image: Rgba, params: dict[str, Any], progress: Progress) -> dict[str, Any]:
    return keypoint_table(image, "akaze", params, progress)
