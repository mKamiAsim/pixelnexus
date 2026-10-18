"""SUSAN corners: the USAN area equals a brute-force sum over the 37-pixel mask, the four
corners of a rectangle are found, and the engine returns the table as JSON."""

from __future__ import annotations

import math
import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.susan import OFFSETS, corners, susan_corner, usan_area
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries
from synthetic import disks

API = "/api/v1"
CATALOG = find_catalog()


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "susan-corner")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def gray_rgba(gray: np.ndarray) -> np.ndarray:
    return np.dstack([gray, gray, gray, np.full_like(gray, 255)]).astype(np.uint8)


def rectangle() -> np.ndarray:
    gray = np.full((80, 80), 40, np.uint8)
    gray[20:60, 25:55] = 200
    return gray


def test_the_mask_has_37_pixels_within_radius_3_4() -> None:
    assert len(OFFSETS) == 37
    assert (0, 0) in OFFSETS
    assert all(dy * dy + dx * dx <= 3.4**2 for dy, dx in OFFSETS)
    assert (3, 2) not in OFFSETS and (3, 1) in OFFSETS


def test_the_usan_area_is_the_brute_force_sum() -> None:
    plane = np.random.default_rng(0).integers(0, 256, (14, 17)).astype(np.float64)
    t = 30.0
    got = usan_area(plane, t, "replicate")
    expected = np.zeros_like(plane)
    for r in range(plane.shape[0]):
        for c in range(plane.shape[1]):
            for dy, dx in OFFSETS:
                rr = min(max(r + dy, 0), plane.shape[0] - 1)
                cc = min(max(c + dx, 0), plane.shape[1] - 1)
                expected[r, c] += math.exp(-(((plane[rr, cc] - plane[r, c]) / t) ** 6))
    np.testing.assert_allclose(got, expected, atol=1e-12)


def test_a_flat_area_has_the_full_usan_and_no_corners() -> None:
    flat = np.full((30, 30), 100.0)
    np.testing.assert_allclose(usan_area(flat, 25, "reflect101"), 37)
    rows, *_ = corners(flat, catalog_values())
    assert len(rows) == 0


@pytest.mark.parametrize("t", [10, 25, 40])
def test_the_four_corners_of_a_rectangle(t: float) -> None:
    table: dict[str, Any] = susan_corner(
        gray_rgba(rectangle()), catalog_values(brightness=t), lambda _: None
    )
    places = sorted((row[0], row[1]) for row in table["rows"])
    assert places == [(25, 20), (25, 59), (54, 20), (54, 59)]
    assert table["summary"] == "4 corners"


def test_a_straight_edge_has_about_half_the_usan() -> None:
    n = usan_area(rectangle().astype(np.float64), 25, "reflect101")
    assert 15 <= n[40, 25] <= 22
    assert n[40, 40] == pytest.approx(37)
    assert n[20, 25] < n[40, 25]


def test_curved_edges_give_corners_too() -> None:
    table: dict[str, Any] = susan_corner(
        gray_rgba(disks(512, 512)), catalog_values(), lambda _: None
    )
    assert table["summary"] == "160 corners"


# Through the engine API -----------------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


def test_the_engine_returns_the_table_as_json(client: TestClient) -> None:
    image = gray_rgba(rectangle())
    upload = client.post(
        f"{API}/images",
        params={"width": 80, "height": 80},
        content=image.tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    job = client.post(f"{API}/jobs", json={"filter": "susan-corner", "image": upload.json()["id"]})
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
    assert result["summary"] == "4 corners"
    assert [c["key"] for c in result["columns"]] == ["x", "y", "score", "usan"]


def test_the_representation(client: TestClient) -> None:
    stages = client.post(f"{API}/filters/susan-corner/representation", json={}).json()["stages"]
    assert [s["name"] for s in stages] == ["Mask", "USAN area", "Response", "Corners"]
    assert "g = 0.5 \\cdot 37 = 18.5" in stages[2]["formula"]
