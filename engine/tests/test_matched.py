"""The matched filter: the template is the rectangle around the selection, the normalized map is
scikit-image's match_template aligned on the template center, the plain map is the correlation
with the template less its mean, and matches are the peaks of the normalized map."""

from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from skimage.feature import match_template

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.matched import (
    correlation_map,
    matched_filter,
    matched_filter_representation,
    ncc_map,
    template_box,
    template_of,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

API = "/api/v1"
CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731
# The centers of the crosses of the test scene, as (y, x).
TEMPLATE, FAINT, INVERTED, COPY = (30, 30), (30, 90), (90, 30), (130, 120)


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "matched-filter")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def gray_rgba(gray: np.ndarray) -> np.ndarray:
    out = np.empty((*gray.shape, 4), np.uint8)
    out[..., :3] = np.clip(np.rint(gray), 0, 255).astype(np.uint8)[..., None]
    out[..., 3] = 255
    return out


def cross(gray: np.ndarray, center: tuple[int, int], fg: float, bg: float) -> None:
    cy, cx = center
    gray[cy - 10 : cy + 11, cx - 10 : cx + 11] = bg
    gray[cy - 8 : cy + 9, cx - 2 : cx + 3] = fg
    gray[cy - 2 : cy + 3, cx - 8 : cx + 9] = fg


def scene() -> np.ndarray:
    """A cross, a faint copy, an inverted copy, a bright block and a full copy."""
    gray = np.full((160, 160), 100.0)
    cross(gray, TEMPLATE, 220, 60)
    cross(gray, FAINT, 140, 100)
    cross(gray, INVERTED, 60, 220)
    gray[70:110, 70:150] = 250
    cross(gray, COPY, 220, 60)
    return gray


def selection(shape: tuple[int, int], top: int, left: int, height: int, width: int) -> np.ndarray:
    mask = np.zeros(shape, np.uint8)
    mask[top : top + height, left : left + width] = 255
    return mask


def test_the_template_is_the_rectangle_around_the_selection() -> None:
    mask = np.zeros((20, 30), bool)
    mask[4, 7] = mask[9, 12] = mask[6, 20] = True
    assert template_box(mask) == (4, 7, 6, 14)
    plane = np.arange(600.0).reshape(20, 30)
    template = template_of(plane, mask.astype(np.uint8) * 200)
    np.testing.assert_array_equal(template, plane[4:10, 7:21])


def test_an_empty_or_flat_template_stops_with_a_message() -> None:
    plane = np.full((20, 20), 50.0)
    with pytest.raises(ValueError, match="empty"):
        template_of(plane, np.zeros((20, 20), np.uint8))
    with pytest.raises(ValueError, match="flat"):
        template_of(plane, selection((20, 20), 2, 2, 5, 5))


@pytest.mark.parametrize(("border", "mode"), [("reflect101", "reflect"), ("constant", "constant")])
def test_the_normalized_map_is_scikit_image(border: str, mode: str) -> None:
    plane = np.random.default_rng(1).normal(100, 30, (40, 50))
    template = plane[10:17, 20:31]
    expected = match_template(plane, template, pad_input=True, mode=mode)
    np.testing.assert_allclose(ncc_map(plane, template, border), expected)


