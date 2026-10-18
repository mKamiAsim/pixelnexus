"""Split-and-merge segmentation on a quadtree, after Horowitz and Pavlidis (1976), in
PixelNexus's own code.

The predicate is homogeneity of the luma (BT.709) in pixel levels: a region is homogeneous when
its largest and smallest value differ by at most the threshold T. This predicate is our choice
among those the method allows.

* Split: start with the whole image as one block. A block that is not homogeneous splits into
  four quarters, unless both of its sides are at most the smallest size. A side of odd length
  splits into a first half of length // 2 and a second half of the rest, so blocks need not be
  square. A side of 1 cannot split, so such a block splits into two halves only. A block
  stopped by the smallest size can stay not uniform. It then merges with no neighbor and stays
  a region of its own.
* Merge: neighboring regions (sharing an edge of pixels) merge when the merged region is still
  homogeneous. The pairs are tried in the order of the difference of their means, the smallest
  first, and ties go to the pair found first. A merge updates the region's range, and the
  remaining pairs are tested against the merged regions. The order is our choice.

The regions are then numbered in the raster order of their first pixel.
"""

from __future__ import annotations

import heapq
from typing import Any

import numpy as np

from pixelnexus_engine.filters.segmentation import sequential_by_position, show
from pixelnexus_engine.labels import Labels
from pixelnexus_engine.planes import KB, KG, KR, Plane
from pixelnexus_engine.registry import Progress, Rgba, register

Block = tuple[int, int, int, int]


def luma(image: Rgba) -> Plane:
    rgb = image[..., :3].astype(np.float64)
    y: Plane = KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2]
    return y


def split_blocks(plane: Plane, threshold: float, smallest: int) -> Labels:
    """The leaves of the quadtree as labels, numbered in the order they are found."""
    labels = np.zeros(plane.shape, np.int64)
    stack: list[Block] = [(0, 0, plane.shape[0], plane.shape[1])]
    count = 0
    while stack:
        top, left, height, width = stack.pop()
        block = plane[top : top + height, left : left + width]
        small = height <= smallest and width <= smallest
        if small or float(block.max() - block.min()) <= threshold:
            count += 1
            labels[top : top + height, left : left + width] = count
            continue
        h1, w1 = height // 2, width // 2
        # Pushed in reverse, so the top-left quarter is taken first.
        for t, lf, h, w in (
            (top + h1, left + w1, height - h1, width - w1),
            (top + h1, left, height - h1, w1),
            (top, left + w1, h1, width - w1),
            (top, left, h1, w1),
        ):
            if h > 0 and w > 0:
                stack.append((t, lf, h, w))
    return labels


def merge_regions(plane: Plane, labels: Labels, threshold: float) -> Labels:
    """Merge neighboring regions while the merged region stays homogeneous."""
    count = int(labels.max())
    flat = labels.ravel()
    values = plane.ravel()
    low = np.full(count + 1, np.inf)
    high = np.full(count + 1, -np.inf)
    np.minimum.at(low, flat, values)
    np.maximum.at(high, flat, values)
    total = np.bincount(flat, weights=values, minlength=count + 1)
    size = np.bincount(flat, minlength=count + 1).astype(np.float64)
    parent = np.arange(count + 1)

    def root(k: int) -> int:
        while parent[k] != k:
            parent[k] = parent[parent[k]]
            k = int(parent[k])
        return k

    pairs: set[tuple[int, int]] = set()
    for a, b in (
        (labels[:, :-1], labels[:, 1:]),
        (labels[:-1, :], labels[1:, :]),
    ):
        differ = a != b
        for p, q in zip(a[differ].tolist(), b[differ].tolist(), strict=True):
            pairs.add((min(p, q), max(p, q)))
    heap = []
    for order, (p, q) in enumerate(sorted(pairs)):
        gap = abs(total[p] / size[p] - total[q] / size[q])
        heap.append((gap, order, p, q))
    heapq.heapify(heap)
    while heap:
        _, _, p, q = heapq.heappop(heap)
        rp, rq = root(p), root(q)
        if rp == rq:
            continue
        lo, hi = min(low[rp], low[rq]), max(high[rp], high[rq])
        if hi - lo > threshold:
            continue
        parent[rq] = rp
        low[rp], high[rp] = lo, hi
        total[rp] += total[rq]
        size[rp] += size[rq]
    roots = np.array([root(k) for k in range(count + 1)])
    return sequential_by_position(roots[labels])


def split_merge_representation(params: dict[str, Any]) -> dict[str, Any]:
    t = params["threshold"]
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Predicate",
                "formula": f"H(R) = \\left[\\max_R Y - \\min_R Y \\le {t:g}\\right]",
                "note": "A region is homogeneous when its luma spans at most the threshold.",
            },
            {
                "name": "Split",
                "formula": "R \\to R_1, R_2, R_3, R_4 \\quad \\text{while } \\neg H(R)",
                "note": "Blocks split into quarters. A block with both sides at most "
                f"{params['smallest']} px does not split.",
            },
            {
                "name": "Merge",
                "formula": "R_i \\cup R_j \\quad \\text{when adjacent and } H(R_i \\cup R_j)",
                "note": "Neighbors with the closest means are tried first.",
            },
        ],
    }


@register("split-merge", representation=split_merge_representation)
def split_merge(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba | dict[str, Any]:
    plane = luma(image)
    blocks = split_blocks(plane, params["threshold"], params["smallest"])
    progress(0.4)
    if params["output"] == "blocks":
        return show(image, sequential_by_position(blocks), {"output": "regions"}, "block")
    labels = merge_regions(plane, blocks, params["threshold"])
    progress(0.9)
    return show(image, labels, params, "region")
