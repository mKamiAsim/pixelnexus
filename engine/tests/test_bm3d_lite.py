"""BM3D-lite: the block matching keeps the closest patches within the threshold, a tiny sigma
leaves the image, and the two steps remove noise, the second more than the first."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest

from pixelnexus_engine.filters.bm3d_lite import (
    bm3d_lite,
    bm3d_lite_plane,
    bm3d_lite_representation,
    grid,
    match,
    thresholds,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "bm3d-lite")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def scene() -> np.ndarray:
    """Squares, a disk and stripes on 64 x 64 pixels."""
    rows, cols = np.mgrid[0:64, 0:64]
    image = np.full((64, 64), 70.0)
    image[8:28, 8:28] = 180
    image[(rows - 44) ** 2 + (cols - 20) ** 2 <= 100] = 140
    image[36:60, 36:60] = 100 + 60 * (np.sin(2 * np.pi * cols[36:60, 36:60] / 6) > 0)
    return image


def psnr(a: np.ndarray, b: np.ndarray) -> float:
    return float(10 * np.log10(255**2 / np.mean((a - b) ** 2)))


def test_the_thresholds_follow_lebruns_table() -> None:
    assert thresholds(20) == (2500, 400)
    assert thresholds(40) == (2500, 400)
    assert thresholds(41) == (5000, 3500)


def test_the_grid_steps_by_3_and_ends_at_the_last_patch() -> None:
    assert grid(20) == [0, 3, 6, 9, 12]
    assert grid(18) == [0, 3, 6, 9, 10]


def test_the_matching_keeps_the_closest_patches_within_tau() -> None:
    rng = np.random.default_rng(1)
    patches = rng.uniform(0, 255, (20, 20, 64))
    rows, cols = match(patches, 10, 10, 4, tau=9000, count=5)
    assert (rows[0], cols[0]) == (10, 10)
    window = patches[6:15, 6:15]
    distance = np.mean((window - patches[10, 10]) ** 2, axis=-1)
    expected = np.sort(distance[distance <= 9000])[:5]
    found = np.mean((patches[rows, cols] - patches[10, 10]) ** 2, axis=-1)
    np.testing.assert_allclose(found, expected)
    assert (np.abs(rows - 10) <= 4).all() and (np.abs(cols - 10) <= 4).all()
    # Near the border the window is cut, and a tau of 0 keeps only the reference.
    rows, cols = match(patches, 0, 19, 4, tau=0, count=5)
    assert (rows.tolist(), cols.tolist()) == ([0], [19])


def test_a_flat_image_stays_flat() -> None:
    flat = np.full((24, 24), 123.0)
    basic, final, _ = bm3d_lite_plane(flat, catalog_values(sigma=10), NOTHING)
    np.testing.assert_allclose(basic, 123, atol=1e-9)
    # The Wiener factor B^2 / (B^2 + sigma^2) shrinks even a flat group a little.
    np.testing.assert_allclose(final, 123, rtol=1e-5)


def test_a_tiny_sigma_leaves_the_image() -> None:
    image = scene()
    basic, final, _ = bm3d_lite_plane(image, catalog_values(sigma=1e-3, searchRadius=6), NOTHING)
    # Only coefficients under 2.7 sigma, here 0.0027, are set to 0.
    np.testing.assert_allclose(basic, image, atol=1e-4)
    np.testing.assert_allclose(final, image, atol=1e-3)


@pytest.mark.parametrize("sigma", [10.0, 30.0])
def test_both_steps_remove_noise_and_the_second_helps(sigma: float) -> None:
    clean = scene()
    noisy = clean + np.random.default_rng(2).normal(0, sigma, clean.shape)
    basic, final, used = bm3d_lite_plane(noisy, catalog_values(sigma=sigma), NOTHING)
    assert used == sigma
    assert psnr(basic, clean) > psnr(noisy, clean) + 6
    assert psnr(final, clean) > psnr(basic, clean)


def test_sigma_0_estimates_the_noise() -> None:
    clean = scene()
    noisy = clean + np.random.default_rng(3).normal(0, 15, clean.shape)
    _, _, used = bm3d_lite_plane(noisy, catalog_values(sigma=0), NOTHING)
    assert 12 < used < 18


def test_the_filter_outputs_and_the_representation() -> None:
    noisy = scene() + np.random.default_rng(4).normal(0, 15, (64, 64))
    g = np.clip(np.rint(noisy), 0, 255).astype(np.uint8)
    image = np.dstack([g, g, g, np.full_like(g, 255)])
    basic, final, _ = bm3d_lite_plane(g.astype(float), catalog_values(sigma=15), NOTHING)
    for output, expected in (("basic", basic), ("final", final)):
        values = catalog_values(sigma=15, output=output, channelScope="rgb")
        out = bm3d_lite(image, values, NOTHING)
        np.testing.assert_array_equal(out[..., 0], np.clip(np.rint(expected), 0, 255))
        assert (out[..., 3] == 255).all()
    stages = bm3d_lite_representation(catalog_values())["stages"]
    assert len(stages) == 4
    for stage in stages:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])
