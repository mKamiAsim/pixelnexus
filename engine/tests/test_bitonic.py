"""The bitonic filter: the parts follow Treece's equations, steps and ramps pass unchanged, the
centile decides about impulses, and noise is removed better than by a Gaussian or a median."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest
from scipy import ndimage

from pixelnexus_engine.filters.bitonic import (
    bitonic,
    bitonic_parts,
    bitonic_representation,
    disk,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "bitonic")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def step_scene() -> np.ndarray:
    rows, cols = np.mgrid[0:96, 0:96]
    image = np.where(cols >= 48, 180.0, 60.0)
    image[(rows - 70) ** 2 + (cols - 72) ** 2 <= 144] = 230
    return image


def psnr(a: np.ndarray, b: np.ndarray) -> float:
    return float(10 * np.log10(255**2 / np.mean((a - b) ** 2)))


def test_the_disk_has_diameter_l() -> None:
    footprint = disk(9)
    assert footprint.shape == (9, 9) and footprint.sum() == 69
    np.testing.assert_array_equal(footprint, footprint.T)
    assert footprint[4].all() and not footprint[0, 0]


def test_the_parts_follow_the_equations() -> None:
    values = np.random.default_rng(0).uniform(0, 255, (40, 40))
    parts = bitonic_parts(values, 7, 10)
    footprint = disk(7)

    def rank(x: np.ndarray, c: float) -> np.ndarray:
        return ndimage.percentile_filter(x, c, footprint=footprint, mode="reflect")

    np.testing.assert_allclose(parts["opening"], rank(rank(values, 10), 90))
    np.testing.assert_allclose(parts["closing"], rank(rank(values, 90), 10))
    smooth = lambda x: ndimage.gaussian_filter(x, 0.33 * 7, mode="reflect", truncate=2)  # noqa: E731
    e_open = np.abs(smooth(values - parts["opening"]))
    e_close = np.abs(smooth(parts["closing"] - values))
    np.testing.assert_allclose(parts["errorOpen"], e_open)
    expected = (e_open * parts["closing"] + e_close * parts["opening"]) / (e_open + e_close)
    np.testing.assert_allclose(parts["output"], expected)


def test_both_weights_are_one_half_where_both_errors_are_zero() -> None:
    flat = np.full((20, 20), 77.0)
    parts = bitonic_parts(flat, 5, 10)
    np.testing.assert_array_equal(parts["errorOpen"], 0.5)
    np.testing.assert_array_equal(parts["output"], 77.0)


def test_a_step_and_a_ramp_pass_unchanged() -> None:
    rows, cols = np.mgrid[0:64, 0:64].astype(float)
    step = np.where(cols >= 32, 200.0, 40.0)
    np.testing.assert_allclose(bitonic_parts(step, 9, 10)["output"], step, atol=1e-9)
    ramp = 1.5 * cols + 0.5 * rows
    inner = (slice(10, -10), slice(10, -10))
    np.testing.assert_allclose(bitonic_parts(ramp, 9, 10)["output"][inner], ramp[inner], atol=1e-9)


@pytest.mark.parametrize(("centile", "kept"), [(0, True), (10, False)])
def test_the_centile_decides_about_an_impulse(centile: float, kept: bool) -> None:
    image = np.full((31, 31), 100.0)
    image[15, 15] = 250
    out = bitonic_parts(image, 9, centile)["output"]
    assert (abs(out[15, 15] - 250) < 1e-9) == kept
    if not kept:
        assert out[15, 15] < 110


@pytest.mark.parametrize("sigma", [5.0, 20.0])
def test_it_removes_noise_better_than_a_gaussian_or_a_median(sigma: float) -> None:
    clean = step_scene()
    noisy = clean + np.random.default_rng(1).normal(0, sigma, clean.shape)
    out = bitonic_parts(noisy, 9, 10)["output"]
    gauss = ndimage.gaussian_filter(noisy, 0.33 * 9, mode="reflect", truncate=2)
    median = ndimage.median_filter(noisy, footprint=disk(9), mode="reflect")
    assert psnr(out, clean) > psnr(median, clean) > psnr(gauss, clean)
    assert psnr(out, clean) > psnr(noisy, clean) + 5


def test_heavy_noise_tends_to_the_gaussian() -> None:
    noisy = 128 + np.random.default_rng(2).normal(0, 40, (64, 64))
    out = bitonic_parts(noisy, 9, 10)["output"]
    gauss = ndimage.gaussian_filter(noisy, 0.33 * 9, mode="reflect", truncate=2)
    inner = (slice(10, -10), slice(10, -10))
    assert np.std((out - gauss)[inner]) < 0.25 * np.std((noisy - gauss)[inner])


def test_the_filter_and_its_representation() -> None:
    noisy = step_scene() + np.random.default_rng(3).normal(0, 10, (96, 96))
    g = np.clip(np.rint(noisy), 0, 255).astype(np.uint8)
    image = np.dstack([g, g, g, np.full_like(g, 255)])
    out = bitonic(image, catalog_values(channelScope="rgb"), NOTHING)
    expected = bitonic_parts(g.astype(float), 9, 10)["output"]
    np.testing.assert_array_equal(out[..., 0], np.clip(np.rint(expected), 0, 255))
    assert (out[..., 3] == 255).all()
    stages = bitonic_representation(catalog_values())["stages"]
    assert len(stages) == 3
    for stage in stages:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])
