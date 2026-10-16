"""Iterative steering kernel regression, after Takeda, Farsiu and Milanfar (2007), in
PixelNexus's own code.

* Regression (Eq. 43): at each pixel x, a local polynomial of order N (0, 1 or 2) is fitted by
  weighted least squares to the samples y_i at x_i in a square window. The estimate is the
  constant term beta_0, and for N >= 1 the linear terms beta_1 are the gradient.
* Steering kernel (Eq. 47 and 48), Gaussian, with mu_i = 1 for a regular grid (Eq. 39):
  K(x_i - x) = sqrt(det C_i) / (2 pi h^2) exp(-(x_i - x)^T C_i (x_i - x) / (2 h^2)). C_i belongs
  to the sample x_i.
* Steering matrix (Eq. 50 to 54): the gradients in a local window around x_i form the matrix G_i,
  with singular values s_1 >= s_2 and the second right singular vector v_2 = (nu_1, nu_2).
  theta_i = arctan(nu_1 / nu_2), sigma_i = (s_1 + lambda') / (s_2 + lambda'), gamma_i =
  ((s_1 s_2 + lambda'') / M)^(1/2), and C_i = gamma_i U_theta diag(sigma_i, 1 / sigma_i)
  U_theta^T, with lambda' = 1.0 and lambda'' = 0.01 as in the paper. Here U_theta diag(...)
  U_theta^T is formed directly from v_2 and its normal, which gives the same matrix.
* Iteration (Fig. 10): gradients first, then the steering matrices, then a regression on the
  input. Each further iteration takes the gradients from the last regression and regresses its
  output. The first gradients come from the classic regression of the same order with
  H = h I, our choice, since the paper names the method but not its settings.

Our choices, which the paper leaves open: the regression window of (2 radius + 1)^2 pixels,
the 5 x 5 window for the gradient matrix (M = 25), the reflect 101 border, and a tiny ridge on
each local system, 1e-10 times each diagonal entry, to keep it solvable.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray

from pixelnexus_engine.planes import Plane, filter_by_scope
from pixelnexus_engine.registry import Progress, Rgba, register

Float = NDArray[np.float64]
LAMBDA_ELONGATION = 1.0
LAMBDA_SCALE = 0.01
GRADIENT_RADIUS = 2
RIDGE = 1e-10


def basis(dy: int, dx: int, order: int) -> list[float]:
    """The polynomial terms of an offset: 1, then dx, dy, then dx^2, dx dy, dy^2."""
    terms = [1.0]
    if order >= 1:
        terms += [float(dx), float(dy)]
    if order >= 2:
        terms += [float(dx * dx), float(dx * dy), float(dy * dy)]
    return terms


def shifted(padded: Float, dy: int, dx: int, reach: int, shape: tuple[int, ...]) -> Float:
    height, width = shape[:2]
    return padded[reach + dy : reach + dy + height, reach + dx : reach + dx + width]


def regression(
    values: Float, steering: Float | None, params: dict[str, Any]
) -> tuple[Float, Float, Float]:
    """beta_0, and the gradients d/dx and d/dy (zero for order 0), with the steering matrices
    of shape (H, W, 2, 2), or the classic kernel when steering is None."""
    h, order, reach = params["h"], int(params["order"]), params["radius"]
    shape = values.shape
    count = len(basis(0, 0, order))
    pad_values = np.pad(values, reach, mode="reflect")
    if steering is not None:
        pad_c = np.pad(steering, ((reach, reach), (reach, reach), (0, 0), (0, 0)), mode="reflect")
        root_det = np.sqrt(np.maximum(np.linalg.det(pad_c), 0.0))
    normal = np.zeros((*shape, count, count))
    right = np.zeros((*shape, count))
    for dy in range(-reach, reach + 1):
        for dx in range(-reach, reach + 1):
            if steering is None:
                weight = np.full(shape, np.exp(-(dx * dx + dy * dy) / (2 * h * h)))
            else:
                c = shifted(pad_c, dy, dx, reach, shape)
                quadratic = (
                    c[..., 0, 0] * dx * dx + 2 * c[..., 0, 1] * dx * dy + c[..., 1, 1] * dy * dy
                )
                weight = shifted(root_det, dy, dx, reach, shape) * np.exp(-quadratic / (2 * h * h))
            terms = np.array(basis(dy, dx, order))
            outer = np.outer(terms, terms)
            normal += weight[..., None, None] * outer
            right += (weight * shifted(pad_values, dy, dx, reach, shape))[..., None] * terms
    diagonal = np.diagonal(normal, axis1=-2, axis2=-1)
    normal += RIDGE * diagonal[..., None] * np.eye(count)
    beta = np.linalg.solve(normal, right[..., None])[..., 0]
    zero = np.zeros(shape)
    if order == 0:
        return beta[..., 0], zero, zero
    return beta[..., 0], beta[..., 1], beta[..., 2]


def steering_matrices(gx: Float, gy: Float) -> Float:
    """C_i from the gradients in the 5 x 5 window around each pixel (Eq. 50 to 54)."""
    reach = GRADIENT_RADIUS
    shape = gx.shape
    pad_x, pad_y = np.pad(gx, reach, mode="reflect"), np.pad(gy, reach, mode="reflect")
    xx, xy, yy = np.zeros(shape), np.zeros(shape), np.zeros(shape)
    for dy in range(-reach, reach + 1):
        for dx in range(-reach, reach + 1):
            a, b = shifted(pad_x, dy, dx, reach, shape), shifted(pad_y, dy, dx, reach, shape)
            xx += a * a
            xy += a * b
            yy += b * b
    # G^T G = V S^2 V^T, so the singular values of G are the square roots of its eigenvalues.
    gram = np.stack([np.stack([xx, xy], -1), np.stack([xy, yy], -1)], -2)
    eigenvalues, vectors = np.linalg.eigh(gram)
    s2, s1 = (
        np.sqrt(np.maximum(eigenvalues[..., 0], 0)),
        np.sqrt(np.maximum(eigenvalues[..., 1], 0)),
    )
    count = (2 * reach + 1) ** 2
    elongation = (s1 + LAMBDA_ELONGATION) / (s2 + LAMBDA_ELONGATION)
    scale = np.sqrt((s1 * s2 + LAMBDA_SCALE) / count)
    # v_1 is the dominant gradient direction and v_2, the edge direction, is normal to it.
    v1, v2 = vectors[..., :, 1], vectors[..., :, 0]
    out: Float = scale[..., None, None] * (
        elongation[..., None, None] * v1[..., :, None] * v1[..., None, :]
        + (1 / elongation)[..., None, None] * v2[..., :, None] * v2[..., None, :]
    )
    return out


def steering_kernel_plane(plane: Plane, params: dict[str, Any], progress: Progress) -> Plane:
    """The iterations of Fig. 10. The gradients always come from a fit of order 1 or more."""
    order = int(params["order"])
    gradient_params = {**params, "order": max(order, 1)}
    _, gx, gy = regression(plane, None, gradient_params)
    source = plane
    for iteration in range(params["iterations"]):
        steering = steering_matrices(gx, gy)
        estimate, gx, gy = regression(source, steering, gradient_params)
        if order == 0:
            estimate, _, _ = regression(source, steering, params)
        source = estimate
        progress((iteration + 1) / params["iterations"])
    return source


def steering_kernel_representation(params: dict[str, Any]) -> dict[str, Any]:
    h, order, side = params["h"], int(params["order"]), 2 * params["radius"] + 1
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Gradients",
                "formula": f"\\hat{{\\beta}}_1,\\ N = {max(order, 1)},\\ H = {h:g} I",
                "note": "The first gradients come from the classic regression.",
            },
            {
                "name": "Steering matrices",
                "formula": "C_i = \\gamma_i U_{\\theta_i} \\operatorname{diag}(\\sigma_i, "
                "\\sigma_i^{-1}) U_{\\theta_i}^T",
                "note": "From the gradients in a 5 x 5 window: narrow across the edge, long along "
                "it, and large in flat areas.",
            },
            {
                "name": "Regression",
                "formula": f"K(x_i - x) \\propto \\sqrt{{\\det C_i}}\\, \\exp\\!\\left(-"
                f"\\frac{{(x_i - x)^T C_i (x_i - x)}}{{2 \\cdot {h:g}^2}}\\right)",
                "note": f"A weighted polynomial fit of order {order} in a {side} x {side} window. "
                "The constant term is the result.",
            },
            {
                "name": "Iterate",
                "formula": f"u = 1, \\dots, {params['iterations']}",
                "note": "Each pass takes its gradients and its input from the pass before.",
            },
        ],
    }


@register("steering-kernel", representation=steering_kernel_representation)
def steering_kernel(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda plane, _c: steering_kernel_plane(plane, params, lambda _: None),
        progress,
    )