@pytest.mark.parametrize(("height", "width"), [(7, 11), (8, 6), (1, 5)])
def test_the_template_scores_1_at_its_own_center(height: int, width: int) -> None:
    plane = np.random.default_rng(height).normal(100, 30, (40, 50))
    top, left = 12, 18
    template = plane[top : top + height, left : left + width]
    scores = ncc_map(plane, template, "reflect101")
    center = (top + height // 2, left + width // 2)
    assert scores[center] == pytest.approx(1)
    assert np.unravel_index(scores.argmax(), scores.shape) == center


def test_the_plain_map_is_the_correlation_with_the_template_less_its_mean() -> None:
    rng = np.random.default_rng(2)
    plane = rng.normal(100, 30, (30, 36))
    template = plane[5:10, 8:16]
    height, width = template.shape
    values = correlation_map(plane, template, "reflect101")
    padded = np.pad(plane, ((height, height), (width, width)), mode="reflect")
    zero_mean = template - template.mean()
    for r, c in [(0, 0), (7, 11), (29, 35), (15, 3)]:
        top = r - height // 2 + height
        left = c - width // 2 + width
        window = padded[top : top + height, left : left + width]
        assert values[r, c] == pytest.approx(float((window * zero_mean).sum()))


def test_brightness_contrast_and_inversion() -> None:
    gray = scene()
    template = gray[20:41, 20:41]
    scores = ncc_map(gray, template, "reflect101")
    plain = correlation_map(gray, template, "reflect101")
    assert scores[FAINT] == pytest.approx(1)
    assert scores[COPY] == pytest.approx(1)
    assert scores[INVERTED] == pytest.approx(-1)
    # Inside the flat block the window has no spread.
    assert scores[90, 110] == 0
    # The plain filter scores the faint copy at a quarter, below a corner of the bright block.
    assert plain[FAINT] == pytest.approx(plain[TEMPLATE] / 4)
    assert plain[60:120, 60:160].max() > plain[FAINT]


def test_the_matches_are_the_copies() -> None:
    gray = scene()
    params = {**catalog_values(output="matches"), "mask": selection(gray.shape, 20, 20, 21, 21)}
    table = matched_filter(gray_rgba(gray), params, NOTHING)
    assert isinstance(table, dict)
    centers = sorted((row[1], row[0]) for row in table["rows"])
    assert centers == sorted([TEMPLATE, FAINT, COPY])
    assert all(row[2] == 10.5 and row[4:] == [21, 21] for row in table["rows"])
    assert table["summary"] == "3 matches"
    params["matches"] = 2
    table = matched_filter(gray_rgba(gray), params, NOTHING)
    assert isinstance(table, dict)
    assert len(table["rows"]) == 2


def test_an_even_template_has_its_center_between_pixels() -> None:
    gray = scene()
    params = {**catalog_values(output="matches"), "mask": selection(gray.shape, 21, 21, 20, 20)}
    table = matched_filter(gray_rgba(gray), params, NOTHING)
    assert isinstance(table, dict)
    centers = sorted((row[1], row[0]) for row in table["rows"])
    assert centers == sorted((y + 0.5, x + 0.5) for y, x in (TEMPLATE, FAINT, COPY))


def test_noise_lowers_the_faint_copy_first() -> None:
    gray = scene() + np.random.default_rng(0).normal(0, 8, (160, 160))
    params = {
        **catalog_values(output="matches", threshold=0.95),
        "mask": selection(gray.shape, 20, 20, 21, 21),
    }
    table = matched_filter(gray_rgba(gray), params, NOTHING)
    assert isinstance(table, dict)
    centers = {(row[1], row[0]) for row in table["rows"]}
    assert COPY in centers
    assert FAINT not in centers


def test_the_images() -> None:
    gray = scene()
    mask = selection(gray.shape, 20, 20, 21, 21)
    image = gray_rgba(gray)
    rounded = image[..., 0].astype(float)
    template = rounded[20:41, 20:41]
    out = matched_filter(image, {**catalog_values(), "mask": mask}, NOTHING)
    assert isinstance(out, np.ndarray)
    expected = np.clip(np.round((ncc_map(rounded, template, "reflect101") + 1) * 127.5), 0, 255)
    np.testing.assert_array_equal(out[..., 0], expected)
    plain = matched_filter(image, {**catalog_values(output="correlation"), "mask": mask}, NOTHING)
    assert isinstance(plain, np.ndarray)
    assert plain[TEMPLATE][0] == 255
    assert plain[INVERTED][0] == 0


@pytest.mark.parametrize("output", ["ncc", "correlation", "matches"])
def test_the_representation(output: str) -> None:
    stages = matched_filter_representation(catalog_values(output=output))["stages"]
    names = {
        "ncc": ["Template", "Matched filter", "Normalized"],
        "correlation": ["Template", "Matched filter"],
        "matches": ["Template", "Matched filter", "Normalized", "Matches"],
    }
    assert [s["name"] for s in stages] == names[output]
    for stage in stages:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


def upload(client: TestClient, image: np.ndarray) -> str:
    height, width = image.shape[:2]
    response = client.post(
        f"{API}/images",
        params={"width": width, "height": height},
        content=np.ascontiguousarray(image).tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    image_id: str = response.json()["id"]
    return image_id


def test_the_engine_reads_the_template_from_the_mask(client: TestClient) -> None:
    gray = scene()
    image = gray_rgba(gray)
    mask = selection(gray.shape, 20, 20, 21, 21)
    job = client.post(
        f"{API}/jobs",
        json={
            "filter": "matched-filter",
            "image": upload(client, image),
            "mask": upload(client, gray_rgba(mask)),
            "params": {"output": "matches"},
        },
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
    result = client.get(f"{API}/jobs/{job_id}/result").json()
    expected = matched_filter(image, {**catalog_values(output="matches"), "mask": mask}, NOTHING)
    assert isinstance(expected, dict)
    assert result["rows"] == expected["rows"]


def test_a_job_without_a_template_is_refused(client: TestClient) -> None:
    image = gray_rgba(scene())
    job = client.post(
        f"{API}/jobs", json={"filter": "matched-filter", "image": upload(client, image)}
    )
    assert job.status_code == 422, job.text
