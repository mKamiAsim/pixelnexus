"""Reference results for the Gaussian and Laplacian pyramid filters of Phase 5e.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. REDUCE
and EXPAND follow Burt and Adelson with the kernel [1, 4, 6, 4, 1] / 16, and positions outside a
level follow the border mode on that level. Before the cases are written, the script checks
that a Laplacian pyramid with all gains 1 gives the image back and that a flat image stays flat.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]
Add = Callable[..., None]

KERNEL = np.array([1, 4, 6, 4, 1], dtype=np.float64) / 16


def _fail(message: str) -> None:
    raise SystemExit(message)


def border_index(i: int, n: int, mode: str) -> int:
    """The same rule as borderIndex in web/src/core/filters/planes.ts, -1 for constant."""
    if 0 <= i < n:
        return i
    if mode == "constant":
        return -1
    if mode == "replicate":
        return 0 if i < 0 else n - 1
    if mode == "wrap":
        return i % n
    if mode == "reflect":
        k = i % (2 * n)
        return k if k < n else 2 * n - 1 - k
    if n == 1:
        return 0
    k = i % (2 * n - 2)
    return k if k < n else 2 * n - 2 - k


def _take(line: FloatArray, i: int, mode: str) -> float:
    j = border_index(i, len(line), mode)
    return 0.0 if j < 0 else float(line[j])


def _reduce_line(line: FloatArray, mode: str) -> FloatArray:
    n = (len(line) + 1) // 2
    return np.array(
        [sum(KERNEL[m + 2] * _take(line, 2 * k + m, mode) for m in range(-2, 3)) for k in range(n)]
    )


def _expand_line(line: FloatArray, size: int, mode: str) -> FloatArray:
    out = np.zeros(size)
    for i in range(size):
        out[i] = sum(
            2 * KERNEL[m + 2] * _take(line, (i - m) // 2, mode)
            for m in range(-2, 3)
            if (i - m) % 2 == 0
        )
    return out


def reduce(p: FloatArray, mode: str) -> FloatArray:
    rows = np.array([_reduce_line(r, mode) for r in p])
    return np.array([_reduce_line(c, mode) for c in rows.T]).T


def expand(p: FloatArray, height: int, width: int, mode: str) -> FloatArray:
    rows = np.array([_expand_line(r, width, mode) for r in p])
    return np.array([_expand_line(c, height, mode) for c in rows.T]).T


def gaussian_pyramid(p: FloatArray, levels: int, mode: str) -> list[FloatArray]:
    pyramid = [p]
    for _ in range(levels):
        if pyramid[-1].shape == (1, 1):
            break
        pyramid.append(reduce(pyramid[-1], mode))
    return pyramid


def gaussian_pyramid_filter(p: FloatArray, levels: int, mode: str) -> FloatArray:
    pyramid = gaussian_pyramid(p, levels, mode)
    estimate = pyramid[-1]
    for level in reversed(pyramid[:-1]):
        height, width = level.shape
        estimate = expand(estimate, height, width, mode)
    return estimate


def laplacian_rebuild(p: FloatArray, levels: int, gains: list[float], mode: str) -> FloatArray:
    pyramid = gaussian_pyramid(p, levels, mode)
    estimate = pyramid[-1]
    for k in range(len(pyramid) - 2, -1, -1):
        level = pyramid[k]
        height, width = level.shape
        detail = level - expand(pyramid[k + 1], height, width, mode)
        gain = gains[k] if k < len(gains) else 1.0
        estimate = expand(estimate, height, width, mode) + gain * detail
    return estimate


def _checks(plane: FloatArray) -> None:
    for mode in ("reflect101", "reflect", "replicate", "wrap", "constant"):
        rebuilt = laplacian_rebuild(plane, 4, [1, 1, 1, 1], mode)
        if not np.allclose(rebuilt, plane, atol=1e-9):
            _fail(f"the Laplacian pyramid with all gains 1 does not give the image back, {mode}")
        if mode != "constant":
            flat = gaussian_pyramid_filter(np.full((10, 13), 77.0), 3, mode)
            if not np.allclose(flat, 77.0):
                _fail(f"the Gaussian pyramid filter does not keep a flat image, {mode}")


def add_multiscale_cases(plane: FloatArray, add: Add) -> None:
    _checks(plane)
    source = "REDUCE and EXPAND of Burt and Adelson, written with NumPy"
    for levels, mode in ((1, "reflect101"), (2, "reflect"), (3, "wrap")):
        params: dict[str, Any] = {"levels": levels, "border": mode}
        add("gaussian-pyramid", params, gaussian_pyramid_filter(plane, levels, mode), source)
    for levels, gains, mode in (
        (3, [2.0, 1.5, 0.5, 1.0], "reflect101"),
        (4, [0.0, 1.0, 1.0, 3.0], "replicate"),
        (2, [1.5, 1.5, 1.0, 1.0], "constant"),
    ):
        params = {"levels": levels, "border": mode}
        params.update({f"gain{i + 1}": g for i, g in enumerate(gains)})
        add("laplacian-pyramid", params, laplacian_rebuild(plane, levels, gains, mode), source)
