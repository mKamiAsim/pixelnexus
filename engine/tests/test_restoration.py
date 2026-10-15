"""Regularized and blind deconvolution: the PSFs match the browser references, total variation
and FISTA reach the minimum of their energies, and blind Richardson-Lucy keeps its PSF valid."""

from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
import pywt
import scipy.fft
from fastapi.testclient import TestClient
from scipy import ndimage, optimize

from fixtures_filters import disk_kernel as reference_disk
from fixtures_filters import motion_kernel as reference_motion
from fixtures_frequency import margin, next_fast
from fixtures_restoration import gaussian_psf as reference_gaussian
from fixtures_restoration import transfer as reference_transfer
from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.restoration import (
    blind_deconv,
    blind_rl,
    centered_grid,
    divergence,
    fista,
    gradient,
    image_step,
    psf_picture,
    psf_step,
    sparse_energy,
    sparse_fista,
    sparse_fista_plane,
    support_mask,
    tv_deblur,
    tv_deblur_plane,
    tv_deconvolve,
    tv_energy,
    wavelet_prox,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.psf import (
    convolve,
    disk_kernel,
    extend,
    gaussian_kernel,
    motion_kernel,
    transfer,
)
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

API = "/api/v1"
CATALOG = find_catalog()


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def blurred_disk(size: int = 64, noise: float = 0.0, seed: int = 3) -> tuple[np.ndarray, ...]:
    y, x = np.mgrid[0:size, 0:size]
    clean = np.where((x - size / 2) ** 2 + (y - size / 2.5) ** 2 < (size / 4) ** 2, 200.0, 50.0)
    clean = np.where(np.abs(x - 0.5 * y - size / 6) < 1.5, 120.0, clean)
    blurred = ndimage.convolve(clean, gaussian_kernel(1.5), mode="reflect")
    return clean, blurred + np.random.default_rng(seed).normal(0, noise, clean.shape)


def psnr(image: np.ndarray, clean: np.ndarray) -> float:
    return float(10 * np.log10(255**2 / np.mean((image - clean) ** 2)))


# PSFs and the grid ----------------------------------------------------------------------------


@pytest.mark.parametrize("sigma", [0.3, 1, 2.5, 7])
def test_the_gaussian_psf_matches_the_reference(sigma: float) -> None:
    np.testing.assert_allclose(gaussian_kernel(sigma), reference_gaussian(sigma), atol=1e-15)


@pytest.mark.parametrize(("length", "angle"), [(1, 0), (9, 0), (9, 30), (12.5, 90), (21, 135)])
def test_the_motion_psf_matches_the_reference(length: float, angle: float) -> None:
    np.testing.assert_allclose(
        motion_kernel(length, angle), reference_motion(length, angle), atol=1e-15
    )


@pytest.mark.parametrize("radius", [0.5, 1.3, 3, 7.7])
def test_the_defocus_psf_matches_the_reference(radius: float) -> None:
    """Closed-form areas here, numerical integration in the reference."""
    np.testing.assert_allclose(disk_kernel(radius), reference_disk(radius), atol=1e-10)


@pytest.mark.parametrize("shape", [(10, 13), (64, 64), (101, 77), (700, 300)])
def test_the_grid_matches_the_browser_frequency_grid(shape: tuple[int, int]) -> None:
    extended, (top, left) = extend(np.zeros(shape), "reflect")
    assert (top, left) == (margin(shape[0]), margin(shape[1]))
    assert extended.shape == (
        next_fast(shape[0] + 2 * margin(shape[0])),
        next_fast(shape[1] + 2 * margin(shape[1])),
    )


def test_the_transfer_function_matches_the_reference() -> None:
    kernel = motion_kernel(9, 30)
    np.testing.assert_allclose(
        transfer(kernel, (48, 54)), reference_transfer(kernel, 54, 48), atol=1e-12
    )


# Total variation ------------------------------------------------------------------------------


def test_divergence_is_the_negative_adjoint_of_the_gradient() -> None:
    rng = np.random.default_rng(0)
    f = rng.random((12, 17))
    px, py = rng.random((12, 17)), rng.random((12, 17))
    gx, gy = gradient(f)
    assert np.sum(gx * px + gy * py) == pytest.approx(-np.sum(f * divergence(px, py)), rel=1e-12)


def test_total_variation_reaches_the_minimum_of_its_energy() -> None:
    """Chambolle-Pock against L-BFGS on the same energy with a slightly smoothed TV."""
    _, g = blurred_disk(24, noise=5)
    h = transfer(gaussian_kernel(1.5), g.shape)
    lam = 4.0
    ours = tv_deconvolve(g, h, lam, 3000)

    def smoothed(values: np.ndarray) -> tuple[float, np.ndarray]:
        f = values.reshape(g.shape)
        residual = convolve(f, h) - g
        gx, gy = gradient(f)
        length = np.sqrt(gx**2 + gy**2 + 1e-6)
        energy = 0.5 * np.sum(residual**2) + lam * np.sum(length)
        grad = convolve(residual, h, adjoint=True) - lam * divergence(gx / length, gy / length)
        return float(energy), grad.ravel()

    other = optimize.minimize(
        smoothed, g.ravel(), jac=True, method="L-BFGS-B", options={"maxiter": 20000, "gtol": 1e-9}
    ).x.reshape(g.shape)
    ours_energy, other_energy = tv_energy(ours, g, h, lam), tv_energy(other, g, h, lam)
    assert ours_energy <= other_energy * (1 + 1e-4)
    assert ours_energy == pytest.approx(other_energy, rel=1e-3)
    assert tv_energy(ours, g, h, lam) < tv_energy(g, g, h, lam)


def test_total_variation_with_lambda_0_keeps_the_dual_field_at_0() -> None:
    """With lambda 0 only the data term is left, and each step is its proximal map."""
    _, g = blurred_disk(32)
    h = transfer(gaussian_kernel(1.5), g.shape)
    tau = 1 / np.sqrt(8)
    expected = g.copy()
    for _ in range(3):
        expected = scipy.fft.ifft2(
            (scipy.fft.fft2(expected) + tau * np.conj(h) * scipy.fft.fft2(g))
            / (1 + tau * np.abs(h) ** 2)
        ).real
    np.testing.assert_allclose(tv_deconvolve(g, h, 0.0, 3), expected, atol=1e-9)


def test_total_variation_restores_a_blurred_noisy_image() -> None:
    clean, g = blurred_disk(64, noise=5)
    params = catalog_values("tv-deblur", sigma=1.5)
    assert psnr(tv_deblur_plane(g, params), clean) > psnr(g, clean) + 2.5


# Sparse wavelet prior -------------------------------------------------------------------------


@pytest.mark.parametrize("wavelet", ["haar", "db4", "sym8"])
def test_the_wavelet_transform_is_orthogonal(wavelet: str) -> None:
    f = np.random.default_rng(1).random((64, 96))
    coeffs = pywt.wavedec2(f, wavelet, mode="periodization", level=3)
    energy = sum(np.sum(c**2) for c in [coeffs[0], *(b for d in coeffs[1:] for b in d)])
    assert energy == pytest.approx(np.sum(f**2), rel=1e-12)
    np.testing.assert_allclose(wavelet_prox(f, wavelet, 3, 0.0), f, atol=1e-10)


def ista(g: np.ndarray, h: np.ndarray, lam: float, wavelet: str, iterations: int) -> np.ndarray:
    """Plain iterative shrinkage, written with pywt.threshold."""
    x = g.copy()
    for _ in range(iterations):
        z = x - convolve(convolve(x, h) - g, h, adjoint=True)
        coeffs = pywt.wavedec2(z, wavelet, mode="periodization", level=2)
        coeffs = [coeffs[0]] + [
            tuple(pywt.threshold(b, lam, mode="soft") for b in d) for d in coeffs[1:]
        ]
        x = pywt.waverec2(coeffs, wavelet, mode="periodization")
    return x


def test_fista_reaches_the_minimum_found_by_plain_iterative_shrinkage() -> None:
    _, blurred = blurred_disk(32, noise=5)
    g, _ = extend(blurred, "reflect", 4)
    h = transfer(gaussian_kernel(1.5), g.shape)
    lam = 2.0
    ours = fista(g, h, lam, "db2", 2, 600)
    reference = ista(g, h, lam, "db2", 6000)
    ours_energy = sparse_energy(ours, g, h, lam, "db2", 2)
    reference_energy = sparse_energy(reference, g, h, lam, "db2", 2)
    assert ours_energy <= reference_energy * (1 + 1e-4)
    assert ours_energy == pytest.approx(reference_energy, rel=1e-3)


def test_one_fista_step_is_a_gradient_step_and_a_soft_threshold() -> None:
    _, blurred = blurred_disk(32, noise=5)
    g, _ = extend(blurred, "reflect", 4)
    h = transfer(motion_kernel(7, 30), g.shape)
    np.testing.assert_allclose(fista(g, h, 3.0, "sym4", 2, 1), ista(g, h, 3.0, "sym4", 1))


def test_sparse_regularization_restores_a_blurred_noisy_image() -> None:
    clean, g = blurred_disk(64, noise=5)
    params = catalog_values("sparse-fista", sigma=1.5)
    assert psnr(sparse_fista_plane(g, params), clean) > psnr(g, clean) + 1.5


# Blind Richardson-Lucy -------------------------------------------------------------------------


def test_the_true_image_and_psf_are_fixed_points() -> None:
    """Without noise, the sharp image and the true PSF fit the photo exactly, so neither step
    changes them."""
    clean, _ = blurred_disk(48)
    truth = centered_grid(gaussian_kernel(1.5), clean.shape)
    h_hat = scipy.fft.fft2(truth)
    g = scipy.fft.ifft2(h_hat * scipy.fft.fft2(clean)).real
    support = support_mask(clean.shape, 7)
    f_hat = scipy.fft.fft2(clean)
    np.testing.assert_allclose(
        psf_step(truth, f_hat, float(clean.sum()), g, support), truth, atol=1e-12
    )
    np.testing.assert_allclose(image_step(clean, h_hat, g), clean, atol=1e-9)


def test_the_image_step_is_a_richardson_lucy_step() -> None:
    _, g = blurred_disk(40)
    h = transfer(gaussian_kernel(1.5), g.shape)
    f = g * 0.9 + 10
    expected = f * convolve(g / np.maximum(convolve(f, h), 1e-12), h, adjoint=True)
    np.testing.assert_allclose(image_step(f, h, g), expected, atol=1e-9)


def test_the_psf_stays_valid_and_moves_toward_the_true_blur() -> None:
    _, blurred = blurred_disk(64, noise=1)
    g, _ = extend(blurred, "reflect")
    truth = centered_grid(gaussian_kernel(1.5), g.shape)
    start = centered_grid(gaussian_kernel(3), g.shape) * support_mask(g.shape, 6)
    start /= start.sum()
    _, h = blind_rl(g, start, 6, 40, 5, 5)
    assert h.min() >= 0
    assert h.sum() == pytest.approx(1, abs=1e-12)
    assert np.all(h[support_mask(g.shape, 6) == 0] == 0)
    assert np.abs(h - truth).sum() < 0.7 * np.abs(start - truth).sum()


def test_show_psf_draws_the_kernel_in_the_middle() -> None:
    shape = (60, 80)
    h = centered_grid(gaussian_kernel(1), (40, 40)) * support_mask((40, 40), 3)
    h /= h.sum()
    picture = psf_picture(h, 3, shape)
    block = min(shape) // 14
    assert picture.max() == pytest.approx(255)
    assert picture[shape[0] // 2, shape[1] // 2] == pytest.approx(255)
    assert np.count_nonzero(picture) == (7 * block) ** 2


# The filters through the engine API -----------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


@pytest.mark.parametrize(
    ("filter_id", "function", "values"),
    [
        ("tv-deblur", tv_deblur, {"iterations": 20, "psf": "motion"}),
        ("sparse-fista", sparse_fista, {"iterations": 20, "channelScope": "luminance"}),
        ("blind-deconv", blind_deconv, {"cycles": 2}),
        ("blind-deconv", blind_deconv, {"cycles": 2, "output": "psf", "support": 3}),
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
        ("tv-deblur", ["PSF", "Energy", "Dual step", "Primal step"]),
        ("sparse-fista", ["PSF", "Energy", "Gradient step", "Shrink", "Momentum"]),
        ("blind-deconv", ["Start", "PSF steps", "Image steps", "Cycles"]),
    ],
)
def test_the_representations(client: TestClient, filter_id: str, names: list[str]) -> None:
    stages = client.post(f"{API}/filters/{filter_id}/representation", json={}).json()
    assert [s["name"] for s in stages["stages"]] == names
