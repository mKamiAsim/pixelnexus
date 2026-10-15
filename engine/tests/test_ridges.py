"""Ridge filters: each is its scikit-image function on pixel levels, stretched, with the
scales and polarity the parameters name. They find lines, and the engine runs them."""

from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy import ndimage
from skimage.filters import frangi, hessian, meijering, sato

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.ridges import (
    frangi_filter,
    hessian_filter,
    meijering_filter,
    response,
    sato_filter,
    scales,
    stretched,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.planes import to_uint8
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

API = "/api/v1"
CATALOG = find_catalog()
FILTERS = {
    "frangi": frangi_filter,
    "hessian": hessian_filter,
    "sato": sato_filter,
    "meijering": meijering_filter,
}


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def gray_rgba(gray: np.ndarray) -> np.ndarray:
    return np.dstack([gray, gray, gray, np.full_like(gray, 255)]).astype(np.uint8)


def dark_line(width: float, size: int = 64) -> np.ndarray:
    """A vertical dark line of the given width through the middle, on a bright ground."""
    x = np.arange(size) + 0.5 - size / 2
    profile = np.where(np.abs(x) <= width / 2, 60.0, 200.0)
    return np.asarray(ndimage.gaussian_filter1d(np.tile(profile, (size, 1)), 0.7, axis=1))


@pytest.mark.parametrize(
    ("low", "high", "step", "expected"),
    [
        (1, 9, 2, [1, 3, 5, 7, 9]),
        (1, 8, 2, [1, 3, 5, 7]),
        (2, 1, 1, [2]),
        (0.5, 2, 0.5, [0.5, 1, 1.5, 2]),
    ],
)
def test_the_scales(low: float, high: float, step: float, expected: list[float]) -> None:
    assert scales({"sigmaMin": low, "sigmaMax": high, "sigmaStep": step}) == expected


SKIMAGE = {"frangi": frangi, "hessian": hessian, "sato": sato, "meijering": meijering}


@pytest.mark.parametrize("kind", list(FILTERS))
@pytest.mark.parametrize("ridges", ["dark", "bright"])
def test_each_filter_is_its_scikit_image_function_stretched(kind: str, ridges: str) -> None:
    gray = np.random.default_rng(0).integers(0, 256, (40, 48)).astype(np.uint8)
    values = catalog_values(kind, ridges=ridges, sigmaMin=1, sigmaMax=4, sigmaStep=1.5)
    extra = {}
    if kind in ("frangi", "hessian"):
        extra = {"beta": values["beta"], "gamma": values["gamma"] or None}
    expected = SKIMAGE[kind](
        gray.astype(np.float64),
        sigmas=[1, 2.5, 4],
        black_ridges=ridges == "dark",
        mode="reflect",
        **extra,
    )
    out = FILTERS[kind](gray_rgba(gray), values, lambda _: None)
    np.testing.assert_array_equal(out[..., 0], to_uint8(expected * 255 / expected.max()))
    np.testing.assert_array_equal(out[..., 0], out[..., 2])


def test_the_border_mode_reaches_scikit_image() -> None:
    gray = np.random.default_rng(1).random((30, 30)) * 255
    values = catalog_values("sato", border="wrap")
    wrapped = sato(gray, sigmas=scales(values), mode="wrap")
    np.testing.assert_allclose(response(gray, "sato", values), wrapped)


@pytest.mark.parametrize("kind", list(FILTERS))
def test_the_strongest_response_is_on_the_line(kind: str) -> None:
    out = FILTERS[kind](gray_rgba(dark_line(3)), catalog_values(kind), lambda _: None)[..., 0]
    middle = out[16:-16]
    assert set(np.argmax(middle, axis=1)) <= {31, 32}


@pytest.mark.parametrize("kind", list(FILTERS))
def test_bright_ridges_of_the_negated_image_are_dark_ridges(kind: str) -> None:
    gray = dark_line(4).astype(np.uint8)
    dark = FILTERS[kind](gray_rgba(gray), catalog_values(kind), lambda _: None)
    bright = FILTERS[kind](
        gray_rgba(255 - gray), catalog_values(kind, ridges="bright"), lambda _: None
    )
    np.testing.assert_array_equal(dark, bright)


def test_frangi_removes_round_blobs_that_sato_keeps() -> None:
    y, x = np.mgrid[0:64, 0:64]
    blob = np.where((x - 32) ** 2 + (y - 32) ** 2 <= 4**2, 60.0, 200.0)
    blob = ndimage.gaussian_filter(blob, 0.7)
    frangi_value = response(blob, "frangi", catalog_values("frangi"))[32, 32]
    sato_value = response(blob, "sato", catalog_values("sato"))[32, 32]
    line_value = response(dark_line(4), "frangi", catalog_values("frangi"))[32, 32]
    assert frangi_value < 0.05 * line_value
    assert sato_value > 0


def test_sato_compares_lines_of_different_widths_fairly() -> None:
    """With sigma^2 scaling, lines of the same contrast give similar peak responses."""
    values = catalog_values("sato", sigmaMin=0.5, sigmaMax=6, sigmaStep=0.5)
    # Lines narrower than 3 pixels lose contrast to the blur of the test image itself.
    thin = response(dark_line(3), "sato", values)[32].max()
    wide = response(dark_line(10), "sato", values)[32].max()
    assert 0.8 < thin / wide < 1.25


def test_the_hybrid_hessian_sets_responses_of_0_to_1() -> None:
    """Inside a bright disk the curvature has the wrong sign for dark ridges."""
    y, x = np.mgrid[0:64, 0:64]
    disk = ndimage.gaussian_filter(np.where((x - 32) ** 2 + (y - 32) ** 2 <= 20**2, 220.0, 30.0), 1)
    values = catalog_values("hessian")
    assert response(disk, "hessian", values)[32, 32] == 1
    assert response(disk, "frangi", {**values, "gamma": 15})[32, 32] == 0
    assert response(disk, "hessian", values)[2, 2] < 0.01


def test_the_hybrid_hessian_makes_a_flat_image_white() -> None:
    out = hessian_filter(
        gray_rgba(np.full((20, 20), 128)), catalog_values("hessian"), lambda _: None
    )
    assert (out[..., :3] == 255).all()


def test_stretching_keeps_zeros() -> None:
    np.testing.assert_array_equal(stretched(np.zeros((3, 3))), 0)
    np.testing.assert_allclose(stretched(np.array([0.0, 0.5, 2.0])), [0, 63.75, 255])


def test_rgb_scope_filters_each_channel() -> None:
    image = np.random.default_rng(2).integers(0, 256, (24, 28, 4)).astype(np.uint8)
    values = catalog_values("meijering", channelScope="rgb")
    out = meijering_filter(image, values, lambda _: None)
    for c in range(3):
        expected = stretched(response(image[..., c].astype(np.float64), "meijering", values))
        np.testing.assert_array_equal(out[..., c], to_uint8(expected))
    np.testing.assert_array_equal(out[..., 3], image[..., 3])


# Through the engine API -----------------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


@pytest.mark.parametrize("kind", list(FILTERS))
def test_the_engine_runs_the_filters(client: TestClient, kind: str) -> None:
    image = np.random.default_rng(3).integers(40, 220, (22, 30, 4)).astype(np.uint8)
    upload = client.post(
        f"{API}/images",
        params={"width": 30, "height": 22},
        content=image.tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    job = client.post(
        f"{API}/jobs",
        json={"filter": kind, "image": upload.json()["id"], "params": {"sigmaMax": 3}},
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
    pixels = np.frombuffer(client.get(f"{API}/jobs/{job_id}/result").content, np.uint8)
    expected = FILTERS[kind](image, catalog_values(kind, sigmaMax=3), lambda _: None)
    np.testing.assert_array_equal(pixels.reshape(22, 30, 4), expected)


@pytest.mark.parametrize(
    ("kind", "name"),
    [
        ("frangi", "Frangi"),
        ("hessian", "Hybrid Hessian"),
        ("sato", "Sato"),
        ("meijering", "Meijering"),
    ],
)
def test_the_representations(client: TestClient, kind: str, name: str) -> None:
    stages = client.post(f"{API}/filters/{kind}/representation", json={"sigmaMax": 5}).json()[
        "stages"
    ]
    assert [s["name"] for s in stages] == ["Hessian", "Eigenvalues", name, "Scales"]
    assert "sigma = 1, 3, 5 px" in stages[0]["note"]
