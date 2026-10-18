"""Contourlet denoising: the ladder filter, the pyramid, the directional filter bank, the
rebuild and the filter."""

from __future__ import annotations

import itertools

import numpy as np
import pytest

from pixelnexus_engine.filters import contourlet as ct

PARAMS = {
    "levels": 3,
    "directions": "8",
    "factor": 3,
    "mode": "hard",
    "sigma": 0,
    "channelScope": "rgb",
}


def psnr(a: np.ndarray, b: np.ndarray) -> float:
    return float(10 * np.log10(255**2 / np.mean((a.astype(float) - b) ** 2)))


def test_the_ladder_filter_is_the_published_one() -> None:
    # Phoong et al. 1995, Example 3.2. The six values sum to about 1/2, as V(1) = 1 needs.
    assert ct.PKVA == (0.630, -0.193, 0.0972, -0.0526, 0.0272, -0.0144)
    assert sum(ct.PKVA) == pytest.approx(0.5, abs=0.01)
    diamond = ct.ladder_taps(fan=False)
    assert len(diamond) == 144
    # Every tap joins an even point of the quincunx lattice to an odd one.
    assert all((a + b) % 2 == 1 for a, b in diamond)
    assert sum(diamond.values()) == pytest.approx((2 * sum(ct.PKVA)) ** 2)
    # The fan filter is the diamond filter shifted by pi along the rows.
    for (a, b), value in ct.FAN_TAPS.items():
        assert value == pytest.approx(diamond[a, b] * (-1) ** a)


def test_the_pyramid_filters_are_the_9_7_filters() -> None:
    assert len(ct.H97) == 9
    assert len(ct.G97) == 7
    np.testing.assert_allclose(ct.H97, ct.H97[::-1])
    np.testing.assert_allclose(ct.G97, ct.G97[::-1])
    assert ct.H97.sum() == pytest.approx(np.sqrt(2))
    assert ct.G97.sum() == pytest.approx(np.sqrt(2))


def test_the_pyramid_rebuilds_exactly() -> None:
    x = np.random.default_rng(1).normal(size=(48, 80))
    coarse, band = ct.lp_dec(x)
    assert coarse.shape == (24, 40)
    np.testing.assert_allclose(ct.lp_rec(coarse, band), x, atol=1e-12)


