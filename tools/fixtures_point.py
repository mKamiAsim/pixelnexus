"""Reference results for the point operations and histogram equalization of Phase 5f.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. Each
curve is written again here with NumPy. Invert and solarize are checked against Pillow, and the
percentiles against numpy.percentile on the plane itself, before the cases are written. CLAHE
follows the steps of cv::CLAHE and is checked against cv2.createCLAHE.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image, ImageOps

FloatArray = NDArray[np.float64]
Add = Callable[..., None]


def _fail(message: str) -> None:
    raise SystemExit(message)


def log_transform(p: FloatArray) -> FloatArray:
    return np.asarray(255 / math.log(256) * np.log1p(p))


def contrast_stretch(p: FloatArray, r1: float, s1: float, r2: float, s2: float) -> FloatArray:
    if r1 > r2:
        r1, s1, r2, s2 = r2, s2, r1, s1
    out = np.empty_like(p)
    low = p <= r1
    mid = (p > r1) & (p <= r2)
    high = p > r2
    out[low] = s1 * p[low] / r1 if r1 > 0 else s1
    if r2 > r1:
        out[mid] = s1 + (s2 - s1) * (p[mid] - r1) / (r2 - r1)
    out[high] = s2 + (255 - s2) * (p[high] - r2) / (255 - r2) if r2 < 255 else s2
    return out


def posterize(p: FloatArray, levels: int) -> FloatArray:
    bins = np.minimum(levels - 1, np.floor(p * levels / 256))
    return np.asarray(bins * 255 / (levels - 1))


def solarize(p: FloatArray, threshold: float) -> FloatArray:
    return np.where(p < threshold, p, 255 - p)


def equalize(p: FloatArray) -> FloatArray:
    counts = np.bincount(np.clip(np.rint(p), 0, 255).astype(int).ravel(), minlength=256)
    table = 255 * np.cumsum(counts) / counts.sum()
    return np.asarray(table[p.astype(int)])


def percentile_normalize(p: FloatArray, low: float, high: float) -> FloatArray:
    lo, hi = np.percentile(p, [low, high])
    if hi <= lo:
        return p.copy()
    return np.asarray(np.clip(255 * (p - lo) / (hi - lo), 0, 255))


def _check_against_pillow() -> None:
    levels = np.arange(256, dtype=np.uint8).reshape(16, 16)
    image = Image.fromarray(levels)
    inverted = np.asarray(ImageOps.invert(image), dtype=np.float64)
    if not np.array_equal(inverted, 255 - levels.astype(np.float64)):
        _fail("invert differs from Pillow ImageOps.invert")
    for threshold in (1, 100, 128, 255):
        solarized = np.asarray(ImageOps.solarize(image, threshold), dtype=np.float64)
        if not np.array_equal(solarized, solarize(levels.astype(np.float64), threshold)):
            _fail(f"solarize differs from Pillow ImageOps.solarize at threshold {threshold}")


def add_point_cases(plane: FloatArray, add: Add) -> None:
    _check_against_pillow()
    add("log-transform", {}, log_transform(plane), "c log(1 + r) with c = 255 / ln 256, NumPy")
    add("invert", {}, 255 - plane, "255 - r, checked against Pillow ImageOps.invert")
    for r1, s1, r2, s2 in (
        (64, 32, 192, 224),
        (50, 0, 50, 255),
        (200, 240, 30, 10),
        (0, 40, 255, 200),
    ):
        params = {"r1": r1, "s1": s1, "r2": r2, "s2": s2}
        add(
            "contrast-stretch",
            params,
            contrast_stretch(plane, r1, s1, r2, s2),
            "the piecewise-linear curve of Gonzalez and Woods, NumPy",
        )
    for levels in (2, 3, 4, 7, 64):
        add("posterize", {"levels": levels}, posterize(plane, levels), "equal bins, NumPy")
    for threshold in (0, 64, 128, 256):
        add(
            "solarize",
            {"threshold": threshold},
            solarize(plane, threshold),
            "checked against Pillow ImageOps.solarize",
        )
    add("histogram-eq", {}, equalize(plane), "255 times the cumulative histogram, NumPy")
    for low, high in ((1, 99), (0, 100), (10, 60), (40, 40)):
        add(
            "percentile-normalize",
            {"low": low, "high": high},
            percentile_normalize(plane, low, high),
            "numpy.percentile",
        )


def _round_even(v: Any) -> FloatArray:
    """Round half to even, as cvRound does."""
    return np.asarray(np.rint(v), dtype=np.float64)


def clip_histogram(hist: NDArray[np.int64], limit: int) -> None:
    """Clip and spread the excess, as cv::CLAHE does. Changes hist in place."""
    excess = int(np.maximum(hist - limit, 0).sum())
    np.minimum(hist, limit, out=hist)
    batch, residual = divmod(excess, 256)
    hist += batch
    if residual:
        step = max(256 // residual, 1)
        i = 0
        while i < 256 and residual > 0:
            hist[i] += 1
            i += step
            residual -= 1


def clahe(
    p: FloatArray, grid_x: int, grid_y: int, clip_limit: float, float32: bool = False
) -> FloatArray:
    """CLAHE with the steps of cv::CLAHE, without the final rounding.

    With float32, the blend runs in 32-bit floats and rounds, as OpenCV does.
    """
    height, width = p.shape
    tiles_x, tiles_y = min(width, grid_x), min(height, grid_y)
    pad_x = 0 if width % tiles_x == 0 else tiles_x - width % tiles_x
    pad_y = 0 if height % tiles_y == 0 else tiles_y - height % tiles_y
    levels = np.clip(np.rint(p), 0, 255).astype(int)
    ext = np.pad(levels, ((0, pad_y), (0, pad_x)), mode="reflect")
    tile_w, tile_h = ext.shape[1] // tiles_x, ext.shape[0] // tiles_y
    total = tile_w * tile_h
    limit = max(1, int(clip_limit * total / 256)) if clip_limit > 0 else 0
    scale = np.float32(255) / np.float32(total)
    luts = np.zeros((tiles_y, tiles_x, 256))
    for ty in range(tiles_y):
        for tx in range(tiles_x):
            tile = ext[ty * tile_h : (ty + 1) * tile_h, tx * tile_w : (tx + 1) * tile_w]
            hist = np.bincount(tile.ravel(), minlength=256).astype(np.int64)
            if limit:
                clip_histogram(hist, limit)
            cdf = np.cumsum(hist).astype(np.float32)
            luts[ty, tx] = np.minimum(255, _round_even(cdf * scale))
    real = np.float32 if float32 else np.float64
    if float32:
        luts = luts.astype(np.float32)

    def blend(pos: int, size: int, tiles: int) -> tuple[int, int, Any, Any]:
        f = real(pos) * (real(1) / real(size)) - real(0.5)
        first = math.floor(f)
        weight = real(f - real(first))
        return max(first, 0), min(first + 1, tiles - 1), weight, real(1) - weight

    out = np.zeros_like(p)
    for y in range(height):
        ya, yb, wy, wy1 = blend(y, tile_h, tiles_y)
        for x in range(width):
            xa, xb, wx, wx1 = blend(x, tile_w, tiles_x)
            v = levels[y, x]
            top = luts[ya, xa, v] * wx1 + luts[ya, xb, v] * wx
            bottom = luts[yb, xa, v] * wx1 + luts[yb, xb, v] * wx
            out[y, x] = top * wy1 + bottom * wy
    return np.rint(out) if float32 else out


def _check_clahe_against_opencv() -> None:
    """With the blend in 32-bit floats, the reference must equal cv2.createCLAHE exactly."""
    rng = np.random.default_rng(5)
    base = rng.normal(110, 25, size=(61, 83)).cumsum(axis=1) / 40
    image = np.clip(base - base.min() + rng.normal(0, 6, size=base.shape), 0, 255)
    image = np.rint(image).astype(np.uint8)
    for grid, clip_limit in (((8, 8), 2.0), ((4, 3), 40.0), ((5, 7), 0.0), ((1, 1), 1.0)):
        ours = clahe(image.astype(np.float64), *grid, clip_limit, float32=True)
        theirs = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=grid).apply(image)
        if not np.array_equal(ours, theirs):
            _fail(f"CLAHE differs from OpenCV for grid {grid} and clip limit {clip_limit}")


def add_clahe_cases(plane: FloatArray, add: Add) -> None:
    _check_clahe_against_opencv()
    source = "the steps of cv::CLAHE written with NumPy, checked against cv2.createCLAHE"
    for grid_x, grid_y, clip_limit in ((2, 2, 2.0), (3, 2, 1.0), (4, 4, 40.0), (5, 3, 0.5)):
        params = {"tilesX": grid_x, "tilesY": grid_y, "clipLimit": clip_limit}
        add("clahe", params, clahe(plane, grid_x, grid_y, clip_limit), source)
    for grid_x, grid_y in ((2, 2), (4, 3), (13, 10)):
        params = {"tilesX": grid_x, "tilesY": grid_y}
        add("ahe", params, clahe(plane, grid_x, grid_y, 0.0), source)
