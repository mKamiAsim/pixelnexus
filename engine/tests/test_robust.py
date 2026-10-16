"""Robust estimation: the M-estimator matches a direct reweighting loop and ignores outliers, and
the RANSAC surface recovers a background that objects do not bend."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest
from scipy import ndimage

from pixelnexus_engine.filters.robust import (
    HUBER_K,
    TUKEY_C,
    fit_surface,
    m_estimator,
    m_estimator_plane,
    m_estimator_representation,
    m_weights,
    ransac_surface,
    ransac_surface_representation,
    terms,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def gray_rgba(plane: np.ndarray) -> np.ndarray:
    g = np.clip(np.rint(plane), 0, 255).astype(np.uint8)
    return np.dstack([g, g, g, np.full_like(g, 255)])


# M-estimator ------------------------------------------------------------------------------------


def test_the_weights_of_huber_and_tukey() -> None:
    r = np.array([0.0, 1.0, HUBER_K, 2 * HUBER_K, -2 * HUBER_K, TUKEY_C, 10.0])
    np.testing.assert_allclose(
        m_weights(r, "huber"), [1, 1, 1, 0.5, 0.5, HUBER_K / TUKEY_C, HUBER_K / 10]
    )
    tukey = m_weights(r, "tukey")
    assert tukey[0] == 1 and tukey[5] == 0 and tukey[6] == 0
    assert tukey[1] == pytest.approx((1 - (1 / TUKEY_C) ** 2) ** 2)


def test_the_m_estimator_matches_a_direct_loop() -> None:
    plane = np.random.default_rng(1).integers(0, 256, (9, 10)).astype(np.float64)
    params = catalog_values("m-estimator", estimator="huber", scale=20, radius=1, iterations=3)
    padded = np.pad(plane, 1, mode="edge")
    mu = ndimage.median_filter(plane, size=3, mode="nearest")
    for _ in range(3):
        new = mu.copy()
        for y in range(9):
            for x in range(10):
                window = padded[y : y + 3, x : x + 3].ravel()
                w = m_weights((window - mu[y, x]) / 20, "huber")
                new[y, x] = (w * window).sum() / w.sum()
        mu = new
    np.testing.assert_allclose(m_estimator_plane(plane, params), mu, rtol=1e-12)


def test_tukey_ignores_impulses_and_keeps_an_edge() -> None:
    rng = np.random.default_rng(0)
    clean = np.full((60, 60), 60.0)
    clean[:, 30:] = 190
    noisy = clean + rng.normal(0, 10, clean.shape)
    hits = rng.random(clean.shape) < 0.1
    noisy[hits] = rng.choice([0.0, 255.0], int(hits.sum()))
    out = m_estimator(
        gray_rgba(noisy), catalog_values("m-estimator", estimator="tukey", scale=10), NOTHING
    )
    error = np.sqrt(np.mean((out[..., 0] - clean) ** 2))
    median = ndimage.median_filter(np.clip(np.rint(noisy), 0, 255), 5, mode="nearest")
    assert error < np.sqrt(np.mean((median - clean) ** 2))
    assert (out[:, 26, 0] < 90).all() and (out[:, 33, 0] > 160).all()


def test_all_zero_weights_keep_the_last_estimate() -> None:
    plane = np.zeros((5, 5))
    plane[2, 2] = 255
    params = catalog_values("m-estimator", estimator="tukey", scale=1, radius=1, iterations=2)
    np.testing.assert_array_equal(m_estimator_plane(plane, params), np.zeros((5, 5)))


# RANSAC surface ---------------------------------------------------------------------------------


def lit_scene() -> tuple[np.ndarray, np.ndarray]:
    yy, xx = np.mgrid[:120, :160]
    background = 80 + 0.4 * xx + 0.2 * yy + 0.002 * (xx - 80) ** 2
    plane = background.copy()
    plane[30:60, 30:70] += 100
    plane[70:100, 90:140] -= 50
    plane += np.random.default_rng(3).normal(0, 3, plane.shape)
    return gray_rgba(plane), background


def test_the_terms_are_the_monomials_up_to_the_degree() -> None:
    xy = np.array([[2.0, 3.0]])
    np.testing.assert_allclose(terms(xy, 2), [[1, 3, 2, 9, 6, 4]])


def test_ransac_recovers_the_background_under_the_objects() -> None:
    image, background = lit_scene()
    fitted, inliers = fit_surface(image, catalog_values("ransac-surface"))
    assert np.abs(fitted - background).max() < 3
    assert not inliers[30:60, 30:70].any()
    corrected = ransac_surface(image, catalog_values("ransac-surface"), NOTHING)
    ground = corrected[:, :, 0][110:, :].astype(float)
    assert ground.std() < 5
    plane_fit, _ = fit_surface(image, catalog_values("ransac-surface", degree=1))
    assert np.abs(plane_fit - background).max() > 5


def test_ransac_repeats_and_draws_its_outputs() -> None:
    image, _ = lit_scene()
    params = catalog_values("ransac-surface", output="background")
    first = ransac_surface(image, params, NOTHING)
    np.testing.assert_array_equal(first, ransac_surface(image, params, NOTHING))
    inliers = ransac_surface(image, catalog_values("ransac-surface", output="inliers"), NOTHING)
    assert (np.all(inliers[..., :3] == (255, 214, 10), axis=-1)).sum() > 100
    with pytest.raises(ValueError, match="too few"):
        fit_surface(image[:8, :8], catalog_values("ransac-surface", step=8, degree=3))


# Representations --------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("representation", "filter_id", "values", "count"),
    [
        (m_estimator_representation, "m-estimator", {}, 3),
        (m_estimator_representation, "m-estimator", {"estimator": "huber", "scale": 12}, 3),
        (ransac_surface_representation, "ransac-surface", {}, 4),
    ],
)
def test_the_representations(
    representation: Any, filter_id: str, values: dict[str, Any], count: int
) -> None:
    stages = representation(catalog_values(filter_id, **values))["stages"]
    assert len(stages) == count
    for stage in stages:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])
