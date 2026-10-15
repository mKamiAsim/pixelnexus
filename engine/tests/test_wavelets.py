"""Wavelet thresholding against scikit-image, PyWavelets and a brute-force SURE search."""

from __future__ import annotations

import itertools
import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
import pywt
from fastapi.testclient import TestClient
from skimage.restoration import denoise_wavelet, estimate_sigma

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.wavelets import (
    estimate_sigma as our_sigma,
)
from pixelnexus_engine.filters.wavelets import (
    shrink,
    sure_minimizer,
    sure_threshold,
    wavelet_threshold,
    wavelet_threshold_plane,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.planes import rgb_to_ycc
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

API = "/api/v1"
CATALOG = find_catalog()


def catalog_params(**values: Any) -> dict[str, Any]:
    """Values checked against the catalog entry, with its defaults, as the engine API does."""
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "wavelet-threshold")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def noisy_disks(width: int = 61, height: int = 47, sigma: float = 20.0) -> np.ndarray:
    """Bright disks on a dark ground with Gaussian noise. Odd sizes test the final crop."""
    y, x = np.mgrid[0:height, 0:width]
    clean = np.where((x - 20) ** 2 + (y - 20) ** 2 < 144, 200.0, 50.0)
    clean = np.where((x - 45) ** 2 + (y - 30) ** 2 < 36, 220.0, clean)
    return clean + np.random.default_rng(3).normal(0, sigma, clean.shape)


SKIMAGE_RULES = {"visushrink": "VisuShrink", "bayesshrink": "BayesShrink"}


@pytest.mark.parametrize(
    ("rule", "mode", "wavelet", "levels"),
    list(itertools.product(SKIMAGE_RULES, ["soft", "hard"], ["haar", "db4", "sym8"], [1, 3])),
)
def test_matches_scikit_image(rule: str, mode: str, wavelet: str, levels: int) -> None:
    # 125 rows allow 3 levels of sym8, so the level cap does not apply.
    plane = noisy_disks(133, 125)
    params = catalog_params(rule=rule, mode=mode, wavelet=wavelet, levels=levels)
    ours = wavelet_threshold_plane(plane, params)
    # scikit-image neither rescales nor clips float images, so it gets the same values.
    theirs = denoise_wavelet(
        plane,
        wavelet=wavelet,
        mode=mode,
        wavelet_levels=levels,
        method=SKIMAGE_RULES[rule],
        rescale_sigma=False,
    )
    assert ours.shape == plane.shape
    np.testing.assert_allclose(ours, theirs, rtol=0, atol=1e-9)


def test_a_given_sigma_is_used() -> None:
    plane = noisy_disks()
    params = catalog_params(sigma=12.5, levels=2)
    theirs = denoise_wavelet(
        plane,
        sigma=12.5,
        wavelet="sym4",
        wavelet_levels=2,
        method="BayesShrink",
        rescale_sigma=False,
    )
    np.testing.assert_allclose(wavelet_threshold_plane(plane, params), theirs, atol=1e-9)


def test_noise_estimate_matches_scikit_image() -> None:
    plane = noisy_disks(128, 96, sigma=10)
    coeffs = pywt.wavedec2(plane, "db2", mode="symmetric", level=1)
    assert our_sigma(coeffs[-1][2]) == pytest.approx(estimate_sigma(plane), rel=1e-12)


def test_noise_estimate_finds_the_noise_level() -> None:
    noise = np.random.default_rng(5).normal(0, 10, (256, 256))
    coeffs = pywt.wavedec2(noise, "sym4", mode="symmetric", level=1)
    assert our_sigma(coeffs[-1][2]) == pytest.approx(10, rel=0.03)


@pytest.mark.parametrize("mode", ["soft", "hard"])
def test_shrink_matches_pywavelets(mode: str) -> None:
    w = np.array([-3.0, -2.0, -1.5, -0.5, 0.0, 0.5, 1.5, 2.0, 3.0])
    np.testing.assert_array_equal(shrink(w, 1.5, mode), pywt.threshold(w, 1.5, mode=mode))


def sure(t: float, x: np.ndarray) -> float:
    """SURE for soft thresholding with unit noise, written out directly."""
    return float(x.size - 2 * np.sum(np.abs(x) <= t) + np.sum(np.minimum(np.abs(x), t) ** 2))


@pytest.mark.parametrize("seed", range(6))
def test_sure_minimizer_beats_a_brute_force_search(seed: int) -> None:
    rng = np.random.default_rng(seed)
    x = np.concatenate([rng.normal(0, 1, 300), rng.normal(0, 4, 40)])
    if seed == 0:
        x[:5] = 0  # zeros count toward the threshold 0
    limit = np.sqrt(2 * np.log(x.size))
    t = sure_minimizer(x, limit)
    assert 0 <= t <= limit
    grid = np.concatenate([np.linspace(0, limit, 4001), np.abs(x[np.abs(x) <= limit]), [0.0]])
    best = min(sure(g, x) for g in grid)
    assert sure(t, x) == pytest.approx(best, abs=1e-9)


def test_sure_uses_the_universal_threshold_on_a_sparse_subband() -> None:
    noise = np.random.default_rng(2).normal(0, 5, (32, 32))
    d = noise.size
    assert sure_threshold(noise, 5.0) == pytest.approx(5 * np.sqrt(2 * np.log(d)))


