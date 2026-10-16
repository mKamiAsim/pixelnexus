"""Segmentation into regions: label maps encode and describe their regions, and each filter gives
the labels of its scikit-image function, numbered from 1, as regions, boundaries or mean
colors."""

from __future__ import annotations

import base64
import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from skimage.filters import threshold_multiotsu
from skimage.segmentation import felzenszwalb, mark_boundaries, quickshift, slic

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.keypoints import luma8
from pixelnexus_engine.filters.segmentation import (
    felzenszwalb_filter,
    felzenszwalb_labels,
    felzenszwalb_representation,
    multi_otsu,
    multi_otsu_labels,
    multi_otsu_representation,
    quickshift_filter,
    quickshift_labels,
    quickshift_representation,
    slic_filter,
    slic_labels,
    slic_representation,
)
from pixelnexus_engine.labels import bits_for, encode, label_result, mean_colors, region_rows
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries
from synthetic import disks

API = "/api/v1"
CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def gray_rgba(gray: np.ndarray) -> np.ndarray:
    return np.dstack([gray, gray, gray, np.full_like(gray, 255)]).astype(np.uint8)


def colors(size: int = 48) -> np.ndarray:
    """Four flat colored quarters with a little noise."""
    image = np.zeros((size, size, 4), np.uint8)
    half = size // 2
    image[:half, :half, :3] = (200, 40, 40)
    image[:half, half:, :3] = (40, 160, 60)
    image[half:, :half, :3] = (40, 60, 200)
    image[half:, half:, :3] = (220, 220, 220)
    noise = np.random.default_rng(1).integers(-6, 7, (size, size, 3))
    image[..., :3] = np.clip(image[..., :3].astype(int) + noise, 0, 255)
    image[..., 3] = 255
    return image


def decoded(result: dict[str, Any]) -> np.ndarray:
    dtype = {8: "<u1", 16: "<u2", 32: "<u4"}[result["bits"]]
    data = np.frombuffer(base64.b64decode(result["data"]), dtype=dtype)
    return data.reshape(result["height"], result["width"]).astype(np.int64)


# Label maps -----------------------------------------------------------------------------------


def test_the_labels_use_the_smallest_width_that_fits() -> None:
    assert [bits_for(n) for n in (0, 255, 256, 65535, 65536)] == [8, 8, 16, 16, 32]
    labels = np.array([[0, 1], [300, 70000]])
    bits, data = encode(labels)
    assert bits == 32
    assert np.frombuffer(base64.b64decode(data), "<u4").tolist() == [0, 1, 300, 70000]


def test_the_region_table() -> None:
    labels = np.array([[1, 1, 2], [1, 0, 2], [3, 3, 2]])
    gray = np.array([[10, 20, 90], [30, 200, 90], [5, 7, 120]], np.uint8)
    rows = region_rows(labels, gray_rgba(gray))
    assert rows[0] == [1, 3, 0.333, 0.333, 20.0]
    assert rows[1] == [2, 3, 2.0, 1.0, pytest.approx(100)]
    assert rows[2] == [3, 2, 0.5, 2.0, pytest.approx(6)]


def test_a_label_result_round_trips() -> None:
    labels = np.array([[1, 1, 2], [1, 0, 2]])
    result = label_result(labels, gray_rgba(np.zeros((2, 3), np.uint8)), "region")
    assert result["kind"] == "labels"
    assert (result["width"], result["height"], result["bits"]) == (3, 2, 8)
    np.testing.assert_array_equal(decoded(result), labels)
    assert result["table"]["summary"] == "2 regions"
    assert [c["key"] for c in result["table"]["columns"]] == ["label", "area", "x", "y", "mean"]


def test_mean_colors_fill_each_region_and_keep_label_0() -> None:
    labels = np.array([[1, 1], [0, 2]])
    image = np.zeros((2, 2, 4), np.uint8)
    image[..., 0] = [[10, 21], [99, 50]]
    image[..., 3] = 7
    out = mean_colors(labels, image)
    assert out[..., 0].tolist() == [[16, 16], [99, 50]]
    assert (out[..., 3] == 7).all()


# The filters ----------------------------------------------------------------------------------


def test_slic_is_scikit_image_numbered_from_1() -> None:
    image = colors()
    params = catalog_values("slic", segments=16)
    expected = slic(image[..., :3] / 255, n_segments=16, compactness=10, start_label=1)
    labels = slic_labels(image, params)
    assert labels.min() == 1
    assert set(np.unique(labels)) == set(range(1, labels.max() + 1))
    # The same partition: each old label maps to one new label.
    pairs = {(int(a), int(b)) for a, b in zip(expected.ravel(), labels.ravel(), strict=True)}
    assert len(pairs) == len(np.unique(expected)) == labels.max()


