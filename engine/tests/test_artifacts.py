"""Artifact removal: dehazing recovers a scene made with the haze model, debanding keeps edges
and smooths steps, descreening removes a screen and leaves a plain image alone, deblocking uses
the tables of libjpeg, and deringing works only near strong edges."""

from __future__ import annotations

import io
import time
from collections.abc import Iterator
from typing import Any

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from scipy import ndimage

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.artifacts import (
    atmospheric_light,
    dark_channel,
    deband,
    deband_offsets,
    deband_plane,
    deblock,
    dehaze,
    dehaze_parts,
    dering,
    descreen,
    descreen_plane,
    edge_zone,
    guided_filter,
    jfif_rgb,
    jfif_ycbcr,
    jpeg_cleanup,
    quantization_table,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries
from synthetic import siemens_star

API = "/api/v1"
CATALOG = find_catalog()


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def rgba(values: np.ndarray) -> np.ndarray:
    if values.ndim == 2:
        values = np.repeat(values[..., None], 3, axis=2)
    out = np.empty((*values.shape[:2], 4), dtype=np.uint8)
    out[..., :3] = np.clip(np.rint(values), 0, 255)
    out[..., 3] = 200
    return out


def psnr(image: np.ndarray, clean: np.ndarray) -> float:
    error = np.mean((image.astype(np.float64) - clean.astype(np.float64)) ** 2)
    return float(10 * np.log10(255**2 / error))


def no_progress(_fraction: float) -> None:
    return None


# Dehazing -------------------------------------------------------------------------------------


def test_the_guided_filter_matches_opencv() -> None:
    """OpenCV's ximgproc.guidedFilter extends with the reflect mode."""
    rng = np.random.default_rng(0)
    guide = rng.random((40, 50))
    source = rng.random((40, 50))
    ours = guided_filter(guide, source, 3, 0.01, "reflect")
    theirs = cv2.ximgproc.guidedFilter(guide.astype(np.float32), source.astype(np.float32), 3, 0.01)
    np.testing.assert_allclose(ours, theirs, atol=1e-4)


def test_the_dark_channel_is_the_minimum_over_colors_and_patch() -> None:
    rgb = np.random.default_rng(1).random((12, 15, 3))
    dark = dark_channel(rgb, 5, "replicate")
    padded = np.pad(rgb.min(axis=2), 2, mode="edge")
    expected = np.array(
        [[padded[y : y + 5, x : x + 5].min() for x in range(15)] for y in range(12)]
    )
    np.testing.assert_array_equal(dark, expected)


def hazy_scene() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """A scene whose patches all hold a black pixel, under haze with a known air light. The top
    rows are pure air light, as a sky."""
    rng = np.random.default_rng(2)
    scene = rng.uniform(0.2, 1.0, (96, 96, 3))
    scene[::4, ::4] = 0.0
    t = np.full((96, 96), 0.6)
    t[:16] = 0.0
    light = np.array([0.8, 0.85, 0.9])
    hazy = scene * t[..., None] + light * (1 - t[..., None])
    return scene, t, light, hazy


def test_the_air_light_comes_from_the_haziest_bright_pixels() -> None:
    _, _, light, hazy = hazy_scene()
    found = atmospheric_light(hazy, dark_channel(hazy, 15, "reflect"))
    np.testing.assert_allclose(found, light, atol=1e-12)


def test_dehazing_recovers_a_scene_made_with_the_haze_model() -> None:
    scene, t, _, hazy = hazy_scene()
    params = catalog_values("dehaze", omega=1.0, t0=0.05, radius=8)
    dehazed, transmission, _ = dehaze_parts(hazy, params)
    # Away from the sky and its edge, the haze model is inverted almost exactly.
    inside = (slice(40, 80), slice(16, 80))
    np.testing.assert_allclose(transmission[inside], t[inside], atol=0.01)
    assert np.abs(dehazed[inside] - scene[inside]).mean() < 0.01


def test_the_transmission_output_is_gray_and_keeps_alpha() -> None:
    *_, hazy = hazy_scene()
    image = rgba(hazy * 255)
    out = dehaze(image, catalog_values("dehaze", output="transmission", radius=4), no_progress)
    np.testing.assert_array_equal(out[..., 0], out[..., 1])
    np.testing.assert_array_equal(out[..., 3], image[..., 3])
    assert out[:4, :, 0].mean() < 30  # the sky is all haze
    assert out[40:, :, 0].mean() > 120  # the scene below has a transmission of 0.6


# Debanding ------------------------------------------------------------------------------------


def banded_ramp() -> tuple[np.ndarray, np.ndarray]:
    y, x = np.mgrid[0:96, 0:160]
    smooth = 100 + x * 24 / 160 + 6 * np.sin(y / 30)
    return smooth, np.round(smooth / 4) * 4


def test_debanding_smooths_gentle_steps() -> None:
    smooth, banded = banded_ramp()
    params = catalog_values("deband", threshold=5)
    out = deband_plane(banded, deband_offsets(banded.shape, 16, 0), params)

    def local_mean(values: np.ndarray) -> np.ndarray:
        return np.asarray(ndimage.uniform_filter(values, 5))

    inside = (slice(16, -16), slice(16, -16))
    before = psnr(local_mean(banded)[inside], smooth[inside])
    after = psnr(local_mean(out)[inside], smooth[inside])
    assert after > before + 3


def test_debanding_keeps_steps_above_the_threshold() -> None:
    plane = np.where(np.arange(64)[None, :] < 32, 50.0, 80.0) * np.ones((40, 1))
    out = deband_plane(plane, deband_offsets(plane.shape, 16, 0), catalog_values("deband"))
    np.testing.assert_array_equal(out, plane)


def test_the_offsets_stay_in_range_and_follow_the_seed() -> None:
    dy, dx = deband_offsets((50, 60), 12, 3)
    assert np.abs(dy).max() <= 12 and np.abs(dx).max() <= 12
    again = deband_offsets((50, 60), 12, 3)
    other = deband_offsets((50, 60), 12, 4)
    np.testing.assert_array_equal(dy, again[0])
    assert not np.array_equal(dy, other[0])


# Descreening ----------------------------------------------------------------------------------


def screened() -> tuple[np.ndarray, np.ndarray]:
    y, x = np.mgrid[0:128, 0:128]
    clean = ndimage.gaussian_filter(np.where((x - 64) ** 2 + (y - 60) ** 2 < 900, 180.0, 60.0), 2)
    angle = np.radians(30)
    u = x * np.cos(angle) + y * np.sin(angle)
    v = -x * np.sin(angle) + y * np.cos(angle)
    screen = 25 * (np.cos(2 * np.pi * u / 5) + np.cos(2 * np.pi * v / 5))
    return clean, clean + screen


def test_descreening_removes_a_regular_screen() -> None:
    clean, dirty = screened()
    out = descreen_plane(dirty, catalog_values("descreen"))
    assert psnr(dirty, clean) < 25
    assert psnr(out, clean) > 30


def test_the_removed_output_is_the_screen_around_mid_gray() -> None:
    clean, dirty = screened()
    removed = descreen_plane(dirty, catalog_values("descreen", output="removed"))
    inside = (slice(16, -16), slice(16, -16))
    assert psnr(removed[inside] - 128, (dirty - clean)[inside]) > 30


@pytest.mark.parametrize("which", ["disk", "star", "photo"])
def test_descreening_leaves_images_without_a_screen(which: str) -> None:
    """The rings of a disk, the spokes of a star and the edges of a photo-like image are lines
    and rings in the spectrum, not isolated peaks."""
    clean = {
        "disk": screened()[0],
        "star": siemens_star(160, 160).astype(np.float64),
        "photo": photo_like()[..., 0].astype(np.float64),
    }[which]
    out = descreen_plane(clean, catalog_values("descreen"))
    assert np.abs(out - clean).max() < 0.5


# Deblocking -----------------------------------------------------------------------------------


@pytest.mark.parametrize("quality", [1, 10, 25, 50, 75, 95, 100])
def test_the_quantization_tables_are_those_of_libjpeg(quality: int) -> None:
    image = Image.fromarray(np.random.default_rng(0).integers(0, 255, (16, 16, 3), np.uint8))
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=quality, subsampling=0)
    tables = Image.open(io.BytesIO(buffer.getvalue())).quantization  # type: ignore[attr-defined]
    np.testing.assert_array_equal(np.reshape(tables[0], (8, 8)), quantization_table(quality, False))
    np.testing.assert_array_equal(np.reshape(tables[1], (8, 8)), quantization_table(quality, True))


