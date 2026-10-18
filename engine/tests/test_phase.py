"""Phase congruency: the grid code equals a transcription of Kovesi's phasecong3 with his own
angles, the result does not change with brightness or contrast, lines and steps get their
feature type, and corners show in the smallest moment only."""

from __future__ import annotations

import math
import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.phase import (
    angular_filter,
    frequency_grid,
    noise_threshold,
    phase_congruency,
    phase_congruency_filter,
    phase_congruency_grid,
    phase_congruency_representation,
    radial_filter,
    wavelengths,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

API = "/api/v1"
CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "phase-congruency")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def gray_rgba(gray: np.ndarray) -> np.ndarray:
    out = np.empty((*gray.shape, 4), np.uint8)
    out[..., :3] = np.clip(np.rint(gray), 0, 255).astype(np.uint8)[..., None]
    out[..., 3] = 255
    return out


def kovesi_phasecong3(img: np.ndarray, p: dict[str, Any]) -> tuple[np.ndarray, ...]:
    """phasecong3 of ImagePhaseCongruency.jl, step by step, with its own angle convention:
    sin theta = fx / f and cos theta = fy / f. It returns M, m and the feature type."""
    epsilon = 1e-5
    nscale, norient, mult, k = p["scales"], p["orientations"], p["mult"], p["k"]
    rows, cols = img.shape
    spectrum = np.fft.fft2(img)
    fx = np.fft.fftfreq(cols)[None, :] * np.ones((rows, 1))
    fy = np.fft.fftfreq(rows)[:, None] * np.ones((1, cols))
    freq = np.sqrt(fx**2 + fy**2)
    freq[0, 0] = 1
    sintheta, costheta = fx / freq, fy / freq
    freq[0, 0] = 0
    log_gabor = []
    for s in range(nscale):
        fo = 1.0 / (p["minWavelength"] * mult**s)
        with np.errstate(divide="ignore"):
            g = np.exp(-(np.log(freq / fo) ** 2) / (2 * math.log(p["sigmaOnf"]) ** 2))
        g[freq < np.finfo(float).eps] = 0
        log_gabor.append(g / (1 + (freq / 0.45) ** 30))
    energy_v = np.zeros((3, rows, cols))
    covx2, covy2, covxy = np.zeros((rows, cols)), np.zeros((rows, cols)), np.zeros((rows, cols))
    for o in range(norient):
        angl = o * math.pi / norient
        wavelen = 4 * math.pi / norient
        ds = sintheta * math.cos(angl) - costheta * math.sin(angl)
        dc = costheta * math.cos(angl) + sintheta * math.sin(angl)
        dtheta = np.minimum(np.abs(np.arctan2(ds, dc)) * 2 * math.pi / wavelen, math.pi)
        angfilter = (np.cos(dtheta) + 1) / 2
        eo, sum_e, sum_o, sum_an = [], 0.0, 0.0, 0.0
        tau, max_an = 0.0, None
        for s in range(nscale):
            result = np.fft.ifft2(spectrum * log_gabor[s] * angfilter)
            eo.append(result)
            an = np.abs(result)
            sum_an = sum_an + an
            sum_e = sum_e + result.real
            sum_o = sum_o + result.imag
            if s == 0:
                tau = float(np.median(sum_an)) / math.sqrt(math.log(4))
                max_an = an
            else:
                max_an = np.maximum(max_an, an)
        energy_v[0] += sum_e
        energy_v[1] += math.cos(angl) * sum_o
        energy_v[2] += math.sin(angl) * sum_o
        x_energy = np.sqrt(sum_e**2 + sum_o**2) + epsilon
        mean_e, mean_o = sum_e / x_energy, sum_o / x_energy
        energy = np.zeros((rows, cols))
        for result in eo:
            e, d = result.real, result.imag
            energy += e * mean_e + d * mean_o - np.abs(e * mean_o - d * mean_e)
        total_tau = tau * (1 - (1 / mult) ** nscale) / (1 - (1 / mult))
        t = total_tau * math.sqrt(math.pi / 2) + k * total_tau * math.sqrt((4 - math.pi) / 2)
        energy = np.maximum(energy - t, 0)
        width = (sum_an / (max_an + epsilon) - 1) / (nscale - 1)
        weight = 1.0 / (1 + np.exp((p["cutoff"] - width) * p["g"]))
        pco = weight * energy / sum_an
        covx, covy = pco * math.cos(angl), pco * math.sin(angl)
        covx2 += covx**2
        covy2 += covy**2
        covxy += covx * covy
    covx2 /= norient / 2
    covy2 /= norient / 2
    covxy *= 4 / norient
    denom = np.sqrt(covxy**2 + (covx2 - covy2) ** 2) + epsilon
    big = (covy2 + covx2 + denom) / 2
    small = (covy2 + covx2 - denom) / 2
    feat_type = np.arctan2(energy_v[0], np.sqrt(energy_v[1] ** 2 + energy_v[2] ** 2))
    return big, small, feat_type


