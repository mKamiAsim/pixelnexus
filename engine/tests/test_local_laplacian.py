"""Local Laplacian filtering: the remapping follows Paris et al., the fast algorithm of Aubry et
al. comes close to the exact Algorithm 1, details grow or shrink with alpha, and a strong edge
makes no halo."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest

from pixelnexus_engine.filters.local_laplacian import (
    collapse,
    gaussian_pyramid,
    laplacian_pyramid,
    level_count,
    local_laplacian,
    local_laplacian_gray,
    local_laplacian_representation,
    remap,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "local-laplacian")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def blocks(size: int = 32) -> np.ndarray:
    rng = np.random.default_rng(0)
    clean = np.kron(rng.uniform(0, 1, (4, 4)), np.ones((size // 4, size // 4)))
    return np.clip(clean + rng.normal(0, 0.03, (size, size)), 0, 1)


def exact(image: np.ndarray, params: dict[str, Any]) -> np.ndarray:
    """Algorithm 1 of Paris et al. in its direct form: a full remap and pyramid per coefficient."""
    levels = level_count(image.shape)
    gauss = gaussian_pyramid(image, levels)
    output = []
    for level in range(levels):
        out = np.zeros_like(gauss[level])
        for y in range(out.shape[0]):
            for x in range(out.shape[1]):
                pyramid = laplacian_pyramid(remap(image, gauss[level][y, x], params), levels)
                out[y, x] = pyramid[level][y, x]
        output.append(out)
    output.append(gauss[-1])
    return collapse(output)


def psnr(a: np.ndarray, b: np.ndarray) -> float:
    return float(10 * np.log10(1 / np.mean((a - b) ** 2)))


def test_the_remapping_follows_the_paper() -> None:
    params = catalog_values(sigmaR=0.2, alpha=2.0, beta=0.5)
    i = np.array([0.5, 0.6, 0.4, 0.7, 0.9, 0.1])
    out = remap(i, 0.5, params)
    # Details: g + sign(d) sigma (|d| / sigma)^alpha.
    np.testing.assert_allclose(out[:4], [0.5, 0.55, 0.45, 0.7])
    # Edges: g + sign(d) (beta (|d| - sigma) + sigma).
    np.testing.assert_allclose(out[4:], [0.5 + 0.5 * 0.2 + 0.2, 0.5 - 0.5 * 0.2 - 0.2])


def test_the_noise_guard_leaves_tiny_differences_alone() -> None:
    params = catalog_values(sigmaR=0.3, alpha=0.25)
    d = np.array([0.005, 0.015, 0.05])
    out = remap(0.5 + d, 0.5, params) - 0.5
    assert out[0] == pytest.approx(0.005)
    assert 0.015 < out[1] < 0.3 * (0.015 / 0.3) ** 0.25
    assert out[2] == pytest.approx(0.3 * (0.05 / 0.3) ** 0.25)


def test_the_remapping_is_monotonic_and_continuous() -> None:
    # The guard blends in over 1 percent of the range, so the curve is steep there. On a grid
    # of 1e-5 no step may pass 0.002.
    i = np.linspace(0, 1, 100001)
    for alpha, beta in ((0.25, 1.0), (1.0, 0.3), (3.0, 1.5)):
        out = remap(i, 0.4, catalog_values(alpha=alpha, beta=beta))
        assert (np.diff(out) >= -1e-12).all()
        assert np.abs(np.diff(out)).max() < 0.002


def test_the_pyramid_collapses_back_to_the_image() -> None:
    image = blocks()
    np.testing.assert_allclose(collapse(laplacian_pyramid(image, 3)), image, atol=1e-12)


def test_identity_settings_leave_the_image() -> None:
    image = blocks()
    params = catalog_values(alpha=1.0, beta=1.0)
    np.testing.assert_allclose(local_laplacian_gray(image, params, NOTHING), image, atol=1e-9)


@pytest.mark.parametrize(("samples", "floor"), [(8, 30), (16, 35)])
def test_the_fast_algorithm_is_close_to_algorithm_1(samples: int, floor: float) -> None:
    image = blocks()
    params = catalog_values(sigmaR=0.3, alpha=0.5, samples=samples)
    reference = exact(image, params)
    assert psnr(reference, image) < 30  # The filter does change the image.
    assert psnr(local_laplacian_gray(image, params, NOTHING), reference) > floor


def test_alpha_raises_or_lowers_detail_and_the_edge_has_no_halo() -> None:
    columns = np.arange(64)
    texture = 0.03 * np.sin(2 * np.pi * columns / 4)
    image = np.where(columns < 32, 0.2, 0.8)[None, :] + texture[None, :] + np.zeros((64, 1))

    def detail(alpha: float) -> tuple[float, float, float]:
        out = local_laplacian_gray(image, catalog_values(alpha=alpha), NOTHING)
        row = out[32]
        return float(row[8:24].std()), float(row[40:56].std()), float(row[32:40].max())

    plain = detail(1.0)
    boosted, smoothed = detail(0.25), detail(4.0)
    assert boosted[0] > 1.5 * plain[0] and boosted[1] > 1.5 * plain[1]
    assert smoothed[0] < 0.5 * plain[0] and smoothed[1] < 0.5 * plain[1]
    # Next to the edge, the boosted result stays within the texture of the bright side.
    assert boosted[2] < 0.8 + 3 * boosted[1]


def test_beta_compresses_a_large_step() -> None:
    image = np.where(np.arange(64) < 32, 0.1, 0.9)[None, :] + np.zeros((64, 1))
    out = local_laplacian_gray(image, catalog_values(alpha=1.0, beta=0.3), NOTHING)
    # Inside the coarsest level, the far ends are set by the low-pass residual, so measure near
    # the step, where the finer levels act.
    assert out[32, 34] - out[32, 29] < 0.8 * (image[32, 34] - image[32, 29])


def test_color_ratios_are_kept() -> None:
    rng = np.random.default_rng(2)
    rgb = rng.integers(40, 220, (32, 32, 3)).astype(np.uint8)
    image = np.dstack([rgb, np.full((32, 32), 200, np.uint8)])
    out = local_laplacian(image, catalog_values(alpha=0.5), NOTHING)
    before = rgb.astype(float)
    after = out[..., :3].astype(float)
    ratio_before = before[..., 0] / before[..., 1]
    ratio_after = after[..., 0] / np.maximum(after[..., 1], 1)
    unclipped = (after > 2).all(axis=-1) & (after < 253).all(axis=-1)
    assert np.median(np.abs(ratio_after - ratio_before)[unclipped]) < 0.02
    assert (out[..., 3] == 200).all()


def test_the_representation() -> None:
    stages = local_laplacian_representation(catalog_values())["stages"]
    assert len(stages) == 4
    for stage in stages:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])
