"""Segmentation from seeds: seeds come from the selection by the border or the map rule, graph cuts
find a labeling of least energy, and the random walker and GrabCut give the results of
scikit-image and OpenCV."""

from __future__ import annotations

import base64
from typing import Any

import cv2
import numpy as np
import pytest
from skimage.segmentation import random_walker

from pixelnexus_engine.filters.interactive import (
    FLOOR,
    box_of,
    grabcut,
    grabcut_inside,
    grabcut_representation,
    grabcut_start,
    graph_cut,
    graph_cut_inside,
    graph_cut_representation,
    luma,
    random_walker_filter,
    random_walker_representation,
    region_costs,
    seeds,
    walker_probability,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731
SIZE = 60


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def decoded(result: dict[str, Any]) -> np.ndarray:
    dtype = {8: "<u1", 16: "<u2", 32: "<u4"}[result["bits"]]
    data = np.frombuffer(base64.b64decode(result["data"]), dtype=dtype)
    return data.reshape(result["height"], result["width"]).astype(np.int64)


def disk(radius: int = 15) -> np.ndarray:
    yy, xx = np.mgrid[:SIZE, :SIZE]
    out: np.ndarray = (yy - 30) ** 2 + (xx - 30) ** 2 <= radius**2
    return out


def scene(noise: float = 6, color: tuple[int, int, int] = (190, 190, 190)) -> np.ndarray:
    """A disk on a ground of 50, with Gaussian noise."""
    image = np.zeros((SIZE, SIZE, 4), np.float64)
    image[..., :3] = 50
    image[disk(), :3] = color
    image[..., :3] += np.random.default_rng(2).normal(0, noise, (SIZE, SIZE, 3))
    image[..., 3] = 255
    return np.clip(np.rint(image), 0, 255).astype(np.uint8)


def spot() -> np.ndarray:
    mask = np.zeros((SIZE, SIZE), np.uint8)
    mask[27:34, 27:34] = 255
    return mask


def overlap(found: np.ndarray, truth: np.ndarray) -> float:
    return float((found & truth).sum() / (found | truth).sum())


# Seeds ------------------------------------------------------------------------------------------


def test_border_seeds_are_the_selection_and_the_unselected_edge() -> None:
    mask = np.zeros((10, 10), np.uint8)
    mask[0:4, 0:4] = 255
    inside, outside = seeds(mask, "border")
    assert inside.sum() == 16
    assert not outside[0, 0] and outside[0, 4] and outside[9, 9]
    assert outside.sum() == 36 - 7


def test_map_seeds_use_three_levels() -> None:
    mask = np.array([[255, 192, 191, 128], [127, 64, 63, 0]], np.uint8)
    inside, outside = seeds(mask, "map")
    assert inside.tolist() == [[True, True, False, False], [False, False, False, False]]
    assert outside.tolist() == [[False, False, False, False], [False, False, True, True]]


@pytest.mark.parametrize(
    ("values", "mode", "message"),
    [
        (np.zeros((5, 5)), "border", "no object seeds"),
        (np.full((5, 5), 255), "border", "no background seeds"),
        (np.where(np.eye(5) > 0, 255, 0), "map", "Every pixel is a seed"),
    ],
)
def test_missing_seeds_stop_with_a_message(values: np.ndarray, mode: str, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        seeds(values.astype(np.uint8), mode)


# Graph cuts -------------------------------------------------------------------------------------


def test_region_costs_come_from_a_histogram_with_a_floor() -> None:
    y = np.array([[0.0, 7.9, 8.0, 255.0]])
    sample = np.array([[True, True, True, False]])
    cost = region_costs(y, sample)
    np.testing.assert_allclose(cost[0, :3], [-np.log(2 / 3)] * 2 + [-np.log(1 / 3)])
    assert cost[0, 3] == pytest.approx(-np.log(FLOOR))


def energy(y: np.ndarray, labels: np.ndarray, params: dict[str, Any]) -> float:
    """The Boykov-Jolly energy, written out on its own: region costs from the seed histograms and
    boundary costs over 8 neighbors, with the weights rounded as the filter rounds them."""
    inside, outside = seeds(params["mask"], params["seeds"])
    total = 0.0
    if (labels & outside).any() or (~labels & inside).any():
        return np.inf
    unknown = ~inside & ~outside
    r_obj = np.rint(params["lambda"] * region_costs(y, inside) * 1000)
    r_bkg = np.rint(params["lambda"] * region_costs(y, outside) * 1000)
    total += r_obj[unknown & labels].sum() + r_bkg[unknown & ~labels].sum()
    h, w = y.shape
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        for r in range(h - dy):
            for c in range(max(0, -dx), w - max(0, dx)):
                if labels[r, c] != labels[r + dy, c + dx]:
                    diff = y[r, c] - y[r + dy, c + dx]
                    b = np.exp(-(diff**2) / (2 * params["sigma"] ** 2)) / np.hypot(dy, dx)
                    total += np.rint(b * 1000)
    return float(total)


def test_graph_cut_has_the_least_energy_among_other_labelings() -> None:
    image = scene(noise=20)[20:40, 20:40]
    mask = np.zeros((20, 20), np.uint8)
    mask[8:12, 8:12] = 255
    y = luma(image)
    for lam in (0.2, 1):
        params = {**catalog_values("graph-cut", **{"lambda": lam}), "mask": mask}
        found = graph_cut_inside(image, params)
        best = energy(y, found, params)
        rng = np.random.default_rng(0)
        others = [mask > 127, np.ones((20, 20), bool), disk()[20:40, 20:40]]
        for _ in range(20):
            flipped = found.copy()
            r, c = rng.integers(1, 19, 2)
            flipped[r - 1 : r + 2, c - 1 : c + 2] ^= True
            others.append(flipped)
        for other in others:
            assert best <= energy(y, other, params)


def test_graph_cut_finds_the_disk_from_a_spot() -> None:
    params = {**catalog_values("graph-cut"), "mask": spot()}
    result = graph_cut(scene(), params, NOTHING)
    assert isinstance(result, dict)
    assert overlap(decoded(result) == 1, disk()) > 0.95


# Random walker ----------------------------------------------------------------------------------


def test_random_walker_is_scikit_image_on_the_luma() -> None:
    image = scene()
    params = {**catalog_values("random-walker"), "mask": spot()}
    inside, outside = seeds(spot(), "border")
    labels = np.where(inside, 1, np.where(outside, 2, 0))
    expected = random_walker(
        luma(image) / 255, labels, beta=130, mode="cg_j", tol=1e-3, return_full_prob=True
    )[0]
    np.testing.assert_allclose(walker_probability(image, params), expected)


def test_random_walker_finds_the_disk_and_shows_the_probability() -> None:
    image = scene()
    params = {**catalog_values("random-walker"), "mask": spot()}
    result = random_walker_filter(image, params, NOTHING)
    assert isinstance(result, dict)
    assert overlap(decoded(result) == 1, disk()) > 0.95
    shown = random_walker_filter(image, {**params, "output": "probability"}, NOTHING)
    assert isinstance(shown, np.ndarray)
    assert shown[30, 30, 0] == 255 and shown[0, 0, 0] == 0


# GrabCut ----------------------------------------------------------------------------------------


def test_the_box_is_the_rectangle_around_the_selection() -> None:
    mask = np.zeros((20, 30), np.uint8)
    mask[3:8, 5:9] = 255
    mask[12, 20] = 255
    assert box_of(mask) == (5, 3, 16, 10)
    with pytest.raises(ValueError, match="empty"):
        box_of(np.zeros((5, 5), np.uint8))
    with pytest.raises(ValueError, match="whole image"):
        box_of(np.full((5, 5), 255, np.uint8))


def test_the_map_start_gives_opencvs_four_classes() -> None:
    mask = np.array([[255, 192, 191, 128, 127, 64, 63, 0]], np.uint8)
    expected = [cv2.GC_FGD] * 2 + [cv2.GC_PR_FGD] * 2 + [cv2.GC_PR_BGD] * 2 + [cv2.GC_BGD] * 2
    assert grabcut_start(mask).tolist() == [expected]


def test_grabcut_is_opencv_with_the_box() -> None:
    image = scene(color=(200, 60, 40))
    mask = np.zeros((SIZE, SIZE), np.uint8)
    mask[10:50, 10:50] = 255
    params = {**catalog_values("grabcut"), "mask": mask}
    classes = np.zeros((SIZE, SIZE), np.uint8)
    cv2.grabCut(
        np.ascontiguousarray(image[..., 2::-1]),
        classes,
        (10, 10, 40, 40),
        np.zeros((1, 65)),
        np.zeros((1, 65)),
        5,
        cv2.GC_INIT_WITH_RECT,
    )
    found = grabcut_inside(image, params)
    np.testing.assert_array_equal(found, np.isin(classes, (cv2.GC_FGD, cv2.GC_PR_FGD)))
    result = grabcut(image, params, NOTHING)
    assert isinstance(result, dict)
    assert overlap(decoded(result) == 1, disk()) > 0.95


def test_grabcut_with_a_map_keeps_certain_pixels() -> None:
    image = scene(color=(200, 60, 40))
    mask = np.full((SIZE, SIZE), 100, np.uint8)
    mask[disk(17)] = 150
    mask[28:33, 5:10] = 255  # background marked as certain object
    found = grabcut_inside(image, {**catalog_values("grabcut", start="map"), "mask": mask})
    assert found[28:33, 5:10].all()


# Representations --------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("representation", "filter_id", "values"),
    [
        (graph_cut_representation, "graph-cut", {}),
        (graph_cut_representation, "graph-cut", {"seeds": "map"}),
        (random_walker_representation, "random-walker", {}),
        (grabcut_representation, "grabcut", {}),
        (grabcut_representation, "grabcut", {"start": "map"}),
    ],
)
def test_the_representations(representation: Any, filter_id: str, values: dict[str, Any]) -> None:
    stages = representation(catalog_values(filter_id, **values))["stages"]
    assert len(stages) == 4
    for stage in stages:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])
