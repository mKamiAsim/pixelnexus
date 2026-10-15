"""Python copies of the studio's built-in test images in web/src/core/image/synthetic.ts.

The docs of science engine filters run in Python, so they need the same test images as the
browser filter docs. make_fixtures.py writes a hash of each one to synthetic.json, and the studio
tests check that the TypeScript images give the same hashes. Values are rounded half up, as
Math.round does for these positive values.
"""

from __future__ import annotations

import math

import numpy as np
from numpy.typing import NDArray

Gray = NDArray[np.uint8]


def _round(values: NDArray[np.float64]) -> Gray:
    return np.floor(values + 0.5).astype(np.uint8)


def _supersampled(width: int, height: int, inside: object) -> NDArray[np.float64]:
    """The mean of a 0/1 shape function over a 4x4 grid inside each pixel."""
    n = 4
    offsets = (np.arange(n) + 0.5) / n
    y, x = np.mgrid[0:height, 0:width].astype(np.float64)
    total = np.zeros((height, width))
    for dy in offsets:
        for dx in offsets:
            total += inside(x + dx, y + dy)  # type: ignore[operator]
    return total / (n * n)


def disks(width: int = 512, height: int = 512) -> Gray:
    """Bright disks of several sizes on a dark background, plus single-pixel dots."""
    s = min(width, height) / 512
    shapes = [
        (96, 96, 48),
        (256, 96, 24),
        (384, 96, 12),
        (448, 96, 6),
        (128, 320, 72),
        (352, 320, 36),
    ]
    dots = [(300, 220), (420, 230), (460, 440), (60, 460)]

    def inside(x: NDArray[np.float64], y: NDArray[np.float64]) -> NDArray[np.float64]:
        hit = np.zeros(x.shape, dtype=bool)
        for cx, cy, r in shapes:
            hit |= (x - cx * s) ** 2 + (y - cy * s) ** 2 <= (r * s) ** 2
        return hit.astype(np.float64)

    coverage = _supersampled(width, height, inside)
    image = _round(30 + 190 * coverage)
    for x, y in dots:
        image[math.floor(y * s + 0.5), math.floor(x * s + 0.5)] = 220
    return image


def siemens_star(width: int = 512, height: int = 512, spokes: int = 36) -> Gray:
    """Siemens star with 36 spokes on a mid-gray background."""
    cx, cy = width / 2, height / 2
    radius = min(width, height) * 0.45

    def value(x: NDArray[np.float64], y: NDArray[np.float64]) -> NDArray[np.float64]:
        dx, dy = x - cx, y - cy
        star = np.where(np.sin(spokes / 2 * np.arctan2(dy, dx)) >= 0, 235.0, 20.0)
        return np.where(dx * dx + dy * dy > radius * radius, 128.0, star)

    return _round(_supersampled(width, height, value))
