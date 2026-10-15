"""Blob detection with scikit-image. The results are tables of features, not images.

All three work on the luma of the image (BT.709 weights) scaled to 0 to 1, as scikit-image
expects, so its thresholds keep their meaning. Dark blobs are found as bright blobs of 1 - luma.

* blob-log: skimage.feature.blob_log. The scale-normalized Laplacian of Gaussian,
  -sigma^2 LoG * I, at num_sigma scales from min to max sigma.
* blob-dog: skimage.feature.blob_dog. Differences of Gaussians at sigmas growing by a ratio k,
  (G_sigma - G_{k sigma}) * I / (k - 1).
* blob-doh: skimage.feature.blob_doh. The determinant of the Hessian, with box filters on the
  integral image, as in SURF: D_xx D_yy - 0.81 D_xy^2. It finds bright and dark blobs alike, so
  it has no polarity setting. Its boxes only sum to zero when floor(3 sigma) is a multiple of 3,
  so the brightness level adds a little to the response.

A blob is a local maximum of the response in space and scale above the threshold. Blobs that
overlap more than the overlap limit are pruned, the smaller one going. The score of a blob is
the response at its peak, computed the same way scikit-image computes it.

A table has columns with a key, a label and a unit, and one row per feature. The studio draws
rows with x, y and radius as circles. x is the column and y the row of the pixel, so the
center of the pixel is at x + 0.5, y + 0.5 in image coordinates.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage
from skimage.feature import blob as skimage_blob
from skimage.feature import blob_dog, blob_doh, blob_log
from skimage.filters import gaussian as skimage_gaussian

from pixelnexus_engine.planes import KB, KG, KR, Plane
from pixelnexus_engine.registry import Progress, Rgba, register

Blobs = NDArray[np.float64]

COLUMNS = [
    {"key": "x", "label": "x", "unit": "px"},
    {"key": "y", "label": "y", "unit": "px"},
    {"key": "radius", "label": "Radius", "unit": "px"},
    {"key": "sigma", "label": "Sigma", "unit": "px"},
    {"key": "score", "label": "Score", "unit": ""},
]

# The radius of a blob of scale sigma, from the scikit-image docs.
RADIUS = {"blob-log": math.sqrt(2), "blob-dog": math.sqrt(2), "blob-doh": 1.0}

# These functions of scikit-image have no type hints.
SKIMAGE: dict[str, Any] = {"blob-log": blob_log, "blob-dog": blob_dog, "blob-doh": blob_doh}
gaussian: Any = skimage_gaussian
# The DoH response of scikit-image, a private function that blob_doh uses.
_hessian_matrix_det: Any = vars(skimage_blob)["_hessian_matrix_det"]


def luma01(image: Rgba, polarity: str) -> Plane:
    """The luma from 0 to 1, inverted for dark blobs."""
    rgb = image[..., :3].astype(np.float64) / 255
    y: Plane = KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2]
    return 1 - y if polarity == "dark" else y


def detect(gray: Plane, kind: str, params: dict[str, Any]) -> Blobs:
    """Rows of (row, column, sigma), as scikit-image returns them."""
    common: dict[str, Any] = {
        "min_sigma": params["minSigma"],
        "max_sigma": max(params["minSigma"], params["maxSigma"]),
        "threshold": params["threshold"],
        "overlap": params["overlap"],
    }
    if kind == "blob-dog":
        common["sigma_ratio"] = params["sigmaRatio"]
    else:
        common["num_sigma"] = params["numSigma"]
        common["log_scale"] = params["logScale"]
    blobs: Blobs = np.asarray(SKIMAGE[kind](gray, **common), dtype=np.float64)
    return blobs.reshape(-1, 3)


def scores(gray: Plane, kind: str, blobs: Blobs, params: dict[str, Any]) -> NDArray[np.float64]:
    """The response at each blob's peak, as scikit-image computes it for its scale."""
    out = np.empty(len(blobs))
    # The integral image, as skimage.transform.integral_image makes it.
    integral = gray.cumsum(axis=0).cumsum(axis=1) if kind == "blob-doh" else None
    for sigma in np.unique(blobs[:, 2]):
        if kind == "blob-log":
            response = -ndimage.gaussian_laplace(gray, sigma) * sigma**2
        elif kind == "blob-dog":
            ratio = params["sigmaRatio"]
            near = gaussian(gray, sigma=sigma, mode="reflect")
            far = gaussian(gray, sigma=sigma * ratio, mode="reflect")
            response = (near - far) / (ratio - 1)
        else:
            response = _hessian_matrix_det(integral, sigma)
        rows = blobs[:, 2] == sigma
        out[rows] = response[blobs[rows, 0].astype(int), blobs[rows, 1].astype(int)]
    return out


