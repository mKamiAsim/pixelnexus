"""Reference results for the artistic effects of Phase 5f part 9.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json.

- Emboss, outline and edge enhance: scipy.ndimage.correlate with Pillow's kernels and offsets.
  Before the cases are written, they are checked against Pillow's own filters away from the edge,
  where Pillow rounds to whole levels and leaves the outermost pixels unchanged.
- Pixelate: NumPy block means, checked against Pillow's Image.reduce on an image whose sides the
  block size divides.
- Vignette: PixelNexus's own falloff, written out in NumPy.
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
from numpy.typing import NDArray
from PIL import Image, ImageFilter
from scipy import ndimage

from fixtures_rank import SCIPY_MODES

FloatArray = NDArray[np.float64]
Add = Callable[..., None]

# Pillow applies the first kernel row to the row below the pixel, so EMBOSS, listed with -1 at
# the top left, subtracts the pixel below and to the left. This correlation kernel says so.
EMBOSS = np.array([[0, 0, 0], [0, 1, 0], [-1, 0, 0]], float)

KERNELS = {
    "emboss": (ImageFilter.EMBOSS, EMBOSS, 128.0),
    "outline": (
        ImageFilter.CONTOUR,
        np.array([[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]], float),
        255.0,
    ),
    "edge-enhance-normal": (
        ImageFilter.EDGE_ENHANCE,
        np.array([[-1, -1, -1], [-1, 10, -1], [-1, -1, -1]], float) / 2,
        0.0,
    ),
    "edge-enhance-more": (
        ImageFilter.EDGE_ENHANCE_MORE,
        np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]], float),
        0.0,
    ),
}


def fixed_kernel(plane: FloatArray, name: str, border: str) -> FloatArray:
    _, kernel, offset = KERNELS[name]
    return np.asarray(ndimage.correlate(plane, kernel, mode=SCIPY_MODES[border]) + offset)


def _check_against_pillow(plane: FloatArray) -> None:
    image = Image.fromarray(plane.astype(np.uint8))
    for name, (pil_filter, _, _) in KERNELS.items():
        theirs = np.asarray(image.filter(pil_filter), dtype=np.float64)[1:-1, 1:-1]
        ours = np.clip(fixed_kernel(plane, name, "reflect101"), 0, 255)[1:-1, 1:-1]
        if np.max(np.abs(ours - theirs)) > 0.5 + 1e-9:
            raise SystemExit(f"{name}: Pillow's filter differs away from the edge")


def pixelate(plane: FloatArray, n: int) -> FloatArray:
    out = np.empty_like(plane)
    h, w = plane.shape
    for by in range(0, h, n):
        for bx in range(0, w, n):
            out[by : by + n, bx : bx + n] = plane[by : by + n, bx : bx + n].mean()
    return out


def _check_pixelate_against_pillow() -> None:
    rng = np.random.default_rng(61)
    plane = rng.integers(0, 256, size=(12, 16)).astype(np.float64)
    reduced = np.asarray(Image.fromarray(plane.astype(np.uint8)).reduce(4), dtype=np.float64)
    ours = pixelate(plane, 4)[::4, ::4]
    if np.max(np.abs(ours - reduced)) > 0.5 + 1e-9:
        raise SystemExit("Pixelate: Pillow's reduce gives other block means")


def vignette(plane: FloatArray, amount: float, start: float, linear: bool) -> FloatArray:
    h, w = plane.shape
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    u = (xs + 0.5 - w / 2) / (w / 2)
    v = (ys + 0.5 - h / 2) / (h / 2)
    d = np.sqrt((u * u + v * v) / 2)
    a, d0 = amount / 100, start / 100
    t = np.zeros_like(d) if d0 >= 1 else np.clip((d - d0) / (1 - d0), 0, 1)
    f = 1 - a * t * t * (3 - 2 * t)
    if not linear:
        return np.asarray(f * plane)
    c = plane / 255
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4) * f
    encoded = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)
    return np.asarray(encoded * 255)


def add_artistic_cases(plane: FloatArray, add: Add) -> None:
    _check_against_pillow(plane)
    _check_pixelate_against_pillow()
    for border in ("reflect101", "replicate", "constant"):
        add("emboss", {"border": border}, fixed_kernel(plane, "emboss", border), "Pillow EMBOSS")
        add("outline", {"border": border}, fixed_kernel(plane, "outline", border), "Pillow CONTOUR")
        for strength in ("normal", "more"):
            add(
                "edge-enhance",
                {"strength": strength, "border": border},
                fixed_kernel(plane, f"edge-enhance-{strength}", border),
                "Pillow EDGE_ENHANCE and EDGE_ENHANCE_MORE",
            )
    for n in (2, 3, 4, 8):
        add("pixelate", {"size": n}, pixelate(plane, n), "NumPy block means, checked with Pillow")
    for amount, start, linear in ((50.0, 50.0, True), (80.0, 10.0, False), (100.0, 0.0, True)):
        add(
            "vignette",
            {"amount": amount, "start": start, "linearLight": linear},
            vignette(plane, amount, start, linear),
            "NumPy, PixelNexus's own falloff",
        )
