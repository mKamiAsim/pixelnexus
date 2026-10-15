"""Plug-and-play ADMM and RED: with denoisers whose exact answer is known, both reach that
answer. The denoisers match the filters they name, and the filters run through the API."""

from __future__ import annotations

import math
import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
import scipy.fft
from fastapi.testclient import TestClient
from scipy import ndimage
from skimage.restoration import denoise_nl_means

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.plugplay import (
    data_solve,
    denoise,
    pnp_admm,
    pnp_admm_filter,
    pnp_plane,
    red_filter,
    red_fixed_point,
    red_plane,
)
from pixelnexus_engine.filters.wavelets import stationary_plane, wavelet_threshold_plane
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.psf import gaussian_kernel, motion_kernel, transfer
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

API = "/api/v1"
CATALOG = find_catalog()


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def blurred_disk(size: int = 64, noise: float = 5.0) -> tuple[np.ndarray, np.ndarray]:
    y, x = np.mgrid[0:size, 0:size]
    clean = np.where((x - size / 2) ** 2 + (y - size / 2.5) ** 2 < (size / 4) ** 2, 200.0, 50.0)
    blurred = ndimage.convolve(clean, gaussian_kernel(1.5), mode="reflect")
    return clean, blurred + np.random.default_rng(3).normal(0, noise, clean.shape)


def psnr(image: np.ndarray, clean: np.ndarray) -> float:
    return float(10 * np.log10(255**2 / np.mean((image - clean) ** 2)))


# Denoisers and the data step ------------------------------------------------------------------


def test_the_wavelet_denoisers_are_the_wavelet_filters_with_a_given_sigma() -> None:
    plane = np.random.default_rng(0).random((40, 52)) * 255
    params = {
        "wavelet": "sym4",
        "levels": 3,
        "rule": "bayesshrink",
        "mode": "soft",
        "threshold": 0,
        "border": "reflect",
        "sigma": 7.0,
    }
    np.testing.assert_array_equal(
        denoise(plane, "wavelet", 7.0), wavelet_threshold_plane(plane, params)
    )
    np.testing.assert_array_equal(
        denoise(plane, "stationary", 7.0), stationary_plane(plane, params)
    )


def test_non_local_means_uses_the_scikit_image_example_settings() -> None:
    plane = np.random.default_rng(1).random((30, 30)) * 255
    expected = denoise_nl_means(
        plane, h=0.8 * 6, sigma=6, patch_size=5, patch_distance=6, fast_mode=True
    )
    np.testing.assert_array_equal(denoise(plane, "nlm", 6.0), expected)


@pytest.mark.parametrize("kind", ["wavelet", "stationary", "nlm"])
def test_a_sigma_of_0_leaves_the_plane(kind: str) -> None:
    plane = np.random.default_rng(2).random((20, 24))
    assert denoise(plane, kind, 0.0) is plane


def test_the_data_step_solves_its_linear_system() -> None:
    rng = np.random.default_rng(3)
    n = rng.random((24, 30))
    h = transfer(motion_kernel(7, 30), n.shape)
    x = data_solve(scipy.fft.fft2(n), h, 0.3)
    applied = scipy.fft.ifft2((np.abs(h) ** 2 + 0.3) * scipy.fft.fft2(x)).real
    np.testing.assert_allclose(applied, n, atol=1e-10)


# Known answers ----------------------------------------------------------------------------------


def test_admm_with_the_proximal_map_of_a_quadratic_prior_reaches_the_tikhonov_answer() -> None:
    """With D(z) = z / (1 + sigma^2), the exact proximal map of 1/2 ||x||^2 with weight
    lambda / rho = sigma^2, ADMM must solve min 1/2 ||h * x - g||^2 + lambda / 2 ||x||^2."""
    _, g = blurred_disk(32)
    h = transfer(gaussian_kernel(1.5), g.shape)
    lam = 0.05
    result = pnp_admm(g, h, lam, 0.2, 1.0, 400, lambda z, s: z / (1 + s * s))
    exact = data_solve(np.conj(h) * scipy.fft.fft2(g), h, lam)
    np.testing.assert_allclose(result, exact, atol=1e-6)


def test_red_with_a_symmetric_linear_denoiser_reaches_the_minimum_of_its_energy() -> None:
    """With D(x) = w * x for a symmetric blur w, the RED energy is quadratic and its minimum
    solves (H^T H / sigma_n^2 + lambda (1 - W)) x = H^T g / sigma_n^2 exactly."""
    _, g = blurred_disk(32)
    h = transfer(gaussian_kernel(1.5), g.shape)
    w = transfer(gaussian_kernel(1.0), g.shape).real
    noise, lam = 5.0, 0.02

    def smooth(x: np.ndarray, _sigma: float) -> np.ndarray:
        return np.asarray(scipy.fft.ifft2(w * scipy.fft.fft2(x)).real)

    result = red_fixed_point(g, h, lam, noise, 1.0, 3000, smooth)
    exact = scipy.fft.ifft2(
        np.conj(h) * scipy.fft.fft2(g) / noise**2 / (np.abs(h) ** 2 / noise**2 + lam * (1 - w))
    ).real
    np.testing.assert_allclose(result, exact, atol=1e-4)


def test_admm_hands_the_denoiser_sigma_sqrt_lambda_over_rho() -> None:
    _, g = blurred_disk(16)
    h = transfer(gaussian_kernel(1.0), g.shape)
    seen: list[float] = []

    def spy(z: np.ndarray, sigma: float) -> np.ndarray:
        seen.append(sigma)
        return z

    pnp_admm(g, h, 8.0, 0.5, 1.1, 3, spy)
    expected = [math.sqrt(8 / (0.5 * 1.1**k)) for k in range(3)]
    assert seen == pytest.approx(expected, rel=1e-12)


@pytest.mark.parametrize("function", [pnp_plane, red_plane])
def test_the_defaults_restore_a_blurred_noisy_image(function: Any) -> None:
    clean, g = blurred_disk(64)
    filter_id = "pnp-admm" if function is pnp_plane else "red"
    restored = function(g, catalog_values(filter_id, sigma=1.5))
    assert psnr(restored, clean) > psnr(g, clean) + 1.2


# The filters through the engine API -----------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


@pytest.mark.parametrize(
    ("filter_id", "function", "values"),
    [
        ("pnp-admm", pnp_admm_filter, {"iterations": 3, "denoiser": "wavelet"}),
        ("pnp-admm", pnp_admm_filter, {"iterations": 2, "denoiser": "nlm", "gamma": 1.1}),
        ("red", red_filter, {"iterations": 3, "channelScope": "rgb"}),
    ],
)
def test_the_engine_runs_the_filters(
    client: TestClient, filter_id: str, function: Any, values: dict[str, Any]
) -> None:
    image = np.random.default_rng(4).integers(40, 220, (22, 30, 4)).astype(np.uint8)
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
    np.testing.assert_array_equal(pixels[..., 3], image[..., 3])


@pytest.mark.parametrize(
    ("filter_id", "names"),
    [
        ("pnp-admm", ["PSF", "Data step", "Denoiser step", "Dual update"]),
        ("red", ["PSF", "Energy", "Fixed-point step"]),
    ],
)
def test_the_representations(client: TestClient, filter_id: str, names: list[str]) -> None:
    stages = client.post(f"{API}/filters/{filter_id}/representation", json={}).json()
    assert [s["name"] for s in stages["stages"]] == names
