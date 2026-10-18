"""The Deriche gradient is OpenCV's on the rounded luma, peaks at the step height, and smooths
more at a smaller alpha."""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np
import pytest

from pixelnexus_engine.filters.deriche import deriche, deriche_gradients, deriche_representation
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "deriche")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def step(noise: float = 0) -> np.ndarray:
    gray = np.full((40, 40), 50.0)
    gray[:, 20:] = 200
    gray += np.random.default_rng(2).normal(0, noise, gray.shape)
    g = np.clip(np.rint(gray), 0, 255).astype(np.uint8)
    return np.dstack([g, g, g, np.full_like(g, 255)])


def test_the_gradients_are_opencv_on_the_luma() -> None:
    image = step(5)
    gx, gy = deriche_gradients(image, catalog_values(alpha=0.7, omega=0.2))
    np.testing.assert_array_equal(gx, cv2.ximgproc.GradientDericheX(image[..., 0], 0.7, 0.2))
    np.testing.assert_array_equal(gy, cv2.ximgproc.GradientDericheY(image[..., 0], 0.7, 0.2))


def test_a_step_peaks_at_its_height_and_the_outputs_show_it() -> None:
    out = deriche(step(), catalog_values(), NOTHING)
    assert out[20, :, 0].max() == 150 and int(np.argmax(out[20, :, 0])) == 19
    gx = deriche(step(), catalog_values(output="gx"), NOTHING)
    assert gx[20, 19, 0] == 203 and gx[20, 5, 0] == 128


@pytest.mark.parametrize("alpha", [0.5, 2.0])
def test_smaller_alpha_smooths_noise_more(alpha: float) -> None:
    g = np.clip(np.rint(128 + np.random.default_rng(2).normal(0, 10, (200, 200))), 0, 255)
    flat = np.dstack([g, g, g, np.full_like(g, 255)]).astype(np.uint8)

    def response(a: float) -> float:
        out = deriche(flat, catalog_values(alpha=a), NOTHING)[..., 0].astype(float)
        return float(out[50:150, 50:150].mean())

    assert response(alpha) < response(alpha * 2)


def test_the_representation() -> None:
    stages = deriche_representation(catalog_values())["stages"]
    assert len(stages) == 3
    for stage in stages:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])