def test_the_jfif_color_conversion_matches_pillow_and_inverts() -> None:
    rgb = np.random.default_rng(5).integers(0, 256, (20, 30, 3)).astype(np.uint8)
    ours = jfif_ycbcr(rgb.astype(np.float64))
    theirs = np.asarray(Image.fromarray(rgb).convert("YCbCr"), dtype=np.float64)
    assert np.abs(ours - theirs).max() <= 1
    np.testing.assert_allclose(jfif_rgb(ours), rgb, atol=1e-3)


def jpeg(image: np.ndarray, quality: int) -> np.ndarray:
    buffer = io.BytesIO()
    Image.fromarray(image).save(buffer, "JPEG", quality=quality, subsampling=0)
    return np.asarray(Image.open(io.BytesIO(buffer.getvalue())).convert("RGB"))


def photo_like() -> np.ndarray:
    y, x = np.mgrid[0:96, 0:120]
    disk = (x - 60) ** 2 + (y - 48) ** 2 < 900
    red = np.where(disk, 210, 40 + x)
    green = np.where(disk, 60, 80 + 60 * np.sin(y / 9) ** 2)
    blue = np.where(np.abs(x - y) < 6, 220, 50)
    return np.stack([red, green, blue], axis=-1).astype(np.uint8)


def test_one_shift_gives_a_decoded_jpeg_back() -> None:
    """A decoded JPEG is already rounded on its own grid, so re-applying JPEG there changes it
    by about the rounding of the decoder."""
    decoded = jpeg(photo_like(), 30)
    out = deblock(rgba(decoded), catalog_values("deblock", quality=30, shifts="1"), no_progress)
    difference = np.abs(out[..., :3].astype(int) - decoded.astype(int))
    assert difference.max() <= 3 and difference.mean() < 0.5


