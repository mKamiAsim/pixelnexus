"""The SURF-inspired detector: the box filters equal the kernels of the paper, the response uses
the weight 0.9, blobs are found with their sign, and a quarter turn turns the keypoints."""

from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy import ndimage

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.surf import (
    hessian_boxes,
    integral,
    octave_sizes,
    sigma_of,
    surf_inspired,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries
from synthetic import disks, siemens_star

API = "/api/v1"
CATALOG = find_catalog()


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "surf-inspired")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def gray_rgba(gray: np.ndarray) -> np.ndarray:
    return np.dstack([gray, gray, gray, np.full_like(gray, 255)]).astype(np.uint8)


def rows_of(gray: np.ndarray, **values: Any) -> list[list[float]]:
    table: dict[str, Any] = surf_inspired(gray_rgba(gray), catalog_values(**values), lambda _: None)
    rows: list[list[float]] = table["rows"]
    return rows


def paper_kernels(size: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """D_xx, D_yy and D_xy of the paper as explicit arrays."""
    lobe, half = size // 3, (size - 1) // 2
    dyy = np.zeros((size, size))
    dyy[:, half - lobe + 1 : half + lobe] = 1
    dyy[lobe : 2 * lobe, half - lobe + 1 : half + lobe] = -2
    dxy = np.zeros((size, size))
    dxy[half - lobe : half, half - lobe : half] = 1
    dxy[half + 1 : half + lobe + 1, half + 1 : half + lobe + 1] = 1
    dxy[half - lobe : half, half + 1 : half + lobe + 1] = -1
    dxy[half + 1 : half + lobe + 1, half - lobe : half] = -1
    return dyy.T.copy(), dyy, dxy


@pytest.mark.parametrize("size", [9, 15, 27, 51])
def test_the_box_filters_are_the_kernels_of_the_paper(size: int) -> None:
    plane = np.random.default_rng(size).random((60, 70))
    boxes = hessian_boxes(integral(plane), size)
    for got, kernel in zip(boxes, paper_kernels(size), strict=True):
        expected = ndimage.correlate(plane, kernel, mode="constant", cval=0) / size**2
        np.testing.assert_allclose(got, expected, atol=1e-12)
    for kernel in paper_kernels(size):
        assert kernel.sum() == 0


def test_the_filter_sizes_and_scales_of_the_octaves() -> None:
    assert [octave_sizes(o) for o in range(4)] == [
        [9, 15, 21, 27],
        [15, 27, 39, 51],
        [27, 51, 75, 99],
        [51, 99, 147, 195],
    ]
    assert sigma_of(9) == pytest.approx(1.2)


def test_the_score_is_the_box_determinant_with_the_weight_0_9() -> None:
    gray = disks(256, 256)
    row = rows_of(gray)[0]
    x, y, size = int(row[0]), int(row[1]), int(row[3])
    dxx, dyy, dxy = hessian_boxes(integral(gray / 255.0), size)
    expected = dxx[y, x] * dyy[y, x] - (0.9 * dxy[y, x]) ** 2
    assert row[5] == pytest.approx(expected, abs=1e-8)


@pytest.mark.parametrize(("x", "y", "radius"), [(256, 96, 24), (384, 96, 12), (448, 96, 6)])
def test_bright_disks_are_found_with_a_negative_laplacian(x: int, y: int, radius: int) -> None:
    rows = rows_of(disks(512, 512))
    near = [r for r in rows if abs(r[0] + 0.5 - x) <= 1.5 and abs(r[1] + 0.5 - y) <= 1.5]
    assert near, radius
    assert all(r[6] == -1 for r in near)


def test_dark_disks_are_found_in_the_same_places_with_a_positive_laplacian() -> None:
    gray = disks(512, 512)
    bright = rows_of(gray)
    dark = rows_of(255 - gray)
    assert len(dark) == len(bright)
    for row in bright:
        match = [
            r
            for r in dark
            if abs(r[0] - row[0]) <= 1 and abs(r[1] - row[1]) <= 1 and r[3] == row[3]
        ]
        assert match and match[0][6] == 1


def test_a_quarter_turn_turns_the_keypoints_and_their_angles() -> None:
    star = siemens_star(256, 256)
    rows = rows_of(star)
    turned = rows_of(np.ascontiguousarray(np.rot90(star)))
    assert len(turned) == len(rows)
    width = star.shape[1]
    same = 0
    for x, y, _, size, angle, *_ in rows:
        for tx, ty, _, tsize, tangle, *_ in turned:
            difference = (tangle - angle - 90) % 360
            moved = abs(tx - y) <= 1 and abs(ty - (width - 1 - x)) <= 1 and tsize == size
            if moved and min(difference, 360 - difference) < 2:
                same += 1
                break
    assert same >= 0.95 * len(rows)


def test_touching_equal_maxima_give_one_keypoint() -> None:
    gray = np.full((80, 80), 30, np.uint8)
    gray[30:50, 30:50] = 220  # A square whose center lies between pixels.
    rows = rows_of(gray, threshold=0.001)
    places = [(r[0], r[1], r[3]) for r in rows]
    assert len(places) == len(set(places))
    near = [r for r in rows if abs(r[0] - 39.5) <= 1 and abs(r[1] - 39.5) <= 1]
    sizes = [r[3] for r in near]
    assert len(sizes) == len(set(sizes))


def test_a_flat_image_has_no_keypoints() -> None:
    assert rows_of(np.full((120, 120), 128, np.uint8)) == []


def test_without_orientation_all_angles_are_0() -> None:
    rows = rows_of(disks(256, 256), orientation=False)
    assert rows and all(r[4] == 0 for r in rows)


# Through the engine API -----------------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


def test_the_engine_returns_the_table_as_json(client: TestClient) -> None:
    gray = disks(160, 160)
    image = gray_rgba(gray)
    upload = client.post(
        f"{API}/images",
        params={"width": 160, "height": 160},
        content=image.tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    job = client.post(f"{API}/jobs", json={"filter": "surf-inspired", "image": upload.json()["id"]})
    assert job.status_code == 202, job.text
    job_id = job.json()["id"]
    state = "queued"
    for _ in range(600):
        state = client.get(f"{API}/jobs/{job_id}").json()["state"]
        if state in ("done", "failed"):
            break
        time.sleep(0.05)
    assert state == "done"
    result = client.get(f"{API}/jobs/{job_id}/result").json()
    assert result["rows"] == rows_of(gray)


def test_the_representation(client: TestClient) -> None:
    stages = client.post(f"{API}/filters/surf-inspired/representation", json={"octaves": 2}).json()[
        "stages"
    ]
    assert [s["name"] for s in stages] == ["Integral image", "Box Hessian", "Maxima", "Orientation"]
    assert "9, 15, 21, 27; 15, 27, 39, 51" in stages[1]["note"]
