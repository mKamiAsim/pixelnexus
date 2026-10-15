"""The steerable pyramid filter: the masks pyrtools uses match the Inspector formula, steering,
exact rebuilds, the noise level of each band, and the filter through the engine API."""

from __future__ import annotations

import itertools
import math
import subprocess
import sys
import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.directional import line_angle_to_frequency
from pixelnexus_engine.filters.steerable import (
    angular_scale,
    band_noise,
    band_plane,
    build,
    denoise_plane,
    extend,
    steer,
    steerable_pyramid,
    steered_band,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

API = "/api/v1"
CATALOG = find_catalog()
ID = "steerable-pyramid"
ORIENTATIONS = [2, 4, 6, 8]


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == ID)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def radial_h(r: np.ndarray) -> np.ndarray:
    """H(r) = cos(pi/2 log2 r) for 1/2 <= r <= 1, 0 below and 1 above."""
    with np.errstate(divide="ignore"):
        inside = np.cos(np.pi / 2 * np.log2(np.clip(r, 0.5, 1.0)))
    return np.where(r >= 1, 1.0, np.where(r <= 0.5, 0.0, inside))


def angular_g(theta: np.ndarray, b: int, orientations: int) -> np.ndarray:
    k = orientations - 1
    return angular_scale(orientations) * np.cos(theta - np.pi * b / orientations) ** k


def grid(size: int, crop: int) -> tuple[np.ndarray, np.ndarray]:
    """Frequency radius and angle on the centered grid pyrtools uses, cropped to `crop` points
    around the center. The radius is 1 at the Nyquist frequency."""
    ramp = np.linspace(-1, 1, size + 1)[:-1]
    start = size // 2 - crop // 2
    part = ramp[start : start + crop]
    x, y = np.meshgrid(part, part)
    return np.hypot(x, y), np.arctan2(y, x)


# The masks ----------------------------------------------------------------------------------


@pytest.mark.parametrize("orientations", ORIENTATIONS)
def test_the_squares_of_the_angular_masks_add_up_to_1(orientations: int) -> None:
    theta = np.linspace(-np.pi, np.pi, 721)
    total = sum(angular_g(theta, b, orientations) ** 2 for b in range(orientations))
    np.testing.assert_allclose(total, 1, atol=1e-12)