def test_sure_goes_below_the_universal_threshold_on_a_dense_subband() -> None:
    rng = np.random.default_rng(4)
    dense = rng.normal(0, 5, (32, 32)) + rng.normal(0, 15, (32, 32))
    assert sure_threshold(dense, 5.0) < 5 * np.sqrt(2 * np.log(dense.size))


@pytest.mark.parametrize("border", ["reflect", "reflect101", "replicate", "constant", "wrap"])
def test_a_zero_threshold_gives_the_image_back(border: str) -> None:
    plane = noisy_disks()
    params = catalog_params(rule="manual", threshold=0, border=border, levels=3)
    np.testing.assert_allclose(wavelet_threshold_plane(plane, params), plane, atol=1e-9)


def test_a_flat_plane_stays_flat() -> None:
    plane = np.full((40, 40), 77.0)
    for rule in ("visushrink", "bayesshrink", "sureshrink"):
        out = wavelet_threshold_plane(plane, catalog_params(rule=rule))
        np.testing.assert_allclose(out, plane, atol=1e-9)


def test_levels_are_capped_by_the_image_size() -> None:
    plane = noisy_disks(8, 8)
    # db8 has 16 taps, too long for even one level on 8 pixels.
    out = wavelet_threshold_plane(plane, catalog_params(wavelet="db8", levels=4))
    np.testing.assert_array_equal(out, plane)


def color_image() -> np.ndarray:
    """Random colors away from 0 and 255, so that filtering luma does not clip them."""
    rng = np.random.default_rng(9)
    image = rng.integers(60, 200, (24, 30, 4)).astype(np.uint8)
    image[..., 3] = rng.integers(0, 256, (24, 30))
    return image


def test_alpha_is_kept_and_rgb_filters_each_channel() -> None:
    image = color_image()
    params = catalog_params(levels=2)
    out = wavelet_threshold(image, params, lambda _: None)
    np.testing.assert_array_equal(out[..., 3], image[..., 3])
    green = wavelet_threshold_plane(image[..., 1].astype(np.float64), params)
    np.testing.assert_array_equal(out[..., 1], np.clip(np.rint(green), 0, 255))


def test_brightness_only_keeps_the_colors() -> None:
    image = color_image()
    out = wavelet_threshold(image, catalog_params(channelScope="luminance"), lambda _: None)
    before = rgb_to_ycc(*(image[..., c].astype(np.float64) for c in range(3)))
    after = rgb_to_ycc(*(out[..., c].astype(np.float64) for c in range(3)))
    # Rounding to 8 bits moves Cb and Cr by at most about one level.
    for channel in (1, 2):
        assert np.abs(after[channel] - before[channel]).max() < 1.0


# The filter through the engine API ------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


def test_the_engine_runs_the_filter(client: TestClient) -> None:
    image = color_image()
    height, width = image.shape[:2]
    upload = client.post(
        f"{API}/images",
        params={"width": width, "height": height},
        content=image.tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    values = {"wavelet": "db2", "levels": 2, "rule": "sureshrink"}
    job = client.post(
        f"{API}/jobs",
        json={"filter": "wavelet-threshold", "image": upload.json()["id"], "params": values},
    )
    assert job.status_code == 202, job.text
    job_id = job.json()["id"]
    for _ in range(600):
        state = client.get(f"{API}/jobs/{job_id}").json()["state"]
        if state in ("done", "failed"):
            break
        time.sleep(0.05)
    assert state == "done"
    result = client.get(f"{API}/jobs/{job_id}/result")
    pixels = np.frombuffer(result.content, dtype=np.uint8).reshape(height, width, 4)
    expected = wavelet_threshold(image, catalog_params(**values), lambda _: None)
    np.testing.assert_array_equal(pixels, expected)


def test_the_engine_lists_the_filter_as_available(client: TestClient) -> None:
    entry = client.get(f"{API}/filters/wavelet-threshold").json()
    assert entry["available"] is True


@pytest.mark.parametrize(
    ("values", "message"),
    [
        ({"levels": 0}, "Levels must be from 1 to 8."),
        ({"wavelet": "bior2.2"}, 'Wavelet has no option "bior2.2".'),
        ({"speed": 1}, "Unknown parameter: speed."),
        ({"channelScope": "per-channel"}, 'Channels has no option "per-channel".'),
    ],
)
def test_the_engine_checks_values_against_the_catalog(
    client: TestClient, values: dict[str, Any], message: str
) -> None:
    response = client.post(
        f"{API}/jobs", json={"filter": "wavelet-threshold", "image": "x", "params": values}
    )
    assert response.status_code == 422
    assert response.json()["detail"] == message


def test_the_representation_shows_the_taps_of_the_chosen_wavelet(client: TestClient) -> None:
    response = client.post(
        f"{API}/filters/wavelet-threshold/representation", json={"wavelet": "haar"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["kind"] == "stages"
    names = [stage["name"] for stage in body["stages"]]
    assert names == ["Analysis", "Filter taps", "Noise level", "Threshold", "Shrink", "Synthesis"]
    taps = body["stages"][1]["formula"]
    assert "0.7071,\\ 0.7071" in taps
