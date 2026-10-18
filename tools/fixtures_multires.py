"""Reference results for multiresolution diffusion.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. The
pyramid comes from tools/fixtures_multiscale.py, whose REDUCE and EXPAND are checked there. The
Perona-Malik steps are written here with NumPy, with the edges of each level repeated, and are
checked first: with a huge K the conduction is 1, and the steps must equal repeated
scipy.ndimage.convolve with the heat equation stencil and mode "nearest".
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage

from fixtures_multiscale import expand, gaussian_pyramid

FloatArray = NDArray[np.float64]
Add = Callable[..., None]


def perona_malik(p: FloatArray, steps: int, kappa: float, lam: float, kind: str) -> FloatArray:
    def g(d: FloatArray) -> FloatArray:
        if kind == "quadratic":
            return np.asarray(1 / (1 + (d / kappa) ** 2))
        return np.asarray(np.exp(-((d / kappa) ** 2)))

    cur = p.astype(np.float64)
    for _ in range(steps):
        e = np.pad(cur, 1, mode="edge")
        nxt = cur.copy()
        for sl in (np.s_[:-2, 1:-1], np.s_[2:, 1:-1], np.s_[1:-1, 2:], np.s_[1:-1, :-2]):
            d = e[sl] - cur
            nxt += lam * g(np.abs(d)) * d
        cur = nxt
    return cur


def multires_diffusion(
    p: FloatArray, levels: int, steps: int, kappa: float, lam: float, kind: str, border: str
) -> FloatArray:
    pyramid = gaussian_pyramid(p.astype(np.float64), levels, border)
    u = perona_malik(pyramid[-1], steps, kappa, lam, kind)
    for k in range(len(pyramid) - 2, -1, -1):
        level, above = pyramid[k], pyramid[k + 1]
        carried = expand(u - above, level.shape[0], level.shape[1], border)
        u = perona_malik(level + carried, steps, kappa, lam, kind)
    return u


def _cross_check(plane: FloatArray) -> None:
    stencil = np.array([[0, 0.2, 0], [0.2, 0.2, 0.2], [0, 0.2, 0]])
    heat = plane.astype(np.float64)
    for _ in range(4):
        heat = ndimage.convolve(heat, stencil, mode="nearest")
    if not np.allclose(perona_malik(plane, 4, 1e9, 0.2, "exponential"), heat):
        raise SystemExit("Perona-Malik with a huge K is not the heat equation")


def add_multires_cases(plane: FloatArray, add: Add) -> None:
    _cross_check(plane)
    source = "NumPy Perona-Malik steps on the pyramid of fixtures_multiscale.py"
    for border in ("reflect101", "replicate", "constant"):
        for levels, steps, kappa, kind in ((2, 5, 20, "exponential"), (3, 4, 30, "quadratic")):
            params = {"levels": levels, "iterations": steps, "kappa": kappa, "lambda": 0.2,
                      "conduction": kind, "border": border}  # fmt: skip
            result = multires_diffusion(plane, levels, steps, kappa, 0.2, kind, border)
            add("multires-diffusion", params, result, source)
    params = {"levels": 0, "iterations": 6, "kappa": 25, "lambda": 0.25,
              "conduction": "exponential", "border": "reflect101"}  # fmt: skip
    add("multires-diffusion", params,
        multires_diffusion(plane, 0, 6, 25, 0.25, "exponential", "reflect101"), source)  # fmt: skip