@pytest.mark.parametrize("orientations", ORIENTATIONS)
def test_pyrtools_uses_the_masks_of_the_formula(orientations: int) -> None:
    """The Inspector formula against the masks pyrtools built. pyrtools reads them from lookup
    tables, so they agree to about 1e-3."""
    size, levels = 64, 3
    pyramid = build(np.zeros((size, size)), levels, orientations)
    r, theta = grid(size, size)
    center = (size // 2, size // 2)
    expected = radial_h(r)
    expected[center] = pyramid._hi0mask[center]  # pyrtools copies a neighbor into the center
    np.testing.assert_allclose(pyramid._hi0mask, expected, atol=2e-3)
    for j in range(levels):
        r, theta = grid(size, size >> j)
        himask = radial_h(2 ** (j + 1) * r)
        keep = r > 0
        np.testing.assert_allclose(pyramid._himasks[j][keep], himask[keep], atol=2e-3)
        for b in range(orientations):
            np.testing.assert_allclose(
                pyramid._anglemasks[j][b][keep], angular_g(theta, b, orientations)[keep], atol=3e-3
            )


# Steering -----------------------------------------------------------------------------------


@pytest.mark.parametrize("orientations", ORIENTATIONS)
def test_steering_mixes_the_angular_masks_into_a_rotated_mask(orientations: int) -> None:
    """With the weights of pyrtools steer, the K + 1 masks add up to the mask turned to phi."""
    theta = np.linspace(-np.pi, np.pi, 361)
    basis = np.stack([angular_g(theta, b, orientations) for b in range(orientations)], axis=1)
    for phi in (0.0, 0.3, 1.0, 2.5):
        steered = steer(basis, phi).ravel()
        rotated = angular_scale(orientations) * np.cos(theta - phi) ** (orientations - 1)
        np.testing.assert_allclose(steered, rotated, atol=1e-9)


@pytest.mark.parametrize("orientations", ORIENTATIONS)
def test_steering_to_the_angle_of_a_band_gives_that_band(orientations: int) -> None:
    image = np.random.default_rng(1).random((64, 64)) * 255
    pyramid = build(image, 2, orientations)
    for level, b in itertools.product(range(2), range(orientations)):
        band = pyramid.pyr_coeffs[(level, b)]
        steered = steered_band(pyramid, level, np.pi * b / orientations)
        np.testing.assert_allclose(steered, band, atol=1e-9 * np.abs(band).max())


def stripes(degrees: float, size: int = 96, period: float = 6) -> np.ndarray:
    """Stripes whose lines run at an angle, counterclockwise on screen, with rows growing down."""
    y, x = np.mgrid[0:size, 0:size].astype(float)
    a = np.radians(degrees)
    return 128 + 60 * np.sin(2 * np.pi * (x * np.sin(a) + y * np.cos(a)) / period)


@pytest.mark.parametrize("angle", [0, 30, 45, 90, 135, 160])
def test_a_band_steered_to_the_line_angle_responds_to_those_lines(angle: float) -> None:
    pyramid = build(stripes(angle), 2, 4)
    along = steered_band(pyramid, 0, line_angle_to_frequency(angle))
    across = steered_band(pyramid, 0, line_angle_to_frequency(angle + 90))
    # Most stripes do not repeat across the image, so the pyramid, which wraps around, sees
    # edges at the border. Compare inside.
    inside = (slice(16, -16), slice(16, -16))
    assert np.abs(across[inside]).max() < 0.01 * np.abs(along[inside]).max()


@pytest.mark.parametrize("level", [1, 2, 3])
def test_show_one_band_puts_sample_k_on_pixel_2_to_the_j_times_k(level: int) -> None:
    image = np.random.default_rng(2).random((45, 58)) * 255
    params = catalog_values(output="band", levels=3, level=level, direction=30)
    shown = band_plane(image, params)
    extended, (top, left) = extend(image, "reflect", 3)
    pyramid = build(extended, 3, 4)
    band = steered_band(pyramid, level - 1, line_angle_to_frequency(30))
    step = 2 ** (level - 1)
    rows = np.arange(-top % step, image.shape[0], step)
    columns = np.arange(-left % step, image.shape[1], step)
    samples = band[np.ix_((rows + top) // step, (columns + left) // step)]
    cut = shown[np.ix_(rows, columns)]
    peak = (shown - 128).__abs__().max()
    np.testing.assert_allclose(cut - 128, samples * (peak / np.abs(samples).max()), atol=1e-6)
    assert peak == pytest.approx(127)


def test_show_one_band_of_a_flat_image_is_mid_gray() -> None:
    shown = band_plane(np.full((40, 40), 90.0), catalog_values(output="band"))
    np.testing.assert_allclose(shown, 128, atol=1e-9)


# Rebuild and noise ----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("border", "shape", "orientations"),
    list(itertools.product(["reflect", "wrap", "constant"], [(53, 71), (40, 90)], ["2", "6"])),
)
def test_a_zero_threshold_gives_the_image_back(
    border: str, shape: tuple[int, int], orientations: str
) -> None:
    """Exact up to the lookup tables of pyrtools, about 1e-5 of the range."""
    image = np.random.default_rng(0).random(shape) * 255
    params = catalog_values(factor=0, border=border, orientations=orientations)
    np.testing.assert_allclose(denoise_plane(image, params), image, atol=255 * 2e-5)


def test_extend_reaches_a_multiple_of_2_to_the_j() -> None:
    for shape, levels in (((53, 71), 3), ((7, 9), 6), ((100, 40), 1)):
        extended, (top, left) = extend(np.zeros(shape), "reflect", levels)
        assert all(side % 2**levels == 0 for side in extended.shape)
        assert top == math.ceil(shape[0] / 2) and left == math.ceil(shape[1] / 2)


@pytest.mark.parametrize("orientations", [2, 4])
def test_the_noise_level_of_a_band_follows_its_filter(orientations: int) -> None:
    """White noise of sigma gives band coefficients of sigma times the norm of the band filter,
    measured from the pyramid of a single bright pixel."""
    noise = np.random.default_rng(7).normal(0, 10, (128, 160))
    pyramid = build(noise, 3, orientations)
    for key, level in band_noise((128, 160), 3, orientations).items():
        assert pyramid.pyr_coeffs[key].std() == pytest.approx(10 * level, rel=0.08), key


def test_removing_noise_raises_the_psnr() -> None:
    y, x = np.mgrid[0:96, 0:96]
    clean = np.where((x - 48) ** 2 + (y - 40) ** 2 < 600, 200.0, 60.0)
    clean = np.where(np.abs(x - 0.6 * y - 20) < 1.5, 140.0, clean)
    noisy = clean + np.random.default_rng(3).normal(0, 20, clean.shape)

    def psnr(image: np.ndarray) -> float:
        return float(10 * np.log10(255**2 / np.mean((image - clean) ** 2)))

    assert psnr(denoise_plane(noisy, catalog_values())) > psnr(noisy) + 6
    # A given sigma near the true one does about as well as the estimate.
    given = denoise_plane(noisy, catalog_values(sigma=20))
    assert psnr(given) > psnr(noisy) + 6


def test_without_pyrtools_the_filter_is_not_registered() -> None:
    code = (
        "import sys; sys.modules['pyrtools'] = None; "
        "import pixelnexus_engine.filters; "
        "from pixelnexus_engine.registry import FILTERS; "
        "assert 'steerable-pyramid' not in FILTERS; assert 'wavelet-threshold' in FILTERS"
    )
    subprocess.run([sys.executable, "-c", code], check=True)


# The filter through the engine API ----------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


def test_the_engine_lists_the_filter_as_available(client: TestClient) -> None:
    entry = client.get(f"{API}/filters/{ID}").json()
    assert entry["available"] is True


@pytest.mark.parametrize(
    "values",
    [
        {"levels": 2, "channelScope": "rgb"},
        {"output": "band", "level": 2, "direction": 60},
    ],
)
def test_the_engine_runs_the_filter(client: TestClient, values: dict[str, Any]) -> None:
    image = np.random.default_rng(4).integers(40, 220, (22, 30, 4)).astype(np.uint8)
    height, width = image.shape[:2]
    upload = client.post(
        f"{API}/images",
        params={"width": width, "height": height},
        content=image.tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    job = client.post(
        f"{API}/jobs", json={"filter": ID, "image": upload.json()["id"], "params": values}
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
    expected = steerable_pyramid(image, catalog_values(**values), lambda _: None)
    np.testing.assert_array_equal(pixels, expected)
    np.testing.assert_array_equal(pixels[..., 3], image[..., 3])


def test_the_representations(client: TestClient) -> None:
    denoise = client.post(f"{API}/filters/{ID}/representation", json={}).json()
    assert [s["name"] for s in denoise["stages"]] == [
        "Fourier transform",
        "Radial masks",
        "Angular masks",
        "Noise per band",
        "Shrink",
        "Rebuild",
    ]
    assert "0.8944" in denoise["stages"][2]["formula"]  # alpha_3 = sqrt(4^3 3!^2 / (4 6!))
    band = client.post(f"{API}/filters/{ID}/representation", json={"output": "band"}).json()
    assert band["stages"][-1]["name"] == "Steer"
