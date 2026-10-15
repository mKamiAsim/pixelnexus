"""Blob detection: each detector returns what its scikit-image function finds, as a table with
the response at each peak as the score. On the Disks test image the blobs sit where the disks
are, and the engine returns the table as JSON."""

from __future__ import annotations

import math
import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy import ndimage
from skimage.feature import blob_dog, blob_doh, blob_log

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.blobs import (
    blob_dog_filter,
    blob_doh_filter,
    blob_log_filter,
    detect,
    luma01,
    sigma_list,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries
from synthetic import disks

API = "/api/v1"
CATALOG = find_catalog()
FILTERS = {"blob-log": blob_log_filter, "blob-dog": blob_dog_filter, "blob-doh": blob_doh_filter}
# The disks of the Disks test image at 512 x 512: center x, center y and radius.
DISKS = [(96, 96, 48), (256, 96, 24), (384, 96, 12), (448, 96, 6), (128, 320, 72), (352, 320, 36)]
DOTS = [(300, 220), (420, 230), (460, 440), (60, 460)]


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def gray_rgba(gray: np.ndarray) -> np.ndarray:
    return np.dstack([gray, gray, gray, np.full_like(gray, 255)]).astype(np.uint8)


@pytest.fixture(scope="module")
def disk_image() -> np.ndarray:
    return gray_rgba(disks(512, 512))


def run(filter_id: str, image: np.ndarray, **values: Any) -> dict[str, Any]:
    result: dict[str, Any] = FILTERS[filter_id](
        image, catalog_values(filter_id, **values), lambda _: None
    )
    return result


def test_the_input_is_luma_from_0_to_1() -> None:
    image = np.zeros((1, 2, 4), np.uint8)
    image[0, 0, :3] = (255, 0, 0)
    image[0, 1, :3] = (0, 0, 255)
    np.testing.assert_allclose(luma01(image, "bright")[0], [0.2126, 0.0722])
    np.testing.assert_allclose(luma01(image, "dark")[0], [0.7874, 0.9278])


@pytest.mark.parametrize(
    ("filter_id", "function", "extra"),
    [
        ("blob-log", blob_log, {"num_sigma": 10, "log_scale": False}),
        ("blob-dog", blob_dog, {"sigma_ratio": 1.6}),
        ("blob-doh", blob_doh, {"num_sigma": 10, "log_scale": False}),
    ],
)
def test_each_detector_is_its_scikit_image_function(
    filter_id: str, function: Any, extra: dict[str, Any], disk_image: np.ndarray
) -> None:
    values = catalog_values(filter_id)
    gray = luma01(disk_image, "bright")
    expected = function(
        gray,
        min_sigma=values["minSigma"],
        max_sigma=values["maxSigma"],
        threshold=values["threshold"],
        overlap=values["overlap"],
        **extra,
    )
    np.testing.assert_array_equal(detect(gray, filter_id, values), expected)
    table = run(filter_id, disk_image)
    found = sorted((row[1], row[0], row[3]) for row in table["rows"])
    assert found == sorted((r, c, round(s, 4)) for r, c, s in expected.tolist())


def test_the_table_has_columns_rows_and_a_summary(disk_image: np.ndarray) -> None:
    table = run("blob-log", disk_image)
    assert table["kind"] == "features"
    assert [c["key"] for c in table["columns"]] == ["x", "y", "radius", "sigma", "score"]
    assert table["summary"] == "10 blobs"
    scores = [row[4] for row in table["rows"]]
    assert scores == sorted(scores, reverse=True)
    assert all(math.isclose(row[2], row[3] * math.sqrt(2), rel_tol=1e-3) for row in table["rows"])


def test_log_finds_the_disks_and_dots_with_their_sizes(disk_image: np.ndarray) -> None:
    rows = run("blob-log", disk_image)["rows"]
    for x, y, r in DISKS:
        near = [row for row in rows if math.hypot(row[0] - x, row[1] - y) <= 2]
        assert len(near) == 1, (x, y)
        # The scales are 5.4 px apart, and the largest is 50.
        assert abs(near[0][2] - min(r, 50 * math.sqrt(2))) <= 0.5 * 5.44 * math.sqrt(2) + 1
    for x, y in DOTS:
        assert any(row[0] == x and row[1] == y and row[3] == 1 for row in rows)


def test_a_larger_smallest_sigma_drops_the_single_pixels(disk_image: np.ndarray) -> None:
    assert run("blob-log", disk_image, minSigma=3)["summary"] == "6 blobs"


def test_dog_finds_the_six_disks(disk_image: np.ndarray) -> None:
    rows = run("blob-dog", disk_image)["rows"]
    assert len(rows) == 6
    for x, y, _ in DISKS:
        assert any(math.hypot(row[0] - x, row[1] - y) <= 2 for row in rows)


def test_doh_finds_bright_and_dark_blobs(disk_image: np.ndarray) -> None:
    bright = run("blob-doh", disk_image)["rows"]
    dark = run("blob-doh", gray_rgba(255 - disk_image[..., 0]))["rows"]
    for x, y, r in DISKS[1:4]:
        for rows in (bright, dark):
            assert any(math.hypot(row[0] - x, row[1] - y) <= 3 for row in rows), (x, y, r)


@pytest.mark.parametrize("filter_id", ["blob-log", "blob-dog"])
def test_dark_blobs_are_bright_blobs_of_the_negated_image(filter_id: str) -> None:
    y, x = np.mgrid[0:80, 0:80]
    spots = np.where((x - 25) ** 2 + (y - 30) ** 2 <= 36, 40, 200)
    spots = np.where((x - 55) ** 2 + (y - 50) ** 2 <= 100, 40, spots).astype(np.uint8)
    dark = run(filter_id, gray_rgba(spots), blobs="dark")
    bright = run(filter_id, gray_rgba(255 - spots))
    assert dark["rows"] == bright["rows"]
    assert len(dark["rows"]) == 2


@pytest.mark.parametrize("filter_id", list(FILTERS))
def test_scores_are_the_response_at_the_peak(filter_id: str) -> None:
    """For LoG, the score is -sigma^2 times the Gaussian Laplacian at the peak."""
    image = np.zeros((60, 60), np.uint8)
    image[20:31, 25:36] = 200
    table = run(filter_id, gray_rgba(image), threshold=0)
    assert table["rows"], filter_id
    if filter_id == "blob-log":
        x, y, _, sigma, score = table["rows"][0]
        gray = image / 255.0
        expected = -ndimage.gaussian_laplace(gray, sigma) * sigma**2
        # The table rounds sigma to 4 decimals and the score to 6.
        assert score == pytest.approx(expected[y, x], abs=1e-4)


def test_a_flat_image_has_no_blobs_except_for_doh() -> None:
    flat = gray_rgba(np.full((40, 40), 128, np.uint8))
    for filter_id in ("blob-log", "blob-dog"):
        assert run(filter_id, flat)["summary"] == "0 blobs"
    # The boxes of scikit-image do not always sum to 0 and are clipped at the edge. The docs say so.
    assert run("blob-doh", flat)["summary"] == "1 blob"


def test_the_scales_of_the_representation() -> None:
    assert sigma_list("blob-log", catalog_values("blob-log", maxSigma=10, numSigma=4)) == [
        1,
        4,
        7,
        10,
    ]
    dog = sigma_list("blob-dog", catalog_values("blob-dog", minSigma=1, maxSigma=4, sigmaRatio=2))
    assert dog == [1, 2, 4, 8]


# Through the engine API -----------------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


@pytest.mark.parametrize("filter_id", list(FILTERS))
def test_the_engine_returns_the_table_as_json(client: TestClient, filter_id: str) -> None:
    image = gray_rgba(disks(128, 128))
    upload = client.post(
        f"{API}/images",
        params={"width": 128, "height": 128},
        content=image.tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    job = client.post(f"{API}/jobs", json={"filter": filter_id, "image": upload.json()["id"]})
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
    assert result.headers["content-type"].startswith("application/json")
    assert result.json() == run(filter_id, image)


@pytest.mark.parametrize("filter_id", list(FILTERS))
def test_the_representations(client: TestClient, filter_id: str) -> None:
    stages = client.post(f"{API}/filters/{filter_id}/representation", json={}).json()["stages"]
    assert [s["name"] for s in stages] == ["Input", "Response", "Peaks", "Pruning"]
