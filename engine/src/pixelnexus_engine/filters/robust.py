"""Robust estimation: a local M-estimator and a background surface fitted with RANSAC.

* m-estimator: our own code. Each pixel becomes the M-estimate of location of its square window,
  after Huber, found by iteratively reweighted least squares (Holland and Welsch). It starts from
  the window median (our choice, since Tukey's weights need a robust start). Each step weighs
  every window pixel by w(r) with r = (I - mu) / s, then takes the weighted mean. Huber's
  weights are 1 for |r| <= k and k / |r| above, with k = 1.345. Tukey's biweight (Beaton and
  Tukey) is (1 - (r / c)^2)^2 for |r| < c and 0 above, with c = 4.685. Both are the usual tuning
  constants for 95 percent efficiency at the normal distribution. The scale s is given in levels,
  or estimated from the plane with skimage.restoration.estimate_sigma when it is 0. Where all
  weights are 0, the pixel keeps its last estimate. The plane is padded by repeating its edge
  pixels.
* ransac-surface: a polynomial surface of degree 1, 2 or 3 in x and y, fitted to the luma
  (BT.709) at the pixels of a grid with skimage.measure.ransac, after Fischler and Bolles, with a
  fixed random seed of 0. x and y are scaled to -1 to 1 before the fit (our choice, for a better
  conditioned least squares). scikit-image fits the final surface to all inliers of the best
  trial. The corrected image subtracts the surface minus its mean from every channel, which
  flattens the background and keeps the mean brightness.
"""

from __future__ import annotations

from typing import Any, Self

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage
from skimage.measure import ransac
from skimage.restoration import estimate_sigma

from pixelnexus_engine.planes import KB, KG, KR, Plane, filter_by_scope, to_uint8
from pixelnexus_engine.registry import Progress, Rgba, register

# These functions of scikit-image have no type hints.
SKIMAGE: dict[str, Any] = {"ransac": ransac, "estimate_sigma": estimate_sigma}
HUBER_K = 1.345
TUKEY_C = 4.685
SEED = 0


# M-estimator ------------------------------------------------------------------------------------


def m_weights(r: Plane, estimator: str) -> Plane:
    a = np.abs(r)
    if estimator == "tukey":
        out: Plane = np.where(a < TUKEY_C, (1 - (r / TUKEY_C) ** 2) ** 2, 0.0)
    else:
        out = np.where(a <= HUBER_K, 1.0, HUBER_K / np.maximum(a, 1e-300))
    return out


def m_scale(plane: Plane, scale: float) -> float:
    if scale > 0:
        return scale
    sigma = float(SKIMAGE["estimate_sigma"](plane / 255)) * 255
    return max(sigma, 1e-6)


def m_estimator_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    radius = params["radius"]
    size = 2 * radius + 1
    s = m_scale(plane, params["scale"])
    padded = np.pad(plane, radius, mode="edge")
    h, w = plane.shape
    window = [padded[dy : dy + h, dx : dx + w] for dy in range(size) for dx in range(size)]
    mu: Plane = ndimage.median_filter(plane, size=size, mode="nearest")
    for _ in range(params["iterations"]):
        total = np.zeros_like(plane)
        weights = np.zeros_like(plane)
        for values in window:
            weight = m_weights((values - mu) / s, params["estimator"])
            total += weight * values
            weights += weight
        mu = np.where(weights > 0, total / np.where(weights > 0, weights, 1), mu)
    return mu


def m_estimator_representation(params: dict[str, Any]) -> dict[str, Any]:
    size = 2 * params["radius"] + 1
    if params["estimator"] == "tukey":
        weight = (
            f"w(r) = \\left(1 - (r / {TUKEY_C})^2\\right)^2 \\text{{ for }} \\lvert r \\rvert < "
            f"{TUKEY_C},\\ 0 \\text{{ above}}"
        )
        note = "Tukey's biweight drops pixels far from the estimate completely."
    else:
        weight = f"w(r) = \\min\\left(1, {HUBER_K} / \\lvert r \\rvert\\right)"
        note = "Huber's weights shrink the pull of far pixels, but never to 0."
    scale = f"s = {params['scale']:g}" if params["scale"] > 0 else "s = \\hat\\sigma"
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Start",
                "formula": f"\\mu_0 = \\operatorname{{median}}_{{{size} \\times {size}}}",
                "note": "The median of the window, a robust first guess.",
            },
            {
                "name": "Weights",
                "formula": f"{weight},\\quad r = (I - \\mu) / s,\\ {scale}",
                "note": note
                + (
                    ""
                    if params["scale"] > 0
                    else " The scale is the noise estimate of scikit-image."
                ),
            },
            {
                "name": "Reweigh",
                "formula": "\\mu_{t+1} = \\frac{\\sum w(r)\\, I}{\\sum w(r)}",
                "note": f"{params['iterations']} steps of iteratively reweighted least squares.",
            },
        ],
    }


