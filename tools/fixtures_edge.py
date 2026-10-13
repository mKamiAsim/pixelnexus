"""Reference results for the edge-preserving filters of Phase 5b.

tools/fixtures_filters.py adds the one-plane cases (guided filter, anisotropic diffusion) to
web/tests/fixtures/filters.json, and the color cases (Kuwahara, Nagao-Matsuyama, bilateral,
vector diffusion) to its "color" section. Where OpenCV has the same filter, the reference is
checked against it first.
"""

from __future__ import annotations

import math
from collections.abc import Callable

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy import ndimage

from fixtures_rank import PAD_MODES, windows

FloatArray = NDArray[np.float64]
Add = Callable[..., None]
LUMA = np.array([0.2126, 0.7152, 0.0722])


def _fail(message: str) -> None:
    raise SystemExit(message)


# Kuwahara and Nagao-Matsuyama ---------------------------------------------------------------


def kuwahara_regions(a: int) -> list[list[tuple[int, int]]]:
    def square(x0: int, y0: int) -> list[tuple[int, int]]:
        return [(dx, dy) for dy in range(y0, y0 + a + 1) for dx in range(x0, x0 + a + 1)]

    return [square(-a, -a), square(0, -a), square(-a, 0), square(0, 0)]


def nagao_regions() -> list[list[tuple[int, int]]]:
    center = [(dx, dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1)]
    north = [(-1, -2), (0, -2), (1, -2), (-1, -1), (0, -1), (1, -1), (0, 0)]
    north_west = [(-2, -2), (-1, -2), (-2, -1), (-1, -1), (0, -1), (-1, 0), (0, 0)]

    def turn(region: list[tuple[int, int]]) -> list[tuple[int, int]]:
        return [(-dy, dx) for dx, dy in region]

    east = turn(north)
    south = turn(east)
    west = turn(south)
    north_east = turn(north_west)
    south_east = turn(north_east)
    south_west = turn(south_east)
    return [center, north, east, south, west, north_west, north_east, south_east, south_west]


def subregion_filter(
    image: FloatArray, regions: list[list[tuple[int, int]]], radius: int, border: str
) -> FloatArray:
    size = 2 * radius + 1
    win = np.stack([windows(image[..., c], size, size, border) for c in range(3)], axis=-1)
    luma = win @ LUMA
    out = np.zeros_like(image)
    for y in range(image.shape[0]):
        for x in range(image.shape[1]):
            best, best_var = 0, math.inf
            for k, region in enumerate(regions):
                values = np.array([luma[y, x, radius + dy, radius + dx] for dx, dy in region])
                var = float(np.mean(values**2) - np.mean(values) ** 2)
                if var < best_var - 1e-9:
                    best, best_var = k, var
            cells = regions[best]
            out[y, x] = np.mean([win[y, x, radius + dy, radius + dx] for dx, dy in cells], axis=0)
    return out


