"""BM3D-lite: a simplified two-step BM3D, after Dabov, Foi, Katkovnik and Egiazarian (2007), with
the step-by-step description and the parameter table of Lebrun's IPOL analysis (2012).

Step 1, hard thresholding. For each reference patch of 8 x 8 pixels, on a grid with a step of 3
(plus the last row and column), the patches of the noisy image in the search window whose
normalized distance ||P - Q||^2 / 64 is at most tau_hard are sorted by distance, and the 16
closest form a 3D group. The group is transformed, coefficients with |x| <= 2.7 sigma are set
to 0, and the inverse transform gives an estimate of each patch. The estimates are added up with
the weight 1 / N, N being the number of coefficients kept (1 if none).

Step 2, Wiener filtering. The matching runs on the basic estimate with tau_wien, and the 32
closest patches form two groups, one from the basic estimate and one from the noisy image. The
noisy group is multiplied in the transform domain by omega = B^2 / (B^2 + sigma^2), B being the
transformed basic group, and the estimates are added up with the weight 1 / ||omega||^2.

tau_hard is 2500 and tau_wien 400 for sigma <= 40, and 5000 and 3500 above, as in Lebrun's
table, for values from 0 to 255.

What makes it lite, our choices: every transform is the orthonormal DCT (scipy.fft.dctn with
norm "ortho"), in 2D within the patches and in 1D across them, as in Lebrun's DCT variant. The
Kaiser window of the aggregation is left out, as Lebrun found it does not raise the PSNR. The 2D
pre-threshold of the matching for sigma > 40 is left out. Each channel is processed on its own,
not in the opponent color space of the paper. The search window is 2 radius + 1 pixels across.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from numpy.typing import NDArray
from scipy.fft import dctn, idctn
from skimage.restoration import estimate_sigma

from pixelnexus_engine.planes import Plane, filter_by_scope
from pixelnexus_engine.registry import Progress, Rgba, register

Float = NDArray[np.float64]
PATCH = 8
STEP = 3
GROUP_HARD = 16
GROUP_WIENER = 32
LAMBDA_3D = 2.7
# scikit-image has no type hints.
SKIMAGE: dict[str, Any] = {"estimate_sigma": estimate_sigma}


def thresholds(sigma: float) -> tuple[float, float]:
    """tau_hard and tau_wien of Lebrun's table."""
    return (2500.0, 400.0) if sigma <= 40 else (5000.0, 3500.0)


def grid(size: int) -> list[int]:
    last = size - PATCH
    points = list(range(0, last + 1, STEP))
    return points if points[-1] == last else [*points, last]


def match(
    patches: Float, row: int, col: int, radius: int, tau: float, count: int
) -> tuple[NDArray[np.intp], NDArray[np.intp]]:
    """Rows and columns of the closest patches with a normalized distance at most tau, the
    reference first."""
    rows, cols = patches.shape[:2]
    top, left = max(row - radius, 0), max(col - radius, 0)
    bottom, right = min(row + radius, rows - 1), min(col + radius, cols - 1)
    window = patches[top : bottom + 1, left : right + 1]
    distance = np.mean((window - patches[row, col]) ** 2, axis=-1)
    # The reference comes first, as in Lebrun, even where other patches tie with it at 0.
    distance[row - top, col - left] = -1.0
    flat = distance.ravel()
    order = np.argsort(flat, kind="stable")
    order = order[flat[order] <= tau][:count]
    found_rows, found_cols = np.divmod(order, window.shape[1])
    return found_rows + top, found_cols + left


