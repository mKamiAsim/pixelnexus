"""MSER regions: the table summarizes what OpenCV finds, with the centroid, the equal-area
radius and the long axis of each region, and the engine returns it as JSON."""

from __future__ import annotations

import math
import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy import ndimage

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.keypoints import luma8
from pixelnexus_engine.filters.mser import detector, mser, region_row
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries
from synthetic import disks

API = "/api/v1"
CATALOG = find_catalog()


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "mser")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def gray_rgba(gray: np.ndarray) -> np.ndarray:
    return np.dstack([gray, gray, gray, np.full_like(gray, 255)]).astype(np.uint8)


def blurred_disks() -> np.ndarray:
    smooth = ndimage.gaussian_filter(disks(512, 512).astype(np.float64), 3)
    return np.clip(np.rint(smooth), 0, 255).astype(np.uint8)


def table(gray: np.ndarray, **values: Any) -> dict[str, Any]:
    result: dict[str, Any] = mser(gray_rgba(gray), catalog_values(**values), lambda _: None)
    return result


def test_the_detector_has_the_opencv_defaults() -> None:
    found = detector(catalog_values())
    assert (found.getDelta(), found.getMinArea(), found.getMaxArea()) == (5, 60, 14400)
    assert found.getMaxVariation() == pytest.approx(0.25)


def test_a_row_summarizes_a_region() -> None:
    # An ellipse with its long axis rising at 30 degrees, counterclockwise from the x axis.
    y, x = np.mgrid[0:200, 0:200]
    u = (x - 100) * math.cos(math.radians(30)) - (y - 100) * math.sin(math.radians(30))
    v = (x - 100) * math.sin(math.radians(30)) + (y - 100) * math.cos(math.radians(30))
    inside = (u / 40) ** 2 + (v / 15) ** 2 <= 1
    points = np.column_stack([x[inside], y[inside]]).astype(np.int32)
    cx, cy, radius, angle, area, ratio = region_row(points)
    assert (cx, cy) == pytest.approx((100, 100), abs=0.01)
    assert area == inside.sum()
    assert radius == pytest.approx(math.sqrt(area / math.pi), abs=1e-3)
    assert angle == pytest.approx(30, abs=0.5)
    assert ratio == pytest.approx(40 / 15, rel=0.02)


def test_the_table_holds_what_opencv_finds() -> None:
    gray = blurred_disks()
    regions, _ = detector(catalog_values()).detectRegions(luma8(gray_rgba(gray)))
    rows = table(gray)["rows"]
    assert len(rows) == len(regions) == 4
    assert sorted(row[4] for row in rows) == sorted(len(r) for r in regions)
    areas = [row[4] for row in rows]
    assert areas == sorted(areas, reverse=True)


def test_flat_shapes_give_no_regions() -> None:
    assert table(disks(512, 512))["summary"] == "0 regions"


def test_bright_and_dark_regions_are_both_found() -> None:
    gray = blurred_disks()
    assert table(gray)["rows"] == table(255 - gray)["rows"]


def test_the_area_limits_drop_regions() -> None:
    gray = blurred_disks()
    assert len(table(gray, maxArea=1000)["rows"]) < 4


# Through the engine API -----------------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


def test_the_engine_returns_the_table_as_json(client: TestClient) -> None:
    gray = blurred_disks()
    image = gray_rgba(gray)
    upload = client.post(
        f"{API}/images",
        params={"width": 512, "height": 512},
        content=image.tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    job = client.post(f"{API}/jobs", json={"filter": "mser", "image": upload.json()["id"]})
    assert job.status_code == 202, job.text
    job_id = job.json()["id"]
    state = "queued"
    for _ in range(600):
        state = client.get(f"{API}/jobs/{job_id}").json()["state"]
        if state in ("done", "failed"):
            break
        time.sleep(0.05)
    assert state == "done"
    assert client.get(f"{API}/jobs/{job_id}/result").json() == table(gray)


def test_the_representation(client: TestClient) -> None:
    stages = client.post(f"{API}/filters/mser/representation", json={"delta": 7}).json()["stages"]
    assert [s["name"] for s in stages] == ["Extremal regions", "Stability", "Limits", "Table"]
    assert "Q_{t + 7}" in stages[1]["formula"]
