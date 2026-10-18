"""Contours: Chan-Vese, the morphological geodesic active contour and snakes give the results of
their scikit-image functions, start from the selection where they need one, and return label
maps whose inside can become the selection."""

from __future__ import annotations

import base64
from typing import Any

import numpy as np
import pytest
from scipy import ndimage
from skimage.segmentation import (
    active_contour,
    chan_vese,
    inverse_gaussian_gradient,
    mark_boundaries,
    morphological_geodesic_active_contour,
)

from pixelnexus_engine.filters.contours import (
    active_contour_filter,
    active_contour_representation,
    chan_vese_filter,
    chan_vese_level_set,
    chan_vese_representation,
    level_set,
    level_set_inside,
    level_set_representation,
    luma01,
    resample,
    snake_result,
    start_snake,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731
SIZE = 100


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def decoded(result: dict[str, Any]) -> np.ndarray:
    dtype = {8: "<u1", 16: "<u2", 32: "<u4"}[result["bits"]]
    data = np.frombuffer(base64.b64decode(result["data"]), dtype=dtype)
    return data.reshape(result["height"], result["width"]).astype(np.int64)


def disk(radius: int = 20) -> np.ndarray:
    yy, xx = np.mgrid[:SIZE, :SIZE]
    out: np.ndarray = (yy - 50) ** 2 + (xx - 50) ** 2 <= radius**2
    return out


def noisy_disk() -> np.ndarray:
    """A bright disk of radius 20 on a dark ground, with Gaussian noise of 10 levels."""
    gray = np.where(disk(), 200.0, 50.0) + np.random.default_rng(0).normal(0, 10, (SIZE, SIZE))
    g = gray.clip(0, 255).astype(np.uint8)
    return np.dstack([g, g, g, np.full_like(g, 255)])


def box_mask(low: int = 15, high: int = 85) -> np.ndarray:
    mask = np.zeros((SIZE, SIZE), np.uint8)
    mask[low:high, low:high] = 255
    return mask


def overlap(found: np.ndarray, truth: np.ndarray) -> float:
    return float((found & truth).sum() / (found | truth).sum())


# Chan-Vese --------------------------------------------------------------------------------------


def test_chan_vese_is_scikit_image_on_the_luma() -> None:
    image = noisy_disk()
    params = catalog_values("chan-vese", iterations=50)
    _, phi, _ = chan_vese(
        luma01(image), mu=0.25, max_num_iter=50, init_level_set="checkerboard", extended_output=True
    )
    np.testing.assert_array_equal(chan_vese_level_set(image, params), phi)


def test_chan_vese_finds_the_disk_as_phase_one() -> None:
    image = noisy_disk()
    result = chan_vese_filter(image, catalog_values("chan-vese"), NOTHING)
    assert isinstance(result, dict) and result["kind"] == "labels"
    labels = decoded(result)
    assert set(np.unique(labels)) == {1, 2}
    assert overlap(labels == 1, disk()) == 1.0
    assert result["table"]["summary"] == "2 phases"


def test_chan_vese_level_set_has_zero_at_middle_gray() -> None:
    image = noisy_disk()
    params = catalog_values("chan-vese", output="levelSet")
    phi = chan_vese_level_set(image, params)
    out = chan_vese_filter(image, params, NOTHING)
    assert isinstance(out, np.ndarray)
    assert (out[..., 0][phi > 0] >= 128).all() and (out[..., 0][phi < 0] <= 127).all()
    np.testing.assert_array_equal(out[..., 3], image[..., 3])
    boundaries = chan_vese_filter(image, catalog_values("chan-vese", output="boundaries"), NOTHING)
    labels = np.where(phi > 0, 1, 2)
    expected = np.round(mark_boundaries(image[..., :3] / 255, labels) * 255)
    np.testing.assert_array_equal(boundaries[..., :3], expected)


# Level sets -------------------------------------------------------------------------------------


def test_level_set_is_scikit_image_from_the_selection() -> None:
    image = noisy_disk()
    params = {**catalog_values("level-set", iterations=30), "mask": box_mask()}
    gimage = inverse_gaussian_gradient(luma01(image), alpha=100, sigma=2)
    expected = morphological_geodesic_active_contour(
        gimage, 30, init_level_set=(box_mask() > 127).astype(np.int8), smoothing=1, balloon=-1
    )
    np.testing.assert_array_equal(level_set_inside(image, params), expected > 0)


@pytest.mark.parametrize(("balloon", "mask"), [(-1, box_mask()), (1, disk(5) * np.uint8(255))])
def test_level_set_shrinks_or_grows_onto_the_disk(balloon: float, mask: np.ndarray) -> None:
    params = {**catalog_values("level-set", balloon=balloon), "mask": mask}
    result = level_set(noisy_disk(), params, NOTHING)
    assert isinstance(result, dict)
    labels = decoded(result)
    assert set(np.unique(labels)) == {0, 1}
    assert overlap(labels == 1, disk()) > 0.98


def test_level_set_edge_stopping_and_empty_selection() -> None:
    image = noisy_disk()
    params = {**catalog_values("level-set", output="edgeStopping"), "mask": box_mask()}
    out = level_set(image, params, NOTHING)
    assert isinstance(out, np.ndarray)
    g = inverse_gaussian_gradient(luma01(image), alpha=100, sigma=2)
    np.testing.assert_array_equal(out[..., 1], np.clip(np.round(g * 255), 0, 255))
    empty = {**catalog_values("level-set"), "mask": np.zeros((SIZE, SIZE), np.uint8)}
    with pytest.raises(ValueError, match="selection is empty"):
        level_set(image, empty, NOTHING)


# Snakes -----------------------------------------------------------------------------------------


def test_resample_spaces_points_evenly_along_a_closed_polygon() -> None:
    square = np.array([[0.0, 0.0], [0.0, 4.0], [4.0, 4.0], [4.0, 0.0]])
    points = resample(square, 8)
    np.testing.assert_allclose(
        points,
        [[0, 0], [0, 2], [0, 4], [2, 4], [4, 4], [4, 2], [4, 0], [2, 0]],
    )


def test_the_start_snake_is_the_outline_of_the_largest_part() -> None:
    mask = box_mask(20, 60)
    mask[80:90, 80:90] = 255
    mask[30:40, 30:40] = 0  # a hole, filled first
    snake = start_snake(mask, 160)
    assert snake.shape == (160, 2)
    # find_contours at 0.5 runs half a pixel outside the selected pixels.
    assert snake[:, 0].min() == pytest.approx(19.5) and snake[:, 0].max() == pytest.approx(59.5)
    assert snake[:, 1].min() == pytest.approx(19.5) and snake[:, 1].max() == pytest.approx(59.5)
    steps = np.hypot(*np.diff(np.vstack([snake, snake[:1]]), axis=0).T)
    np.testing.assert_allclose(steps, steps.mean(), atol=0.3)


def test_the_snake_is_scikit_image_on_the_blurred_luma() -> None:
    image = noisy_disk()
    params = {**catalog_values("active-contour", iterations=200), "mask": box_mask()}
    start, end = snake_result(image, params)
    blurred = ndimage.gaussian_filter(luma01(image), 2, mode="nearest")
    expected = active_contour(
        blurred, start, alpha=0.05, beta=0.1, gamma=0.01, max_num_iter=200, convergence=0.1
    )
    np.testing.assert_allclose(end, expected)


def test_the_snake_shrinks_onto_the_disk() -> None:
    params = {**catalog_values("active-contour"), "mask": box_mask()}
    _, end = snake_result(noisy_disk(), params)
    radius = np.hypot(end[:, 0] - 50, end[:, 1] - 50)
    assert abs(radius.mean() - 20) < 1 and radius.std() < 1
    result = active_contour_filter(noisy_disk(), params, NOTHING)
    assert isinstance(result, dict)
    assert overlap(decoded(result) == 1, disk()) > 0.9


def test_the_contour_output_draws_start_and_end() -> None:
    params = {**catalog_values("active-contour", output="contour"), "mask": box_mask()}
    out = active_contour_filter(noisy_disk(), params, NOTHING)
    assert isinstance(out, np.ndarray)
    # The start runs at row 14.5, half a pixel outside the selection, and rounds to 14.
    assert tuple(out[14, 50, :3]) == (0, 128, 255)
    assert (np.all(out[..., :3] == (255, 255, 0), axis=-1)).sum() > 100


def test_a_snake_with_nothing_to_stop_it_shrinks_away() -> None:
    flat = np.dstack([np.full((60, 60), 100, np.uint8)] * 3 + [np.full((60, 60), 255, np.uint8)])
    mask = np.zeros((60, 60), np.uint8)
    mask[28:32, 28:32] = 255
    params = {**catalog_values("active-contour", alpha=1, iterations=5000), "mask": mask}
    with pytest.raises(ValueError, match="shrank"):
        active_contour_filter(flat, params, NOTHING)


# Representations --------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("representation", "filter_id"),
    [
        (chan_vese_representation, "chan-vese"),
        (level_set_representation, "level-set"),
        (active_contour_representation, "active-contour"),
    ],
)
def test_the_representations(representation: Any, filter_id: str) -> None:
    stages = representation(catalog_values(filter_id))["stages"]
    assert len(stages) == 4
    for stage in stages:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])
