"""The fast bilateral solver: the grid, the bistochastization, the solve and the filter."""

from __future__ import annotations

import numpy as np
from scipy.sparse import diags

from pixelnexus_engine.filters import bilateral_solver as bs
from pixelnexus_engine.planes import rgb_to_ycc


def rgba(rgb: np.ndarray) -> np.ndarray:
    return np.dstack([rgb, np.full(rgb.shape[:2], 255)]).astype(np.uint8)


def noisy_disk(sigma: float) -> tuple[np.ndarray, np.ndarray]:
    rows, cols = np.mgrid[0:60, 0:80]
    base = np.where((cols - 30) ** 2 + (rows - 30) ** 2 < 400, 200.0, 60.0)
    clean = np.dstack([base, base * 0.7, 255 - base])
    noise = np.random.default_rng(1).normal(0, sigma, clean.shape)
    return rgba(np.clip(np.rint(clean + noise), 0, 255)), clean


def psnr(a: np.ndarray, b: np.ndarray) -> float:
    return float(10 * np.log10(255**2 / np.mean((a.astype(float) - b) ** 2)))


def test_a_flat_image_comes_back() -> None:
    image = rgba(np.full((20, 30, 3), (90, 140, 30)))
    out = bs.solve(image, 8, 16, 16, 128)
    np.testing.assert_allclose(out, image[..., :3], atol=1e-3)


def test_vertices_are_the_rounded_down_cells() -> None:
    image, _ = noisy_disk(10)
    grid = bs.BilateralGrid(image, 8, 16, 16)
    rgb = image[..., :3].astype(float)
    y, cb, cr = rgb_to_ycc(rgb[..., 0], rgb[..., 1], rgb[..., 2])
    rows, cols = np.mgrid[0:60, 0:80]
    cells = np.stack(
        [cols // 8, rows // 8, np.floor(y / 16), np.floor(cb / 16), np.floor(cr / 16)], -1
    )
    assert grid.vertices == len(np.unique(cells.reshape(-1, 5), axis=0))
    assert grid.splat(np.ones(grid.pixels)).sum() == grid.pixels


def test_without_smoothness_each_pixel_gets_the_mean_of_its_cell() -> None:
    image, _ = noisy_disk(20)
    grid = bs.BilateralGrid(image, 8, 16, 16)
    red = image[..., 0].astype(float).ravel()
    counts = grid.splat(np.ones(grid.pixels))
    expected = grid.slice(grid.splat(red) / counts)
    np.testing.assert_allclose(bs.solve(image, 8, 16, 16, 0)[..., 0].ravel(), expected, atol=1e-3)


def test_bistochastization_makes_the_blur_keep_the_counts() -> None:
    image, _ = noisy_disk(20)
    grid = bs.BilateralGrid(image, 8, 16, 16)
    n, dm = bs.bistochastize(grid)
    m = grid.splat(np.ones(grid.pixels))
    rows = diags(n) @ grid.blur_matrix @ diags(n) @ np.ones(grid.vertices)
    np.testing.assert_allclose(dm, rows)
    # Ten steps bring the row sums close to the pixel counts.
    assert np.abs(rows - m).max() < 0.05 * m.max()


def test_the_linear_system_is_solved() -> None:
    image, _ = noisy_disk(20)
    grid = bs.BilateralGrid(image, 8, 16, 16)
    n, dm = bs.bistochastize(grid)
    m = grid.splat(np.ones(grid.pixels))
    dn = diags(n)
    a = 128 * (diags(dm) - dn @ grid.blur_matrix @ dn) + diags(m)
    out = bs.solve(image, 8, 16, 16, 128)
    # The sliced result is constant on each vertex, so its vertex values are the solution y.
    y = grid.splat(out[..., 1].ravel()) / m
    b = grid.splat(image[..., 1].astype(float).ravel())
    assert np.linalg.norm(a @ y - b) < 1e-4 * np.linalg.norm(b)


def test_noise_drops_and_the_edge_stays() -> None:
    image, clean = noisy_disk(20)
    out = bs.bilateral_solver(
        image,
        {"sigmaSpatial": 8, "sigmaLuma": 16, "sigmaChroma": 16, "lambda": 128},
        lambda _: None,
    )
    assert psnr(out[..., :3], clean) > psnr(image[..., :3], clean) + 6
    # Two pixels just inside and outside the disk stay far apart.
    assert abs(int(out[30, 48, 0]) - int(out[30, 52, 0])) > 100
    assert (out[..., 3] == 255).all()