@register("m-estimator", representation=m_estimator_representation)
def m_estimator(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image, params["channelScope"], lambda plane, _c: m_estimator_plane(plane, params), progress
    )


# RANSAC surface ---------------------------------------------------------------------------------


def terms(xy: NDArray[np.float64], degree: int) -> NDArray[np.float64]:
    """The monomials x^i y^j with i + j <= degree, as columns."""
    x, y = xy[:, 0], xy[:, 1]
    columns = [x**i * y ** (total - i) for total in range(degree + 1) for i in range(total + 1)]
    out: NDArray[np.float64] = np.column_stack(columns)
    return out


def surface_model(degree: int) -> type:
    class Surface:
        """A polynomial surface for skimage.measure.ransac."""

        def __init__(self, coefficients: NDArray[np.float64] | None = None) -> None:
            self.coefficients = coefficients

        def __bool__(self) -> bool:
            return self.coefficients is not None

        @classmethod
        def from_estimate(cls, xy: NDArray[np.float64], z: NDArray[np.float64]) -> Self:
            a = terms(xy, degree)
            if np.linalg.matrix_rank(a) < a.shape[1]:
                return cls(None)
            coefficients, *_ = np.linalg.lstsq(a, z, rcond=None)
            return cls(coefficients)

        def predict(self, xy: NDArray[np.float64]) -> NDArray[np.float64]:
            assert self.coefficients is not None
            out: NDArray[np.float64] = terms(xy, degree) @ self.coefficients
            return out

        def residuals(self, xy: NDArray[np.float64], z: NDArray[np.float64]) -> NDArray[np.float64]:
            out: NDArray[np.float64] = np.abs(z - self.predict(xy))
            return out

    return Surface


def unit_coords(rows: NDArray[Any], cols: NDArray[Any], shape: tuple[int, ...]) -> NDArray[Any]:
    h, w = shape[:2]
    x = 2 * cols / max(w - 1, 1) - 1
    y = 2 * rows / max(h - 1, 1) - 1
    out: NDArray[np.float64] = np.column_stack([x.ravel(), y.ravel()]).astype(np.float64)
    return out


def fit_surface(image: Rgba, params: dict[str, Any]) -> tuple[Plane, NDArray[np.bool_]]:
    """The fitted background and the inlier grid pixels, as a mask of the image size."""
    rgb = image[..., :3].astype(np.float64)
    luma = KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2]
    h, w = luma.shape
    step = params["step"]
    rows, cols = np.mgrid[0:h:step, 0:w:step]
    xy = unit_coords(rows, cols, luma.shape)
    z = luma[rows, cols].ravel()
    degree = params["degree"]
    count = (degree + 1) * (degree + 2) // 2
    if z.size <= count:
        raise ValueError("The grid has too few pixels for this degree. Lower the grid step.")
    model, inliers = SKIMAGE["ransac"](
        (xy, z),
        surface_model(degree),
        min_samples=count,
        residual_threshold=params["threshold"],
        max_trials=params["trials"],
        rng=SEED,
    )
    if model is None or inliers is None:
        raise ValueError("RANSAC found no surface. Raise the threshold or the number of trials.")
    all_rows, all_cols = np.mgrid[0:h, 0:w]
    background = model.predict(unit_coords(all_rows, all_cols, luma.shape)).reshape(h, w)
    mask = np.zeros((h, w), bool)
    mask[rows.ravel()[inliers], cols.ravel()[inliers]] = True
    return background, mask


def ransac_surface_representation(params: dict[str, Any]) -> dict[str, Any]:
    degree = params["degree"]
    count = (degree + 1) * (degree + 2) // 2
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Samples",
                "formula": f"\\text{{every }} {params['step']} \\text{{ px}}",
                "note": "The luma at the pixels of a grid, with x and y scaled to -1 to 1.",
            },
            {
                "name": "Model",
                "formula": f"B(x, y) = \\sum_{{i + j \\le {degree}}} a_{{ij}} x^i y^j",
                "note": f"A polynomial surface with {count} coefficients.",
            },
            {
                "name": "Consensus",
                "formula": f"\\lvert Y - B \\rvert \\le {params['threshold']:g}",
                "note": f"{params['trials']} trials, each fitting {count} random samples. The "
                "trial with the most inliers wins, and all its inliers are fitted again.",
            },
            {
                "name": "Correct",
                "formula": "I' = I - (B - \\bar B)",
                "note": "The background minus its mean is taken from every channel.",
            },
        ],
    }


@register("ransac-surface", representation=ransac_surface_representation)
def ransac_surface(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    background, inliers = fit_surface(image, params)
    progress(0.8)
    out = image.copy()
    if params["output"] == "background":
        out[..., :3] = to_uint8(background)[..., None]
    elif params["output"] == "inliers":
        shown = image[..., :3] // 2
        shown[inliers] = (255, 214, 10)
        out[..., :3] = shown
    else:
        shift = background - background.mean()
        for channel in range(3):
            out[..., channel] = to_uint8(image[..., channel] - shift)
    progress(1.0)
    return out
