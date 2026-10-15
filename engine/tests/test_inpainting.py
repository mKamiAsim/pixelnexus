"""Inpainting: the hole is what the selection touches, known pixels never change, each method
matches its library and has the expected fill, and jobs carry the selection as a mask."""

from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Any

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from skimage.restoration import inpaint_biharmonic

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.inpainting import fill, hole_of, inpaint
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

API = "/api/v1"
CATALOG = find_catalog()


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "inpaint")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def disk_hole(height: int, width: int, radius: float) -> np.ndarray:
    y, x = np.mgrid[0:height, 0:width]
    return (x - width / 2) ** 2 + (y - height / 2) ** 2 < radius**2


def ramp(height: int = 60, width: int = 80) -> np.ndarray:
    y, x = np.mgrid[0:height, 0:width]
    return np.stack([40 + 2 * x, 30 + 2 * y + x, np.full_like(x, 100)], -1).astype(np.uint8)


def test_the_hole_is_every_pixel_the_selection_touches() -> None:
    mask = np.array([[0, 1, 128], [255, 0, 0]], dtype=np.uint8)
    np.testing.assert_array_equal(hole_of(mask), [[False, True, True], [True, False, False]])


@pytest.mark.parametrize("method", ["telea", "ns", "biharmonic"])
def test_pixels_outside_the_hole_never_change(method: str) -> None:
    image = np.random.default_rng(0).integers(0, 256, (40, 50, 3)).astype(np.uint8)
    hole = disk_hole(40, 50, 8)
    out = fill(image, hole, method, 3)
    np.testing.assert_array_equal(out[~hole], image[~hole])
    assert not np.array_equal(out[hole], image[hole])


@pytest.mark.parametrize("method", ["telea", "ns"])
def test_the_opencv_methods_are_cv2_inpaint(method: str) -> None:
    image = np.random.default_rng(1).integers(0, 256, (30, 36, 3)).astype(np.uint8)
    hole = disk_hole(30, 36, 6)
    flag = cv2.INPAINT_TELEA if method == "telea" else cv2.INPAINT_NS
    expected = cv2.inpaint(image, hole.astype(np.uint8) * 255, 5, flag)
    np.testing.assert_array_equal(fill(image, hole, method, 5), expected)


def test_biharmonic_is_scikit_image_rounded() -> None:
    image = np.random.default_rng(2).integers(0, 256, (24, 30, 3)).astype(np.uint8)
    hole = disk_hole(24, 30, 5)
    expected = inpaint_biharmonic(image / 255.0, hole, channel_axis=-1) * 255
    out = fill(image, hole, "biharmonic", 3)
    np.testing.assert_array_equal(out[hole], np.clip(np.rint(expected), 0, 255)[hole])


def test_biharmonic_fills_a_linear_ramp_exactly() -> None:
    """A linear function solves the biharmonic equation, so it is its own fill."""
    image = ramp()
    np.testing.assert_array_equal(fill(image, disk_hole(60, 80, 12), "biharmonic", 3), image)


@pytest.mark.parametrize(("method", "worst"), [("telea", 19), ("ns", 15)])
def test_the_opencv_methods_follow_a_ramp_closely(method: str, worst: int) -> None:
    image = ramp()
    hole = disk_hole(60, 80, 12)
    error = np.abs(fill(image, hole, method, 3).astype(int) - image)[hole]
    assert error.max() <= worst
    assert error.mean() < 5


@pytest.mark.parametrize("method", ["ns", "biharmonic"])
def test_a_flat_area_stays_flat(method: str) -> None:
    image = np.full((50, 50, 3), 123, np.uint8)
    np.testing.assert_array_equal(fill(image, disk_hole(50, 50, 15), method, 3), image)


def test_telea_drifts_a_few_levels_in_a_large_flat_hole() -> None:
    """OpenCV's Telea is not exact on a flat area. The docs give this number."""
    image = np.full((80, 80, 3), 123, np.uint8)
    error = fill(image, disk_hole(80, 80, 25), "telea", 3).astype(int) - 123
    assert error.min() >= -1
    assert error.max() == 5


def test_an_empty_hole_leaves_the_image() -> None:
    image = np.random.default_rng(3).integers(0, 256, (10, 12, 3)).astype(np.uint8)
    np.testing.assert_array_equal(fill(image, np.zeros((10, 12), bool), "telea", 3), image)


def test_a_hole_over_the_whole_image_is_refused() -> None:
    image = np.zeros((10, 12, 3), np.uint8)
    with pytest.raises(ValueError, match="covers the whole image"):
        fill(image, np.ones((10, 12), bool), "biharmonic", 3)


