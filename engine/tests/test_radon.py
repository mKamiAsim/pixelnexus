"""Radon transform filters against exact projections, the Fourier slice theorem and an
independent ridgelet pipeline."""

from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
import pywt
from fastapi.testclient import TestClient
from skimage.transform import iradon, radon

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.radon import (
    back_project,
    projection_angles,
    radon_filter,
    radon_plane,
    ridgelet,
    ridgelet_plane,
    sinogram,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

API = "/api/v1"
CATALOG = find_catalog()
NORMAL_Q75 = 0.6744897501960817


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def disk(size: int, radius: float) -> np.ndarray:
    """A disk of value 1 around the rotation center, pixel size // 2, with 8 x 8 supersampling."""
    center = size // 2 + 0.5
    y, x = np.mgrid[0:size, 0:size]
    total = np.zeros((size, size))
    for dy in (np.arange(8) + 0.5) / 8:
        for dx in (np.arange(8) + 0.5) / 8:
            total += (x + dx - center) ** 2 + (y + dy - center) ** 2 <= radius**2
    return total / 64


def test_projections_of_a_disk_are_its_chord_lengths() -> None:
    radius = 30.0
    values, _ = sinogram(disk(96, radius), 12)
    t = np.arange(values.shape[0]) - values.shape[0] // 2
    chords = 2 * np.sqrt(np.maximum(radius**2 - t**2, 0))
    inside = np.abs(t) < radius - 2
    for column in range(values.shape[1]):
        assert np.abs(values[inside, column] - chords[inside]).max() < 0.5


def test_a_projection_at_0_degrees_is_a_slice_of_the_spectrum() -> None:
    """The Fourier slice theorem, exact at 0 degrees, where the projection sums the columns."""
    image = np.random.default_rng(0).random((48, 48))
    values, _ = sinogram(image, 4)
    pad = (values.shape[0] - 48) // 2
    projection = values[pad : pad + 48, 0]
    np.testing.assert_allclose(np.fft.fft(projection), np.fft.fft2(image)[0, :], rtol=0, atol=1e-9)


def test_filtered_back_projection_gives_a_smooth_image_back() -> None:
    y, x = np.mgrid[0:70, 0:90]
    image = 100 + 80 * np.exp(-((x - 40) ** 2 + (y - 30) ** 2) / 300)
    out = radon_plane(image, catalog_values("radon-filter", angles=180))
    assert out.shape == image.shape
    assert np.abs(out - image)[10:-10, 10:-10].max() < 2.0


def test_the_filter_matches_scikit_image_on_a_square() -> None:
    image = np.random.default_rng(2).random((40, 40)) * 255
    theta = projection_angles(60)
    expected = iradon(
        radon(image, theta, circle=False),
        theta,
        output_size=40,
        filter_name="hann",
        circle=False,
    )
    out = radon_plane(image, catalog_values("radon-filter", angles=60, window="hann"))
    np.testing.assert_allclose(out, expected, atol=1e-9)


def test_a_point_off_center_comes_back_in_place_in_a_wide_image() -> None:
    image = np.zeros((30, 70))
    image[8, 52] = 255
    out = radon_plane(image, catalog_values("radon-filter", angles=180))
    assert np.unravel_index(np.argmax(out), out.shape) == (8, 52)


def test_plain_back_projection_blurs_a_point_more_than_the_filtered_one() -> None:
    image = np.zeros((41, 41))
    image[20, 20] = 255
    values, offset = sinogram(image, 180)
    plain = back_project(values, image.shape, offset, None)
    filtered = back_project(values, image.shape, offset, "ramp")
    # Along a row away from the point, the plain back projection falls off like 1 / r.
    r = np.arange(4, 20)
    scaled = r * plain[20, 20 + r]
    assert np.all(np.diff(plain[20, 20:40]) < 0)
    assert scaled.max() / scaled.min() < 1.15
    # The ramp filter removes that tail.
    assert np.abs(filtered[20, 24:40]).max() / filtered[20, 20] < 0.02


def test_the_sinogram_output_is_stretched_to_the_image_size() -> None:
    image = np.zeros((50, 64))
    image[25, :] = 200  # a horizontal line
    out = radon_plane(image, catalog_values("radon-filter", output="sinogram", angles=90))
    assert out.shape == image.shape
    assert out.min() == pytest.approx(0) and out.max() == pytest.approx(255)
    # A horizontal line sums up at 90 degrees, the middle of the angles, across the image.
    assert abs(np.argmax(out.max(axis=0)) - 32) <= 1


def test_the_hann_window_lowers_noise_more_than_the_ramp() -> None:
    noise = np.random.default_rng(3).normal(128, 20, (48, 48))
    ramp = radon_plane(noise, catalog_values("radon-filter", window="ramp"))
    hann = radon_plane(noise, catalog_values("radon-filter", window="hann"))
    assert hann[8:-8, 8:-8].std() < ramp[8:-8, 8:-8].std()


# Ridgelet filtering -------------------------------------------------------------------------


def noisy_lines(size: int = 64) -> np.ndarray:
    y, x = np.mgrid[0:size, 0:size]
    clean = np.where(np.abs(x - 0.5 * y - 10) < 1.5, 200.0, 60.0)
    return clean + np.random.default_rng(5).normal(0, 15, clean.shape)


def test_a_zero_threshold_gives_the_radon_round_trip() -> None:
    image = noisy_lines()
    values, offset = sinogram(image, 90)
    expected = back_project(values, image.shape, offset, "ramp")
    out = ridgelet_plane(image, catalog_values("ridgelet", angles=90, factor=0))
    np.testing.assert_allclose(out, expected, atol=1e-9)


@pytest.mark.parametrize("mode", ["hard", "soft"])
def test_ridgelet_filtering_matches_an_independent_pipeline(mode: str) -> None:
    image = noisy_lines()
    theta = projection_angles(90)
    # The image is square already, so it needs no padding. Its projections are 91 samples
    # long, which allow 3 levels of db4.
    values = radon(image, theta, circle=False)
    rebuilt = np.zeros_like(values)
    for column in range(values.shape[1]):
        coeffs = pywt.wavedec(values[:, column], "db4", mode="symmetric", level=3)
        finest = np.abs(coeffs[-1][coeffs[-1] != 0])
        sigma = np.median(finest) / NORMAL_Q75 if finest.size else 0.0
        coeffs = [coeffs[0]] + [pywt.threshold(c, 3 * sigma, mode=mode) for c in coeffs[1:]]
        rebuilt[:, column] = pywt.waverec(coeffs, "db4", mode="symmetric")[: values.shape[0]]
    expected = iradon(rebuilt, theta, output_size=64, filter_name="ramp", circle=False)
    out = ridgelet_plane(image, catalog_values("ridgelet", angles=90, mode=mode, levels=3))
    np.testing.assert_allclose(out, expected, atol=1e-9)


# The filters through the engine API ---------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


@pytest.mark.parametrize(
    ("filter_id", "function", "values"),
    [
        ("radon-filter", radon_filter, {"angles": 30}),
        ("radon-filter", radon_filter, {"angles": 30, "output": "sinogram"}),
        ("ridgelet", ridgelet, {"angles": 30, "levels": 2}),
    ],
)
def test_the_engine_runs_the_filters(
    client: TestClient, filter_id: str, function: Any, values: dict[str, Any]
) -> None:
    image = np.random.default_rng(4).integers(40, 220, (20, 28, 4)).astype(np.uint8)
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
    if values.get("output") == "sinogram":
        # Brightness only: a derived result is gray.
        np.testing.assert_array_equal(pixels[..., 0], pixels[..., 1])


@pytest.mark.parametrize(
    ("filter_id", "values", "names"),
    [
        ("radon-filter", {}, ["Radon transform", "Ramp filter", "Back projection"]),
        ("radon-filter", {"output": "sinogram"}, ["Radon transform", "Show the sinogram"]),
        (
            "ridgelet",
            {},
            ["Radon transform", "1-D wavelet transform", "Threshold", "Shrink", "Rebuild"],
        ),
    ],
)
def test_the_representations_list_their_stages(
    client: TestClient, filter_id: str, values: dict[str, Any], names: list[str]
) -> None:
    response = client.post(f"{API}/filters/{filter_id}/representation", json=values)
    assert response.status_code == 200, response.text
    assert [stage["name"] for stage in response.json()["stages"]] == names
