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


# Watershed and mean shift ---------------------------------------------------------------------


def test_the_elevation_is_the_sobel_of_the_blurred_luma() -> None:
    from scipy import ndimage
    from skimage.filters import sobel

    from pixelnexus_engine.filters.segmentation import elevation

    gray = np.random.default_rng(3).integers(0, 256, (30, 34)).astype(np.uint8)
    expected = sobel(ndimage.gaussian_filter(gray.astype(float), 1.5, mode="nearest"))
    np.testing.assert_allclose(elevation(gray_rgba(gray), 1.5), expected, atol=1e-9)
    np.testing.assert_allclose(elevation(gray_rgba(gray), 0), sobel(gray.astype(float)))


def test_watershed_is_scikit_image_from_h_minima() -> None:
    from scipy import ndimage
    from skimage.morphology import h_minima
    from skimage.segmentation import watershed

    from pixelnexus_engine.filters.segmentation import elevation, watershed_labels

    image = gray_rgba(disks(128, 128))
    height = elevation(image, 1)
    ramp = np.arange(height.size).reshape(height.shape) / height.size
    markers, _ = ndimage.label(h_minima(height + 1e-6 * ramp, 10), structure=np.ones((3, 3)))
    expected = watershed(height, markers)
    labels = watershed_labels(image, catalog_values("watershed"))
    pairs = {(int(a), int(b)) for a, b in zip(expected.ravel(), labels.ravel(), strict=True)}
    assert len(pairs) == labels.max() == len(np.unique(expected))


def test_minima_that_tie_with_the_lowest_level_need_depth_too() -> None:
    from pixelnexus_engine.filters.segmentation import minima_markers

    # Two minima at 0 joined by a pass of 1, and a basin 30 deep behind a ridge.
    height = np.full((5, 9), 1.0)
    height[2, 1] = height[2, 3] = 0
    height[:, 5] = 40
    height[:, 6:] = 20
    height[2, 7] = 10
    markers = minima_markers(height, 5)
    assert markers.max() == 2
    assert markers[2, 7] > 0


def test_watershed_finds_the_noisy_disks_with_enough_depth() -> None:
    from pixelnexus_engine.filters.segmentation import watershed_labels

    noise = np.random.default_rng(1).normal(0, 8, (256, 256))
    gray = np.clip(np.rint(disks(256, 256) + noise), 0, 255).astype(np.uint8)
    labels = watershed_labels(gray_rgba(gray), catalog_values("watershed", h=20))
    # Six disks and the ground.
    assert labels.max() == 7


def test_marker_watershed_grows_one_region_per_part_and_the_border() -> None:
    from pixelnexus_engine.filters.segmentation import marker_watershed, selection_markers

    gray = np.full((80, 80), 40, np.uint8)
    gray[10:40, 10:40] = 200
    gray[45:75, 45:75] = 120
    mask = np.zeros((80, 80), np.uint8)
    mask[20:25, 20:25] = 255
    mask[55:60, 55:60] = 255
    markers = selection_markers(mask, True)
    assert markers.max() == 3 and (markers[0] == 3).all()
    params = {**catalog_values("marker-watershed"), "mask": mask}
    result = marker_watershed(gray_rgba(gray), params, NOTHING)
    assert isinstance(result, dict)
    labels = decoded(result)
    assert (labels[12:38, 12:38] == 1).all()
    assert (labels[47:73, 47:73] == 2).all()
    assert labels[2, 60] == 3 and labels[60, 2] == 3


def test_marker_watershed_needs_two_markers() -> None:
    from pixelnexus_engine.filters.segmentation import marker_watershed_labels, selection_markers

    mask = np.zeros((20, 20), np.uint8)
    with pytest.raises(ValueError, match="empty"):
        selection_markers(mask, True)
    mask[5:10, 5:10] = 255
    params = {**catalog_values("marker-watershed", borderMarker=False), "mask": mask}
    with pytest.raises(ValueError, match="only one marker"):
        marker_watershed_labels(gray_rgba(np.zeros((20, 20), np.uint8)), params)


def test_mean_shift_is_opencv_and_groups_similar_colors() -> None:
    import cv2

    from pixelnexus_engine.filters.segmentation import (
        mean_shift,
        mean_shift_colors,
        similar_color_labels,
    )

    image = colors(40)
    params = catalog_values("mean-shift")
    expected = cv2.pyrMeanShiftFiltering(np.ascontiguousarray(image[..., :3]), 10, 20, maxLevel=1)
    np.testing.assert_array_equal(mean_shift_colors(image, params), expected)
    filtered = mean_shift(image, catalog_values("mean-shift", output="filtered"), NOTHING)
    assert isinstance(filtered, np.ndarray)
    np.testing.assert_array_equal(filtered[..., :3], expected)
    rgb = np.zeros((3, 4, 3), np.uint8)
    rgb[:, 2:] = 10
    rgb[0, 0] = 2
    assert similar_color_labels(rgb, 0).tolist() == [[1, 2, 3, 3], [2, 2, 3, 3], [2, 2, 3, 3]]
    assert similar_color_labels(rgb, 2).tolist() == [[1, 1, 2, 2], [1, 1, 2, 2], [1, 1, 2, 2]]


def test_the_new_representations() -> None:
    from pixelnexus_engine.filters.segmentation import (
        marker_watershed_representation,
        mean_shift_representation,
        watershed_representation,
    )

    for representation, filter_id in (
        (watershed_representation, "watershed"),
        (marker_watershed_representation, "marker-watershed"),
        (mean_shift_representation, "mean-shift"),
    ):
        stages = representation(catalog_values(filter_id))["stages"]
        assert len(stages) == 3
        for stage in stages:
            assert all(ch >= " " for ch in stage["formula"] + stage["note"])