@pytest.mark.parametrize(
    ("shape", "values"),
    [
        ((40, 48), {}),
        ((41, 37), {"orientations": 4, "scales": 3, "k": 5}),
        ((36, 36), {"orientations": 8, "mult": 1.6, "sigmaOnf": 0.75, "cutoff": 0.3}),
    ],
)
def test_the_grid_code_equals_kovesi_with_his_angles(
    shape: tuple[int, int], values: dict[str, Any]
) -> None:
    rng = np.random.default_rng(len(values))
    img = rng.normal(100, 10, shape)
    img[:, shape[1] // 2 :] += 60
    img[shape[0] // 3 : shape[0] // 2, 5:15] -= 50
    params = catalog_values(**values)
    ours = phase_congruency_grid(img, (slice(None), slice(None)), params, NOTHING)
    big, small, feat_type = kovesi_phasecong3(img, params)
    np.testing.assert_allclose(ours["M"], big, atol=1e-6)
    np.testing.assert_allclose(ours["m"], small, atol=1e-6)
    np.testing.assert_allclose(ours["type"], feat_type, atol=1e-6)


def test_the_filters() -> None:
    radius, phi = frequency_grid((64, 64))
    assert radius[0, 1] == pytest.approx(1 / 64)
    # Kovesi's directions: atan2(f_x, f_y), with f_y counting down the rows.
    assert phi[1, 0] == 0
    assert phi[0, 1] == pytest.approx(math.pi / 2)
    gabor = radial_filter(radius, 8, 0.55)
    assert gabor[0, 0] == 0
    assert gabor[0, 8] == pytest.approx(1.0 / (1 + (0.125 / 0.45) ** 30))
    assert gabor[0, 8] == gabor[0].max()
    window = angular_filter(phi, math.pi / 6, 6)
    assert angular_filter(np.array([math.pi / 6]), math.pi / 6, 6)[0] == pytest.approx(1)
    far = np.abs(np.angle(np.exp(1j * (phi - math.pi / 6)))) >= 2 * math.pi / 6
    assert not window[far].any()


def test_the_wavelengths_and_the_threshold() -> None:
    assert wavelengths(catalog_values()) == pytest.approx([3, 6.3, 13.23, 27.783])
    params = catalog_values(mult=2, scales=2, k=3)
    expected = 1.5 * (math.sqrt(math.pi / 2) + 3 * math.sqrt((4 - math.pi) / 2))
    assert noise_threshold(1.0, params) == pytest.approx(expected)


def test_brightness_and_contrast_do_not_change_the_result() -> None:
    rng = np.random.default_rng(3)
    img = rng.normal(100, 15, (48, 56))
    img[:, 28:] += 40
    params = catalog_values()
    first = phase_congruency(img, params, NOTHING)
    second = phase_congruency(3 * img + 17, params, NOTHING)
    for key in ("M", "m", "type"):
        np.testing.assert_allclose(first[key], second[key], atol=1e-5)


def centered_step() -> np.ndarray:
    step = np.full((64, 64), 50.0)
    step[:, 33:] = 200
    step[:, 32] = 125
    return step


def test_a_step_has_type_0_and_one_peak() -> None:
    result = phase_congruency(centered_step(), catalog_values(), NOTHING)
    assert result["type"][32, 32] == pytest.approx(0, abs=1e-3)
    row = result["M"][32]
    assert row.argmax() == 32
    assert row[32] > 2 * max(row[31], row[33])


@pytest.mark.parametrize(("value", "sign"), [(200.0, 1), (0.0, -1)])
def test_bright_and_dark_lines_have_type_plus_or_minus_pi_over_2(value: float, sign: int) -> None:
    line = np.full((64, 64), 100.0)
    line[:, 32] = value
    result = phase_congruency(line, catalog_values(), NOTHING)
    assert result["type"][32, 32] == pytest.approx(sign * math.pi / 2, abs=1e-3)
    assert result["M"][32].argmax() == 32


def test_corners_show_in_the_smallest_moment_only() -> None:
    square = np.full((80, 80), 50.0)
    square[20:60, 20:60] = 200
    result = phase_congruency(square, catalog_values(), NOTHING)
    small, big = result["m"], result["M"]
    corner = small[15:25, 15:25].max()
    assert corner > 4 * small[35:45, 15:25].max()
    assert big[35:45, 15:25].max() > 4 * small[35:45, 15:25].max()


def test_a_faint_edge_counts_about_as_much_as_a_strong_one() -> None:
    img = np.full((96, 96), 100.0)
    img[:, 32:] = 120
    img[:, 64:] = 250
    big = phase_congruency(img, catalog_values(), NOTHING)["M"]
    faint, strong = big[48, 28:36].max(), big[48, 60:68].max()
    assert 0.5 < faint / strong < 2


def test_a_flat_image_is_black_even_when_stretched() -> None:
    flat = gray_rgba(np.full((32, 32), 90.0))
    for output in ("edges", "corners"):
        out = phase_congruency_filter(flat, catalog_values(output=output), NOTHING)
        assert not out[..., :3].any()


def test_the_outputs() -> None:
    step = centered_step()
    image = gray_rgba(step)
    result = phase_congruency(step, catalog_values(), NOTHING)
    edges = phase_congruency_filter(image, catalog_values(), NOTHING)[..., 0]
    assert edges.max() == 255
    plain = phase_congruency_filter(image, catalog_values(stretch=False), NOTHING)[..., 0]
    expected = np.clip(np.rint(np.clip(result["M"], 0, 1) * 255), 0, 255)
    np.testing.assert_array_equal(plain, expected)
    kind = phase_congruency_filter(image, catalog_values(output="type"), NOTHING)[..., 0]
    assert abs(int(kind[32, 32]) - 128) <= 1
    # Away from the step, M is below 0.05, so the type is mid gray.
    assert (kind[:, :20] == 128).all()
    corners = phase_congruency_filter(image, catalog_values(output="corners"), NOTHING)
    assert corners.shape == image.shape


@pytest.mark.parametrize("output", ["edges", "corners", "type"])
def test_the_representation(output: str) -> None:
    stages = phase_congruency_representation(catalog_values(output=output))["stages"]
    names = [s["name"] for s in stages]
    assert names[:4] == ["Filter bank", "Energy", "Noise", "Phase congruency"]
    assert names[4] == ("Feature type" if output == "type" else "Moments")
    assert "3, 6.3, 13.2, 27.8 px" in stages[0]["note"]
    for stage in stages:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=2))) as test_client:
        yield test_client


def test_the_engine_runs_the_filter(client: TestClient) -> None:
    image = gray_rgba(np.random.default_rng(5).normal(120, 30, (30, 34)))
    upload = client.post(
        f"{API}/images",
        params={"width": 34, "height": 30},
        content=image.tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    job = client.post(
        f"{API}/jobs",
        json={"filter": "phase-congruency", "image": upload.json()["id"], "params": {"k": 3}},
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
    expected = phase_congruency_filter(image, catalog_values(k=3), NOTHING)
    np.testing.assert_array_equal(pixels.reshape(30, 34, 4), expected)
