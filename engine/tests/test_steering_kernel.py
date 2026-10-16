"""Steering kernel regression: the steering matrices follow Eq. 50 to 54 of Takeda et al., the
regression reproduces polynomials, and the iterations remove noise while keeping an edge."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest
from scipy.ndimage import convolve

from pixelnexus_engine.filters.steering_kernel import (
    regression,
    steering_kernel,
    steering_kernel_plane,
    steering_kernel_representation,
    steering_matrices,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "steering-kernel")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def edge_scene(noise: float = 0, seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    rows, cols = np.mgrid[0:64, 0:64]
    clean = np.where(cols + 0.5 * rows > 45, 200.0, 60.0)
    return clean, clean + np.random.default_rng(seed).normal(0, noise, clean.shape)


def rmse(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.sqrt(np.mean((a - b) ** 2)))


def test_order_0_classic_is_a_normalized_gaussian_average() -> None:
    values = np.random.default_rng(1).uniform(0, 255, (24, 24))
    estimate, _, _ = regression(values, None, {"h": 1.5, "order": 0, "radius": 3})
    offsets = np.arange(-3, 4)
    kernel = np.exp(-(offsets[:, None] ** 2 + offsets[None, :] ** 2) / (2 * 1.5**2))
    expected = convolve(values, kernel / kernel.sum(), mode="mirror")
    np.testing.assert_allclose(estimate, expected, atol=1e-9)


@pytest.mark.parametrize("steered", [False, True])
def test_order_2_reproduces_a_quadratic_and_its_gradient(steered: bool) -> None:
    rows, cols = np.mgrid[0:30, 0:30].astype(float)
    surface = 3 + 0.5 * cols - 0.2 * rows + 0.01 * cols**2 + 0.02 * cols * rows - 0.03 * rows**2
    params = {"h": 2.0, "order": 2, "radius": 4}
    steering = None
    if steered:
        gx, gy = np.gradient(surface, axis=1), np.gradient(surface, axis=0)
        steering = steering_matrices(gx, gy)
    estimate, gx_hat, gy_hat = regression(surface, steering, params)
    inner = (slice(5, -5), slice(5, -5))
    np.testing.assert_allclose(estimate[inner], surface[inner], atol=1e-6)
    np.testing.assert_allclose(gx_hat[inner], (0.5 + 0.02 * cols + 0.02 * rows)[inner], atol=1e-6)
    np.testing.assert_allclose(gy_hat[inner], (-0.2 + 0.02 * cols - 0.06 * rows)[inner], atol=1e-6)


def test_the_steering_matrices_follow_equations_50_to_54() -> None:
    rng = np.random.default_rng(3)
    gx, gy = rng.normal(0, 5, (12, 12)), rng.normal(0, 5, (12, 12))
    gx[4:9, 4:9] += 20  # A dominant direction at the center.
    out = steering_matrices(gx, gy)
    r, c = 6, 6
    g = np.stack(
        [gx[r - 2 : r + 3, c - 2 : c + 3].ravel(), gy[r - 2 : r + 3, c - 2 : c + 3].ravel()], 1
    )
    _, s, vt = np.linalg.svd(g)
    nu1, nu2 = vt[1]
    theta = np.arctan(nu1 / nu2)
    rotation = np.array([[np.cos(theta), np.sin(theta)], [-np.sin(theta), np.cos(theta)]])
    sigma = (s[0] + 1.0) / (s[1] + 1.0)
    gamma = np.sqrt((s[0] * s[1] + 0.01) / 25)
    expected = gamma * rotation @ np.diag([sigma, 1 / sigma]) @ rotation.T
    np.testing.assert_allclose(out[r, c], expected, rtol=1e-9, atol=1e-12)


def test_flat_areas_get_a_wide_round_kernel_and_edges_a_thin_one() -> None:
    zero = np.zeros((9, 9))
    np.testing.assert_allclose(steering_matrices(zero, zero)[4, 4], np.sqrt(0.01 / 25) * np.eye(2))
    # A straight vertical edge: all gradients point along x, so s_2 = 0.
    step = np.where(np.arange(20) < 10, 60.0, 200.0)[None, :] + np.zeros((20, 1))
    gy, gx = np.gradient(step)
    c = steering_matrices(gx, gy)
    values, vectors = np.linalg.eigh(c[10, 9])
    # The large eigenvalue, the narrow direction, lies along the gradient, and the ratio of the
    # eigenvalues is sigma_i^2 = (s_1 + 1)^2.
    assert abs(vectors[0, 1]) > 0.999
    s1 = np.sqrt(np.sum(gx[8:13, 7:12] ** 2))
    assert values[1] / values[0] == pytest.approx((s1 + 1) ** 2)


def test_the_iterations_remove_noise_and_keep_the_edge() -> None:
    clean, noisy = edge_scene(20)
    params = catalog_values()
    classic, _, _ = regression(noisy, None, {"h": 2.0, "order": 2, "radius": 5})
    steered = steering_kernel_plane(noisy, params, NOTHING)
    assert rmse(steered, clean) < 0.6 * rmse(classic, clean) < rmse(noisy, clean)
    # Across the edge, the steered result rises more sharply than the classic one.
    row = 32
    width = lambda line: int(np.sum((line > 80) & (line < 180)))  # noqa: E731
    assert width(steered[row]) < width(classic[row])


def test_order_0_also_works_and_progress_is_reported() -> None:
    clean, noisy = edge_scene(20)
    seen: list[float] = []
    out = steering_kernel_plane(noisy, catalog_values(order="0", iterations=2), seen.append)
    assert rmse(out, clean) < rmse(noisy, clean) / 2
    assert seen == [0.5, 1.0]


def test_the_filter_and_its_representation() -> None:
    _, noisy = edge_scene(20)
    g = np.clip(np.rint(noisy), 0, 255).astype(np.uint8)
    image = np.dstack([g, g, g, np.full_like(g, 255)])
    out = steering_kernel(image, catalog_values(iterations=1, channelScope="rgb"), NOTHING)
    assert (out[..., 0] == out[..., 1]).all() and (out[..., 3] == 255).all()
    assert out[..., 0].astype(float).std() < g.astype(float).std()
    stages = steering_kernel_representation(catalog_values())["stages"]
    assert len(stages) == 4
    for stage in stages:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])