def blob_table(
    image: Rgba, kind: str, params: dict[str, Any], progress: Progress
) -> dict[str, Any]:
    gray = luma01(image, params.get("blobs", "bright"))
    blobs = detect(gray, kind, params)
    progress(0.8)
    score = scores(gray, kind, blobs, params)
    order = np.argsort(-score, kind="stable")
    rows = [
        [
            int(blobs[i, 1]),
            int(blobs[i, 0]),
            round(float(blobs[i, 2] * RADIUS[kind]), 4),
            round(float(blobs[i, 2]), 4),
            round(float(score[i]), 6),
        ]
        for i in order
    ]
    progress(1.0)
    noun = "blob" if len(rows) == 1 else "blobs"
    return {
        "kind": "features",
        "columns": COLUMNS,
        "rows": rows,
        "summary": f"{len(rows)} {noun}",
    }


# Representation -------------------------------------------------------------------------------


def sigma_list(kind: str, params: dict[str, Any]) -> list[float]:
    """The scales scikit-image tries, for the Inspector."""
    low = params["minSigma"]
    high = max(low, params["maxSigma"])
    if kind == "blob-dog":
        ratio = params["sigmaRatio"]
        k = int(math.log(high / low) / math.log(ratio) + 1)
        return [low * ratio**i for i in range(k + 1)]
    if params["logScale"]:
        return [
            float(v) for v in np.logspace(math.log10(low), math.log10(high), params["numSigma"])
        ]
    return [float(v) for v in np.linspace(low, high, params["numSigma"])]


RESPONSES = {
    "blob-log": (
        "R_\\sigma = -\\sigma^2 \\nabla^2 (G_\\sigma * I)",
        "The scale-normalized Laplacian of Gaussian. A bright blob of radius r gives its "
        "strongest response near sigma = r / sqrt(2).",
    ),
    "blob-dog": (
        "R_{\\sigma} = \\frac{(G_{\\sigma} - G_{k\\sigma}) * I}{k - 1}",
        "The difference of two Gaussian blurs, close to the scale-normalized Laplacian. The "
        "last scale only serves as the partner of the one before.",
    ),
    "blob-doh": (
        "R_\\sigma = D_{xx} D_{yy} - 0.81\\, D_{xy}^2",
        "The determinant of the Hessian, with box-filter second derivatives on the integral "
        "image, as in SURF. The boxes span floor(3 sigma) pixels, and each sum is divided by "
        "the square of that size. Bright and dark blobs are both found.",
    ),
}


def blob_representation(kind: str, params: dict[str, Any]) -> dict[str, Any]:
    formula, note = RESPONSES[kind]
    scales = ", ".join(f"{s:.3g}" for s in sigma_list(kind, params))
    polarity = "1 - Y" if params.get("blobs") == "dark" else "Y"
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Input",
                "formula": f"I = {polarity},\\quad Y = 0.2126 R + 0.7152 G + 0.0722 B",
                "note": "The luma from 0 to 1. Dark blobs are found as bright blobs of 1 - Y.",
            },
            {"name": "Response", "formula": formula, "note": f"{note} Scales: {scales} px."},
            {
                "name": "Peaks",
                "formula": f"R_\\sigma(x) \\ge {params['threshold']:g},\\quad R_\\sigma(x) = "
                "\\max_{3 \\times 3 \\times 3} R",
                "note": "A blob is a local maximum over its 3 x 3 neighbors in space and the "
                "scales next to it, above the threshold.",
            },
            {
                "name": "Pruning",
                "formula": f"\\text{{overlap}} > {params['overlap']:g}",
                "note": "Of two blobs whose areas overlap by more than this share, the smaller "
                f"goes. The radius is {RADIUS[kind]:.4g} sigma.",
            },
        ],
    }


@register("blob-log", representation=lambda p: blob_representation("blob-log", p))
def blob_log_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> dict[str, Any]:
    return blob_table(image, "blob-log", params, progress)


@register("blob-dog", representation=lambda p: blob_representation("blob-dog", p))
def blob_dog_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> dict[str, Any]:
    return blob_table(image, "blob-dog", params, progress)


@register("blob-doh", representation=lambda p: blob_representation("blob-doh", p))
def blob_doh_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> dict[str, Any]:
    return blob_table(image, "blob-doh", params, progress)