@pytest.mark.parametrize("levels", [1, 2, 3, 4])
def test_the_directional_filter_bank_rebuilds_exactly(levels: int) -> None:
    x = np.random.default_rng(2).normal(size=(64, 128))
    bands = ct.dfb_dec(x, levels)
    assert len(bands) == 2**levels
    # Each subband lives on its own lattice, 1 / 2^levels of the points, and they do not overlap.
    support = [b != 0 for b in bands]
    assert all(s.sum() == x.size // 2**levels for s in support)
    assert (np.sum(support, axis=0) == 1).all()
    np.testing.assert_allclose(ct.dfb_rec(bands, levels), x, atol=1e-12)


def test_wedges_cover_all_directions_once() -> None:
    for levels in (2, 3, 4):
        found = ct.wedges(levels)
        assert len(found) == 2**levels
        for family in "hv":
            parts = sorted((w.lo, w.hi) for w in found if w.family == family)
            assert parts[0][0] == -1 and parts[-1][1] == 1
            assert all(a[1] == b[0] for a, b in itertools.pairwise(parts))
            # From the second level on, the wedges of one family have the same width in slope.
            assert len({round(hi - lo, 9) for lo, hi in parts}) == 1


@pytest.mark.parametrize("index", range(8))
def test_a_wave_in_the_middle_of_a_wedge_lands_in_its_subband(index: int) -> None:
    size = 64
    wedge = ct.wedges(3)[index]
    # 2 pi / 64 times (16, 16 s) with s the middle slope: 0.25 or 0.75 of the way.
    middle = (wedge.lo + wedge.hi) / 2
    across, along = 16, round(16 * middle)
    k0, k1 = (across, along) if wedge.family == "h" else (along, across)
    rows, cols = np.mgrid[0:size, 0:size]
    wave = np.cos(2 * np.pi * (k0 * rows + k1 * cols) / size + 0.4)
    energy = np.array([np.sum(b * b) for b in ct.dfb_dec(wave, 3)])
    assert energy.argmax() == index
    assert energy[index] > 0.8 * energy.sum()


def test_the_edge_angles_of_the_wedges() -> None:
    angles = sorted(round(w.degrees(), 1) for w in ct.wedges(3))
    # The middles of the slope intervals: atan(0.25) and atan(0.75) away from 0 and 90 degrees.
    assert angles == [14.0, 36.9, 53.1, 76.0, 104.0, 126.9, 143.1, 166.0]
    flat = [w for w in ct.wedges(3) if w.family == "h"]
    assert all(w.degrees() < 45 or w.degrees() > 135 for w in flat)


def test_a_line_lands_in_the_subband_of_its_angle() -> None:
    size = 128
    rows, cols = np.mgrid[0:size, 0:size]
    # A line through the middle at 37 degrees, counterclockwise from horizontal on screen.
    angle = np.radians(37)
    distance = (cols - 64) * np.sin(angle) + (rows - 64) * np.cos(angle)
    line = np.exp(-(distance**2) / 2)
    _, bands = ct.contourlet_dec(line, 1, 8)
    energy = np.array([np.sum(b * b) for b in bands[0]])
    best = ct.wedges(3)[int(energy.argmax())]
    assert best.degrees() == pytest.approx(36.9, abs=0.1)


@pytest.mark.parametrize("directions", [4, 8, 16])
def test_the_contourlet_transform_rebuilds_exactly(directions: int) -> None:
    x = np.random.default_rng(3).normal(size=(128, 192)) * 50 + 100
    coarse, bands = ct.contourlet_dec(x, 3, directions)
    assert coarse.shape == (16, 24)
    assert [len(b) for b in bands] == [directions] * 3
    np.testing.assert_allclose(ct.contourlet_rec(coarse, bands, directions), x, atol=1e-9)


def test_without_thresholding_the_image_comes_back() -> None:
    image = np.random.default_rng(4).integers(0, 256, (37, 53, 4)).astype(np.uint8)
    out = ct.contourlet(image, PARAMS | {"factor": 0}, lambda _: None)
    np.testing.assert_array_equal(out, image)


def test_the_noise_scales_match_fresh_noise() -> None:
    scales = ct.noise_scales(2, 8)
    noise = np.random.default_rng(5).standard_normal((256, 256))
    _, bands = ct.contourlet_dec(noise, 2, 8)
    for subbands, row in zip(bands, scales, strict=True):
        for band, scale in zip(subbands, row, strict=True):
            measured = np.sqrt(np.sum(band * band) * 8 / band.size)
            assert measured == pytest.approx(scale, rel=0.1)


def test_noise_drops_and_edges_stay() -> None:
    rows, cols = np.mgrid[0:96, 0:128]
    clean = np.where((cols - 60) ** 2 + (rows - 48) ** 2 < 900, 200.0, 60.0)
    clean = np.where(np.abs(rows - cols * 0.4 - 10) < 2, 230.0, clean)
    noisy = clean + np.random.default_rng(6).normal(0, 20, clean.shape)
    image = np.dstack([np.clip(np.rint(noisy), 0, 255)] * 3 + [np.full(clean.shape, 255)])
    out = ct.contourlet(image.astype(np.uint8), PARAMS, lambda _: None)
    assert psnr(out[..., 0], clean) > psnr(image[..., 0], clean) + 3
    # Two pixels just inside and outside the disk stay far apart.
    assert int(out[48, 34, 0]) - int(out[48, 26, 0]) > 100
    assert (out[..., 3] == 255).all()


def test_a_known_sigma_and_soft_thresholding() -> None:
    clean = np.full((64, 64), 120.0)
    noisy = clean + np.random.default_rng(7).normal(0, 10, clean.shape)
    hard = ct.contourlet_plane(noisy, PARAMS | {"sigma": 10})
    soft = ct.contourlet_plane(noisy, PARAMS | {"sigma": 10, "mode": "soft"})
    assert np.std(hard - clean) < 0.5 * np.std(noisy - clean)
    assert np.std(soft - clean) < np.std(hard - clean)


def test_the_representation_shows_the_filters() -> None:
    stages = ct.contourlet_representation(PARAMS)["stages"]
    names = [s["name"] for s in stages]
    assert names == [
        "Laplacian pyramid",
        "Directional filter bank",
        "Threshold",
        "Shrink",
        "Rebuild",
    ]
    assert "0.63" in stages[1]["note"]
    assert "8 wedges" in stages[1]["note"]
