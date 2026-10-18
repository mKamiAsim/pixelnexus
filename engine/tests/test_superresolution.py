"""Classical super-resolution: the enlargement is the studio's bicubic Resize, back-projection
makes the camera model give the image back, it beats bicubic on a shrunk image, and the engine
returns the larger result with its size."""

from __future__ import annotations

import itertools
import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy import ndimage

from fixtures_geometry import resize as reference_resize
from fixtures_geometry import weight_matrix
from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.superresolution import (
    Grid,
    back_project,
    bicubic_matrix,
    box_matrix,
    sr_classical,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

API = "/api/v1"
CATALOG = find_catalog()


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "sr-classical")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def sharp_scene(size: int = 128) -> np.ndarray:
    y, x = np.mgrid[0:size, 0:size]
    disks = np.where((x % 40 - 20) ** 2 + (y % 40 - 20) ** 2 < 150, 220.0, 40.0)
    return np.asarray(ndimage.gaussian_filter(disks, 0.7))


def shrink(image: np.ndarray, scale: int) -> np.ndarray:
    h, w = image.shape[0] // scale, image.shape[1] // scale
    return np.asarray(image[: h * scale, : w * scale].reshape(h, scale, w, scale).mean(axis=(1, 3)))


def psnr(image: np.ndarray, clean: np.ndarray) -> float:
    return float(10 * np.log10(255**2 / np.mean((image - clean) ** 2)))


@pytest.mark.parametrize(("size", "scale"), [(1, 2), (5, 2), (13, 3), (30, 4)])
def test_the_enlargement_is_the_bicubic_resize_of_the_studio(size: int, scale: int) -> None:
    np.testing.assert_allclose(
        bicubic_matrix(size, scale).toarray(),
        weight_matrix(size, size * scale, "bicubic"),
        atol=1e-14,
    )


def test_the_camera_model_is_the_mean_of_each_block() -> None:
    plane = np.random.default_rng(0).random((12, 18))
    grid = Grid(4, 6, 3)
    np.testing.assert_allclose(grid.down(plane), shrink(plane, 3), atol=1e-14)
    np.testing.assert_allclose(box_matrix(4, 3).sum(axis=1), 1)


def test_a_constant_image_stays_constant() -> None:
    grid = Grid(9, 7, 3)
    plane = np.full((9, 7), 77.0)
    np.testing.assert_allclose(back_project(plane, grid, 5), 77.0, atol=1e-12)


@pytest.mark.parametrize("scale", [2, 3, 4])
def test_back_projection_makes_the_camera_model_give_the_image_back(scale: int) -> None:
    g = np.random.default_rng(scale).random((20, 26)) * 255
    grid = Grid(20, 26, scale)
    errors: list[float] = []
    back_project(
        g, grid, 30, lambda _k, x: errors.append(float(np.sqrt(np.mean((g - grid.down(x)) ** 2))))
    )
    assert all(b < a for a, b in itertools.pairwise(errors))
    assert errors[-1] < 1e-6


def test_back_projection_beats_bicubic_on_a_shrunk_image() -> None:
    clean = sharp_scene()
    g = shrink(clean, 2)
    grid = Grid(64, 64, 2)
    bicubic = psnr(back_project(g, grid, 0), clean)
    restored = psnr(back_project(g, grid, 10), clean)
    assert restored > bicubic + 1.4


def test_no_iterations_give_the_resize_of_the_studio() -> None:
    image = np.random.default_rng(1).integers(0, 256, (21, 30, 4)).astype(np.uint8)
    image[..., 3] = np.random.default_rng(2).integers(0, 256, (21, 30))
    image[:3, :3, 3] = 0
    out = sr_classical(
        image, catalog_values(scale=3, iterations=0, channelScope="rgb"), lambda _: None
    )
    expected = reference_resize(image.astype(np.float64), 90, 63, "bicubic")
    assert out.shape == (63, 90, 4)
    # The two sum in another order, so a value that lands on a half can round the other way.
    assert np.abs(out.astype(int) - expected).max() <= 1
    assert np.mean(out != expected) < 0.001


def test_the_brightness_scope_changes_only_brightness() -> None:
    image = np.random.default_rng(3).integers(90, 166, (16, 20, 4)).astype(np.uint8)
    image[..., 3] = 255
    luma = sr_classical(image, catalog_values(iterations=5), lambda _: None).astype(float)
    start = sr_classical(image, catalog_values(iterations=0), lambda _: None).astype(float)
    change = luma[..., :3] - start[..., :3]
    # The same change in red, green and blue is a change of Y alone, to rounding.
    assert np.abs(change - change.mean(axis=-1, keepdims=True)).max() <= 1.5
    assert np.abs(change).max() > 5


def test_progress_reaches_one() -> None:
    seen: list[float] = []
    image = np.zeros((6, 6, 4), np.uint8)
    sr_classical(image, catalog_values(iterations=4, channelScope="rgb"), seen.append)
    assert seen[-1] == 1.0
    assert seen == sorted(seen)


# Through the engine API -----------------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


def test_the_engine_returns_the_larger_result_with_its_size(client: TestClient) -> None:
    image = np.random.default_rng(4).integers(40, 220, (14, 20, 4)).astype(np.uint8)
    upload = client.post(
        f"{API}/images",
        params={"width": 20, "height": 14},
        content=image.tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    values = {"scale": 3, "iterations": 4}
    job = client.post(
        f"{API}/jobs",
        json={"filter": "sr-classical", "image": upload.json()["id"], "params": values},
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
    assert (result.headers["X-Width"], result.headers["X-Height"]) == ("60", "42")
    pixels = np.frombuffer(result.content, dtype=np.uint8).reshape(42, 60, 4)
    expected = sr_classical(image, catalog_values(**values), lambda _: None)
    np.testing.assert_array_equal(pixels, expected)


def test_the_representation(client: TestClient) -> None:
    stages = client.post(
        f"{API}/filters/sr-classical/representation", json={"scale": 3, "iterations": 7}
    ).json()["stages"]
    assert [s["name"] for s in stages] == ["Grid", "Start", "Camera model", "Back-projection"]
    assert "7 iterations" in stages[-1]["note"]
    assert "\\frac{1}{9}" in stages[2]["formula"]