def test_shifted_grids_bring_a_jpeg_closer_to_the_original() -> None:
    original = photo_like()
    decoded = jpeg(original, 20)
    out = deblock(rgba(decoded), catalog_values("deblock", quality=20), no_progress)
    assert psnr(out[..., :3], original) > psnr(decoded, original) + 0.3
    np.testing.assert_array_equal(out[..., 3], 200)


# Deringing ------------------------------------------------------------------------------------


def ringing_edge() -> tuple[np.ndarray, np.ndarray]:
    x = np.arange(96, dtype=np.float64)
    clean = np.where(x < 48, 40.0, 200.0)
    distance = np.abs(x - 47.5)
    ripple = 18 * np.cos(2 * np.pi * distance / 3) * np.exp(-distance / 2) * (distance < 6)
    return np.tile(clean, (64, 1)), np.tile(clean + ripple, (64, 1))


def test_the_zone_follows_strong_edges_only() -> None:
    clean, _ = ringing_edge()
    weight, edges = edge_zone(clean, catalog_values("dering"))
    assert edges[:, 46:50].all()
    assert weight[:, :35].max() == 0 and weight[:, 61:].max() == 0
    assert weight[:, 44:52].min() > 0.9


def test_deringing_removes_ripples_next_to_an_edge_and_keeps_the_rest() -> None:
    clean, rung = ringing_edge()
    image = rgba(rung)
    out = dering(image, catalog_values("dering"), no_progress)[..., 0]
    assert psnr(out, clean) > psnr(rung, clean) + 3
    np.testing.assert_array_equal(out[:, :35], image[:, :35, 0])