def _check_subregions(image: FloatArray) -> None:
    if [len(r) for r in nagao_regions()] != [9] + [7] * 8:
        _fail("Nagao-Matsuyama regions do not have 9 and 7 pixels")
    if len({frozenset(r) for r in nagao_regions()}) != 9:
        _fail("Nagao-Matsuyama regions are not all different")
    # A second way to get the Kuwahara quadrant statistics: shifted box means of the luma.
    a = 2
    luma = np.pad(image @ LUMA, a, mode="reflect")
    mean = ndimage.uniform_filter(luma, a + 1, mode="nearest", origin=(-(a // 2),) * 2)
    square = ndimage.uniform_filter(luma**2, a + 1, mode="nearest", origin=(-(a // 2),) * 2)
    variance = square - mean**2
    h, w = image.shape[:2]
    quads = np.stack(
        [
            variance[a + oy : a + oy + h, a + ox : a + ox + w]
            for ox, oy in ((-a, -a), (0, -a), (-a, 0), (0, 0))
        ]
    )
    choice = np.argmin(quads + np.arange(4)[:, None, None] * 1e-12, axis=0)
    ours = subregion_filter(image, kuwahara_regions(a), a, "reflect101")
    color = np.pad(image, ((a, a), (a, a), (0, 0)), mode="reflect")
    for y in range(h):
        for x in range(w):
            ox, oy = ((-a, -a), (0, -a), (-a, 0), (0, 0))[choice[y, x]]
            block = color[a + y + oy : a + y + oy + a + 1, a + x + ox : a + x + ox + a + 1]
            if not np.allclose(block.mean(axis=(0, 1)), ours[y, x]):
                _fail("Kuwahara disagrees with shifted box means")


# Bilateral -----------------------------------------------------------------------------------


def bilateral(
    image: FloatArray, sigma_s: float, sigma_r: float, mode: str, border: str
) -> FloatArray:
    r = max(1, math.ceil(3 * sigma_s))
    size = 2 * r + 1
    win = np.stack([windows(image[..., c], size, size, border) for c in range(3)], axis=-1)
    dy, dx = np.mgrid[-r : r + 1, -r : r + 1]
    inside = dx**2 + dy**2 <= r * r
    spatial = np.where(inside, np.exp(-(dx**2 + dy**2) / (2 * sigma_s**2)), 0.0)
    center = image[:, :, None, None, :]
    squares = (win - center) ** 2
    d2 = squares.sum(-1, keepdims=True) if mode == "color" else squares
    weights = spatial[None, None, :, :, None] * np.exp(-d2 / (2 * sigma_r**2))
    return np.asarray((weights * win).sum(axis=(2, 3)) / weights.sum(axis=(2, 3)), dtype=np.float64)


def _check_bilateral(image: FloatArray) -> None:
    gray = image[..., 1].astype(np.uint8)
    for sigma_s, sigma_r in ((1.0, 30.0), (1.5, 60.0)):
        r = max(1, math.ceil(3 * sigma_s))
        theirs = cv2.bilateralFilter(
            gray, 2 * r + 1, sigma_r, sigma_s, borderType=cv2.BORDER_REFLECT_101
        )
        rgb = np.repeat(gray[..., None].astype(np.float64), 3, axis=-1)
        ours = bilateral(rgb, sigma_s, sigma_r, "channel", "reflect101")[..., 0]
        if np.max(np.abs(np.round(ours) - theirs)) > 1:
            _fail("bilateral filter disagrees with cv2.bilateralFilter")


def joint_bilateral(
    image: FloatArray, guide: FloatArray, sigma_s: float, sigma_r: float, mode: str, border: str
) -> FloatArray:
    """Range weights from the guide luma or the guide colors, shared by all channels."""
    r = max(1, math.ceil(3 * sigma_s))
    size = 2 * r + 1
    win = np.stack([windows(image[..., c], size, size, border) for c in range(3)], axis=-1)
    g = (guide @ LUMA)[..., None] if mode == "luma" else guide
    gw = np.stack([windows(g[..., c], size, size, border) for c in range(g.shape[-1])], axis=-1)
    dy, dx = np.mgrid[-r : r + 1, -r : r + 1]
    spatial = np.where(dx**2 + dy**2 <= r * r, np.exp(-(dx**2 + dy**2) / (2 * sigma_s**2)), 0.0)
    d2 = ((gw - g[:, :, None, None, :]) ** 2).sum(-1, keepdims=True)
    weights = spatial[None, None, :, :, None] * np.exp(-d2 / (2 * sigma_r**2))
    return np.asarray((weights * win).sum(axis=(2, 3)) / weights.sum(axis=(2, 3)), dtype=np.float64)


def guide_input(image: FloatArray) -> FloatArray:
    """A second image of the same size: the colors in reverse order with a little noise."""
    rng = np.random.default_rng(5)
    return np.asarray(np.clip(image[..., ::-1] + rng.normal(0, 5, image.shape), 0, 255).round())


def _check_joint_bilateral(image: FloatArray, guide: FloatArray) -> None:
    gray_guide = np.repeat(guide[..., 1:2], 3, axis=-1)
    src = np.repeat(image[..., :1], 3, axis=-1)
    for sigma_s, sigma_r in ((1.0, 30.0), (1.5, 50.0)):
        r = max(1, math.ceil(3 * sigma_s))
        theirs = cv2.ximgproc.jointBilateralFilter(
            guide[..., 1].astype(np.float32),
            image[..., 0].astype(np.float32),
            2 * r + 1,
            sigma_r,
            sigma_s,
            borderType=cv2.BORDER_REFLECT_101,
        )
        ours = joint_bilateral(src, gray_guide, sigma_s, sigma_r, "luma", "reflect101")[..., 0]
        if not np.allclose(ours, theirs, atol=1e-3):
            _fail("joint bilateral disagrees with cv2.ximgproc.jointBilateralFilter")
    # Without a separate guide, the color mode is the color bilateral filter.
    same = joint_bilateral(image, image, 1.0, 40.0, "color", "reflect101")
    if not np.allclose(same, bilateral(image, 1.0, 40.0, "color", "reflect101")):
        _fail("joint bilateral guided by the image itself is not the bilateral filter")


# Guided filter --------------------------------------------------------------------------------


def guided(p: FloatArray, r: int, eps: float, border: str) -> FloatArray:
    """Extend once by 2r with the border mode, filter, cut the frame off."""
    pad = 2 * r
    q = np.pad(p, pad, mode=PAD_MODES[border])  # type: ignore[call-overload]
    size = 2 * r + 1

    def mean(v: FloatArray) -> FloatArray:
        return np.asarray(ndimage.uniform_filter(v, size, mode="nearest"), dtype=np.float64)

    mean_i = mean(q)
    var = mean(q * q) - mean_i**2
    a = var / (var + eps)
    b = mean_i - a * mean_i
    out = mean(a) * q + mean(b)
    return np.asarray(out[pad:-pad, pad:-pad], dtype=np.float64)


def _check_guided(plane: FloatArray) -> None:
    for r, eps in ((2, 0.01 * 255**2), (3, 0.1 * 255**2)):
        src = plane.astype(np.float32)
        theirs = cv2.ximgproc.guidedFilter(src, src, r, eps, dDepth=-1)
        ours = guided(plane, r, eps, "reflect")
        if not np.allclose(ours, theirs, atol=1e-2):
            _fail("guided filter disagrees with cv2.ximgproc.guidedFilter")


# Anisotropic diffusion --------------------------------------------------------------------------


def diffusion(
    planes: list[FloatArray],
    steps: int,
    kappa: float,
    lam: float,
    kind: str,
    shared: bool,
    border: str,
) -> list[FloatArray]:
    def g(d: FloatArray) -> FloatArray:
        if kind == "quadratic":
            return np.asarray(1 / (1 + (d / kappa) ** 2))
        return np.asarray(np.exp(-((d / kappa) ** 2)))

    cur = [np.pad(p, steps, mode=PAD_MODES[border]) for p in planes]  # type: ignore[call-overload]
    for _ in range(steps):
        edged = [np.pad(p, 1, mode="edge") for p in cur]
        diffs = {
            name: [e[sl] - p for e, p in zip(edged, cur, strict=True)]
            for name, sl in (
                ("n", np.s_[:-2, 1:-1]),
                ("s", np.s_[2:, 1:-1]),
                ("e", np.s_[1:-1, 2:]),
                ("w", np.s_[1:-1, :-2]),
            )
        }
        nxt = [p.copy() for p in cur]
        for ds in diffs.values():
            if shared:
                c = g(np.sqrt(sum(d * d for d in ds)))
                for k in range(len(cur)):
                    nxt[k] += lam * c * ds[k]
            else:
                for k in range(len(cur)):
                    nxt[k] += lam * g(np.abs(ds[k])) * ds[k]
        cur = nxt
    return [p[steps:-steps, steps:-steps] for p in cur]


def _check_diffusion(plane: FloatArray) -> None:
    # Extending once equals applying the mirror rule at every step.
    steps = 6
    once = diffusion([plane], steps, 20, 0.2, "exponential", False, "reflect")[0]
    cur = plane.copy()
    for _ in range(steps):
        e = np.pad(cur, 1, mode="symmetric")
        total = np.zeros_like(cur)
        for sl in (np.s_[:-2, 1:-1], np.s_[2:, 1:-1], np.s_[1:-1, 2:], np.s_[1:-1, :-2]):
            d = e[sl] - cur
            total += np.exp(-((d / 20) ** 2)) * d
        cur = cur + 0.2 * total
    if not np.allclose(once, cur):
        _fail("diffusion on the extended plane disagrees with a mirror rule at every step")
    # On a gray image the shared conduction sees sqrt(3) times the difference.
    shared = diffusion([plane] * 3, 4, 20 * math.sqrt(3), 0.2, "quadratic", True, "reflect101")[0]
    single = diffusion([plane], 4, 20, 0.2, "quadratic", False, "reflect101")[0]
    if not np.allclose(shared, single):
        _fail("vector diffusion of a gray image disagrees with scalar diffusion")


# Cases --------------------------------------------------------------------------------------------


def add_edge_plane_cases(plane: FloatArray, add: Add) -> None:
    _check_guided(plane)
    _check_diffusion(plane)
    for border in PAD_MODES:
        for r, eps in ((1, 0.01), (2, 0.001), (3, 0.1)):
            add(
                "guided",
                {"radius": r, "eps": eps, "border": border},
                guided(plane, r, eps * 255**2, border),
                "SciPy box means, checked with cv2.ximgproc.guidedFilter",
            )
        for steps, kappa, lam, kind in ((5, 20, 0.2, "exponential"), (3, 40, 0.25, "quadratic")):
            add(
                "anisotropic-diffusion",
                {
                    "iterations": steps,
                    "kappa": kappa,
                    "lambda": lam,
                    "conduction": kind,
                    "border": border,
                },
                diffusion([plane], steps, kappa, lam, kind, False, border)[0],
                "NumPy, checked against a mirror rule at every step",
            )


def add_edge_color_cases(image: FloatArray, add: Add) -> FloatArray:
    """Add the color cases. Returns the guide image that the joint bilateral cases use."""
    guide = guide_input(image)
    _check_subregions(image)
    _check_bilateral(image)
    _check_joint_bilateral(image, guide)
    for border in PAD_MODES:
        for size in (3, 5, 7):
            a = (size - 1) // 2
            add(
                "kuwahara",
                {"size": size, "border": border},
                subregion_filter(image, kuwahara_regions(a), a, border),
                "NumPy windows, checked with shifted box means",
            )
        add(
            "nagao-matsuyama",
            {"border": border},
            subregion_filter(image, nagao_regions(), 2, border),
            "NumPy windows with the nine subregions",
        )
        for sigma_s, sigma_r, mode in (
            (1.0, 30.0, "channel"),
            (1.5, 50.0, "color"),
            (0.7, 20.0, "color"),
        ):
            add(
                "bilateral",
                {"sigmaSpace": sigma_s, "sigmaRange": sigma_r, "range": mode, "border": border},
                bilateral(image, sigma_s, sigma_r, mode, border),
                "NumPy windows, checked with cv2.bilateralFilter",
            )
        for sigma_s, sigma_r, mode in ((1.0, 30.0, "luma"), (1.5, 40.0, "color")):
            params = {
                "sigmaSpace": sigma_s,
                "sigmaRange": sigma_r,
                "guideRange": mode,
                "border": border,
            }
            add(
                "joint-bilateral",
                params,
                joint_bilateral(image, guide, sigma_s, sigma_r, mode, border),
                "NumPy windows, checked with cv2.ximgproc.jointBilateralFilter",
                True,
            )
        add(
            "joint-bilateral",
            {"sigmaSpace": 1.0, "sigmaRange": 30.0, "guideRange": "luma", "border": border},
            joint_bilateral(image, image, 1.0, 30.0, "luma", border),
            "NumPy windows, guided by the luma of the image itself",
        )
        planes = [image[..., c] for c in range(3)]
        add(
            "vector-anisotropic-diffusion",
            {
                "iterations": 4,
                "kappa": 30,
                "lambda": 0.2,
                "conduction": "exponential",
                "border": border,
            },
            np.stack(diffusion(planes, 4, 30, 0.2, "exponential", True, border), axis=-1),
            "NumPy, checked against scalar diffusion on a gray image",
        )
    return guide
