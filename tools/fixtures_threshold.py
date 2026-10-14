"""Reference results for the global and local thresholds of Phase 5f.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. The
references are scikit-image's threshold functions. Before the cases are written, Otsu's
threshold from scikit-image is checked against OpenCV's on several images.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray
from skimage import filters as skfilters

FloatArray = NDArray[np.float64]
Add = Callable[..., None]


def _binary(above: Any, invert: bool) -> FloatArray:
    above = np.asarray(above, dtype=bool)
    return np.where(above != invert, 255.0, 0.0)


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
