"""Morphology with distances and max-trees: the medial axis of scikit-image with its distances,
and area and diameter openings and closings that remove small components and keep the rest
exactly."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest
from skimage.morphology import area_closing, area_opening, diameter_opening, medial_axis

from pixelnexus_engine.filters.tree_morphology import (
    area_closing_filter,
    area_opening_filter,
    attribute_opening,
    attribute_stages,
    axis_and_distance,
    medial_axis_filter,
    medial_axis_representation,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def gray_rgba(gray: np.ndarray) -> np.ndarray:
    g = gray.astype(np.uint8)
    return np.dstack([g, g, g, np.full_like(g, 255)])


def scene() -> np.ndarray:
    """A large bright rectangle, a 4 x 4 bright square, a bright pixel, a thin bright line 1 x 30
    and a dark 2 x 10 bar, on a ground of 50."""
    gray = np.full((60, 80), 50, np.uint8)
    gray[10:50, 10:30] = 200
    gray[20:24, 50:54] = 230
    gray[40, 60] = 255
    gray[5, 40:70] = 220
    gray[30:32, 65:75] = 10
    return gray


# Medial axis ------------------------------------------------------------------------------------


def test_the_medial_axis_is_scikit_image_with_distances() -> None:
    gray = scene()
    axis, distance = axis_and_distance(gray_rgba(gray))
    expected, expected_distance = medial_axis(gray >= 128, return_distance=True, rng=0)
    np.testing.assert_array_equal(axis, expected)
    np.testing.assert_array_equal(distance, expected_distance)
    # The middle of the 20 pixel wide rectangle is 10 pixels from the ground.
    assert distance[axis].max() == 10


def test_the_medial_axis_outputs() -> None:
    image = gray_rgba(scene())
    axis, _ = axis_and_distance(image)
    shown = medial_axis_filter(image, catalog_values("medial-axis"), NOTHING)
    np.testing.assert_array_equal(shown[..., 0] == 255, axis)
    widths = medial_axis_filter(image, catalog_values("medial-axis", output="distance"), NOTHING)
    assert widths[..., 0].max() == 255 and (widths[..., 0][~axis] == 0).all()
    overlay = medial_axis_filter(image, catalog_values("medial-axis", output="overlay"), NOTHING)
    assert (np.all(overlay[..., :3] == (255, 214, 10), axis=-1) == axis).all()


# Attribute filters ------------------------------------------------------------------------------


def test_the_area_opening_removes_small_bright_parts_and_keeps_the_line() -> None:
    gray = scene()
    out = area_opening_filter(gray_rgba(gray), catalog_values("area-opening", area=20), NOTHING)
    np.testing.assert_array_equal(out[..., 0], area_opening(gray, 20, connectivity=2))
    assert out[20:24, 50:54, 0].max() == 50 and out[40, 60, 0] == 50
    np.testing.assert_array_equal(out[5, 40:70, 0], 220)
    np.testing.assert_array_equal(out[10:50, 10:30, 0], 200)


def test_the_area_closing_fills_small_dark_parts() -> None:
    gray = scene()
    params = catalog_values("area-closing", area=30, connectivity="4")
    out = area_closing_filter(gray_rgba(gray), params, NOTHING)
    np.testing.assert_array_equal(out[..., 0], area_closing(gray, 30, connectivity=1))
    assert out[30:32, 65:75, 0].min() == 50


def test_the_diameter_opening_keeps_the_line_that_the_area_removes() -> None:
    gray = scene()
    diameter = attribute_opening(
        gray_rgba(gray), catalog_values("attribute-opening", threshold=8), NOTHING
    )
    np.testing.assert_array_equal(diameter[..., 0], diameter_opening(gray, 8, connectivity=2))
    np.testing.assert_array_equal(diameter[5, 40:70, 0], 220)
    assert diameter[20:24, 50:54, 0].max() == 50
    area = attribute_opening(
        gray_rgba(gray),
        catalog_values("attribute-opening", attribute="area", threshold=31),
        NOTHING,
    )
    assert area[5, 40:70, 0].max() == 50


@pytest.mark.parametrize(
    ("filter_id", "kind", "values"),
    [
        ("area-opening", "area_opening", {}),
        ("area-closing", "area_closing", {"connectivity": "4"}),
        ("attribute-opening", "diameter_opening", {}),
    ],
)
def test_the_representations(filter_id: str, kind: str, values: dict[str, Any]) -> None:
    for stages in (
        attribute_stages(catalog_values(filter_id, **values), kind)["stages"],
        medial_axis_representation(catalog_values("medial-axis"))["stages"],
    ):
        assert len(stages) == 3
        for stage in stages:
            assert all(ch >= " " for ch in stage["formula"] + stage["note"])
