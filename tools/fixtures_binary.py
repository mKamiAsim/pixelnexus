"""Reference results for the binary morphology filters of Phase 5d.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json, on a
named input of blobs. Values at or above 128 are foreground, and results are 0 or 255.
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage
from skimage import morphology as skmorph

from fixtures_morphology import element
from fixtures_rank import PAD_MODES, SCIPY_MODES

FloatArray = NDArray[np.float64]
BoolArray = NDArray[np.bool_]
Add = Callable[..., None]

EIGHT = np.ones((3, 3), dtype=bool)
FOUR = ndimage.generate_binary_structure(2, 1)


def _fail(message: str) -> None:
    raise SystemExit(message)


def out(bits: BoolArray) -> FloatArray:
    return np.where(bits, 255.0, 0.0)


def zhang_suen(img: BoolArray, limit: float = np.inf) -> BoolArray:
    """Zhang and Suen's two sub-iterations, as in their paper, with background outside."""
    a = np.pad(img.astype(bool), 1)
    n = 0
    while n < limit:
        removed = False
        for step in (0, 1):
            p = a

            def at(dy: int, dx: int, p: BoolArray = p) -> BoolArray:
                return np.roll(np.roll(p, dy, 0), dx, 1)

            p2, p3, p4, p5 = at(1, 0), at(1, -1), at(0, -1), at(-1, -1)
            p6, p7, p8, p9 = at(-1, 0), at(-1, 1), at(0, 1), at(1, 1)
            seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
            b = sum(x.astype(int) for x in seq[:8])
            a_count = sum(((~seq[i]) & seq[i + 1]).astype(int) for i in range(8))
            if step == 0:
                c = ~(p2 & p4 & p6) & ~(p4 & p6 & p8)
            else:
                c = ~(p2 & p4 & p8) & ~(p2 & p6 & p8)
            d = p & (b >= 2) & (b <= 6) & (a_count == 1) & c
            d[0, :] = d[-1, :] = d[:, 0] = d[:, -1] = False
            if d.any():
                removed = True
            a = p & ~d
        n += 1
        if not removed:
            break
    return np.asarray(a[1:-1, 1:-1], dtype=bool)


def thin(img: BoolArray, method: str, limit: float = np.inf) -> BoolArray:
    if method == "guo-hall":
        it = None if limit == np.inf else int(limit)
        return np.asarray(skmorph.thin(img, max_num_iter=it), dtype=np.bool_)  # type: ignore[no-untyped-call]
    return zhang_suen(img, limit)


def skeleton(img: BoolArray, spec: str) -> BoolArray:
    fp = element(spec).astype(bool)
    s = np.zeros_like(img, dtype=bool)
    eroded = img.copy()
    while eroded.any():
        opened = ndimage.binary_dilation(ndimage.binary_erosion(eroded, fp), fp)
        s |= eroded & ~opened
        eroded = ndimage.binary_erosion(eroded, fp)
    return s


def _is_end_code(code: int) -> bool:
    if code == 0:
        return False
    if code in (1 << 1, 1 << 3, 1 << 5, 1 << 7):
        return True
    for side in (0, 2, 4, 6):
        allowed = (1 << side) | (1 << ((side + 1) % 8)) | (1 << ((side + 7) % 8))
        if code & (1 << side) and not code & ~allowed:
            return True
    return False


END_TABLE = np.array([_is_end_code(c) for c in range(256)])
# Bits E, NE, N, NW, W, SW, S, SE, as rows and columns of a 3 x 3 window.
NEIGHBOR_BITS = np.array([[8, 4, 2], [16, 0, 1], [32, 64, 128]])


def end_points(img: BoolArray) -> BoolArray:
    codes = ndimage.correlate(img.astype(int), NEIGHBOR_BITS, mode="constant")
    return np.asarray(img & END_TABLE[codes], dtype=bool)


def prune(img: BoolArray, n: int) -> BoolArray:
    x1 = img.copy()
    for _ in range(n):
        x1 = x1 & ~end_points(x1)
    x3 = end_points(x1)
    for _ in range(n):
        x3 = ndimage.binary_dilation(x3, EIGHT) & img
    return np.asarray(x1 | x3, dtype=bool)


def ccl(img: BoolArray, conn: int, low: float, high: float) -> BoolArray:
    labels, _ = ndimage.label(img, EIGHT if conn == 8 else FOUR)
    areas = np.bincount(labels.ravel())
    keep = (areas >= low) & (areas <= high)
    keep[0] = False
    return np.asarray(keep[labels], dtype=bool)


