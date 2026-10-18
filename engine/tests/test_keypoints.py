"""Keypoint detectors: each table holds what its OpenCV detector finds, with the angle turned to
count counterclockwise. Turning the image turns the keypoints, and the engine returns JSON."""

from __future__ import annotations

import math
import time
from collections.abc import Iterator
from typing import Any

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.keypoints import (
    CV,
    XF,
    akaze,
    brisk,
    detector,
    luma8,
    octave_of,
    orb,
    sift,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries
from synthetic import disks, siemens_star

API = "/api/v1"
CATALOG = find_catalog()
FILTERS = {"sift": sift, "orb": orb, "brisk": brisk, "akaze": akaze}


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def gray_rgba(gray: np.ndarray) -> np.ndarray:
    return np.dstack([gray, gray, gray, np.full_like(gray, 255)]).astype(np.uint8)


@pytest.fixture(scope="module")
def star() -> np.ndarray:
    return siemens_star(512, 512)


def table(filter_id: str, gray: np.ndarray, **values: Any) -> dict[str, Any]:
    result: dict[str, Any] = FILTERS[filter_id](
        gray_rgba(gray), catalog_values(filter_id, **values), lambda _: None
    )
    return result


def test_the_input_is_8_bit_luma() -> None:
    image = np.zeros((1, 3, 4), np.uint8)
    image[0, 0, :3] = (255, 0, 0)
    image[0, 1, :3] = (0, 255, 0)
    image[0, 2, :3] = (10, 10, 10)
    np.testing.assert_array_equal(luma8(image)[0], [54, 182, 10])


def test_the_detectors_use_the_catalog_defaults_of_opencv() -> None:
    sift_detector = detector("sift", catalog_values("sift"))
    assert sift_detector.getContrastThreshold() == pytest.approx(0.04)
    assert sift_detector.getNOctaveLayers() == 3
    orb_detector = detector("orb", catalog_values("orb"))
    assert orb_detector.getMaxFeatures() == 500
    assert orb_detector.getScoreType() == CV.ORB_HARRIS_SCORE
    akaze_detector = detector("akaze", catalog_values("akaze"))
    assert akaze_detector.getDiffusivity() == XF.KAZE_DIFF_PM_G2


@pytest.mark.parametrize("filter_id", list(FILTERS))
def test_each_table_is_what_opencv_finds(filter_id: str, star: np.ndarray) -> None:
    found = detector(filter_id, catalog_values(filter_id)).detect(star, None)
    rows = table(filter_id, star)["rows"]
    expected = sorted(
        (round(k.pt[0], 3), round(k.pt[1], 3), round(k.size / 2, 3), round(k.response, 6))
        for k in found
    )
    assert sorted((r[0], r[1], r[2], r[4]) for r in rows) == expected
    angles = sorted(round((360 - k.angle) % 360, 2) for k in found)
    assert sorted(r[3] for r in rows) == angles
    scores = [r[4] for r in rows]
    assert scores == sorted(scores, reverse=True)


def test_sift_octaves_are_the_signed_lowest_byte() -> None:
    assert octave_of("sift", 0x00FF0001) == 1
    assert octave_of("sift", 0x00FF00FF) == -1
    assert octave_of("orb", 3) == 3


def test_angles_turn_with_the_image(star: np.ndarray) -> None:
    """Turning the image a quarter counterclockwise moves (x, y) to (y, W - 1 - x) and adds 90
    degrees to every angle, when angles count counterclockwise."""
    rows = table("sift", star)["rows"]
    turned = table("sift", np.ascontiguousarray(np.rot90(star)))["rows"]
    width = star.shape[1]
    matched = 0
    for x, y, radius, angle, *_ in rows:
        for tx, ty, tr, ta, *_ in turned:
            near = math.hypot(tx - y, ty - (width - 1 - x)) < 1 and abs(tr - radius) < 0.1 * radius
            difference = (ta - angle - 90) % 360
            if near and min(difference, 360 - difference) < 5:
                matched += 1
                break
    assert matched >= 0.8 * len(rows)


def test_orb_finds_more_corners_at_a_lower_fast_threshold() -> None:
    image = disks(512, 512)
    assert len(table("orb", image)["rows"]) == 355
    assert len(table("orb", image, fastThreshold=5)["rows"]) == 443


@pytest.mark.parametrize("filter_id", list(FILTERS))
def test_a_flat_image_has_no_keypoints(filter_id: str) -> None:
    assert table(filter_id, np.full((80, 80), 128, np.uint8))["summary"] == "0 keypoints"


@pytest.mark.parametrize("filter_id", list(FILTERS))
def test_runs_are_repeatable(filter_id: str, star: np.ndarray) -> None:
    assert table(filter_id, star) == table(filter_id, star)


def test_brisk_and_akaze_come_from_xfeatures2d() -> None:
    assert isinstance(detector("brisk", catalog_values("brisk")), cv2.xfeatures2d.BRISK)
    assert isinstance(detector("akaze", catalog_values("akaze")), cv2.xfeatures2d.AKAZE)


# Through the engine API -----------------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


@pytest.mark.parametrize("filter_id", list(FILTERS))
def test_the_engine_returns_the_table_as_json(client: TestClient, filter_id: str) -> None:
    image = gray_rgba(siemens_star(160, 160))
    upload = client.post(
        f"{API}/images",
        params={"width": 160, "height": 160},
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
    result = client.get(f"{API}/jobs/{job_id}/result").json()
    assert result == table(filter_id, siemens_star(160, 160))
    assert [c["key"] for c in result["columns"]] == ["x", "y", "radius", "angle", "score", "octave"]


@pytest.mark.parametrize(
    ("filter_id", "names"),
    [
        ("sift", ["Input", "Scale space", "Extrema", "Edges", "Orientation"]),
        ("orb", ["Input", "Pyramid", "FAST corners", "Ranking", "Orientation"]),
        ("brisk", ["Input", "Scale space", "AGAST corners", "Maxima", "Orientation"]),
        ("akaze", ["Input", "Nonlinear scale space", "Hessian", "Orientation"]),
    ],
)
def test_the_representations(client: TestClient, filter_id: str, names: list[str]) -> None:
    stages = client.post(f"{API}/filters/{filter_id}/representation", json={}).json()["stages"]
    assert [s["name"] for s in stages] == names
