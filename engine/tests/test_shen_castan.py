"""The Shen-Castan detector: the recursive ISEF equals the published kernel, the binary Laplacian
changes at a step, and the edges trace the outline of a noisy disk."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest
from scipy.ndimage import convolve1d
from skimage.filters import apply_hysteresis_threshold

from pixelnexus_engine.filters.shen_castan import (
    isef,
    shen_castan,
    shen_castan_representation,
    shen_castan_stages,
    zero_crossings,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "shen-castan")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def gray_rgba(gray: np.ndarray) -> np.ndarray:
    g = np.clip(np.rint(gray), 0, 255).astype(np.uint8)
    return np.dstack([g, g, g, np.full_like(g, 255)])


def noisy_disk(noise: float = 10) -> np.ndarray:
    rows, cols = np.mgrid[0:80, 0:80]
    gray = np.where((rows - 40) ** 2 + (cols - 40) ** 2 <= 20**2, 200.0, 60.0)
    return gray + np.random.default_rng(4).normal(0, noise, gray.shape)


@pytest.mark.parametrize("b", [0.3, 0.8, 0.95])
def test_the_recursion_is_the_published_kernel(b: float) -> None:
    values = np.random.default_rng(0).uniform(0, 255, (30, 40))
    n = np.arange(-600, 601)
    kernel = (1 - b) / (1 + b) * b ** np.abs(n)
    assert kernel.sum() == pytest.approx(1)
    direct = convolve1d(
        convolve1d(values, kernel, axis=1, mode="nearest"), kernel, axis=0, mode="nearest"
    )
    np.testing.assert_allclose(isef(values, b), direct, atol=1e-9)


def test_a_flat_image_stays_flat() -> None:
    np.testing.assert_allclose(isef(np.full((10, 12), 77.0), 0.9), 77.0)


def test_the_binary_laplacian_changes_at_a_step() -> None:
    gray = np.full((20, 40), 50.0)
    gray[:, 20:] = 200
    stages = shen_castan_stages(gray_rgba(gray), catalog_values())
    # Smoothing lifts the dark side and lowers the bright side.
    assert (stages["laplacian"][:, 19] > 0).all() and (stages["laplacian"][:, 20] < 0).all()
    np.testing.assert_array_equal(stages["crossings"][10], np.arange(40) == 19)


def test_zero_crossings_are_the_inner_border() -> None:
    positive = np.zeros((7, 7), bool)
    positive[2:5, 2:5] = True
    ring = positive.copy()
    ring[3, 3] = False
    np.testing.assert_array_equal(zero_crossings(positive), ring)


def test_the_edges_trace_a_noisy_disk() -> None:
    gray = noisy_disk()
    out = shen_castan(gray_rgba(gray), catalog_values(), NOTHING)
    edges = out[..., 0] == 255
    rows, cols = np.nonzero(edges)
    radius = np.hypot(rows - 40, cols - 40)
    assert edges.sum() > 100
    # A few short spurs come from the noise. 89 percent lie within 2 pixels.
    near = np.abs(radius - 20) <= 2
    assert np.mean(near) > 0.85
    # The edges go all the way around: every 10 degree sector holds some.
    angles = np.degrees(np.arctan2(rows[near] - 40, cols[near] - 40)) % 360
    assert len(np.unique((angles // 10).astype(int))) == 36
    stages = shen_castan_stages(gray_rgba(gray), catalog_values())
    expected = apply_hysteresis_threshold(stages["strength"], 2, 5)
    np.testing.assert_array_equal(edges, expected)


def test_more_smoothing_leaves_fewer_crossings_on_noise() -> None:
    gray = noisy_disk(20)
    counts = [
        shen_castan_stages(gray_rgba(gray), catalog_values(b=b))["crossings"].sum()
        for b in (0.5, 0.8, 0.95)
    ]
    assert counts[0] > counts[1] > counts[2]


def test_the_stage_outputs() -> None:
    image = gray_rgba(noisy_disk())
    stages = shen_castan_stages(image, catalog_values())
    smoothed = shen_castan(image, catalog_values(output="smoothed"), NOTHING)
    np.testing.assert_array_equal(smoothed[..., 0], np.clip(np.rint(stages["smoothed"]), 0, 255))
    binary = shen_castan(image, catalog_values(output="binary"), NOTHING)
    np.testing.assert_array_equal(binary[..., 0] == 255, stages["binary"])
    laplacian = shen_castan(image, catalog_values(output="laplacian"), NOTHING)
    expected = np.clip(np.rint(128 + 4 * stages["laplacian"]), 0, 255)
    np.testing.assert_array_equal(laplacian[..., 0], expected)
    assert (smoothed[..., 3] == 255).all()


def test_the_representation() -> None:
    stages = shen_castan_representation(catalog_values())["stages"]
    assert len(stages) == 3
    for stage in stages:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])
