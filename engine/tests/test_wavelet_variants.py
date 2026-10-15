"""Stationary wavelet filtering, cycle spinning and wavelet Wiener filtering.

The references are independent: cycle spinning over all circular shifts written out with
PyWavelets, scikit-image's cycle_spin, and brute-force window means.
"""

from __future__ import annotations

import itertools
import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
import pywt
from fastapi.testclient import TestClient
from numpy.lib.stride_tricks import sliding_window_view
from skimage.restoration import cycle_spin

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.wavelets import (
    cycle_spin_plane,
    local_signal_variance,
    stationary_plane,
    swt_denoise,
    wavelet_threshold_plane,
    wavelet_wiener,
    wavelet_wiener_plane,
    wiener_gain,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

API = "/api/v1"
CATALOG = find_catalog()
NORMAL_Q75 = 0.6744897501960817


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    """Values checked against the catalog entry, with its defaults, as the engine API does."""
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def noisy_plane(height: int, width: int, seed: int = 3) -> np.ndarray:
    y, x = np.mgrid[0:height, 0:width]
    clean = np.where((x - width / 3) ** 2 + (y - height / 2) ** 2 < (height / 4) ** 2, 200.0, 60.0)
    return clean + np.random.default_rng(seed).normal(0, 15, clean.shape)


# Stationary wavelet filtering ---------------------------------------------------------------


def all_shift_average(plane: np.ndarray, wavelet: str, levels: int, t: float, mode: str):
    """Coifman and Donoho's average over all 2^J x 2^J circular shifts, written out."""
    step = 2**levels
    total = np.zeros_like(plane)
    for dy, dx in itertools.product(range(step), range(step)):
        shifted = np.roll(plane, (dy, dx), axis=(0, 1))
        coeffs = pywt.wavedec2(shifted, wavelet, mode="periodization", level=levels)
        coeffs = [coeffs[0]] + [
            tuple(pywt.threshold(band, t, mode=mode) for band in level) for level in coeffs[1:]
        ]
        rebuilt = pywt.waverec2(coeffs, wavelet, mode="periodization")
        total += np.roll(rebuilt, (-dy, -dx), axis=(0, 1))
    return total / step**2


@pytest.mark.parametrize(
    ("wavelet", "mode"), list(itertools.product(["haar", "db2", "sym4"], ["soft", "hard"]))
)
def test_the_stationary_transform_equals_cycle_spinning_over_all_shifts(
    wavelet: str, mode: str
) -> None:
    # 64 rows allow 3 levels of sym4, so the level cap does not apply.
    plane = noisy_plane(64, 72)
    params = catalog_values(
        "swt-denoise", wavelet=wavelet, mode=mode, rule="manual", threshold=15, levels=3
    )
    expected = all_shift_average(plane, wavelet, 3, 15, mode)
    np.testing.assert_allclose(stationary_plane(plane, params), expected, rtol=0, atol=1e-9)


@pytest.mark.parametrize("rule", ["visushrink", "bayesshrink", "sureshrink"])
def test_the_stationary_transform_moves_with_the_image(rule: str) -> None:
    plane = noisy_plane(32, 48)
    params = catalog_values("swt-denoise", rule=rule, border="wrap")
    moved = np.roll(plane, (3, 5), axis=(0, 1))
    np.testing.assert_allclose(
        stationary_plane(moved, params),
        np.roll(stationary_plane(plane, params), (3, 5), axis=(0, 1)),
        atol=1e-9,
    )


def test_the_decimated_transform_does_not_move_with_the_image() -> None:
    plane = noisy_plane(32, 48)
    params = catalog_values("wavelet-threshold", border="wrap")
    moved = np.roll(plane, (3, 5), axis=(0, 1))
    difference = wavelet_threshold_plane(moved, params) - np.roll(
        wavelet_threshold_plane(plane, params), (3, 5), axis=(0, 1)
    )
    assert np.abs(difference).max() > 1


def test_visushrink_uses_the_noise_of_the_stationary_details() -> None:
    plane = noisy_plane(48, 64)
    finest = pywt.swt2(plane, "sym4", level=3, trim_approx=True)[-1][2]
    sigma = np.median(np.abs(finest[finest != 0])) / NORMAL_Q75
    threshold = sigma * np.sqrt(2 * np.log(plane.size))
    visu = stationary_plane(plane, catalog_values("swt-denoise", rule="visushrink"))
    expected = stationary_plane(
        plane, catalog_values("swt-denoise", rule="manual", threshold=float(threshold))
    )
    np.testing.assert_allclose(visu, expected, atol=1e-9)


@pytest.mark.parametrize("border", ["reflect", "reflect101", "replicate", "constant", "wrap"])
def test_odd_sizes_come_back_whole(border: str) -> None:
    plane = noisy_plane(37, 29)
    params = catalog_values("swt-denoise", rule="manual", threshold=0, border=border)
    out = stationary_plane(plane, params)
    assert out.shape == plane.shape
    np.testing.assert_allclose(out, plane, atol=1e-9)


@pytest.mark.parametrize("shifts", [1, 2, 3])
def test_cycle_spinning_matches_scikit_image(shifts: int) -> None:
    plane = noisy_plane(40, 36)
    params = catalog_values("swt-denoise", transform="cycle-spinning", shifts=shifts)
    expected = cycle_spin(
        plane,
        func=lambda x: wavelet_threshold_plane(x, params),
        max_shifts=shifts - 1,
        workers=1,
    )
    np.testing.assert_allclose(cycle_spin_plane(plane, params), expected, atol=1e-9)


# Wavelet Wiener filtering -------------------------------------------------------------------


def brute_force_variance(band: np.ndarray, sigma: float, sizes: tuple[int, ...]) -> np.ndarray:
    """Window means from explicit windows over a mirrored copy of the subband."""
    estimates = []
    for size in sizes:
        r = size // 2
        padded = np.pad(band * band, r, mode="symmetric")
        means = sliding_window_view(padded, (size, size)).mean(axis=(-2, -1))
        estimates.append(np.maximum(means - sigma**2, 0))
    return np.min(estimates, axis=0)


@pytest.mark.parametrize("sizes", [(3,), (5,), (9,), (3, 5, 7, 9)])
def test_local_variance_matches_explicit_windows(sizes: tuple[int, ...]) -> None:
    band = np.random.default_rng(1).normal(0, 6, (13, 11))
    np.testing.assert_allclose(
        local_signal_variance(band, 4.0, sizes), brute_force_variance(band, 4.0, sizes), atol=1e-9
    )


@pytest.mark.parametrize(("window", "sizes"), [("min", (3, 5, 7, 9)), ("5x5", (5,))])
def test_the_wiener_filter_matches_an_independent_pipeline(
    window: str, sizes: tuple[int, ...]
) -> None:
    # 65 rows allow 3 levels of db4, so the level cap does not apply.
    plane = noisy_plane(65, 74)
    params = catalog_values("wavelet-wiener", window=window, levels=3)
    coeffs = pywt.wavedec2(plane, "db4", mode="symmetric", level=3)
    finest = coeffs[-1][2]
    sigma = np.median(np.abs(finest[finest != 0])) / NORMAL_Q75
    filtered = [coeffs[0]]
    for level in coeffs[1:]:
        bands = []
        for band in level:
            variance = brute_force_variance(band, sigma, sizes)
            bands.append(band * variance / (variance + sigma**2))
        filtered.append(tuple(bands))
    expected = pywt.waverec2(filtered, "db4", mode="symmetric")[:65, :74]
    np.testing.assert_allclose(wavelet_wiener_plane(plane, params), expected, atol=1e-9)


def test_the_gains_stay_between_0_and_1() -> None:
    variance = np.array([0.0, 1.0, 100.0, 1e6])
    gains = wiener_gain(variance, 5.0)
    assert np.all((gains >= 0) & (gains <= 1))
    assert gains[0] == 0
    np.testing.assert_array_equal(wiener_gain(variance, 0.0), np.ones(4))


def test_a_flat_plane_stays_flat_with_both_filters() -> None:
    plane = np.full((40, 40), 90.0)
    for out in (
        wavelet_wiener_plane(plane, catalog_values("wavelet-wiener")),
        swt_denoise_plane_default(plane),
    ):
        np.testing.assert_allclose(out, plane, atol=1e-9)


def swt_denoise_plane_default(plane: np.ndarray) -> np.ndarray:
    return stationary_plane(plane, catalog_values("swt-denoise"))


# The filters through the engine API ---------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


@pytest.mark.parametrize(
    ("filter_id", "function", "values"),
    [
        ("swt-denoise", swt_denoise, {"levels": 2}),
        ("swt-denoise", swt_denoise, {"transform": "cycle-spinning", "shifts": 2}),
        ("wavelet-wiener", wavelet_wiener, {"window": "3x3", "levels": 2}),
    ],
)
def test_the_engine_runs_the_filters(
    client: TestClient, filter_id: str, function: Any, values: dict[str, Any]
) -> None:
    rng = np.random.default_rng(4)
    image = rng.integers(40, 220, (26, 34, 4)).astype(np.uint8)
    height, width = image.shape[:2]
    upload = client.post(
        f"{API}/images",
        params={"width": width, "height": height},
        content=image.tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    job = client.post(
        f"{API}/jobs", json={"filter": filter_id, "image": upload.json()["id"], "params": values}
    )
    assert job.status_code == 202, job.text
    job_id = job.json()["id"]
    state = "queued"
    for _ in range(600):
        state = client.get(f"{API}/jobs/{job_id}").json()["state"]
        if state in ("done", "failed"):
            break
        time.sleep(0.05)
    assert state == "done"
    result = client.get(f"{API}/jobs/{job_id}/result")
    pixels = np.frombuffer(result.content, dtype=np.uint8).reshape(height, width, 4)
    expected = function(image, catalog_values(filter_id, **values), lambda _: None)
    np.testing.assert_array_equal(pixels, expected)


@pytest.mark.parametrize(
    ("filter_id", "values", "names"),
    [
        (
            "swt-denoise",
            {},
            ["Analysis", "Filter taps", "Noise level", "Threshold", "Shrink", "Synthesis"],
        ),
        (
            "swt-denoise",
            {"transform": "cycle-spinning"},
            ["Shift", "Analysis", "Filter taps", "Noise level", "Threshold", "Shrink", "Average"],
        ),
        (
            "wavelet-wiener",
            {},
            [
                "Analysis",
                "Filter taps",
                "Noise level",
                "Local variance",
                "Wiener gain",
                "Synthesis",
            ],
        ),
    ],
)
def test_the_representations_list_their_stages(
    client: TestClient, filter_id: str, values: dict[str, Any], names: list[str]
) -> None:
    response = client.post(f"{API}/filters/{filter_id}/representation", json=values)
    assert response.status_code == 200, response.text
    assert [stage["name"] for stage in response.json()["stages"]] == names
