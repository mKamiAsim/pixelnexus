"""Reference results for resize and free rotation, written to web/tests/fixtures/geometry.json.

The reference is a NumPy version of the same definitions as web/src/core/image/resample.ts:
pixel centers at i + 1/2, kernels widened by the shrink factor, colors premultiplied by alpha.
Before anything is written, it is checked against two other libraries:

* Pillow's resize on an opaque image. Pillow rounds to 8 bits between its two passes, so a
  difference of up to 2 levels is allowed. Nearest must match exactly.
* SciPy's map_coordinates for rotation. Order 1 is bilinear interpolation and order 0 is the
  nearest pixel, both with zero padding ("grid-constant").
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from numpy.typing import NDArray
from PIL import Image as PILImage
from scipy import ndimage

FloatArray = NDArray[np.float64]

KEYS_A = -0.5
SUPPORT = {"bilinear": 1.0, "bicubic": 2.0, "lanczos": 3.0}
PIL_FILTERS = {
    "nearest": PILImage.Resampling.NEAREST,
    "bilinear": PILImage.Resampling.BILINEAR,
    "bicubic": PILImage.Resampling.BICUBIC,
    "lanczos": PILImage.Resampling.LANCZOS,
}


def kernel(method: str, x: float) -> float:
    t = abs(x)
    if method == "bilinear":
        return max(0.0, 1.0 - t)
    if method == "bicubic":
        a = KEYS_A
        if t <= 1:
            return ((a + 2) * t - (a + 3)) * t * t + 1
        if t < 2:
            return ((t - 5) * t + 8) * t * a - 4 * a
        return 0.0
    if t >= 3:
        return 0.0
    return float(np.sinc(x) * np.sinc(x / 3))


def weight_matrix(in_size: int, out_size: int, method: str) -> FloatArray:
    """Row x holds the normalized weights of every source pixel for output pixel x."""
    scale = in_size / out_size
    f = max(scale, 1.0)
    matrix = np.zeros((out_size, in_size))
    for x in range(out_size):
        u = (x + 0.5) * scale - 0.5
        for i in range(in_size):
            matrix[x, i] = kernel(method, (i - u) / f)
        matrix[x] /= matrix[x].sum()
    return matrix


def premultiply(rgba: FloatArray) -> FloatArray:
    out = rgba.astype(np.float64).copy()
    out[..., :3] *= out[..., 3:4] / 255
    return out


def unpremultiply(values: FloatArray) -> FloatArray:
    alpha = np.clip(values[..., 3], 0, 255)
    out = np.zeros_like(values)
    out[..., 3] = np.round(alpha)
    safe = np.where(alpha > 0, alpha, 1.0)
    for c in range(3):
        out[..., c] = np.where(alpha > 0, np.round(np.clip(values[..., c] * 255 / safe, 0, 255)), 0)
    return np.clip(np.round(out), 0, 255)


def resize(rgba: FloatArray, width: int, height: int, method: str) -> FloatArray:
    h, w = rgba.shape[:2]
    if method == "nearest":
        xs = np.minimum(w - 1, np.floor((np.arange(width) + 0.5) * w / width).astype(int))
        ys = np.minimum(h - 1, np.floor((np.arange(height) + 0.5) * h / height).astype(int))
        return np.asarray(rgba[ys][:, xs], dtype=np.float64)
    source = premultiply(rgba)
    rows = np.einsum("xi,yic->yxc", weight_matrix(w, width, method), source)
    both = np.einsum("yj,jxc->yxc", weight_matrix(h, height, method), rows)
    return unpremultiply(both)


def rotated_size(width: int, height: int, degrees: float) -> tuple[int, int]:
    t = math.radians(degrees)
    c, s = abs(math.cos(t)), abs(math.sin(t))
    return (
        max(1, math.ceil(width * c + height * s - 1e-9)),
        max(1, math.ceil(width * s + height * c - 1e-9)),
    )


def source_positions(
    width: int, height: int, out_w: int, out_h: int, degrees: float
) -> tuple[FloatArray, FloatArray]:
    t = math.radians(degrees)
    cos, sin = math.cos(t), math.sin(t)
    yy, xx = np.mgrid[0:out_h, 0:out_w].astype(np.float64)
    dx = xx + 0.5 - out_w / 2
    dy = yy + 0.5 - out_h / 2
    u = dx * cos - dy * sin + width / 2 - 0.5
    v = dx * sin + dy * cos + height / 2 - 0.5
    return u, v


def rotate(
    rgba: FloatArray, degrees: float, interpolation: str, expand: bool, fill: list[int]
) -> FloatArray:
    h, w = rgba.shape[:2]
    out_w, out_h = rotated_size(w, h, degrees) if expand else (w, h)
    u, v = source_positions(w, h, out_w, out_h, degrees)
    padded = np.zeros((h + 6, w + 6, 4))
    padded[3 : 3 + h, 3 : 3 + w] = premultiply(rgba)

    def sample(i: NDArray[np.int64], j: NDArray[np.int64]) -> FloatArray:
        inside = (i >= 0) & (j >= 0) & (i < w) & (j < h)
        values = padded[np.clip(j, -3, h + 2) + 3, np.clip(i, -3, w + 2) + 3]
        return np.asarray(np.where(inside[..., None], values, 0.0))

    if interpolation == "nearest":
        out = sample(np.floor(u + 0.5).astype(int), np.floor(v + 0.5).astype(int))
    elif interpolation == "bilinear":
        i, j = np.floor(u).astype(int), np.floor(v).astype(int)
        fu, fv = (u - i)[..., None], (v - j)[..., None]
        out = (1 - fv) * ((1 - fu) * sample(i, j) + fu * sample(i + 1, j)) + fv * (
            (1 - fu) * sample(i, j + 1) + fu * sample(i + 1, j + 1)
        )
    else:
        i, j = np.floor(u).astype(int), np.floor(v).astype(int)
        out = np.zeros((out_h, out_w, 4))
        keys = np.vectorize(lambda x: kernel("bicubic", x))
        for n in range(-1, 3):
            wy = keys(v - (j + n))
            for m in range(-1, 3):
                wx = keys(u - (i + m))
                out += (wx * wy)[..., None] * sample(i + m, j + n)
    if fill[3] > 0:
        k = fill[3] / 255
        a = np.clip(out[..., 3:4], 0, 255) / 255
        out[..., :3] += np.array(fill[:3], dtype=np.float64) * k * (1 - a)
        out[..., 3:4] = (a + k * (1 - a)) * 255
    return unpremultiply(np.asarray(out))


def _resize_like_pillow(rgb: FloatArray, width: int, height: int, method: str) -> FloatArray:
    """The same weights, but rounded and clipped to 8 bits between the passes, as Pillow does."""
    h, w = rgb.shape[:2]
    rows = np.einsum("xi,yic->yxc", weight_matrix(w, width, method), rgb)
    rows = np.clip(np.round(rows), 0, 255)
    both = np.einsum("yj,jxc->yxc", weight_matrix(h, height, method), rows)
    return np.asarray(np.clip(np.round(both), 0, 255))


def _check_resize_against_pillow(rgb: NDArray[np.uint8]) -> None:
    """Checks the kernels and the coordinate rule. Pillow keeps 8 bits between its two passes,
    so the comparison uses a twin of the reference that does the same."""
    opaque = np.dstack([rgb, np.full(rgb.shape[:2], 255, dtype=np.uint8)]).astype(np.float64)
    image = PILImage.fromarray(rgb, "RGB")
    for method, pil_filter in PIL_FILTERS.items():
        for size in ((17, 10), (5, 4), (11, 3)):
            if method == "nearest":
                ours = resize(opaque, size[0], size[1], method)[..., :3]
            else:
                ours = _resize_like_pillow(rgb.astype(np.float64), size[0], size[1], method)
            theirs = np.asarray(image.resize(size, pil_filter), dtype=np.float64)
            worst = np.max(np.abs(ours - theirs))
            if worst > (0 if method == "nearest" else 1):
                raise SystemExit(f"{method} resize to {size} differs from Pillow by {worst}")


def _check_rotation_against_scipy(rgba: FloatArray) -> None:
    h, w = rgba.shape[:2]
    for degrees in (17.0, -33.0):
        out_w, out_h = rotated_size(w, h, degrees)
        u, v = source_positions(w, h, out_w, out_h, degrees)
        source = premultiply(rgba)
        for order, name in ((1, "bilinear"), (0, "nearest")):
            planes = [
                ndimage.map_coordinates(source[..., c], [v, u], order=order, mode="grid-constant")
                for c in range(4)
            ]
            theirs = unpremultiply(np.dstack(planes))
            ours = rotate(rgba, degrees, name, True, [0, 0, 0, 0])
            if np.max(np.abs(ours - theirs)) > 1:
                raise SystemExit(f"{name} rotation by {degrees} disagrees with SciPy")


def geometry_cases() -> dict[str, Any]:
    rng = np.random.default_rng(20261013)
    rgb = rng.integers(0, 256, size=(7, 11, 3)).astype(np.uint8)
    alpha = rng.choice([0, 64, 255, 255, 255, 200], size=(7, 11)).astype(np.uint8)
    rgba = np.dstack([rgb, alpha]).astype(np.float64)
    _check_resize_against_pillow(rgb)
    _check_rotation_against_scipy(rgba)

    def flat(values: FloatArray) -> list[int]:
        return [int(v) for v in values.reshape(-1)]

    resize_cases = [
        {"width": wd, "height": ht, "method": method, "output": flat(resize(rgba, wd, ht, method))}
        for method in ("nearest", "bilinear", "bicubic", "lanczos")
        for wd, ht in ((17, 10), (5, 4), (11, 3), (23, 7))
    ]
    rotate_cases = []
    for degrees, interpolation, expand, fill in (
        (30.0, "bilinear", True, [0, 0, 0, 0]),
        (-17.0, "bicubic", True, [0, 0, 0, 0]),
        (135.0, "nearest", True, [0, 0, 0, 0]),
        (90.0, "bilinear", True, [0, 0, 0, 0]),
        (12.5, "bicubic", False, [255, 255, 255, 255]),
        (-61.0, "bilinear", False, [0, 0, 0, 255]),
    ):
        out = rotate(rgba, degrees, interpolation, expand, fill)
        rotate_cases.append(
            {
                "degrees": degrees,
                "interpolation": interpolation,
                "expand": expand,
                "fill": fill,
                "width": out.shape[1],
                "height": out.shape[0],
                "output": flat(out),
            }
        )
    return {
        "generator": "tools/make_fixtures.py",
        "description": "Resize and rotation of one small RGBA image.",
        "tolerance": 1,
        "width": 11,
        "height": 7,
        "input": flat(rgba),
        "resize": resize_cases,
        "rotate": rotate_cases,
    }
