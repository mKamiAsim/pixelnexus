"""The SUSAN edge detector: the response follows the rule of the paper, the direction from the
USAN points across the edge, and the edges are thin and trace a disk."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest

from pixelnexus_engine.filters.susan import (
    OFFSETS,
    edge_normal,
    susan_edge,
    susan_edge_representation,
    susan_edge_stages,
    usan_area,
    usan_moments,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "susan-edge")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def gray_rgba(gray: np.ndarray) -> np.ndarray:
    g = np.clip(np.rint(gray), 0, 255).astype(np.uint8)
    return np.dstack([g, g, g, np.full_like(g, 255)])


def test_the_moments_match_a_brute_force_sum() -> None:
    plane = np.random.default_rng(1).uniform(0, 255, (12, 14))
    sums = usan_moments(plane, 25, "reflect101")
    np.testing.assert_allclose(sums["n"], usan_area(plane, 25, "reflect101"), atol=1e-12)
    padded = np.pad(plane, 3, mode="reflect")
    r, c = 6, 7
    expected = {"n": 0.0, "x": 0.0, "y": 0.0, "xx": 0.0, "yy": 0.0, "xy": 0.0}
    for dy, dx in OFFSETS:
        weight = np.exp(-(((padded[r + 3 + dy, c + 3 + dx] - plane[r, c]) / 25) ** 6))
        for key, factor in (("n", 1), ("x", dx), ("y", dy), ("xx", dx * dx)):
            expected[key] += weight * factor
        expected["yy"] += weight * dy * dy
        expected["xy"] += weight * dx * dy
    for key, value in expected.items():
        assert sums[key][r, c] == pytest.approx(value, abs=1e-12)


def test_the_response_follows_the_paper() -> None:
    gray = np.full((20, 30), 50.0)
    gray[:, 15:] = 200
    stages = susan_edge_stages(gray_rgba(gray), catalog_values())
    g = 0.75 * 37
    expected = np.where(stages["n"] < g, g - stages["n"], 0.0)
    np.testing.assert_array_equal(stages["response"], expected)
    # A flat area has the full area and no response.
    assert stages["n"][10, 3] == pytest.approx(37) and stages["response"][10, 3] == 0


@pytest.mark.parametrize("angle", [0, 45, 90, 135])
def test_the_normal_points_across_a_straight_edge(angle: float) -> None:
    rows, cols = np.mgrid[0:41, 0:41] - 20.0
    theta = np.radians(angle)
    gray = np.where(cols * np.cos(theta) + rows * np.sin(theta) > 0.5, 200.0, 50.0)
    sums = usan_moments(gray, 25, "reflect101")
    # Just inside the dark side, the USAN lies on the dark side, so its center of gravity points
    # away from the edge. The normal is the edge direction, up to its sign.
    normal = edge_normal(sums)[20, 20]
    assert np.isclose(np.sin(normal - theta), 0, atol=0.05)


def test_the_thin_line_case_uses_the_longest_axis() -> None:
    # A one pixel bright line: its USAN is the line itself, under 7 pixels of area.
    gray = np.full((21, 21), 50.0)
    gray[:, 10] = 200
    sums = usan_moments(gray, 25, "reflect101")
    assert sums["n"][10, 10] < 8
    assert np.isclose(np.cos(edge_normal(sums)[10, 10]), 1, atol=1e-9) or np.isclose(
        np.cos(edge_normal(sums)[10, 10]), -1, atol=1e-9
    )


def test_a_step_gives_one_thin_edge_line() -> None:
    gray = np.full((20, 30), 50.0)
    gray[:, 15:] = 200
    out = susan_edge(gray_rgba(gray), catalog_values(), NOTHING)
    edges = out[..., 0] == 255
    # One column on each side of the step has the smallest USAN; suppression keeps both, since
    # they tie, and nothing else.
    columns = np.unique(np.nonzero(edges[3:-3])[1])
    assert set(columns.tolist()) <= {14, 15}
    assert edges[3:-3].any(axis=1).all()


def test_the_edges_trace_a_noisy_disk() -> None:
    rows, cols = np.mgrid[0:80, 0:80]
    gray = np.where((rows - 40) ** 2 + (cols - 40) ** 2 <= 20**2, 200.0, 60.0)
    gray = gray + np.random.default_rng(4).normal(0, 5, gray.shape)
    out = susan_edge(gray_rgba(gray), catalog_values(), NOTHING)
    r, c = np.nonzero(out[..., 0] == 255)
    radius = np.hypot(r - 40, c - 40)
    assert np.mean(np.abs(radius - 20) <= 2) > 0.95
    angles = np.degrees(np.arctan2(r - 40, c - 40)) % 360
    assert len(np.unique((angles // 10).astype(int))) == 36


def test_the_minimum_length_removes_short_pieces() -> None:
    gray = 128 + np.random.default_rng(3).normal(0, 15, (60, 60))
    image = gray_rgba(gray)
    every = susan_edge_stages(image, catalog_values(minLength=1))
    kept = susan_edge_stages(image, catalog_values(minLength=5))
    np.testing.assert_array_equal(every["edges"], every["thin"])
    assert kept["edges"].sum() < every["edges"].sum()
    assert (kept["edges"] <= every["edges"]).all()


def test_the_outputs_and_the_representation() -> None:
    gray = np.full((20, 30), 50.0)
    gray[:, 15:] = 200
    image = gray_rgba(gray)
    stages = susan_edge_stages(image, catalog_values())
    response = susan_edge(image, catalog_values(output="response"), NOTHING)
    expected = np.clip(np.rint(stages["response"] * 255 / (0.75 * 37)), 0, 255)
    np.testing.assert_array_equal(response[..., 0], expected)
    assert (response[..., 3] == 255).all()
    for stage in susan_edge_representation(catalog_values())["stages"]:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])
