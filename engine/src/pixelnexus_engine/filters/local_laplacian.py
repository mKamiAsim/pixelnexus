"""Local Laplacian filtering, after Paris, Hasinoff and Kautz (2011), computed with the fast
algorithm of Aubry, Paris, Hasinoff, Kautz and Durand (2014).

* Intensity: I = (20 R + 40 G + B) / 61 on values from 0 to 1, with the color ratios R / I,
  G / I and B / I kept, as Paris et al. do for tone manipulation. The filter works on I, and
  the colors are rebuilt as I' times the ratios.
* Remapping (Paris et al., Eq. 1 and 2): around a value g, a difference d = i - g with
  |d| <= sigma_r is a detail, mapped to g + sign(d) sigma_r f_d(|d| / sigma_r), and a larger one
  is an edge, mapped to g + sign(d) (f_e(|d| - sigma_r) + sigma_r). f_d(x) = x^alpha and
  f_e(a) = beta a. When alpha < 1, f_d(x) = tau x^alpha + (1 - tau) x, where tau is 0 when |d|
  is under 1 percent of the largest intensity and 1 above 2 percent. The paper calls tau a smooth
  step and does not give its shape. The cubic smoothstep 3 s^2 - 2 s^3 is our choice.
* Pyramids: the Burt and Adelson pyramids with 5 x 5 kernels, as OpenCV's pyrDown and pyrUp
  build them, with the border reflect 101. A Laplacian level is G_l - pyrUp(G_(l+1)).
* Fast algorithm (Aubry et al., steps 1 to 5): the Gaussian pyramid of I; K values gamma_j spread
  evenly from 0 to 1; the Laplacian pyramid of each remapped image r_j(I); each output
  coefficient linearly interpolated between the two pyramids whose gamma_j bracket the Gaussian
  pyramid coefficient g; and the collapse. The coarsest level, the low-pass residual, is taken
  from the Gaussian pyramid of I, our choice.
* Levels: floor(log2(min(height, width))) - 2, at least 1, our choice, so the coarsest level
  is about 4 to 8 pixels across.
"""

from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray

from pixelnexus_engine.registry import Progress, Rgba, register

Float = NDArray[np.float64]
# The intensity weights of Paris et al., after Durand and Dorsey.
WEIGHTS = np.array([20.0, 40.0, 1.0]) / 61
NOISE_LOW, NOISE_HIGH = 0.01, 0.02


def level_count(shape: tuple[int, ...]) -> int:
    return max(1, int(math.log2(min(shape[0], shape[1]))) - 2)


def gaussian_pyramid(image: Float, levels: int) -> list[Float]:
    pyramid = [image]
    for _ in range(levels):
        pyramid.append(np.asarray(cv2.pyrDown(pyramid[-1]), np.float64))
    return pyramid


def expand(level: Float, shape: tuple[int, ...]) -> Float:
    return np.asarray(cv2.pyrUp(level, dstsize=(shape[1], shape[0])), np.float64)


def laplacian_pyramid(image: Float, levels: int) -> list[Float]:
    gauss = gaussian_pyramid(image, levels)
    out = [gauss[i] - expand(gauss[i + 1], gauss[i].shape) for i in range(levels)]
    return [*out, gauss[-1]]


def collapse(pyramid: list[Float]) -> Float:
    image = pyramid[-1]
    for level in reversed(pyramid[:-1]):
        image = level + expand(image, level.shape)
    return image


def smoothstep(values: Float) -> Float:
    s = np.clip((values - NOISE_LOW) / (NOISE_HIGH - NOISE_LOW), 0, 1)
    out: Float = s * s * (3 - 2 * s)
    return out