def test_the_filter_keeps_alpha_and_shows_the_hole() -> None:
    image = np.random.default_rng(4).integers(0, 256, (20, 24, 4)).astype(np.uint8)
    mask = (disk_hole(20, 24, 5) * 200).astype(np.uint8)
    out = inpaint(image, {**catalog_values(), "mask": mask}, lambda _: None)
    np.testing.assert_array_equal(out[..., 3], image[..., 3])
    hole = inpaint(image, {**catalog_values(output="hole"), "mask": mask}, lambda _: None)
    np.testing.assert_array_equal(hole[..., 0], np.where(mask > 0, 255, 0))
    np.testing.assert_array_equal(hole[..., 3], image[..., 3])


# Jobs with a mask -------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


def upload(client: TestClient, pixels: np.ndarray) -> str:
    height, width = pixels.shape[:2]
    answer = client.post(
        f"{API}/images",
        params={"width": width, "height": height},
        content=pixels.tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    return str(answer.json()["id"])


def gray_rgba(mask: np.ndarray) -> np.ndarray:
    return np.dstack([mask, mask, mask, np.full_like(mask, 255)])


def wait(client: TestClient, job_id: str) -> str:
    state = "queued"
    for _ in range(600):
        state = client.get(f"{API}/jobs/{job_id}").json()["state"]
        if state in ("done", "failed"):
            break
        time.sleep(0.05)
    return state


@pytest.mark.parametrize("method", ["telea", "ns", "biharmonic"])
def test_the_engine_fills_the_mask_sent_with_the_job(client: TestClient, method: str) -> None:
    image = np.random.default_rng(5).integers(40, 220, (22, 30, 4)).astype(np.uint8)
    mask = (disk_hole(22, 30, 5) * 255).astype(np.uint8)
    job = client.post(
        f"{API}/jobs",
        json={
            "filter": "inpaint",
            "image": upload(client, image),
            "mask": upload(client, gray_rgba(mask)),
            "params": {"method": method},
        },
    )
    assert job.status_code == 202, job.text
    assert wait(client, job.json()["id"]) == "done"
    result = client.get(f"{API}/jobs/{job.json()['id']}/result")
    pixels = np.frombuffer(result.content, dtype=np.uint8).reshape(22, 30, 4)
    expected = inpaint(image, {**catalog_values(method=method), "mask": mask}, lambda _: None)
    np.testing.assert_array_equal(pixels, expected)


def test_a_job_without_its_mask_is_refused(client: TestClient) -> None:
    image = np.zeros((8, 8, 4), np.uint8)
    job = client.post(f"{API}/jobs", json={"filter": "inpaint", "image": upload(client, image)})
    assert job.status_code == 422
    assert "needs a selection" in job.json()["detail"]


def test_a_mask_of_another_size_is_refused(client: TestClient) -> None:
    image = np.zeros((8, 8, 4), np.uint8)
    mask = np.zeros((8, 9, 4), np.uint8)
    job = client.post(
        f"{API}/jobs",
        json={"filter": "inpaint", "image": upload(client, image), "mask": upload(client, mask)},
    )
    assert job.status_code == 422
    assert "same size" in job.json()["detail"]


def test_a_mask_for_a_filter_without_one_is_refused(client: TestClient) -> None:
    image = np.zeros((8, 8, 4), np.uint8)
    job = client.post(
        f"{API}/jobs",
        json={"filter": "deband", "image": upload(client, image), "mask": upload(client, image)},
    )
    assert job.status_code == 422
    assert "does not use a selection" in job.json()["detail"]


def test_an_unknown_mask_is_not_found(client: TestClient) -> None:
    image = np.zeros((8, 8, 4), np.uint8)
    job = client.post(
        f"{API}/jobs",
        json={"filter": "inpaint", "image": upload(client, image), "mask": "0" * 64},
    )
    assert job.status_code == 404


@pytest.mark.parametrize(
    ("method", "names"),
    [
        ("telea", ["Hole", "Fill order", "Estimate"]),
        ("ns", ["Hole", "Equation"]),
        ("biharmonic", ["Hole", "Equation"]),
    ],
)
def test_the_representation(client: TestClient, method: str, names: list[str]) -> None:
    stages = client.post(
        f"{API}/filters/inpaint/representation", json={"method": method, "radius": 7}
    ).json()["stages"]
    assert [s["name"] for s in stages] == names
    assert ("The radius is 7 px." in stages[-1]["note"]) == (method != "biharmonic")