def test_felzenszwalb_is_scikit_image_plus_1() -> None:
    image = colors()
    expected = felzenszwalb(image[..., :3] / 255, scale=1, sigma=0.8, min_size=20)
    np.testing.assert_array_equal(
        felzenszwalb_labels(image, catalog_values("felzenszwalb")), expected + 1
    )


def test_quickshift_is_scikit_image_plus_1() -> None:
    image = colors(32)
    expected = quickshift(image[..., :3] / 255, ratio=1, kernel_size=5, max_dist=10, rng=42)
    np.testing.assert_array_equal(
        quickshift_labels(image, catalog_values("quickshift")), expected + 1
    )


def test_the_four_quarters_are_found() -> None:
    image = colors()
    for labels in (
        felzenszwalb_labels(image, catalog_values("felzenszwalb", minSize=200)),
        quickshift_labels(image, catalog_values("quickshift", kernelSize=3, maxDist=30)),
    ):
        assert labels.max() == 4
        for quarter in (labels[:24, :24], labels[:24, 24:], labels[24:, :24], labels[24:, 24:]):
            assert np.unique(quarter).size == 1


@pytest.mark.parametrize("classes", [2, 3, 4])
def test_multi_otsu_classes_follow_scikit_image(classes: int) -> None:
    image = gray_rgba(disks(128, 128))
    thresholds = threshold_multiotsu(luma8(image), classes=classes)
    labels = multi_otsu_labels(image, catalog_values("multi-otsu", classes=classes))
    # A gray level equal to a threshold stays in the class below.
    np.testing.assert_array_equal(labels, np.digitize(luma8(image), thresholds, right=True) + 1)


def test_multi_otsu_splits_three_levels_exactly() -> None:
    # scikit-image's thresholds are 20 and 120 here, levels that belong to the class below.
    gray = np.repeat(np.array([20, 120, 230], np.uint8), 30)[None, :].repeat(10, axis=0)
    assert threshold_multiotsu(gray).tolist() == [20, 120]
    labels = multi_otsu_labels(gray_rgba(gray), catalog_values("multi-otsu"))
    assert labels[0].tolist() == [1] * 30 + [2] * 30 + [3] * 30
    out = multi_otsu(gray_rgba(gray), catalog_values("multi-otsu", output="levels"), NOTHING)
    assert isinstance(out, np.ndarray)
    assert sorted(set(out[0, :, 0].tolist())) == [0, 128, 255]


@pytest.mark.parametrize(
    ("filter_id", "function", "noun"),
    [
        ("slic", slic_filter, "superpixel"),
        ("felzenszwalb", felzenszwalb_filter, "region"),
        ("quickshift", quickshift_filter, "region"),
        ("multi-otsu", multi_otsu, "class"),
    ],
)
def test_the_outputs(filter_id: str, function: Any, noun: str) -> None:
    image = colors(32)
    result = function(image, catalog_values(filter_id), NOTHING)
    assert isinstance(result, dict)
    labels = decoded(result)
    count = len(result["table"]["rows"])
    plural = "classes" if noun == "class" else f"{noun}s"
    assert result["table"]["summary"] in (f"{count} {plural}", f"1 {noun}")
    boundaries = function(image, catalog_values(filter_id, output="boundaries"), NOTHING)
    expected = np.clip(np.round(mark_boundaries(image[..., :3] / 255, labels) * 255), 0, 255)
    np.testing.assert_array_equal(boundaries[..., :3], expected)
    mean = function(image, catalog_values(filter_id, output="mean"), NOTHING)
    np.testing.assert_array_equal(mean, mean_colors(labels, image))


@pytest.mark.parametrize(
    ("representation", "filter_id"),
    [
        (slic_representation, "slic"),
        (felzenszwalb_representation, "felzenszwalb"),
        (quickshift_representation, "quickshift"),
        (multi_otsu_representation, "multi-otsu"),
    ],
)
def test_the_representations(representation: Any, filter_id: str) -> None:
    stages = representation(catalog_values(filter_id))["stages"]
    assert len(stages) == 3
    for stage in stages:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])


# The engine API -------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


def test_the_engine_returns_the_label_map(client: TestClient) -> None:
    image = colors(32)
    upload = client.post(
        f"{API}/images",
        params={"width": 32, "height": 32},
        content=image.tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    job = client.post(f"{API}/jobs", json={"filter": "slic", "image": upload.json()["id"]})
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
    np.testing.assert_array_equal(decoded(result), slic_labels(image, catalog_values("slic")))