def remap(image: Float, g: float | Float, params: dict[str, Any]) -> Float:
    """r_(g, sigma_r)(i) of Paris et al., with f_d(x) = x^alpha and f_e(a) = beta a."""
    sigma, alpha, beta = params["sigmaR"], params["alpha"], params["beta"]
    d = image - g
    size = np.abs(d)
    x = np.minimum(size / sigma, 1.0)
    detail = x**alpha
    if alpha < 1:
        tau = smoothstep(size)
        detail = tau * detail + (1 - tau) * x
    inside = g + np.sign(d) * sigma * detail
    outside = g + np.sign(d) * (beta * (size - sigma) + sigma)
    out: Float = np.where(size <= sigma, inside, outside)
    return out


def local_laplacian_gray(image: Float, params: dict[str, Any], progress: Progress) -> Float:
    levels = level_count(image.shape)
    gauss = gaussian_pyramid(image, levels)
    count = params["samples"]
    gammas = np.linspace(0.0, 1.0, count)
    stacks: list[list[Float]] = [[] for _ in range(levels)]
    for index, gamma in enumerate(gammas):
        pyramid = laplacian_pyramid(remap(image, float(gamma), params), levels)
        for level in range(levels):
            stacks[level].append(pyramid[level])
        progress(0.9 * (index + 1) / count)
    output: list[Float] = []
    step = 1.0 / (count - 1)
    for level in range(levels):
        g = np.clip(gauss[level], 0.0, 1.0)
        j = np.minimum((g / step).astype(int), count - 2)
        a = g / step - j
        stack = np.stack(stacks[level])
        lower = np.take_along_axis(stack, j[None], axis=0)[0]
        upper = np.take_along_axis(stack, j[None] + 1, axis=0)[0]
        output.append((1 - a) * lower + a * upper)
    output.append(gauss[-1])
    return collapse(output)


def intensity(image: Rgba) -> Float:
    rgb = image[..., :3].astype(np.float64) / 255
    out: Float = rgb @ WEIGHTS
    return out


def local_laplacian_representation(params: dict[str, Any]) -> dict[str, Any]:
    sigma, alpha, beta = params["sigmaR"], params["alpha"], params["beta"]
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Remap",
                "formula": f"r_g(i) = \\begin{{cases}} g + \\operatorname{{sign}}(i - g)\\, "
                f"{sigma:g} \\left(\\frac{{\\lvert i - g \\rvert}}{{{sigma:g}}}\\right)"
                f"^{{{alpha:g}}} & \\lvert i - g \\rvert \\le {sigma:g} \\\\ "
                "g + \\operatorname{sign}(i - g)"
                f"\\left({beta:g} (\\lvert i - g \\rvert - {sigma:g}) + {sigma:g}\\right) & "
                "\\text{otherwise} \\end{cases}",
                "note": "Small differences around g are details, larger ones are edges.",
            },
            {
                "name": "Pyramids",
                "formula": f"L[r_{{\\gamma_j}}(I)],\\quad j = 1, \\dots, {params['samples']}",
                "note": "One Laplacian pyramid for each sampled value of g.",
            },
            {
                "name": "Interpolate",
                "formula": "L_\\ell[O] = (1 - a)\\, L_\\ell[r_{\\gamma_j}(I)] + a\\, "
                "L_\\ell[r_{\\gamma_{j+1}}(I)]",
                "note": "g, from the Gaussian pyramid of I, picks the two pyramids and the "
                "weight a.",
            },
            {
                "name": "Collapse",
                "formula": "O = \\operatorname{collapse}(L[O])",
                "note": "The color ratios of the input then give back the color.",
            },
        ],
    }


@register("local-laplacian", representation=local_laplacian_representation)
def local_laplacian(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    rgb = image[..., :3].astype(np.float64) / 255
    before = intensity(image)
    after = local_laplacian_gray(before, params, progress)
    ratio = np.divide(after, before, out=np.ones_like(after), where=before > 1e-6)
    shown = np.where(before[..., None] > 1e-6, rgb * ratio[..., None], after[..., None])
    out = image.copy()
    out[..., :3] = np.clip(np.rint(shown * 255), 0, 255).astype(np.uint8)
    progress(1.0)
    return out
