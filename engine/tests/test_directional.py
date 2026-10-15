"""The directional filters: an exact partition of 1, exact rebuilds, orientation selection
and the noise level of each tile."""

from __future__ import annotations

import itertools
import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
import scipy.fft
from fastapi.testclient import TestClient

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.directional import (
    BANKS,
    directional_curvelet,
    directional_plane,
    directional_shearlet,
    frequency_grid,
    meyer_nu,
    symmetric_nyquist,
    tile_rms,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

API = "/api/v1"
CATALOG = find_catalog()
IDS = {"curvelet": "directional-curvelet", "shearlet": "directional-shearlet"}


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def test_meyer_polynomial_pairs_add_up_to_1() -> None:
    x = np.linspace(0, 1, 101)
    np.testing.assert_allclose(meyer_nu(x) + meyer_nu(1 - x), 1, atol=1e-12)
    assert meyer_nu(np.array([0.0]))[0] == 0 and meyer_nu(np.array([1.0]))[0] == 1


@pytest.mark.parametrize(
    ("bank", "scales", "directions", "shape"),
    list(itertools.product(BANKS, [2, 4], [8, 32], [(64, 90), (61, 77)])),
)
def test_the_squares_of_the_masks_add_up_to_1(
    bank: str, scales: int, directions: int, shape: tuple[int, int]
) -> None:
    fx, fy = frequency_grid(*shape)
    tiles = symmetric_nyquist(BANKS[bank](fx, fy, scales, directions), shape[1])
    total = sum(tile.mask**2 for tile in tiles)
    np.testing.assert_allclose(total, 1, atol=1e-12)
    assert all(tile.mask.min() >= 0 for tile in tiles)


@pytest.mark.parametrize("bank", BANKS)
def test_the_masks_agree_at_opposite_frequencies(bank: str) -> None:
    """fy and -fy on the columns that rfft2 keeps for both signs of fx, so results are real."""
    fx, fy = frequency_grid(64, 90)
    rows = (-np.arange(64)) % 64
    for tile in symmetric_nyquist(BANKS[bank](fx, fy, 3, 16), 90):
        np.testing.assert_allclose(tile.mask[:, 0], tile.mask[rows, 0], atol=1e-12)
        np.testing.assert_allclose(tile.mask[:, -1], tile.mask[rows, -1], atol=1e-12)


@pytest.mark.parametrize(
    ("bank", "border", "shape"),
    list(itertools.product(BANKS, ["reflect", "wrap", "constant"], [(53, 71), (40, 90)])),
)
def test_a_zero_threshold_gives_the_image_back(
    bank: str, border: str, shape: tuple[int, int]
) -> None:
    image = np.random.default_rng(0).random(shape) * 255
    params = catalog_values(IDS[bank], factor=0, border=border)
    np.testing.assert_allclose(directional_plane(image, params, bank), image, atol=1e-9)


def stripes(degrees: float, size: int = 96, period: float = 8) -> np.ndarray:
    """Stripes whose lines run at an angle, counterclockwise on screen, with rows growing down."""
    y, x = np.mgrid[0:size, 0:size].astype(float)
    a = np.radians(degrees)
    # Distance across the lines: the normal of a line at angle a on screen is (sin a, cos a)
    # in (x, y) with y growing downward.
    return 128 + 60 * np.sin(2 * np.pi * (x * np.sin(a) + y * np.cos(a)) / period)


@pytest.mark.parametrize(("bank", "angle"), list(itertools.product(BANKS, [0, 45, 90, 135])))
def test_keep_one_direction_keeps_lines_at_that_angle(bank: str, angle: float) -> None:
    image = stripes(angle)
    keep = catalog_values(IDS[bank], mode="orientation", direction=angle, keepCoarse=False)
    drop = catalog_values(
        IDS[bank], mode="orientation", direction=(angle + 90) % 180, keepCoarse=False
    )
    centered = image - image.mean()
    kept = directional_plane(image, keep, bank)[16:-16, 16:-16]
    dropped = directional_plane(image, drop, bank)[16:-16, 16:-16]
    assert kept.std() > 0.9 * centered[16:-16, 16:-16].std()
    assert dropped.std() < 0.05 * centered[16:-16, 16:-16].std()


@pytest.mark.parametrize("bank", BANKS)
def test_the_noise_level_of_a_tile_follows_its_mask(bank: str) -> None:
    """White noise of sigma gives tile coefficients of sigma times the RMS of the mask."""
    noise = np.random.default_rng(7).normal(0, 10, (128, 160))
    fx, fy = frequency_grid(128, 160)
    spectrum = scipy.fft.rfft2(noise)
    tiles = symmetric_nyquist(BANKS[bank](fx, fy, 3, 16), 160)
    for tile in tiles[::7]:
        coefficients = scipy.fft.irfft2(spectrum * tile.mask, s=noise.shape)
        expected = 10 * tile_rms(tile.mask, 160)
        assert coefficients.std() == pytest.approx(expected, rel=0.08)


@pytest.mark.parametrize("bank", BANKS)
def test_removing_noise_raises_the_psnr_of_lines(bank: str) -> None:
    y, x = np.mgrid[0:96, 0:96]
    clean = np.where(np.abs(x - 0.6 * y - 20) < 1.5, 200.0, 60.0)
    noisy = clean + np.random.default_rng(3).normal(0, 20, clean.shape)
    out = directional_plane(noisy, catalog_values(IDS[bank]), bank)

    def psnr(image: np.ndarray) -> float:
        return float(10 * np.log10(255**2 / np.mean((image - clean) ** 2)))

    assert psnr(out) > psnr(noisy) + 5


# The filters through the engine API ---------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


@pytest.mark.parametrize(
    ("filter_id", "function", "values"),
    [
        ("directional-curvelet", directional_curvelet, {"scales": 2, "directions": "8"}),
        ("directional-shearlet", directional_shearlet, {"mode": "orientation", "direction": 30}),
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


@pytest.mark.parametrize("filter_id", IDS.values())
def test_the_representations(client: TestClient, filter_id: str) -> None:
    stages = client.post(f"{API}/filters/{filter_id}/representation", json={}).json()
    assert [s["name"] for s in stages["stages"]] == [
        "Spectrum",
        "Tiles",
        "Tile coefficients",
        "Threshold",
        "Synthesis",
    ]
    response = client.post(
        f"{API}/filters/{filter_id}/representation", json={"mode": "orientation"}
    ).json()
    assert response["kind"] == "frequency"
    assert len(response["values"]) == response["size"] ** 2
    assert len(response["profile"]) == 129
    assert max(response["values"]) <= 1 + 1e-9
