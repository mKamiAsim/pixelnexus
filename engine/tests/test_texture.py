"""Texture descriptors: LBP is scikit-image's code scaled to an image or counted in a table, LTP
matches a direct reference, the GLCM table and every window of the map equal graycoprops with
our angles, and the HOG view is scikit-image's stretched."""

from __future__ import annotations

import math
import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from skimage.feature import graycomatrix, graycoprops, hog, local_binary_pattern

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.keypoints import luma8
from pixelnexus_engine.filters.texture import (
    PROPERTIES,
    glcm,
    glcm_map,
    glcm_representation,
    hog_filter,
    hog_representation,
    lbp,
    lbp_code_count,
    lbp_representation,
    ltp,
    ltp_codes,
    ltp_representation,
    offset,
    quantized,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries
from synthetic import siemens_star

API = "/api/v1"
CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def gray_rgba(gray: np.ndarray) -> np.ndarray:
    return np.dstack([gray, gray, gray, np.full_like(gray, 255)]).astype(np.uint8)


def noisy(height: int = 40, width: int = 50, seed: int = 1) -> np.ndarray:
    return np.random.default_rng(seed).integers(0, 256, (height, width)).astype(np.uint8)


def scaled(values: np.ndarray, factor: float) -> np.ndarray:
    return np.clip(np.round(values * factor), 0, 255).astype(np.uint8)


# Local binary patterns ------------------------------------------------------------------------


@pytest.mark.parametrize("method", ["default", "ror", "uniform", "nri_uniform"])
def test_lbp_codes_are_scikit_image_scaled_to_the_gray_range(method: str) -> None:
    gray = noisy()
    image = gray_rgba(gray)
    image[..., 3] = 77
    out = lbp(image, catalog_values("lbp", method=method, points=8, radius=1.5), NOTHING)
    codes = local_binary_pattern(gray, 8, 1.5, method)
    count = lbp_code_count(8, method)
    assert codes.max() <= count - 1
    np.testing.assert_array_equal(out[..., 0], scaled(codes, 255 / (count - 1)))
    np.testing.assert_array_equal(out[..., 3], 77)


def test_the_code_counts() -> None:
    assert lbp_code_count(8, "default") == 256
    assert lbp_code_count(8, "ror") == 256
    assert lbp_code_count(8, "uniform") == 10
    assert lbp_code_count(8, "nri_uniform") == 59
    assert lbp_code_count(16, "nri_uniform") == 243


def test_the_lbp_histogram_counts_every_pixel() -> None:
    gray = noisy()
    params = catalog_values("lbp", output="histogram", method="uniform")
    table = lbp(gray_rgba(gray), params, NOTHING)
    assert isinstance(table, dict)
    assert len(table["rows"]) == 10
    codes = local_binary_pattern(gray, 8, 1, "uniform").astype(int)
    assert [r[1] for r in table["rows"]] == np.bincount(codes.ravel(), minlength=10).tolist()
    assert sum(r[1] for r in table["rows"]) == gray.size
    assert sum(r[2] for r in table["rows"]) == pytest.approx(1, abs=1e-5)


def test_the_variance_method_is_an_image_stretched_to_white() -> None:
    gray = noisy()
    out = lbp(gray_rgba(gray), catalog_values("lbp", output="histogram", method="var"), NOTHING)
    assert isinstance(out, np.ndarray)
    assert out[..., 0].max() == 255


def test_lbp_codes_do_not_change_with_brightness_or_contrast() -> None:
    gray = np.random.default_rng(2).integers(40, 120, (30, 30)).astype(np.uint8)
    brighter = (gray.astype(int) * 2 + 10).astype(np.uint8)
    params = catalog_values("lbp", points=4, radius=1)
    first = lbp(gray_rgba(gray), params, NOTHING)
    second = lbp(gray_rgba(brighter), params, NOTHING)
    # Samples past the edge count as 0, so only the inside keeps its codes.
    np.testing.assert_array_equal(first[1:-1, 1:-1], second[1:-1, 1:-1])


# Local ternary patterns -----------------------------------------------------------------------


def ltp_reference(gray: np.ndarray, t: float, mode: str) -> tuple[np.ndarray, np.ndarray]:
    padded = np.pad(gray.astype(float), 1, mode=mode)  # type: ignore[call-overload]
    height, width = gray.shape
    upper = np.zeros((height, width), int)
    lower = np.zeros((height, width), int)
    steps = [(0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1)]
    for r in range(height):
        for c in range(width):
            center = padded[r + 1, c + 1]
            for k, (dy, dx) in enumerate(steps):
                n = padded[r + 1 + dy, c + 1 + dx]
                if n >= center + t:
                    upper[r, c] += 2**k
                elif n <= center - t:
                    lower[r, c] += 2**k
    return upper, lower


@pytest.mark.parametrize(
    ("border", "mode"),
    [("reflect101", "reflect"), ("replicate", "edge"), ("constant", "constant"), ("wrap", "wrap")],
)
@pytest.mark.parametrize("t", [1, 5, 20])
def test_ltp_matches_a_direct_reference(border: str, mode: str, t: float) -> None:
    gray = noisy(15, 17, seed=t)
    upper, lower = ltp_codes(gray, t, border)
    expected_upper, expected_lower = ltp_reference(gray, t, mode)
    np.testing.assert_array_equal(upper, expected_upper)
    np.testing.assert_array_equal(lower, expected_lower)


def test_bit_k_is_the_neighbor_at_45_k_degrees_counterclockwise() -> None:
    for k, (dy, dx) in enumerate([(0, 1), (-1, 1), (-1, 0), (-1, -1)]):
        gray = np.full((7, 7), 100, np.uint8)
        gray[3 + dy, 3 + dx] = 200
        upper, lower = ltp_codes(gray, 5, "replicate")
        assert upper[3, 3] == 2**k
        assert lower[3, 3] == 0


def test_small_noise_in_a_flat_area_gives_code_0() -> None:
    noise = np.random.default_rng(4).integers(-2, 3, (30, 30))
    gray = (128 + noise).astype(np.uint8)
    upper, lower = ltp_codes(gray, 5, "reflect101")
    assert not upper.any() and not lower.any()
    # A local binary pattern sets bits by the noise alone.
    assert np.unique(local_binary_pattern(gray, 8, 1)).size > 50


def test_with_threshold_0_equal_neighbors_set_both_codes() -> None:
    upper, lower = ltp_codes(np.full((5, 5), 90, np.uint8), 0, "reflect101")
    assert (upper == 255).all() and (lower == 255).all()


def test_ltp_outputs() -> None:
    gray = noisy()
    params = catalog_values("ltp", threshold=8)
    upper, lower = ltp_codes(gray, 8, "reflect101")
    out = ltp(gray_rgba(gray), params, NOTHING)
    np.testing.assert_array_equal(out[..., 0], upper)
    out = ltp(gray_rgba(gray), {**params, "output": "lower"}, NOTHING)
    np.testing.assert_array_equal(out[..., 0], lower)
    table = ltp(gray_rgba(gray), {**params, "output": "histogram"}, NOTHING)
    assert isinstance(table, dict)
    assert [r[1] for r in table["rows"]] == np.bincount(upper.ravel(), minlength=256).tolist()
    assert [r[2] for r in table["rows"]] == np.bincount(lower.ravel(), minlength=256).tolist()


# Gray-level co-occurrence ---------------------------------------------------------------------


def test_the_offsets_count_counterclockwise_with_y_down() -> None:
    assert offset(1, 0) == (0, 1)
    assert offset(1, 45) == (-1, 1)
    assert offset(1, 90) == (-1, 0)
    assert offset(1, 135) == (-1, -1)
    assert offset(3, 90) == (-3, 0)


def test_quantized_levels() -> None:
    gray = np.arange(256, dtype=np.uint8)[None]
    assert quantized(gray, 8)[0].tolist() == [v // 32 for v in range(256)]
    assert quantized(gray, 3).max() == 2


def direct_matrix(q: np.ndarray, levels: int, dy: int, dx: int, symmetric: bool) -> np.ndarray:
    """P counted pair by pair, with the partner at (r + dy, c + dx)."""
    counts = np.zeros((levels, levels))
    height, width = q.shape
    for r in range(height):
        for c in range(width):
            if 0 <= r + dy < height and 0 <= c + dx < width:
                counts[q[r, c], q[r + dy, c + dx]] += 1
    if symmetric:
        counts = counts + counts.T
    return counts / counts.sum()


@pytest.mark.parametrize("symmetric", [True, False])
def test_the_table_has_our_angles(symmetric: bool) -> None:
    gray = noisy(20, 24)
    params = catalog_values("glcm", levels=6, distance=2, symmetric=symmetric)
    table = glcm(gray_rgba(gray), params, NOTHING)
    assert isinstance(table, dict)
    q = quantized(gray, 6)
    assert [(r[0], r[1]) for r in table["rows"]] == [
        (d, a) for d in (1, 2) for a in (0, 45, 90, 135)
    ]
    for row in table["rows"]:
        dy, dx = offset(row[0], row[1])
        matrix = direct_matrix(q, 6, dy, dx, symmetric)[:, :, None, None]
        for value, prop in zip(row[2:], PROPERTIES, strict=True):
            assert value == pytest.approx(float(graycoprops(matrix, prop)[0, 0]), abs=2e-6)


def test_the_table_lists_distance_1_once() -> None:
    table = glcm(gray_rgba(noisy()), catalog_values("glcm", distance=1), NOTHING)
    assert isinstance(table, dict)
    assert len(table["rows"]) == 4
    assert [c["key"] for c in table["columns"]][:3] == ["distance", "angle", "contrast"]


@pytest.mark.parametrize("prop", PROPERTIES)
@pytest.mark.parametrize(("angle", "symmetric"), [("0", True), ("45", False), ("90", False)])
def test_each_window_of_the_map_equals_scikit_image(prop: str, angle: str, symmetric: bool) -> None:
    gray = noisy(23, 26, seed=5)
    gray[:, :9] //= 8  # A darker area, so some windows have few levels.
    q = quantized(gray, 4)
    params = catalog_values(
        "glcm", output="map", levels=4, distance=2, angle=angle, symmetric=symmetric, window=7
    )
    params["property"] = prop
    values = glcm_map(q, params, NOTHING)
    rng = np.random.default_rng(6)
    places = [(0, 0), (22, 25), (3, 12), *rng.integers(0, (23, 26), (12, 2)).tolist()]
    for r, c in places:
        window = q[max(0, r - 3) : r + 4, max(0, c - 3) : c + 4].astype(np.uint8)
        matrix = graycomatrix(
            window,
            [2],
            [-math.radians(float(angle))],
            levels=4,
            symmetric=symmetric,
            normed=True,
        )
        expected = float(graycoprops(matrix, prop)[0, 0])
        assert values[r, c] == pytest.approx(expected, abs=1e-9), (r, c)


def test_the_map_is_stretched_to_the_full_range() -> None:
    out = glcm(gray_rgba(noisy()), catalog_values("glcm", output="map"), NOTHING)
    assert isinstance(out, np.ndarray)
    assert out[..., 0].min() == 0 and out[..., 0].max() == 255


def test_a_flat_image_gives_a_black_map() -> None:
    flat = gray_rgba(np.full((20, 20), 50, np.uint8))
    out = glcm(flat, catalog_values("glcm", output="map"), NOTHING)
    assert isinstance(out, np.ndarray)
    assert not out[..., :3].any()


def test_contrast_on_the_star_is_highest_near_the_center() -> None:
    star = siemens_star(256, 256)
    params = catalog_values("glcm", output="map", window=15)
    values = glcm_map(quantized(star, 8), params, NOTHING)
    rows, cols = np.mgrid[0:256, 0:256]
    distance = np.hypot(rows - 127.5, cols - 127.5)
    rings = [values[(distance >= low) & (distance < low + 10)].mean() for low in range(0, 120, 20)]
    assert rings == sorted(rings, reverse=True)


# Histogram of oriented gradients --------------------------------------------------------------


@pytest.mark.parametrize("norm", ["L1", "L2-Hys"])
def test_the_hog_view_is_scikit_image_stretched(norm: str) -> None:
    star = siemens_star(96, 96)
    params = catalog_values("hog", blockNorm=norm, cellSize=12, orientations=6)
    out = hog_filter(gray_rgba(star), params, NOTHING)
    _, view = hog(
        star,
        orientations=6,
        pixels_per_cell=(12, 12),
        cells_per_block=(3, 3),
        block_norm=norm,
        visualize=True,
    )
    np.testing.assert_array_equal(out[..., 0], scaled(view, 255 / view.max()))


def test_the_hog_lines_lie_along_an_edge() -> None:
    gray = np.zeros((64, 64), np.uint8)
    gray[:, 36:] = 200
    out = hog_filter(gray_rgba(gray), catalog_values("hog"), NOTHING)
    cell = out[0:8, 32:40, 0]
    lit = np.argwhere(cell > 0)
    assert lit.size
    # One near vertical line: few columns, many rows.
    assert np.ptp(lit[:, 1]) <= 1 and np.ptp(lit[:, 0]) >= 4


def test_hog_on_a_flat_image_is_black() -> None:
    out = hog_filter(gray_rgba(np.full((32, 32), 90, np.uint8)), catalog_values("hog"), NOTHING)
    assert not out[..., :3].any()


# Representations and the engine API -----------------------------------------------------------


@pytest.mark.parametrize(
    ("representation", "filter_id", "values"),
    [
        (lbp_representation, "lbp", {}),
        (ltp_representation, "ltp", {}),
        (glcm_representation, "glcm", {}),
        (glcm_representation, "glcm", {"output": "map"}),
        (hog_representation, "hog", {}),
    ],
)
def test_formulas_have_no_control_characters(
    representation: Any, filter_id: str, values: dict[str, Any]
) -> None:
    for stage in representation(catalog_values(filter_id, **values))["stages"]:
        text = stage["formula"] + stage.get("note", "")
        assert all(ch >= " " for ch in text), stage["name"]


def test_the_glcm_representation_names_the_offset() -> None:
    stages = glcm_representation(catalog_values("glcm", angle="90", distance=2))["stages"]
    assert [s["name"] for s in stages] == ["Levels", "Co-occurrence", "Properties"]
    assert "d = (0, 2) px" in stages[1]["note"]


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


def run_job(client: TestClient, filter_id: str, image: np.ndarray, params: dict[str, Any]) -> Any:
    height, width = image.shape[:2]
    upload = client.post(
        f"{API}/images",
        params={"width": width, "height": height},
        content=image.tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    job = client.post(
        f"{API}/jobs", json={"filter": filter_id, "image": upload.json()["id"], "params": params}
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
    return client.get(f"{API}/jobs/{job_id}/result")


def test_the_engine_returns_the_glcm_table(client: TestClient) -> None:
    image = gray_rgba(noisy())
    result = run_job(client, "glcm", image, {"angle": "45"}).json()
    assert result["rows"] == glcm(image, catalog_values("glcm", angle="45"), NOTHING)["rows"]


@pytest.mark.parametrize("filter_id", ["lbp", "ltp", "hog"])
def test_the_engine_returns_the_images(client: TestClient, filter_id: str) -> None:
    image = gray_rgba(noisy(32, 40))
    pixels = np.frombuffer(run_job(client, filter_id, image, {}).content, np.uint8)
    expected = {"lbp": lbp, "ltp": ltp, "hog": hog_filter}[filter_id](
        image, catalog_values(filter_id), NOTHING
    )
    np.testing.assert_array_equal(pixels.reshape(32, 40, 4), expected)


def test_luma8_of_a_gray_image_is_the_gray() -> None:
    gray = noisy()
    np.testing.assert_array_equal(luma8(gray_rgba(gray)), gray)


def test_the_block_settings_do_not_change_the_hog_view() -> None:
    star = gray_rgba(siemens_star(64, 64))
    first = hog_filter(star, catalog_values("hog", blockSize=2, blockNorm="L1"), NOTHING)
    second = hog_filter(star, catalog_values("hog", blockSize=4, blockNorm="L2-Hys"), NOTHING)
    np.testing.assert_array_equal(first, second)
