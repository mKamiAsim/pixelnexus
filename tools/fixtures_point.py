"""Reference results for the point operations of Phase 5f.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. Each
curve is written again here with NumPy. Invert and solarize are checked against Pillow, and the
percentiles against numpy.percentile on the plane itself, before the cases are written.
"""

from __future__ import annotations

import math
from collections.abc import Callable

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
