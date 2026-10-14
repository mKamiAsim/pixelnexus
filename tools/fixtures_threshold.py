"""Reference results for the global and local thresholds of Phase 5f.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. The
references are scikit-image's threshold functions. Before the cases are written, Otsu's
threshold from scikit-image is checked against OpenCV's on several images.

Wolf's and Bradley's thresholds are not in scikit-image. Their references sum each window with
an integral image of the plane padded by the border mode, as Bradley and Roth do. Wolf's
threshold is checked against OpenCV's niBlackThreshold (BINARIZATION_WOLF), which pads with the
replicate border. Bradley's with t = 0 is checked against threshold_local's mean.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray
from skimage import filters as skfilters

from fixtures_rank import PAD_MODES, SCIPY_MODES

FloatArray = NDArray[np.float64]
Add = Callable[..., None]

# A pixel this close to its threshold could land on either side after rounding.
TIE_MARGIN = 1e-3


def _binary(above: Any, invert: bool) -> FloatArray:
    above = np.asarray(above, dtype=bool)
    return np.where(above != invert, 255.0, 0.0)


def _window_sums(plane: FloatArray, size: int, border: str) -> FloatArray:
    """The sum of every size x size window, from an integral image of the padded plane."""
    r = (size - 1) // 2
    padded = np.pad(plane, r, mode=PAD_MODES[border])  # type: ignore[call-overload]
    integral = np.zeros((padded.shape[0] + 1, padded.shape[1] + 1))
    integral[1:, 1:] = padded.cumsum(axis=0).cumsum(axis=1)
    h, w = plane.shape
    return np.asarray(
        integral[size : size + h, size : size + w]
        - integral[:h, size : size + w]
        - integral[size : size + h, :w]
        + integral[:h, :w]
    )


def _no_ties(plane: FloatArray, threshold: FloatArray, what: str) -> FloatArray:
    if np.min(np.abs(plane - threshold)) < TIE_MARGIN:
        raise SystemExit(f"{what}: a pixel lies on its threshold, choose other settings")
    return threshold


def wolf_threshold(plane: FloatArray, size: int, k: float, border: str) -> FloatArray:
    n = size * size
    mean = _window_sums(plane, size, border) / n
    squares = _window_sums(plane * plane, size, border) / n
    deviation = np.sqrt(np.maximum(squares - mean * mean, 0.0))
    low = float(plane.min())
    ratio = deviation / deviation.max() if deviation.max() > 0 else np.zeros_like(deviation)
    return np.asarray((1 - k) * mean + k * low + k * ratio * (mean - low))


def bradley_threshold(plane: FloatArray, size: int, percent: float, border: str) -> FloatArray:
    return _window_sums(plane, size, border) * (100 - percent) / (100 * size * size)


def _check_wolf_against_opencv(plane: FloatArray) -> None:
    rng = np.random.default_rng(47)
    images = [plane, rng.integers(0, 256, size=(23, 31)).astype(np.float64)]
    for image in images:
        for size, k in ((5, 0.5), (7, 0.3), (3, 0.8)):
            ours = wolf_threshold(image, size, k, "replicate")
            theirs = cv2.ximgproc.niBlackThreshold(
                image.astype(np.float32),
                255,
                cv2.THRESH_BINARY,
                size,
                k,
                binarizationMethod=cv2.ximgproc.BINARIZATION_WOLF,
            )
            sure = np.abs(image - ours) >= TIE_MARGIN
            if not np.array_equal(_binary(image > ours, False)[sure], theirs[sure]):
                raise SystemExit(f"Wolf: OpenCV disagrees for size {size}, k {k}")


def _check_bradley_against_skimage(plane: FloatArray) -> None:
    for size in (3, 5, 9):
        for border, mode in SCIPY_MODES.items():
            ours = bradley_threshold(plane, size, 0.0, border)
            theirs = skfilters.threshold_local(  # type: ignore[no-untyped-call]
                plane, size, method="mean", offset=0, mode=mode
            )
            if not np.allclose(ours, theirs, rtol=0, atol=1e-9):
                raise SystemExit(f"Bradley: threshold_local disagrees for {size}, {border}")


def _check_otsu_against_opencv(plane: FloatArray) -> None:
    rng = np.random.default_rng(31)
    images = [
        plane.astype(np.uint8),
        np.concatenate([rng.normal(60, 12, 400), rng.normal(170, 20, 300)]).clip(0, 255),
        rng.integers(90, 140, size=500),
    ]
    for image in images:
        u8 = np.asarray(image, dtype=np.uint8).reshape(1, -1)
        ours = int(skfilters.threshold_otsu(u8))  # type: ignore[no-untyped-call]
        theirs, _ = cv2.threshold(u8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        if ours != int(theirs):
            raise SystemExit(f"Otsu: scikit-image gives {ours}, OpenCV gives {theirs}")


def add_threshold_cases(plane: FloatArray, add: Add) -> None:
    _check_otsu_against_opencv(plane)
    for t, invert in ((128, False), (100, True), (0, False)):
        add(
            "threshold-global",
            {"threshold": t, "invert": invert},
            _binary(plane > t, invert),
            "NumPy comparison",
        )
    t_otsu = skfilters.threshold_otsu(plane.astype(np.uint8))  # type: ignore[no-untyped-call]
    for invert in (False, True):
        add(
            "otsu",
            {"invert": invert},
            _binary(plane > t_otsu, invert),
            "skimage.filters.threshold_otsu, checked against OpenCV",
        )
    for size, offset in ((5, 0.0), (7, 5.0), (3, -10.0)):
        for method, filter_id in (
            ("mean", "threshold-adaptive-mean"),
            ("gaussian", "threshold-adaptive-gaussian"),
        ):
            local = skfilters.threshold_local(  # type: ignore[no-untyped-call]
                plane, size, method=method, offset=offset, mode="reflect"
            )
            add(
                filter_id,
                {"size": size, "offset": offset, "border": "reflect"},
                _binary(plane > local, False),
                f"skimage.filters.threshold_local, method {method}",
            )
    for size, k in ((5, -0.2), (7, 0.3)):
        local = skfilters.threshold_niblack(plane, window_size=size, k=-k)  # type: ignore[no-untyped-call]
        add(
            "niblack",
            {"size": size, "k": k, "border": "reflect101"},
            _binary(plane > local, False),
            "skimage.filters.threshold_niblack with its k of the opposite sign",
        )
    for size, k, r in ((5, 0.5, 128.0), (9, 0.2, 100.0)):
        local = skfilters.threshold_sauvola(plane, window_size=size, k=k, r=r)  # type: ignore[no-untyped-call]
        add(
            "sauvola",
            {"size": size, "k": k, "r": r, "border": "reflect101", "invert": True},
            _binary(plane > local, True),
            "skimage.filters.threshold_sauvola",
        )
    _check_wolf_against_opencv(plane)
    for size, k, border, invert in (
        (5, 0.5, "reflect101", False),
        (7, 0.3, "replicate", True),
        (3, 0.8, "constant", False),
        (9, 0.5, "wrap", False),
    ):
        local = _no_ties(plane, wolf_threshold(plane, size, k, border), "Wolf")
        add(
            "wolf",
            {"size": size, "k": k, "border": border, "invert": invert},
            _binary(plane > local, invert),
            "NumPy, the rule of Wolf and colleagues, checked against OpenCV niBlackThreshold",
        )
    _check_bradley_against_skimage(plane)
    for size, percent, border, invert in (
        (5, 15.0, "reflect101", False),
        (7, 10.0, "reflect", True),
        (3, 25.0, "replicate", False),
        (9, 15.0, "constant", False),
    ):
        local = _no_ties(plane, bradley_threshold(plane, size, percent, border), "Bradley")
        add(
            "bradley",
            {"size": size, "percent": percent, "border": border, "invert": invert},
            _binary(plane > local, invert),
            "NumPy, the integral-image rule of Bradley and Roth",
        )