def test_a_threshold_above_every_edge_changes_nothing() -> None:
    _, rung = ringing_edge()
    image = rgba(rung)
    out = dering(image, catalog_values("dering", threshold=200), no_progress)
    np.testing.assert_array_equal(out, image)


def test_jpeg_cleanup_is_deringing_after_deblocking() -> None:
    decoded = rgba(jpeg(photo_like(), 25))
    params = catalog_values("jpeg-cleanup", quality=25)
    expected = dering(
        deblock(decoded, catalog_values("deblock", quality=25), no_progress),
        catalog_values("dering"),
        no_progress,
    )
    np.testing.assert_array_equal(jpeg_cleanup(decoded, params, no_progress), expected)


# The filters through the engine API -----------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


@pytest.mark.parametrize(
    ("filter_id", "function", "values"),
    [
        ("dehaze", dehaze, {"radius": 5}),
        ("dehaze", dehaze, {"output": "dark"}),
        ("deband", deband, {"range": 6, "channelScope": "luminance"}),
        ("descreen", descreen, {"output": "removed", "channelScope": "luminance"}),
        ("deblock", deblock, {"shifts": "2", "channels": "luma"}),
        ("dering", dering, {"output": "zone"}),
        ("jpeg-cleanup", jpeg_cleanup, {"shifts": "2", "channelScope": "rgb"}),
    ],
)
def test_the_engine_runs_the_filters(
    client: TestClient, filter_id: str, function: Any, values: dict[str, Any]
) -> None:
    image = np.random.default_rng(4).integers(40, 220, (22, 30, 4)).astype(np.uint8)
    height, width = image.shape[:2]
    upload = client.post(
        f"{API}/images",
        params={"width": width, "height": height},
        content=image.tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    job = client.post(
        f"{API}/jobs", json={"filter": filter_id, "image": upload.json()["id"], "params": values}
    )
    assert job.status_code == 202, job.text
    job_id = job.json()["id"]
    state = "queued"
    for _ in range(600):
        state = client.get(f"{API}/jobs/{job_id}").json()["state"]
        if state in ("done", "failed"):
            break
        time.sleep(0.05)
    assert state == "done"
    result = client.get(f"{API}/jobs/{job_id}/result")
    pixels = np.frombuffer(result.content, dtype=np.uint8).reshape(height, width, 4)
    expected = function(image, catalog_values(filter_id, **values), no_progress)
    np.testing.assert_array_equal(pixels, expected)
    np.testing.assert_array_equal(pixels[..., 3], image[..., 3])


@pytest.mark.parametrize(
    ("filter_id", "names"),
    [
        ("dehaze", ["Dark channel", "Air light", "Transmission", "Refine", "Recover"]),
        ("deband", ["References", "Replace"]),
        ("descreen", ["Log spectrum", "Peaks", "Suppress"]),
        ("deblock", ["Color", "Quantization table", "Re-apply JPEG", "Average"]),
        ("dering", ["Strong edges", "Zone", "Blend"]),
        (
            "jpeg-cleanup",
            [
                "Color",
                "Quantization table",
                "Re-apply JPEG",
                "Average",
                "Strong edges",
                "Zone",
                "Blend",
            ],
        ),
    ],
)
def test_the_representations(client: TestClient, filter_id: str, names: list[str]) -> None:
    stages = client.post(f"{API}/filters/{filter_id}/representation", json={}).json()
    assert [s["name"] for s in stages["stages"]] == names
