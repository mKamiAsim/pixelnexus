"""Split-and-merge: the quadtree splits until blocks are uniform, merging joins neighbors while
the union stays uniform, and regions follow uniform areas."""

from __future__ import annotations

from typing import Any

import numpy as np

from pixelnexus_engine.filters.split_merge import (
    merge_regions,
    split_blocks,
    split_merge,
    split_merge_representation,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "split-merge")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def gray_rgba(gray: np.ndarray) -> np.ndarray:
    return np.dstack([gray, gray, gray, np.full_like(gray, 255)]).astype(np.uint8)


def test_a_uniform_image_is_one_block() -> None:
    plane = np.full((16, 16), 50.0)
    assert split_blocks(plane, 0, 1).max() == 1


def test_blocks_split_into_quarters_until_uniform() -> None:
    plane = np.zeros((8, 8))
    plane[0, 0] = 100
    blocks = split_blocks(plane, 10, 1)
    # The top-left quarter splits twice, down to one pixel: 3 + 3 + 1 + 3 blocks.
    assert blocks.max() == 10
    assert np.unique(blocks[4:, 4:]).size == 1
    assert (blocks == blocks[0, 0]).sum() == 1


def test_odd_sides_split_unevenly() -> None:
    plane = np.arange(15.0).reshape(3, 5)
    blocks = split_blocks(plane, 0, 1)
    # 3 x 5 splits into 1 x 2, 1 x 3, 2 x 2 and 2 x 3, and on down to single pixels.
    assert blocks.max() == 15
    assert blocks[0].tolist() == [1, 2, 3, 4, 5]


def test_the_smallest_block_stops_the_split() -> None:
    plane = np.random.default_rng(1).random((16, 16)) * 255
    blocks = split_blocks(plane, 0, 4)
    assert blocks.max() == 16
    for k in range(1, 17):
        rows, cols = np.nonzero(blocks == k)
        assert np.ptp(rows) + 1 == 4 and np.ptp(cols) + 1 == 4


def test_merging_joins_the_grid_back_into_uniform_areas() -> None:
    plane = np.full((32, 32), 20.0)
    plane[5:27, 9:30] = 200
    blocks = split_blocks(plane, 10, 1)
    assert blocks.max() > 2
    labels = merge_regions(plane, blocks, 10)
    assert labels.max() == 2
    assert (labels[plane == 200] == labels[10, 10]).all()
    assert (labels[plane == 20] == 1).all()


def test_merging_keeps_regions_uniform() -> None:
    # With blocks down to one pixel, every block is uniform, and so is every merged region.
    plane = np.random.default_rng(2).integers(0, 100, (24, 24)).astype(float)
    labels = merge_regions(plane, split_blocks(plane, 30, 1), 30)
    for k in range(1, labels.max() + 1):
        values = plane[labels == k]
        assert values.max() - values.min() <= 30


def test_the_outputs_and_representation() -> None:
    gray = np.full((32, 32), 20, np.uint8)
    gray[5:27, 9:30] = 200
    result = split_merge(gray_rgba(gray), catalog_values(smallest=1), NOTHING)
    assert isinstance(result, dict)
    assert result["table"]["summary"] == "2 regions"
    # With the default smallest block of 4, blocks that straddle the edge of the rectangle stop
    # splitting, are not uniform, and stay regions of their own.
    coarse = split_merge(gray_rgba(gray), catalog_values(), NOTHING)
    assert isinstance(coarse, dict)
    assert len(coarse["table"]["rows"]) > 2
    blocks = split_merge(gray_rgba(gray), catalog_values(output="blocks"), NOTHING)
    assert isinstance(blocks, dict)
    assert len(blocks["table"]["rows"]) > 2
    stages = split_merge_representation(catalog_values())["stages"]
    assert [s["name"] for s in stages] == ["Predicate", "Split", "Merge"]
