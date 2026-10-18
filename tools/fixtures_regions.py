"""Reference results for the region filters of Phase 5f part 8.

tools/fixtures_impulse.py adds these color cases to web/tests/fixtures/filters.json.

- Connected-component labeling: scipy.ndimage.label on brightness at or above 128.
- Region growing: skimage.segmentation.flood on the brightness, and the same flood on the largest
  channel difference for the color measure.
- K-means: Lloyd's algorithm on the distinct colors weighted by their counts, with PixelNexus's own
  deterministic start. Before the cases are written, the result is checked against cv2.kmeans run
  on every pixel from the same first assignment.
"""

from __future__ import annotations

import colorsys
import math
from collections.abc import Callable
from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy import ndimage
from skimage import segmentation

FloatArray = NDArray[np.float64]
Add = Callable[..., None]


def luma709(image: FloatArray) -> FloatArray:
    return np.asarray(0.2126 * image[..., 0] + 0.7152 * image[..., 1] + 0.0722 * image[..., 2])


def label_color(label: int) -> tuple[float, float, float]:
    r, g, b = colorsys.hsv_to_rgb(((label * 137.507764) % 360) / 360, 0.65, 0.95)
    return (r * 255, g * 255, b * 255)


def _structure(connectivity: int) -> NDArray[np.int64]:
    return np.asarray(ndimage.generate_binary_structure(2, 1 if connectivity == 4 else 2))


def ccl(image: FloatArray, connectivity: int, invert: bool, output: str) -> FloatArray:
    bits = (luma709(image) >= 128) != invert
    labels, count = ndimage.label(bits, structure=_structure(connectivity))
    out = np.zeros_like(image)
    for k in range(1, count + 1):
        color = (255 * k / count,) * 3 if output == "gray" else label_color(k)
        out[labels == k] = color
    return out


def grow(image: FloatArray, params: dict[str, Any]) -> FloatArray:
    h, w, _ = image.shape

    def at(percent: float, n: int) -> int:
        return min(n - 1, max(0, math.floor(percent / 100 * n)))

    sx, sy = at(params["seedX"], w), at(params["seedY"], h)
    tolerance = float(params["tolerance"])
    connectivity = int(params["connectivity"])
    if params["measure"] == "brightness":
        y = luma709(image)
        if np.min(np.abs(np.abs(y - y[sy, sx]) - tolerance)) < 1e-6:
            raise SystemExit("Region growing: a pixel lies on the tolerance")
        region = segmentation.flood(  # type: ignore[no-untyped-call]
            y, (sy, sx), tolerance=tolerance, connectivity=1 if connectivity == 4 else 2
        )
    else:
        far = np.max(np.abs(image - image[sy, sx]), axis=-1)
        labels, _ = ndimage.label(far <= tolerance, structure=_structure(connectivity))
        region = labels == labels[sy, sx]
    out = np.zeros_like(image)
    out[region] = 255.0
    return out


def kmeans(image: FloatArray, k: int, iterations: int) -> tuple[FloatArray, NDArray[np.int64]]:
    """Centers and the cluster of each pixel, as the browser code computes them."""
    pixels = np.clip(np.round(image.reshape(-1, 3)), 0, 255).astype(np.int64)
    codes = pixels[:, 0] * 65536 + pixels[:, 1] * 256 + pixels[:, 2]
    unique, inverse, counts = np.unique(codes, return_inverse=True, return_counts=True)
    colors = np.stack([(unique >> 16) & 255, (unique >> 8) & 255, unique & 255], -1).astype(float)
    weights = counts.astype(float)
    mean = (weights[:, None] * colors).sum(0) / weights.sum()
    first = int(np.argmin(((colors - mean) ** 2).sum(-1)))
    chosen = [first]
    nearest = ((colors - colors[first]) ** 2).sum(-1)
    while len(chosen) < k:
        far = int(np.argmax(nearest))
        if not nearest[far] > 0:
            break
        chosen.append(far)
        nearest = np.minimum(nearest, ((colors - colors[far]) ** 2).sum(-1))
    centers = colors[chosen].copy()
    assign = np.full(len(colors), -1)
    for _ in range(iterations):
        d = ((colors[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
        new = np.argmin(d, axis=1)
        if np.array_equal(new, assign):
            break
        assign = new
        for c in range(len(centers)):
            members = assign == c
            if weights[members].sum() > 0:
                centers[c] = (weights[members, None] * colors[members]).sum(0) / weights[
                    members
                ].sum()
    return centers, np.asarray(assign[inverse])


def _check_kmeans_against_opencv(image: FloatArray) -> None:
    for k in (3, 4):
        centers, labels = kmeans(image, k, 100)
        # The first assignment, from the start centers alone.
        start, _ = kmeans(image, k, 0)
        pixels = image.reshape(-1, 3).astype(np.float32)
        first = np.argmin(((pixels[:, None, :] - start[None]) ** 2).sum(-1), axis=1)
        criteria = (cv2.TERM_CRITERIA_MAX_ITER + cv2.TERM_CRITERIA_EPS, 100, 1e-12)
        _, theirs_labels, theirs = cv2.kmeans(
            pixels,
            len(start),
            first.astype(np.int32).reshape(-1, 1),
            criteria,
            1,
            cv2.KMEANS_USE_INITIAL_LABELS,
        )
        if not np.allclose(theirs, centers, atol=1e-3):
            raise SystemExit(f"K-means: cv2.kmeans ends at other centers for k = {k}")
        if not np.array_equal(theirs_labels.ravel(), labels):
            raise SystemExit(f"K-means: cv2.kmeans ends with other labels for k = {k}")


def kmeans_image(image: FloatArray, k: int, iterations: int, output: str) -> FloatArray:
    centers, labels = kmeans(image, k, iterations)
    if output == "labels":
        palette = np.array([label_color(c + 1) for c in range(len(centers))])
        return np.asarray(palette[labels].reshape(image.shape))
    return np.asarray(centers[labels].reshape(image.shape))


def add_region_cases(image: FloatArray, add: Add) -> None:
    for connectivity, invert, output in (
        (8, False, "colors"),
        (4, True, "gray"),
        (4, False, "colors"),
    ):
        add(
            "ccl",
            {"connectivity": str(connectivity), "invert": invert, "output": output},
            ccl(image, connectivity, invert, output),
            "scipy.ndimage.label",
        )
    for params in (
        {"seedX": 50, "seedY": 50, "tolerance": 30.5, "measure": "brightness", "connectivity": 8},
        {"seedX": 10, "seedY": 80, "tolerance": 45.5, "measure": "brightness", "connectivity": 4},
        {"seedX": 70, "seedY": 20, "tolerance": 70, "measure": "color", "connectivity": 8},
    ):
        add(
            "region-growing",
            {**params, "connectivity": str(params["connectivity"])},
            grow(image, params),
            "skimage.segmentation.flood",
        )
    _check_kmeans_against_opencv(image)
    for k, iterations, output in ((3, 20, "centers"), (4, 20, "labels"), (5, 2, "centers")):
        add(
            "kmeans-color",
            {"k": k, "iterations": iterations, "output": output},
            kmeans_image(image, k, iterations, output),
            "NumPy Lloyd iterations, checked against cv2.kmeans",
        )
