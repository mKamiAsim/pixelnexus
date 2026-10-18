"""Edge-preserving denoising: each filter gives the result of its library call on the channel
planes or the RGB image, rolling guidance has the start of its paper, and SUSAN smoothing
matches a direct loop over the window."""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np
import pytest
from skimage.restoration import denoise_nl_means, denoise_tv_bregman, denoise_tv_chambolle

from pixelnexus_engine.filters.edge_preserving import (
    domain_transform,
    domain_transform_representation,
    nlm,
    nlm_plane,
    nlm_representation,
    rolling_guidance,
    rolling_guidance_representation,
    susan_plane,
    susan_smoothing,
    susan_smoothing_representation,
    tv_denoise,
    tv_plane,
    tv_representation,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def step_image(noise: float = 15, size: int = 40) -> tuple[np.ndarray, np.ndarray]:
    """A vertical step from 60 to 190, and the same with Gaussian noise, as gray RGBA."""
    clean = np.full((size, size), 60.0)
    clean[:, size // 2 :] = 190
    noisy = clean + np.random.default_rng(4).normal(0, noise, clean.shape)
    out = []
    for plane in (clean, noisy):
        g = np.clip(np.rint(plane), 0, 255).astype(np.uint8)
        out.append(np.dstack([g, g, g, np.full_like(g, 255)]))
    return out[0], out[1]


def error(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.sqrt(np.mean((a[..., 0].astype(float) - b[..., 0].astype(float)) ** 2)))


# Non-local means and total variation ------------------------------------------------------------


def test_nlm_is_scikit_image_in_levels() -> None:
    _, noisy = step_image()
    plane = noisy[..., 0].astype(np.float64)
    params = catalog_values("nlm", h=16, sigma=10, fastMode=False)
    expected = denoise_nl_means(
        plane / 255, patch_size=7, patch_distance=11, h=16 / 255, fast_mode=False, sigma=10 / 255
    )
    np.testing.assert_allclose(nlm_plane(plane, params), expected * 255)


def test_tv_solvers_get_the_weights_of_their_docstrings() -> None:
    _, noisy = step_image()
    plane = noisy[..., 0].astype(np.float64)
    chambolle = tv_plane(plane, catalog_values("tv-denoise", weight=0.2))
    np.testing.assert_allclose(chambolle, denoise_tv_chambolle(plane / 255, weight=0.2) * 255)
    params = catalog_values("tv-denoise", weight=0.2, solver="bregman", iterations=100)
    expected = denoise_tv_bregman(plane / 255, weight=2.5, max_num_iter=100) * 255
    np.testing.assert_allclose(tv_plane(plane, params), expected)


@pytest.mark.parametrize(
    ("filter_id", "function", "values"),
    [
        ("nlm", nlm, {}),
        ("tv-denoise", tv_denoise, {}),
        ("tv-denoise", tv_denoise, {"solver": "bregman"}),
        ("susan-smoothing", susan_smoothing, {"threshold": 40}),
        ("rolling-guidance", rolling_guidance, {}),
    ],
)
def test_the_denoisers_bring_a_noisy_step_closer_to_the_clean_one(
    filter_id: str, function: Any, values: dict[str, Any]
) -> None:
    clean, noisy = step_image()
    out = function(noisy, catalog_values(filter_id, **values), NOTHING)
    assert error(out, clean) < 0.6 * error(noisy, clean)
    np.testing.assert_array_equal(out[..., 3], noisy[..., 3])


# Domain transform and rolling guidance ----------------------------------------------------------


def test_domain_transform_is_opencv_guided_by_the_image() -> None:
    _, noisy = step_image()
    params = catalog_values("domain-transform", mode="rf", iterations=2)
    rgb = np.ascontiguousarray(noisy[..., :3])
    expected = cv2.ximgproc.dtFilter(rgb, rgb, 30, 80, mode=cv2.ximgproc.DTF_RF, numIters=2)
    out = domain_transform(noisy, params, NOTHING)
    np.testing.assert_array_equal(out[..., :3], expected)


def test_domain_transform_keeps_a_sharp_edge() -> None:
    clean, _ = step_image()
    out = domain_transform(clean, catalog_values("domain-transform", sigmaColor=20), NOTHING)
    np.testing.assert_array_equal(out[:, 19, 0], 60)
    np.testing.assert_array_equal(out[:, 20, 0], 190)


def test_rolling_guidance_starts_from_a_gaussian_or_as_opencv_does() -> None:
    _, noisy = step_image()
    rgb = np.ascontiguousarray(noisy[..., :3])
    opencv = rolling_guidance(noisy, catalog_values("rolling-guidance", start="opencv"), NOTHING)
    expected = cv2.ximgproc.rollingGuidanceFilter(
        rgb, d=-1, sigmaColor=25, sigmaSpace=3, numOfIter=4
    )
    np.testing.assert_array_equal(opencv[..., :3], expected)
    guide = cv2.GaussianBlur(rgb, (0, 0), 3)
    for _ in range(3):
        guide = cv2.ximgproc.jointBilateralFilter(guide, rgb, -1, 25, 3)
    paper = rolling_guidance(noisy, catalog_values("rolling-guidance"), NOTHING)
    np.testing.assert_array_equal(paper[..., :3], guide)


def test_the_paper_start_removes_small_dots_that_opencv_keeps() -> None:
    gray = np.full((48, 48), 100, np.uint8)
    gray[8::8, 8::8] = 220
    image = np.dstack([gray, gray, gray, np.full_like(gray, 255)])
    paper = rolling_guidance(image, catalog_values("rolling-guidance"), NOTHING)
    opencv = rolling_guidance(image, catalog_values("rolling-guidance", start="opencv"), NOTHING)
    assert int(paper[..., 0].max()) - 100 < 10
    assert int(opencv[..., 0].max()) - 100 > 60


# SUSAN smoothing --------------------------------------------------------------------------------


def test_susan_matches_a_direct_loop() -> None:
    plane = np.random.default_rng(5).integers(0, 256, (12, 13)).astype(np.float64)
    sigma, t = 1.2, 30.0
    radius = 3
    padded = np.pad(plane, radius, mode="edge")
    expected = np.zeros_like(plane)
    for y in range(12):
        for x in range(13):
            num = den = 0.0
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    if dy == 0 and dx == 0:
                        continue
                    v = padded[y + radius + dy, x + radius + dx]
                    w = np.exp(-(dy * dy + dx * dx) / (2 * sigma**2) - ((v - plane[y, x]) / t) ** 2)
                    num += w * v
                    den += w
            expected[y, x] = num / den
    params = catalog_values("susan-smoothing", sigma=sigma, threshold=t)
    np.testing.assert_allclose(susan_plane(plane, params), expected, rtol=1e-12)


def test_susan_leaves_out_the_center_and_falls_back_to_the_median() -> None:
    plane = np.full((7, 7), 100.0)
    plane[3, 3] = 255
    out = susan_plane(plane, catalog_values("susan-smoothing", sigma=1, threshold=20))
    assert out[3, 3] == pytest.approx(100)
    # With t = 1, every weight next to a jump of 155 levels underflows to 0.
    ring = np.array([[10.0, 20, 30], [40, 255, 60], [70, 80, 90]])
    out = susan_plane(ring, catalog_values("susan-smoothing", sigma=0.5, threshold=1))
    assert out[1, 1] == 50


# Representations --------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("representation", "filter_id", "values"),
    [
        (nlm_representation, "nlm", {}),
        (nlm_representation, "nlm", {"sigma": 10, "fastMode": False}),
        (tv_representation, "tv-denoise", {"solver": "bregman", "isotropic": False}),
        (domain_transform_representation, "domain-transform", {}),
        (rolling_guidance_representation, "rolling-guidance", {}),
        (rolling_guidance_representation, "rolling-guidance", {"start": "opencv"}),
        (susan_smoothing_representation, "susan-smoothing", {}),
    ],
)
def test_the_representations(representation: Any, filter_id: str, values: dict[str, Any]) -> None:
    stages = representation(catalog_values(filter_id, **values))["stages"]
    assert len(stages) == 3
    for stage in stages:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])
