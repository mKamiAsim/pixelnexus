"""The fast bilateral solver of Barron and Poole (ECCV 2016), as an edge-aware smoother.

The image is its own guide and its own target, with the same confidence at every pixel:

1. Bilateral grid. Each pixel gets the vertex (x / sigma_s, y / sigma_s, Y / sigma_l,
   Cb / sigma_c, Cr / sigma_c), each rounded down, with Y'CbCr from planes.rgb_to_ycc in levels.
   Pixels with the same vertex share it. S is the sparse matrix that adds pixels into vertices.
2. Blur. B adds, along each of the five axes, the two neighboring vertices to twice the vertex
   itself: the [1, 2, 1] filter of the paper in each dimension.
3. Bistochastization. With m = S 1, the pixel count of each vertex, n is repeated ten times as
   n = sqrt(n m / (B n)), so that the normalized blur keeps sums.
4. Solve, for each color channel t, the linear system A y = S t with
   A = lambda (D_m - D_n B D_n) + diag(m), where D_m = diag(n B n) and D_n = diag(n). The
   conjugate gradient method of SciPy solves it, with the diagonal of A as a preconditioner,
   from y0 = S t / m. The result is S^T y.

Rounding to vertices and the ten steps follow the paper. The guide in Y'CbCr, the fixed
confidence, and the defaults of the parameters are PixelNexus's own.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy.sparse import csr_matrix, diags
from scipy.sparse.linalg import cg

from pixelnexus_engine.planes import rgb_to_ycc
from pixelnexus_engine.registry import Progress, Rgba, register

Float = NDArray[np.float64]
BISTOCHASTIC_STEPS = 10
CG_STEPS = 50
CG_TOLERANCE = 1e-5


class BilateralGrid:
    """The simplified bilateral grid: one vertex for each occupied cell of the 5D space."""

    def __init__(self, image: Rgba, sigma_spatial: float, sigma_luma: float, sigma_chroma: float):
        height, width = image.shape[:2]
        rgb = image[..., :3].astype(np.float64)
        y, cb, cr = rgb_to_ycc(rgb[..., 0], rgb[..., 1], rgb[..., 2])
        rows, cols = np.mgrid[0:height, 0:width]
        coords = np.stack(
            [
                np.floor(cols / sigma_spatial),
                np.floor(rows / sigma_spatial),
                np.floor(y / sigma_luma),
                np.floor(cb / sigma_chroma),
                np.floor(cr / sigma_chroma),
            ],
            axis=-1,
        ).reshape(-1, 5)
        coords = coords.astype(np.int64)
        vertices, index = np.unique(coords, axis=0, return_inverse=True)
        self.pixels = height * width
        self.vertices = len(vertices)
        self.splat_matrix = csr_matrix(
            (np.ones(self.pixels), (index.ravel(), np.arange(self.pixels))),
            shape=(self.vertices, self.pixels),
        )
        lookup = {tuple(v): i for i, v in enumerate(vertices.tolist())}
        rows_b, cols_b = [], []
        for axis in range(5):
            for step in (-1, 1):
                moved = vertices.copy()
                moved[:, axis] += step
                for i, v in enumerate(moved.tolist()):
                    j = lookup.get(tuple(v))
                    if j is not None:
                        rows_b.append(i)
                        cols_b.append(j)
        neighbors = csr_matrix(
            (np.ones(len(rows_b)), (rows_b, cols_b)), shape=(self.vertices, self.vertices)
        )
        # [1, 2, 1] along each of the 5 axes: 2 * 5 times the vertex, plus its neighbors.
        self.blur_matrix = neighbors + diags(np.full(self.vertices, 10.0))

    def splat(self, values: Float) -> Float:
        out: Float = self.splat_matrix @ values
        return out

    def slice(self, values: Float) -> Float:
        out: Float = self.splat_matrix.T @ values
        return out

    def blur(self, values: Float) -> Float:
        out: Float = self.blur_matrix @ values
        return out


def bistochastize(grid: BilateralGrid) -> tuple[Float, Float]:
    """n and the diagonal of D_m, so that D_n B D_n has the row sums m."""
    m = grid.splat(np.ones(grid.pixels))
    n = np.ones(grid.vertices)
    for _ in range(BISTOCHASTIC_STEPS):
        n = np.sqrt(n * m / grid.blur(n))
    return n, n * grid.blur(n)


def solve(
    image: Rgba,
    sigma_spatial: float,
    sigma_luma: float,
    sigma_chroma: float,
    lam: float,
    progress: Progress | None = None,
) -> Float:
    """The smoothed RGB channels of the image, as an H x W x 3 array of levels."""
    grid = BilateralGrid(image, sigma_spatial, sigma_luma, sigma_chroma)
    n, dm = bistochastize(grid)
    m = grid.splat(np.ones(grid.pixels))
    dn = diags(n)
    a = lam * (diags(dm) - dn @ grid.blur_matrix @ dn) + diags(m)
    preconditioner = diags(1 / np.maximum(a.diagonal(), 1e-5))
    height, width = image.shape[:2]
    out = np.empty((height, width, 3))
    for channel in range(3):
        target = image[..., channel].astype(np.float64).ravel()
        b = grid.splat(target)
        y, _ = cg(a, b, x0=b / m, M=preconditioner, rtol=CG_TOLERANCE, maxiter=CG_STEPS)
        out[..., channel] = grid.slice(y).reshape(height, width)
        if progress is not None:
            progress(0.3 * (channel + 1))
    return out


def bilateral_solver_representation(params: dict[str, Any]) -> dict[str, Any]:
    ss, sl, sc = params["sigmaSpatial"], params["sigmaLuma"], params["sigmaChroma"]

    def frac(top: str, bottom: float) -> str:
        return "\\tfrac{" + top + "}{" + f"{bottom:g}" + "}"

    cell = ", ".join(
        [frac("x", ss), frac("y", ss), frac("Y", sl), frac("C_b", sc), frac("C_r", sc)]
    )
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Bilateral grid",
                "formula": "v = \\left\\lfloor \\left(" + cell + "\\right) \\right\\rfloor",
                "note": "Pixels in the same cell share a vertex. S adds pixels into vertices.",
            },
            {
                "name": "Solve",
                "formula": (
                    f"\\left({params['lambda']:g}\\,(D_m - D_n B D_n) + "
                    "\\operatorname{diag}(S\\mathbf{1})\\right) \\mathbf{y} = S\\,\\mathbf{t}"
                ),
                "note": "Conjugate gradients with the diagonal as preconditioner, per channel.",
            },
            {
                "name": "Slice",
                "formula": "\\hat{\\mathbf{t}} = S^{\\top} \\mathbf{y}",
                "note": "Each pixel takes the value of its vertex.",
            },
        ],
    }


@register("bilateral-solver", representation=bilateral_solver_representation)
def bilateral_solver(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    out = solve(
        image,
        params["sigmaSpatial"],
        params["sigmaLuma"],
        params["sigmaChroma"],
        params["lambda"],
        progress,
    )
    result = image.copy()
    result[..., :3] = np.clip(np.rint(out), 0, 255).astype(np.uint8)
    progress(1.0)
    return result