def bm3d_lite_plane(
    plane: Plane, params: dict[str, Any], progress: Progress
) -> tuple[Plane, Plane, float]:
    """The basic estimate, the final estimate, and the sigma used."""
    sigma = float(params["sigma"]) or float(SKIMAGE["estimate_sigma"](plane / 255)) * 255
    sigma = max(sigma, 1e-6)
    tau_hard, tau_wien = thresholds(sigma)
    radius = params["searchRadius"]
    rows, cols = grid(plane.shape[0]), grid(plane.shape[1])
    total = 2 * len(rows)

    def aggregate(
        source: Plane, guide: Plane, tau: float, count: int, wiener: bool, done: int
    ) -> Plane:
        guide_patches = sliding_window_view(guide, (PATCH, PATCH)).reshape(
            guide.shape[0] - PATCH + 1, guide.shape[1] - PATCH + 1, PATCH * PATCH
        )
        source_patches = sliding_window_view(source, (PATCH, PATCH))
        numerator, denominator = np.zeros_like(plane), np.zeros_like(plane)
        for index, row in enumerate(rows):
            for col in cols:
                found_rows, found_cols = match(guide_patches, row, col, radius, tau, count)
                group = dctn(source_patches[found_rows, found_cols], norm="ortho")
                if wiener:
                    basic = dctn(
                        guide_patches[found_rows, found_cols].reshape(-1, PATCH, PATCH),
                        norm="ortho",
                    )
                    omega = basic**2 / (basic**2 + sigma**2)
                    estimate = idctn(omega * group, norm="ortho")
                    weight = 1 / max(float(np.sum(omega**2)), 1e-12)
                else:
                    group[np.abs(group) <= LAMBDA_3D * sigma] = 0
                    kept = int(np.count_nonzero(group))
                    estimate = idctn(group, norm="ortho")
                    weight = 1 / kept if kept >= 1 else 1.0
                for patch, r, c in zip(estimate, found_rows, found_cols, strict=True):
                    numerator[r : r + PATCH, c : c + PATCH] += weight * patch
                    denominator[r : r + PATCH, c : c + PATCH] += weight
            progress((done + index + 1) / total)
        out: Plane = numerator / denominator
        return out

    basic = aggregate(plane, plane, tau_hard, GROUP_HARD, False, 0)
    final = aggregate(plane, basic, tau_wien, GROUP_WIENER, True, len(rows))
    return basic, final, sigma


def bm3d_lite_representation(params: dict[str, Any]) -> dict[str, Any]:
    sigma = params["sigma"]
    shown = f"{sigma:g}" if sigma else "\\hat{\\sigma}"
    tau_hard, tau_wien = thresholds(sigma or 0)
    side = 2 * params["searchRadius"] + 1
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Group",
                "formula": f"\\frac{{\\lVert P - Q \\rVert^2}}{{64}} \\le {tau_hard:g}",
                "note": f"Up to {GROUP_HARD} patches of 8 x 8 like the reference, from a {side} x "
                f"{side} window, every {STEP} pixels.",
            },
            {
                "name": "Hard threshold",
                "formula": f"\\gamma(x) = 0 \\text{{ if }} \\lvert x \\rvert \\le {LAMBDA_3D:g}\\, "
                f"{shown}",
                "note": "In the 3D DCT of the group. Groups with fewer kept coefficients weigh "
                "more.",
            },
            {
                "name": "Wiener",
                "formula": f"\\omega = \\frac{{B^2}}{{B^2 + {shown}^2}},\\quad "
                f"\\frac{{\\lVert P - Q \\rVert^2}}{{64}} \\le {tau_wien:g}",
                "note": f"Groups of up to {GROUP_WIENER}, matched on the basic estimate B, and "
                "the noisy group scaled by omega.",
            },
            {
                "name": "Aggregate",
                "formula": "u(x) = \\frac{\\sum w_P\\, u_{Q,P}(x)}{\\sum w_P}",
                "note": "Every patch estimate that covers a pixel is averaged with its weight.",
            },
        ],
    }


@register("bm3d-lite", representation=bm3d_lite_representation)
def bm3d_lite(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    output = params["output"]

    def run(plane: Plane, _channel: int) -> Plane:
        basic, final, _ = bm3d_lite_plane(plane, params, lambda _: None)
        return basic if output == "basic" else final

    return filter_by_scope(image, params["channelScope"], run, progress)
