"""Contours that move to fit the image, with scikit-image. Their regions can become the selection.

All three work on the luma (BT.709) from 0 to 1.

* chan-vese: skimage.segmentation.chan_vese, after Chan and Vese and the scheme of Getreuer. It
  splits the image into two phases, where the level set phi is above 0 and where it is not, and
  stops when the root mean square change of phi falls below the tolerance, or after the
  iteration limit. scikit-image leaves out the area term of the paper and does not reset phi.
  The regions are phase 1 (phi > 0) as label 1 and phase 2 as label 2. The level set output is
  phi with 0 at middle gray, scaled by the largest absolute value of phi.
* level-set: skimage.segmentation.morphological_geodesic_active_contour, after Marquez-Neila,
  Baumela and Alvarez, on the edge stopping image g of skimage inverse_gaussian_gradient. It
  starts from the selection. scikit-image's automatic threshold, the 40th percentile of g, is
  used: the balloon force acts only where g is above the threshold divided by the absolute
  balloon value. The inside is label 1.
* active-contour: skimage.segmentation.active_contour, the snake of Kass, Witkin and
  Terzopoulos, on the luma after a Gaussian blur that repeats the edge pixels. The starting
  snake is the outline of the largest 8-connected part of the selection, with its holes filled,
  from skimage.measure.find_contours at 0.5 on the part padded by one pixel. It is resampled to
  the given number of points, evenly spaced along its length (our choice). The inside of the
  final snake, skimage.draw.polygon, is label 1. The contour output draws the starting snake in
  blue and the final one in yellow.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage
from skimage.draw import polygon, polygon_perimeter
from skimage.measure import find_contours
from skimage.segmentation import (
    active_contour,
    chan_vese,
    inverse_gaussian_gradient,
    morphological_geodesic_active_contour,
)

from pixelnexus_engine.filters.segmentation import EIGHT, show
from pixelnexus_engine.labels import Labels
from pixelnexus_engine.planes import KB, KG, KR, to_uint8
from pixelnexus_engine.registry import Progress, Rgba, register

# These functions of scikit-image have no type hints.
SKIMAGE: dict[str, Any] = {
    "chan_vese": chan_vese,
    "mgac": morphological_geodesic_active_contour,
    "inverse_gaussian_gradient": inverse_gaussian_gradient,
    "active_contour": active_contour,
    "find_contours": find_contours,
    "polygon": polygon,
    "polygon_perimeter": polygon_perimeter,
}
AUTO_PERCENTILE = 40
START_COLOR = (0, 128, 255)
END_COLOR = (255, 255, 0)


def luma01(image: Rgba) -> NDArray[np.float64]:
    rgb = image[..., :3].astype(np.float64)
    out: NDArray[np.float64] = (KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2]) / 255
    return out


def selected(mask: NDArray[np.uint8]) -> NDArray[np.bool_]:
    inside: NDArray[np.bool_] = np.asarray(mask) > 127
    if not inside.any():
        raise ValueError("The selection is empty. Select an area to start the contour from.")
    return inside


def gray(image: Rgba, values: NDArray[np.float64]) -> Rgba:
    out = image.copy()
    out[..., :3] = to_uint8(values)[..., None]
    return out


# Chan-Vese --------------------------------------------------------------------------------------


def chan_vese_level_set(image: Rgba, params: dict[str, Any]) -> NDArray[np.float64]:
    _, phi, _ = SKIMAGE["chan_vese"](
        luma01(image),
        mu=params["mu"],
        lambda1=params["lambda1"],
        lambda2=params["lambda2"],
        tol=params["tolerance"],
        max_num_iter=params["iterations"],
        dt=params["dt"],
        init_level_set=params["init"],
        extended_output=True,
    )
    out: NDArray[np.float64] = np.asarray(phi, dtype=np.float64)
    return out


def chan_vese_representation(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Start",
                "formula": f"\\phi_0 = \\text{{{params['init']}}}",
                "note": "The starting level set. Phase 1 is where phi is above 0.",
            },
            {
                "name": "Means",
                "formula": "c_1 = \\operatorname{mean}_{\\phi > 0} Y,\\quad "
                "c_2 = \\operatorname{mean}_{\\phi \\le 0} Y",
                "note": "The mean luma of each phase.",
            },
            {
                "name": "Update",
                "formula": f"\\mu = {params['mu']:g},\\ \\lambda_1 = {params['lambda1']:g},\\ "
                f"\\lambda_2 = {params['lambda2']:g},\\ \\Delta t = {params['dt']:g}",
                "note": "Each pixel moves to the phase whose mean is closer, while the "
                "boundary stays short.",
            },
            {
                "name": "Stop",
                "formula": f"\\text{{RMS}}(\\phi_{{n+1}} - \\phi_n) \\le {params['tolerance']:g}",
                "note": f"Or after {params['iterations']} iterations.",
            },
        ],
    }


@register("chan-vese", representation=chan_vese_representation)
def chan_vese_filter(
    image: Rgba, params: dict[str, Any], progress: Progress
) -> Rgba | dict[str, Any]:
    phi = chan_vese_level_set(image, params)
    progress(0.9)
    if params["output"] == "levelSet":
        top = float(np.abs(phi).max())
        return gray(image, 127.5 + 127.5 * (phi / top if top > 0 else phi))
    labels: Labels = np.where(phi > 0, 1, 2).astype(np.int64)
    return show(image, labels, params, "phase")


# Morphological geodesic active contour ----------------------------------------------------------


def edge_stopping(image: Rgba, params: dict[str, Any]) -> NDArray[np.float64]:
    g = SKIMAGE["inverse_gaussian_gradient"](
        luma01(image), alpha=params["alpha"], sigma=params["sigma"]
    )
    out: NDArray[np.float64] = np.asarray(g, dtype=np.float64)
    return out


def level_set_inside(image: Rgba, params: dict[str, Any]) -> NDArray[np.bool_]:
    start = selected(params["mask"])
    u = SKIMAGE["mgac"](
        edge_stopping(image, params),
        params["iterations"],
        init_level_set=start.astype(np.int8),
        smoothing=params["smoothing"],
        threshold="auto",
        balloon=params["balloon"],
    )
    out: NDArray[np.bool_] = np.asarray(u) > 0
    return out


def level_set_representation(params: dict[str, Any]) -> dict[str, Any]:
    balloon = params["balloon"]
    push = "shrinks" if balloon < 0 else "grows" if balloon > 0 else "neither grows nor shrinks"
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Edge stopping",
                "formula": f"g = 1 / \\sqrt{{1 + {params['alpha']:g}\\, \\lvert \\nabla "
                f"(G_{{{params['sigma']:g}}} * Y) \\rvert}}",
                "note": "Near 1 in flat areas, near 0 on edges.",
            },
            {
                "name": "Balloon",
                "formula": f"\\nu = {balloon:g}",
                "note": f"The contour {push} by one pixel per step where g is above the "
                f"threshold, the {AUTO_PERCENTILE}th percentile of g, divided by the absolute "
                "balloon value.",
            },
            {
                "name": "Attraction",
                "formula": "\\nabla g \\cdot \\nabla u",
                "note": "Pixels on the contour move toward the valleys of g, the edges.",
            },
            {
                "name": "Smoothing",
                "formula": f"(SI \\circ IS)^{{{params['smoothing']}}}",
                "note": f"Morphological curvature smoothing, for {params['iterations']} steps "
                "in all.",
            },
        ],
    }


@register("level-set", representation=level_set_representation, mask=True)
def level_set(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba | dict[str, Any]:
    if params["output"] == "edgeStopping":
        return gray(image, edge_stopping(image, params) * 255)
    inside = level_set_inside(image, params)
    progress(0.9)
    return show(image, inside.astype(np.int64), params, "region")


# Snakes -----------------------------------------------------------------------------------------


def resample(points: NDArray[np.float64], count: int) -> NDArray[np.float64]:
    """count points of a closed polygon, evenly spaced along its length."""
    closed = np.vstack([points, points[:1]])
    lengths = np.hypot(*np.diff(closed, axis=0).T)
    along = np.concatenate([[0.0], np.cumsum(lengths)])
    targets = np.arange(count) * (along[-1] / count)
    out: NDArray[np.float64] = np.column_stack(
        [np.interp(targets, along, closed[:, 0]), np.interp(targets, along, closed[:, 1])]
    )
    return out


def start_snake(mask: NDArray[np.uint8], count: int) -> NDArray[np.float64]:
    """The outline of the largest part of the selection, as count points of (row, column)."""
    parts, n = ndimage.label(selected(mask), structure=EIGHT)
    sizes = np.bincount(parts.ravel(), minlength=n + 1)
    sizes[0] = 0
    part = ndimage.binary_fill_holes(parts == int(sizes.argmax()))
    padded = np.pad(part.astype(np.float64), 1)
    outlines = SKIMAGE["find_contours"](padded, 0.5)
    outline = max(outlines, key=len)[:-1] - 1
    return resample(np.asarray(outline, dtype=np.float64), count)


def snake_result(image: Rgba, params: dict[str, Any]) -> tuple[NDArray[Any], NDArray[Any]]:
    start = start_snake(params["mask"], params["points"])
    y = luma01(image)
    if params["sigma"] > 0:
        y = ndimage.gaussian_filter(y, params["sigma"], mode="nearest")
    end = SKIMAGE["active_contour"](
        y,
        start,
        alpha=params["alpha"],
        beta=params["beta"],
        w_line=params["wLine"],
        w_edge=params["wEdge"],
        gamma=params["gamma"],
        max_px_move=params["maxMove"],
        max_num_iter=params["iterations"],
        convergence=params["convergence"],
        boundary_condition="periodic",
    )
    return start, np.asarray(end, dtype=np.float64)


def draw_snakes(image: Rgba, snakes: list[tuple[NDArray[Any], tuple[int, int, int]]]) -> Rgba:
    out = image.copy()
    for snake, color in snakes:
        rr, cc = SKIMAGE["polygon_perimeter"](
            snake[:, 0].round(), snake[:, 1].round(), shape=image.shape[:2], clip=True
        )
        out[rr, cc, :3] = color
    return out


def active_contour_representation(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Start",
                "formula": f"v_0 = {params['points']} \\text{{ points on the selection outline}}",
                "note": "The outline of the largest part of the selection.",
            },
            {
                "name": "Image energy",
                "formula": f"P = -\\left({params['wLine']:g}\\, Y_{{{params['sigma']:g}}} + "
                f"{params['wEdge']:g}\\, \\lvert \\nabla Y_{{{params['sigma']:g}}} \\rvert\\right)",
                "note": "The snake moves to bright pixels with a positive line weight, and to "
                "edges with a positive edge weight.",
            },
            {
                "name": "Internal energy",
                "formula": f"\\alpha = {params['alpha']:g},\\ \\beta = {params['beta']:g}",
                "note": "Elasticity pulls the points together. Rigidity keeps the curve smooth.",
            },
            {
                "name": "Steps",
                "formula": f"\\gamma = {params['gamma']:g},\\ \\lvert \\Delta v \\rvert \\le "
                f"{params['maxMove']:g}",
                "note": f"At most {params['iterations']} steps, or until the snake moves less "
                f"than {params['convergence']:g} pixels.",
            },
        ],
    }


@register("active-contour", representation=active_contour_representation, mask=True)
def active_contour_filter(
    image: Rgba, params: dict[str, Any], progress: Progress
) -> Rgba | dict[str, Any]:
    start, end = snake_result(image, params)
    progress(0.9)
    if params["output"] == "contour":
        return draw_snakes(image, [(start, START_COLOR), (end, END_COLOR)])
    rr, cc = SKIMAGE["polygon"](end[:, 0], end[:, 1], shape=image.shape[:2])
    labels: Labels = np.zeros(image.shape[:2], np.int64)
    labels[rr, cc] = 1
    if not labels.any():
        raise ValueError(
            "The snake shrank to a line or a point. Lower the elasticity, or start from a "
            "larger selection."
        )
    return show(image, labels, params, "region")
