"""Reference results for the grayscale morphology filters of Phase 5d.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json, and the
structuring element masks to its "elements" section. The masks are checked against
scikit-image, and single steps against scipy.ndimage.grey_erosion and grey_dilation.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage
from skimage import morphology as skmorph

from fixtures_rank import PAD_MODES, SCIPY_MODES

FloatArray = NDArray[np.float64]
Add = Callable[..., None]

DEPTH = {
    "erosion": 1,
    "dilation": 1,
    "opening": 2,
    "closing": 2,
    "morph-gradient": 1,
    "internal-gradient": 1,
    "external-gradient": 1,
    "tophat": 2,
    "blackhat": 2,
}


def _fail(message: str) -> None:
    raise SystemExit(message)


def _from(rx: int, ry: int, inside: Callable[[int, int], bool]) -> NDArray[np.uint8]:
    return np.array(
        [[1 if inside(x, y) else 0 for x in range(-rx, rx + 1)] for y in range(-ry, ry + 1)],
        dtype=np.uint8,
    )


def line_pixels(length: int, angle: float) -> list[tuple[int, int]]:
    h = (length - 1) // 2
    t = angle * math.pi / 180
    c, s = math.cos(t), -math.sin(t)

    def rnd(v: float) -> int:
        return int(math.copysign(math.floor(abs(v) + 0.5), v))

    return [(rnd(k * c), rnd(k * s)) for k in range(-h, h + 1)]


def element(spec: str) -> NDArray[np.uint8]:
    """The mask of a structuring element written as on the docs page. The anchor is the center."""
    name, *rest = spec.split()
    if name == "custom":
        rows = [r.split() for r in " ".join(rest).split(";") if r.strip()]
        return np.array([[int(v) for v in r] for r in rows], dtype=np.uint8)
    a = int(float(rest[0]))
    b = float(rest[1]) if len(rest) > 1 else 0.0
    if name == "disk":
        return _from(a, a, lambda x, y: x * x + y * y <= a * a)
    if name == "diamond":
        return _from(a, a, lambda x, y: abs(x) + abs(y) <= a)
    if name == "cross":
        return _from(a, a, lambda x, y: x == 0 or y == 0)
    if name == "rect":
        return np.ones((int(b), a), dtype=np.uint8)
    if name == "ellipse":
        bb = int(b)
        return _from(a, bb, lambda x, y: (x / (a + 1)) ** 2 + (y / (bb + 1)) ** 2 < 1)
    if name == "line":
        pixels = set(line_pixels(a, b))
        r = max(max(abs(x), abs(y)) for x, y in pixels)
        return _from(r, r, lambda x, y: (x, y) in pixels)
    raise ValueError(spec)


def reach(fp: NDArray[np.uint8]) -> int:
    return int(max(fp.shape)) // 2


def morphology(plane: FloatArray, op: str, spec: str, n: int, border: str) -> FloatArray:
    fp = element(spec)
    r = DEPTH[op] * n * reach(fp)
    p = np.pad(plane, r, mode=PAD_MODES[border])  # type: ignore[call-overload]

    def erode(a: FloatArray) -> FloatArray:
        for _ in range(n):
            a = ndimage.grey_erosion(a, footprint=fp, mode="nearest")
        return a

    def dilate(a: FloatArray) -> FloatArray:
        for _ in range(n):
            a = ndimage.grey_dilation(a, footprint=fp, mode="nearest")
        return a

    if op == "erosion":
        out = erode(p)
    elif op == "dilation":
        out = dilate(p)
    elif op == "opening":
        out = dilate(erode(p))
    elif op == "closing":
        out = erode(dilate(p))
    elif op == "morph-gradient":
        out = dilate(p) - erode(p)
    elif op == "internal-gradient":
        out = p - erode(p)
    elif op == "external-gradient":
        out = dilate(p) - p
    elif op == "tophat":
        out = p - dilate(erode(p))
    else:
        out = erode(dilate(p)) - p
    return np.asarray(out[r:-r, r:-r] if r else out, dtype=np.float64)


def _checks(plane: FloatArray) -> None:
    for r in (1, 2, 4, 7):
        if not np.array_equal(element(f"disk {r}"), skmorph.disk(r)):  # type: ignore[no-untyped-call]
            _fail(f"disk {r} disagrees with skimage.morphology.disk")
        if not np.array_equal(element(f"diamond {r}"), skmorph.diamond(r)):  # type: ignore[no-untyped-call]
            _fail(f"diamond {r} disagrees with skimage.morphology.diamond")
    for a, b in ((3, 2), (1, 4), (5, 5)):
        if not np.array_equal(element(f"ellipse {a} {b}"), skmorph.ellipse(a, b)):  # type: ignore[no-untyped-call]
            _fail(f"ellipse {a} {b} disagrees with skimage.morphology.ellipse")
    # One step equals SciPy with the border mode applied directly, also for an element that is
    # not symmetric, which shows that dilation turns the element.
    for spec in ("disk 2", "custom 1 1 0; 0 1 0; 0 0 1", "line 7 30"):
        fp = element(spec)
        for border, mode in SCIPY_MODES.items():
            direct = {
                "erosion": ndimage.grey_erosion(plane, footprint=fp, mode=mode),
                "dilation": ndimage.grey_dilation(plane, footprint=fp, mode=mode),
            }
            for op, expected in direct.items():
                if not np.allclose(morphology(plane, op, spec, 1, border), expected):
                    _fail(f"{op} with {spec} and {border} disagrees with scipy.ndimage")


ELEMENT_SPECS = [
    "disk 1",
    "disk 3",
    "rect 5 3",
    "ellipse 3 2",
    "cross 2",
    "diamond 2",
    "line 9 0",
    "line 9 30",
    "line 7 45",
    "line 11 100",
    "custom 1 1 0; 0 1 0; 0 0 1",
]


def element_cases() -> list[dict[str, Any]]:
    return [{"spec": s, "rows": element(s).astype(int).tolist()} for s in ELEMENT_SPECS]


UNIT = {4: np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype=bool), 8: np.ones((3, 3), dtype=bool)}


def reconstruct(marker: FloatArray, mask: FloatArray, method: str, conn: int) -> FloatArray:
    """skimage.morphology.reconstruction with the marker clamped to the mask."""
    seed = np.minimum(marker, mask) if method == "dilation" else np.maximum(marker, mask)
    out = skmorph.reconstruction(seed, mask, method=method, footprint=UNIT[conn])  # type: ignore[no-untyped-call]
    return np.asarray(out, dtype=np.float64)


def _vincent_check() -> None:
    """Reconstruction by plain iteration equals skimage, so the reference is sound."""
    rng = np.random.default_rng(9)
    mask = rng.integers(0, 256, (12, 15)).astype(np.float64)
    marker = mask - 40
    for conn in (4, 8):
        j = np.minimum(marker, mask)
        while True:
            nxt = np.minimum(ndimage.grey_dilation(j, footprint=UNIT[conn], mode="nearest"), mask)
            if np.array_equal(nxt, j):
                break
            j = nxt
        if not np.array_equal(j, reconstruct(marker, mask, "dilation", conn)):
            _fail("Iterated geodesic dilation disagrees with skimage reconstruction")


def by_reconstruction(
    plane: FloatArray, opening: bool, spec: str, n: int, conn: int, border: str
) -> FloatArray:
    first = morphology(plane, "erosion" if opening else "dilation", spec, n, border)
    return reconstruct(first, plane, "dilation" if opening else "erosion", conn)


def geodesic(plane: FloatArray, method: str, h: float, steps: int, conn: int) -> FloatArray:
    j = plane - h if method == "dilation" else plane + h
    j = np.minimum(j, plane) if method == "dilation" else np.maximum(j, plane)
    for _ in range(steps):
        if method == "dilation":
            j = np.minimum(ndimage.grey_dilation(j, footprint=UNIT[conn], mode="nearest"), plane)
        else:
            j = np.maximum(ndimage.grey_erosion(j, footprint=UNIT[conn], mode="nearest"), plane)
    return np.asarray(j, dtype=np.float64)


def asf(plane: FloatArray, shape: str, size: int, order: str, border: str) -> FloatArray:
    r = 2 * size * (size + 1)
    p = np.pad(plane, r, mode=PAD_MODES[border])  # type: ignore[call-overload]
    for i in range(1, size + 1):
        spec = f"rect {2 * i + 1} {2 * i + 1}" if shape == "square" else f"{shape} {i}"
        fp = element(spec)
        steps = ["opening", "closing"] if order == "open-close" else ["closing", "opening"]
        for step in steps:
            if step == "opening":
                p = ndimage.grey_dilation(
                    ndimage.grey_erosion(p, footprint=fp, mode="nearest"),
                    footprint=fp,
                    mode="nearest",
                )
            else:
                p = ndimage.grey_erosion(
                    ndimage.grey_dilation(p, footprint=fp, mode="nearest"),
                    footprint=fp,
                    mode="nearest",
                )
    return np.asarray(p[r:-r, r:-r], dtype=np.float64)


def leveling(f: FloatArray, g: FloatArray, conn: int) -> FloatArray:
    for _ in range(2000):
        up = ndimage.grey_dilation(g, footprint=UNIT[conn], mode="nearest")
        down = ndimage.grey_erosion(g, footprint=UNIT[conn], mode="nearest")
        nxt = np.maximum(np.minimum(f, up), down)
        if np.array_equal(nxt, g):
            break
        g = nxt
    return np.asarray(g, dtype=np.float64)


def leveling_filter(plane: FloatArray, sigma: float, conn: int, border: str) -> FloatArray:
    r = int(4 * sigma + 0.5)
    p = np.pad(plane, r, mode=PAD_MODES[border])  # type: ignore[call-overload]
    marker = ndimage.gaussian_filter(p, sigma, mode="nearest", truncate=4.0)[r:-r, r:-r]
    # The filter keeps planes as 32-bit floats, so the marker is rounded the same way.
    return leveling(plane, marker.astype(np.float32).astype(np.float64), conn)


def _leveling_checks(plane: FloatArray) -> None:
    for conn in (4, 8):
        low = plane - 30
        if not np.array_equal(
            leveling(plane, low, conn), reconstruct(low, plane, "dilation", conn)
        ):
            _fail("Leveling with a marker below f is not reconstruction by dilation")
        high = plane + 30
        if not np.array_equal(
            leveling(plane, high, conn), reconstruct(high, plane, "erosion", conn)
        ):
            _fail("Leveling with a marker above f is not reconstruction by erosion")


def add_morphology_cases(plane: FloatArray, add: Add) -> None:
    _checks(plane)
    _vincent_check()
    _leveling_checks(plane)
    for conn in (4, 8):
        for method, h in (("dilation", 20.0), ("erosion", 45.0)):
            add(
                "reconstruction",
                {"method": method, "h": h, "connectivity": str(conn)},
                reconstruct(plane - h if method == "dilation" else plane + h, plane, method, conn),
                "skimage.morphology.reconstruction",
            )
            add(
                "geodesic",
                {"method": method, "h": h, "steps": 3, "connectivity": str(conn)},
                geodesic(plane, method, h, 3, conn),
                "scipy.ndimage, geodesic steps under or over the image",
            )
    for border in SCIPY_MODES:
        for opening in (True, False):
            add(
                "opening-by-reconstruction" if opening else "closing-by-reconstruction",
                {"element": "disk 1", "iterations": 1, "connectivity": "8", "border": border},
                by_reconstruction(plane, opening, "disk 1", 1, 8, border),
                "scipy.ndimage and skimage.morphology.reconstruction",
            )
        for shape, size, order in (("disk", 1, "open-close"), ("square", 2, "close-open")):
            add(
                "asf",
                {"shape": shape, "size": size, "order": order, "border": border},
                asf(plane, shape, size, order, border),
                "scipy.ndimage grey_erosion and grey_dilation",
            )
        add(
            "leveling",
            {"sigma": 1.5, "connectivity": "8", "border": border},
            leveling_filter(plane, 1.5, 8, border),
            "scipy.ndimage, checked against skimage reconstruction for markers below and above",
        )
    for border in SCIPY_MODES:
        for op in DEPTH:
            for spec, n in (("disk 1", 1), ("custom 1 1 0; 0 1 0; 0 0 1", 1), ("line 5 30", 2)):
                add(
                    op,
                    {"element": spec, "iterations": n, "border": border},
                    morphology(plane, op, spec, n, border),
                    "scipy.ndimage grey_erosion and grey_dilation on the extended plane",
                )