def hit_or_miss(plane: FloatArray, rows: list[list[int]], border: str) -> FloatArray:
    k = np.array(rows)
    r = max(k.shape) // 2
    p = np.pad(plane, r, mode=PAD_MODES[border]) >= 128  # type: ignore[call-overload]
    hit = ndimage.binary_hit_or_miss(p, structure1=k == 1, structure2=k == -1)
    return out(hit[r:-r, r:-r])


def blobs(shape: tuple[int, int]) -> FloatArray:
    rng = np.random.default_rng(31)
    smooth = ndimage.gaussian_filter(rng.random(shape), 1.1)
    return np.where(smooth > np.median(smooth), 255.0, 0.0)


def _checks() -> None:
    bar = np.zeros((11, 20), dtype=bool)
    bar[3:8, 2:18] = True
    line = zhang_suen(bar)
    if (
        not (line.sum(axis=0)[5:14] == 1).all()
        or (line.sum(axis=0) > 1).any()
        or (line & ~bar).any()
    ):
        _fail("Zhang-Suen does not thin a bar to a line one pixel thick")
    rng = np.random.default_rng(12)
    shapes = ndimage.binary_dilation(rng.random((30, 30)) > 0.95, iterations=2)
    for method in ("zhang-suen", "guo-hall"):
        thinned = thin(shapes, method)
        if ndimage.label(thinned, EIGHT)[1] != ndimage.label(shapes, EIGHT)[1]:
            _fail(f"{method} thinning changes the number of components")
    # A horizontal line with a vertical spur of 2 pixels: pruning by 3 removes the spur and
    # keeps the line at its full length.
    t = np.zeros((9, 31), dtype=bool)
    t[6, 1:30] = True
    t[4:6, 15] = True
    pruned = prune(t, 3)
    if pruned[4:6, 15].any() or not pruned[6, 1:30].all():
        _fail("Pruning does not remove the spur and keep the line")


def add_binary_cases(plane: FloatArray, add: Add) -> dict[str, FloatArray]:
    _checks()
    shape = blobs(plane.shape)
    img = shape >= 128
    for method in ("zhang-suen", "guo-hall"):
        for limit in (0, 1):
            add(
                "thinning",
                {"method": method, "iterations": limit, "border": "reflect101"},
                out(thin(img, method, np.inf if limit == 0 else limit)),
                "skimage.morphology.thin"
                if method == "guo-hall"
                else "NumPy, the rules of Zhang and Suen",
                input_name="blobs",
            )
        add(
            "thickening",
            {"method": method, "iterations": 2, "border": "reflect101"},
            out(~thin(~img, method, 2)),
            "the complement thinned as above",
            input_name="blobs",
        )
    for spec in ("cross 1", "disk 1", "custom 1 1 0; 0 1 0; 0 0 0"):
        add(
            "skeleton",
            {"element": spec, "border": "reflect101"},
            out(skeleton(img, spec)),
            "scipy.ndimage binary_erosion and binary_dilation",
            input_name="blobs",
        )
    for n in (1, 2):
        add(
            "pruning",
            {"length": n, "border": "reflect101"},
            out(prune(thin(img, "zhang-suen"), n)),
            "NumPy, the four steps of Gonzalez and Woods",
            input_name="thin",
        )
    for conn in (4, 8):
        hull = skmorph.convex_hull_object(img, connectivity=1 if conn == 4 else 2)  # type: ignore[no-untyped-call]
        add(
            "convex-hull",
            {"connectivity": str(conn), "border": "reflect101"},
            out(np.asarray(hull, dtype=bool)),
            "skimage.morphology.convex_hull_object",
            input_name="blobs",
        )
        for low, high in ((1, 5), (6, 1000)):
            add(
                "ccl-filter",
                {
                    "connectivity": str(conn),
                    "minArea": low,
                    "maxArea": high,
                    "border": "reflect101",
                },
                out(ccl(img, conn, low, high)),
                "scipy.ndimage.label",
                input_name="blobs",
            )
    for border in SCIPY_MODES:
        for rows in (
            [[-1, -1, -1], [-1, 1, -1], [-1, -1, -1]],
            [[0, -1, -1], [1, 1, -1], [0, 1, 0]],
        ):
            text = "; ".join(" ".join(str(v) for v in row) for row in rows)
            add(
                "hit-or-miss",
                {"pattern": text, "border": border},
                hit_or_miss(plane, rows, border),
                "scipy.ndimage.binary_hit_or_miss on the extended plane",
            )
    return {"blobs": shape, "thin": out(thin(img, "zhang-suen"))}
