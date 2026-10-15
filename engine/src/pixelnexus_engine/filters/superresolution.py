"""Classical super-resolution: bicubic enlargement, then iterative back-projection.

The image grows by a whole factor s. The geometry is the one of the studio's Resize
(web/src/core/image/resample.ts): pixel i covers [i, i + 1), so the center of output pixel x
sits at u = (x + 1/2) / s - 1/2 in input pixels, and the picture does not shift.

* U is bicubic enlargement, Keys' cubic with a = -1/2. Near the edge, taps outside the image
  are left out and the rest renormalized, as in Resize. With no iterations the result is
  Resize with the bicubic method.
* D is the camera model: each input pixel is the mean of the s x s output pixels it covers.
* Back-projection, after Irani and Peleg (1991) for a single image: x_0 = U g, then
  x_{k+1} = x_k + U (g - D x_k). The bicubic kernel spreads the error of the model back.
  The eigenvalues of D U lie in (0, 1], so D x_k tends to g.

Colors are premultiplied by alpha first, as in Resize. With the brightness scope, only Y of
Y'CbCr is back-projected, and Cb, Cr and alpha are enlarged with bicubic.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import numpy as np
import scipy.sparse
from numpy.typing import NDArray

from pixelnexus_engine.planes import Plane, rgb_to_ycc, ycc_to_rgb
from pixelnexus_engine.registry import Progress, Rgba, register

KEYS_A = -0.5


def keys(t: NDArray[np.float64]) -> NDArray[np.float64]:
    """Keys' cubic convolution kernel with a = -1/2."""
    t = np.abs(t)
    a = KEYS_A
    near = ((a + 2) * t - (a + 3)) * t * t + 1
    far = ((t - 5) * t + 8) * t * a - 4 * a
    return np.where(t <= 1, near, np.where(t < 2, far, 0.0))


def bicubic_matrix(size: int, scale: int) -> scipy.sparse.csr_array:
    """Row x holds the weights of the input pixels for output pixel x, normalized to 1."""
    out = np.arange(size * scale)
    u = (out + 0.5) / scale - 0.5
    first = np.ceil(u - 2).astype(int)
    rows, cols, weights = [], [], []
    for offset in range(5):
        i = first + offset
        inside = (i >= 0) & (i < size) & (np.abs(i - u) < 2)
        rows.append(out[inside])
        cols.append(i[inside])
        weights.append(keys(i[inside] - u[inside]))
    matrix = scipy.sparse.coo_array(
        (np.concatenate(weights), (np.concatenate(rows), np.concatenate(cols))),
        shape=(size * scale, size),
    ).tocsr()
    sums = np.asarray(matrix.sum(axis=1)).ravel()
    return scipy.sparse.csr_array(scipy.sparse.diags_array(1 / sums) @ matrix)


def box_matrix(size: int, scale: int) -> scipy.sparse.csr_array:
    """Row i averages the s output pixels that input pixel i covers."""
    block = np.full((1, scale), 1 / scale)
    matrix = scipy.sparse.kron(scipy.sparse.eye_array(size), block, format="csr")
    return scipy.sparse.csr_array(matrix)


class Grid:
    """The enlargement U and the camera model D for one image size and scale."""

    def __init__(self, height: int, width: int, scale: int) -> None:
        self.up_rows = bicubic_matrix(height, scale)
        self.up_cols = bicubic_matrix(width, scale)
        self.down_rows = box_matrix(height, scale)
        self.down_cols = box_matrix(width, scale)

    def up(self, plane: Plane) -> Plane:
        out: Plane = self.up_rows @ (self.up_cols @ plane.T).T
        return out

    def down(self, plane: Plane) -> Plane:
        out: Plane = self.down_rows @ (self.down_cols @ plane.T).T
        return out


def back_project(
    g: Plane,
    grid: Grid,
    iterations: int,
    on_step: Callable[[int, Plane], None] | None = None,
) -> Plane:
    """Iterative back-projection from the bicubic start. on_step sees each new estimate."""
    x = grid.up(g)
    for k in range(iterations):
        x = x + grid.up(g - grid.down(x))
        if on_step is not None:
            on_step(k + 1, x)
    return x


def premultiplied(image: Rgba) -> tuple[list[Plane], Plane]:
    alpha = image[..., 3].astype(np.float64)
    colors = [image[..., c].astype(np.float64) * (alpha / 255) for c in range(3)]
    return colors, alpha


def straight(colors: list[Plane], alpha: Plane) -> Rgba:
    """Back to straight 8-bit RGBA, as Resize does. Where alpha is 0, the color is 0."""
    a = np.clip(alpha, 0, 255)
    safe = np.where(a > 0, a, 1.0)
    out = np.zeros((*a.shape, 4), dtype=np.uint8)
    for c, plane in enumerate(colors):
        value = np.round(np.clip(plane * 255 / safe, 0, 255))
        out[..., c] = np.where(a > 0, value, 0).astype(np.uint8)
    out[..., 3] = np.round(a).astype(np.uint8)
    return out


def super_resolve(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    height, width = image.shape[:2]
    grid = Grid(height, width, params["scale"])
    iterations = params["iterations"]
    colors, alpha = premultiplied(image)
    if params["channelScope"] == "rgb":
        planes = colors
    else:
        y, cb, cr = rgb_to_ycc(*colors)
        planes = [y]
    total = len(planes) * max(1, iterations)
    done = 0

    def step(_k: int, _x: Plane) -> None:
        nonlocal done
        done += 1
        progress(done / total)

    sharp = [back_project(plane, grid, iterations, step) for plane in planes]
    if params["channelScope"] != "rgb":
        sharp = list(ycc_to_rgb(sharp[0], grid.up(cb), grid.up(cr)))
    progress(1.0)
    return straight(sharp, grid.up(alpha))


# Representation -------------------------------------------------------------------------------


def sr_representation(params: dict[str, Any]) -> dict[str, Any]:
    s, iterations = params["scale"], params["iterations"]
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Grid",
                "formula": f"u = \\frac{{x + 1/2}}{{{s}}} - \\frac{{1}}{{2}}",
                "note": f"Output pixel x has its center at input position u. The image grows "
                f"{s} times in each direction, and the picture does not shift.",
            },
            {
                "name": "Start",
                "formula": "x_0 = U g,\\quad k(t) = \\begin{cases} \\tfrac{3}{2}\\lvert t "
                "\\rvert^3 - \\tfrac{5}{2} \\lvert t \\rvert^2 + 1 & \\lvert t \\rvert \\le 1 \\\\"
                " -\\tfrac{1}{2}\\lvert t \\rvert^3 + \\tfrac{5}{2}\\lvert t \\rvert^2 - 4 "
                "\\lvert t \\rvert + 2 & 1 < \\lvert t \\rvert < 2 \\end{cases}",
                "note": "U is bicubic enlargement with Keys' kernel k, a = -1/2, as in Resize.",
            },
            {
                "name": "Camera model",
                "formula": f"(D x)(i, j) = \\frac{{1}}{{{s * s}}} \\sum_{{m, n = 0}}^{{{s - 1}}}"
                f" x({s} i + m,\\ {s} j + n)",
                "note": "Each input pixel is taken as the mean of the output pixels it covers.",
            },
            {
                "name": "Back-projection",
                "formula": "x_{k+1} = x_k + U \\big(g - D x_k\\big)",
                "note": f"{iterations} iterations. The error of the model is spread back with "
                "the bicubic kernel, after Irani and Peleg.",
            },
        ],
    }


@register("sr-classical", representation=sr_representation)
def sr_classical(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return super_resolve(image, params, progress)
