"""Tone mapping is OpenCV's operator on sRGB-decoded linear light, in BGR order."""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np
import pytest

from pixelnexus_engine.filters.tone import (
    srgb_to_linear,
    tone_mapping,
    tone_mapping_representation,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "tone-mapping")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def photo() -> np.ndarray:
    rng = np.random.default_rng(4)
    rgb = rng.integers(0, 256, (24, 32, 3)).astype(np.uint8)
    return np.dstack([rgb, np.full(rgb.shape[:2], 200, np.uint8)])


def test_the_srgb_curve() -> None:
    values = np.array([0, 10, 11, 128, 255], np.uint8)
    out = srgb_to_linear(values)
    assert out[0] == 0 and out[-1] == pytest.approx(1)
    assert out[1] == pytest.approx(10 / 255 / 12.92)
    assert out[3] == pytest.approx(((128 / 255 + 0.055) / 1.055) ** 2.4, rel=1e-6)


@pytest.mark.parametrize(
    ("operator", "make"),
    [
        ("reinhard", lambda: cv2.createTonemapReinhard(2.2, 0, 1, 0)),
        ("drago", lambda: cv2.createTonemapDrago(2.2, 1, 0.85)),
        ("mantiuk", lambda: cv2.createTonemapMantiuk(2.2, 0.7, 1)),
    ],
)
def test_each_operator_is_opencv_on_linear_light(operator: str, make: Any) -> None:
    image = photo()
    out = tone_mapping(image, catalog_values(operator=operator), NOTHING)
    bgr = np.ascontiguousarray(srgb_to_linear(image[..., 2::-1]))
    expected = np.nan_to_num(make().process(bgr)) * 255
    np.testing.assert_array_equal(
        out[..., :3], np.clip(np.rint(expected[..., ::-1]), 0, 255).astype(np.uint8)
    )
    np.testing.assert_array_equal(out[..., 3], image[..., 3])


@pytest.mark.parametrize("operator", ["reinhard", "drago", "mantiuk"])
def test_the_representations(operator: str) -> None:
    stages = tone_mapping_representation(catalog_values(operator=operator))["stages"]
    assert len(stages) == 3
    for stage in stages:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])
