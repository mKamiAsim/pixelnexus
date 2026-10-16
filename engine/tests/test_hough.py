"""Hough transforms: the edges are scikit-image's Canny, the tables hold what scikit-image finds
in our units, the accumulator view is turned to our angles, the circles of the Disks image are
found, and edge linking is scikit-image's probabilistic transform with a fixed seed."""

from __future__ import annotations

import math
import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from skimage.feature import canny
from skimage.transform import hough_circle, hough_line, probabilistic_hough_line

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.hough import (
    EDGE_GRAY,
    accumulator_view,
    border_points,
    circle_rows,
    edges,
    hough_circles,
    hough_circles_representation,
    hough_lines,
    hough_lines_representation,
    hough_linking,
    hough_linking_representation,
    line_angles,
    line_rows,
    luma01,
    segment_rows,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries
from synthetic import disks

API = "/api/v1"
CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731
# The disks of the Disks test image at 256 x 256: center x, center y and radius.
DISKS = [(48, 48, 24), (128, 48, 12), (192, 48, 6), (224, 48, 3), (64, 160, 36), (176, 160, 18)]


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def gray_rgba(gray: np.ndarray) -> np.ndarray:
    return np.dstack([gray, gray, gray, np.full_like(gray, 255)]).astype(np.uint8)


def shapes(size: int = 160) -> np.ndarray:
    gray = np.full((size, size), 40, np.uint8)
    gray[100:140, 90:150] = 150
    gray[20:80, 20:60] = 220
    return gray


# Edges ----------------------------------------------------------------------------------------


@pytest.mark.parametrize(("border", "mode"), [("reflect101", "mirror"), ("constant", "constant")])
def test_the_edges_are_scikit_image_canny(border: str, mode: str) -> None:
    image = gray_rgba(shapes())
    params = catalog_values("hough-lines", sigma=1.5, lowThreshold=0.05, border=border)
    expected = canny(luma01(image), sigma=1.5, low_threshold=0.05, high_threshold=0.2, mode=mode)
    np.testing.assert_array_equal(edges(image, params), expected)


def test_a_high_threshold_below_the_low_one_counts_as_the_low_one() -> None:
    image = gray_rgba(shapes())
    params = catalog_values("hough-lines", lowThreshold=0.3, highThreshold=0.1)
    expected = canny(luma01(image), sigma=1, low_threshold=0.3, high_threshold=0.3, mode="mirror")
    np.testing.assert_array_equal(edges(image, params), expected)


# Lines ----------------------------------------------------------------------------------------


def lines_of(found: np.ndarray, **values: Any) -> list[list[float]]:
    return line_rows(found, catalog_values("hough-lines", **values))


def test_lines_get_our_direction_and_distance() -> None:
    size = 120
    found = np.zeros((size, size), bool)
    found[30, :] = True
    found[:, 65] = True
    rows = {round(r[0]): r for r in lines_of(found)}
    assert set(rows) == {0, 90}
    assert rows[0][1:3] == [30.0, size]
    assert rows[0][3:] == [0.0, 30.0, size - 1.0, 30.0]
    assert rows[90][1:3] == [65.0, size]


def test_diagonals_run_at_45_and_135_degrees() -> None:
    size = 100
    falling = np.zeros((size, size), bool)
    falling[np.arange(size), np.arange(size)] = True
    (row,) = lines_of(falling)
    # Down to the right on screen is -45 degrees, so the direction is 135.
    assert row[0] == pytest.approx(135)
    assert row[1] == pytest.approx(0, abs=0.5)
    rising = falling[::-1].copy()
    (row,) = lines_of(rising)
    assert row[0] == pytest.approx(45)
    assert row[1] == pytest.approx((size - 1) / math.sqrt(2), abs=0.5)


def test_the_table_holds_the_peaks_of_scikit_image() -> None:
    found = edges(gray_rgba(shapes()), catalog_values("hough-lines"))
    space, _, _ = hough_line(found, theta=line_angles(180))
    rows = lines_of(found)
    assert rows
    assert rows[0][2] == space.max()
    assert [r[2] for r in rows] == sorted((r[2] for r in rows), reverse=True)
    assert all(r[2] >= 0.5 * space.max() for r in rows)


def test_the_border_points() -> None:
    assert border_points(math.pi / 2, 30, 100, 50) == pytest.approx((0, 30, 99, 30))
    assert border_points(0, 40, 100, 50) == pytest.approx((40, 0, 40, 49))
    assert border_points(0, 140, 100, 50) is None


def test_the_accumulator_view_is_turned_to_our_angles() -> None:
    size = 101
    horizontal = np.zeros((size, size), bool)
    horizontal[30, :] = True
    space, _, distances = hough_line(horizontal, theta=line_angles(180))
    turned = np.log1p(space.astype(float))[::-1, ::-1]
    row, col = np.unravel_index(turned.argmax(), turned.shape)
    # The normal points up, at 90 degrees: the right edge. Its signed distance is -30, so the
    # peak lies below the middle row.
    assert col == turned.shape[1] - 1
    assert distances[::-1][row] == -30
    view = accumulator_view(space, (size, size))
    assert view.shape == (size, size)
    assert view.max() == pytest.approx(255)


def test_the_lines_output_draws_lines_over_the_edges() -> None:
    gray = np.full((80, 80), 40, np.uint8)
    gray[:, 40:] = 200
    params = catalog_values("hough-lines")
    out = hough_lines(gray_rgba(gray), params, NOTHING)
    assert isinstance(out, np.ndarray)
    found = edges(gray_rgba(gray), params)
    (row,) = line_rows(found, params)
    assert row[0] == 90
    column = round(row[3])
    assert (out[:, column, 0] == 255).all()
    others = found.copy()
    others[:, column] = False
    assert (out[others, 0] == EDGE_GRAY).all()


def test_a_flat_image_has_no_lines() -> None:
    flat = gray_rgba(np.full((40, 40), 90, np.uint8))
    table = hough_lines(flat, catalog_values("hough-lines", output="table"), NOTHING)
    assert isinstance(table, dict)
    assert table["rows"] == []
    out = hough_lines(flat, catalog_values("hough-lines", output="accumulator"), NOTHING)
    assert isinstance(out, np.ndarray)
    assert not out[..., :3].any()


# Circles --------------------------------------------------------------------------------------


def test_the_disks_are_found_with_their_radius() -> None:
    gray = disks(256, 256)
    params = catalog_values("hough-circles", minRadius=3, maxRadius=40)
    rows = circle_rows(edges(gray_rgba(gray), params), params)
    assert len(rows) == len(DISKS)
    for x, y, radius in DISKS:
        near = [r for r in rows if abs(r[0] + 0.5 - x) <= 1.5 and abs(r[1] + 0.5 - y) <= 1.5]
        assert len(near) == 1, (x, y)
        assert abs(near[0][2] - radius) <= 1


def test_the_shares_are_the_normalized_accumulator() -> None:
    gray = disks(128, 128)
    params = catalog_values("hough-circles", minRadius=4, maxRadius=20, radiusStep=2)
    found = edges(gray_rgba(gray), params)
    spaces = hough_circle(found, np.arange(4, 21, 2), normalize=True)
    for x, y, radius, share in circle_rows(found, params):
        assert share == pytest.approx(spaces[(radius - 4) // 2, y, x], abs=1e-4)
        assert share >= 0.5


def test_the_circle_table_and_the_accumulator() -> None:
    image = gray_rgba(disks(128, 128))
    params = catalog_values("hough-circles", maxRadius=20)
    table = hough_circles(image, params, NOTHING)
    assert isinstance(table, dict)
    assert [c["key"] for c in table["columns"]] == ["x", "y", "radius", "score"]
    assert table["summary"].endswith("circles")
    out = hough_circles(image, {**params, "output": "accumulator"}, NOTHING)
    assert isinstance(out, np.ndarray)
    spaces = hough_circle(edges(image, params), np.arange(5, 21), normalize=True)
    best = spaces.max(axis=0)
    expected = np.clip(np.round(best * 255 / best.max()), 0, 255)
    np.testing.assert_array_equal(out[..., 0], expected)


# Edge linking ---------------------------------------------------------------------------------


def test_linking_is_scikit_image_with_seed_0() -> None:
    image = gray_rgba(shapes())
    params = catalog_values("hough-linking", minLength=20, maxGap=3)
    found = edges(image, params)
    segments = probabilistic_hough_line(
        found, threshold=10, line_length=20, line_gap=3, theta=line_angles(180), rng=0
    )
    rows = segment_rows(found, params)
    assert sorted((r[0], r[1], r[2], r[3]) for r in rows) == sorted(
        (a[0], a[1], b[0], b[1]) for a, b in segments
    )
    assert rows == segment_rows(found, params)


def test_segments_get_their_length_and_direction() -> None:
    found = np.zeros((60, 60), bool)
    found[10, 5:55] = True
    found[15:55, 40] = True
    rows = segment_rows(found, catalog_values("hough-linking", minLength=30, maxGap=0))
    assert [(r[4], round(r[5])) for r in rows] == [(49, 0), (39, 90)]


def test_the_segments_are_drawn_over_the_edges() -> None:
    image = gray_rgba(shapes())
    params = catalog_values("hough-linking", minLength=20, maxGap=3)
    out = hough_linking(image, params, NOTHING)
    assert isinstance(out, np.ndarray)
    found = edges(image, params)
    values = set(np.unique(out[..., 0]).tolist())
    assert values <= {0, EDGE_GRAY, 255}
    assert (out[~found, 0] != EDGE_GRAY).all()
    table = hough_linking(image, {**params, "output": "table"}, NOTHING)
    assert isinstance(table, dict) and table["rows"]


# Representations and the engine API -----------------------------------------------------------


@pytest.mark.parametrize(
    ("representation", "filter_id", "names"),
    [
        (hough_lines_representation, "hough-lines", ["Canny edges", "Voting", "Peaks"]),
        (hough_circles_representation, "hough-circles", ["Canny edges", "Voting", "Peaks"]),
        (
            hough_linking_representation,
            "hough-linking",
            ["Canny edges", "Random voting", "Segments"],
        ),
    ],
)
def test_the_representations(representation: Any, filter_id: str, names: list[str]) -> None:
    stages = representation(catalog_values(filter_id))["stages"]
    assert [s["name"] for s in stages] == names
    for stage in stages:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


def run_job(client: TestClient, filter_id: str, image: np.ndarray, params: dict[str, Any]) -> Any:
    height, width = image.shape[:2]
    upload = client.post(
        f"{API}/images",
        params={"width": width, "height": height},
        content=image.tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    job = client.post(
        f"{API}/jobs", json={"filter": filter_id, "image": upload.json()["id"], "params": params}
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
    return client.get(f"{API}/jobs/{job_id}/result")


def test_the_engine_returns_the_circles(client: TestClient) -> None:
    image = gray_rgba(disks(128, 128))
    result = run_job(client, "hough-circles", image, {"maxRadius": 20}).json()
    expected = hough_circles(image, catalog_values("hough-circles", maxRadius=20), NOTHING)
    assert isinstance(expected, dict)
    assert result["rows"] == expected["rows"]


@pytest.mark.parametrize("filter_id", ["hough-lines", "hough-linking"])
def test_the_engine_returns_the_images(client: TestClient, filter_id: str) -> None:
    image = gray_rgba(shapes(64))
    values = {"minLength": 10} if filter_id == "hough-linking" else {}
    pixels = np.frombuffer(run_job(client, filter_id, image, values).content, np.uint8)
    function = hough_lines if filter_id == "hough-lines" else hough_linking
    expected = function(image, catalog_values(filter_id, **values), NOTHING)
    np.testing.assert_array_equal(pixels.reshape(64, 64, 4), expected)
