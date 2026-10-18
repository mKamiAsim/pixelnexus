"""Structured edges: optional models download only on request and must match their SHA-256,
and the filter is OpenCV's StructuredEdgeDetection with the downloaded model. The tests that run
the model skip when it is not downloaded, as on a fresh machine or in CI."""

from __future__ import annotations

import hashlib
import math
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from pixelnexus_engine import models
from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters.structured_edge import (
    MODEL_ID,
    structured_edge,
    structured_edge_representation,
)
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries
from synthetic import disks

API = "/api/v1"
CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731
REPO_MODEL = Path(__file__).resolve().parents[2] / "models"


def catalog_values(**values: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == "structured-edge")
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def fake_entry(tmp_path: Path, content: bytes, sha: str | None = None) -> dict[str, Any]:
    source = tmp_path / "source" / "model.yml.gz"
    source.parent.mkdir()
    source.write_bytes(content)
    return {
        "id": "fake-model",
        "name": "Fake model",
        "sourceUrl": source.as_uri(),
        "sha256": sha or hashlib.sha256(content).hexdigest(),
        "sizeMB": 0.001,
    }


# Models ---------------------------------------------------------------------------------------


def test_the_catalog_lists_the_model() -> None:
    entry = models.model_entry(MODEL_ID, CATALOG)
    assert entry is not None
    assert entry["sizeMB"] == pytest.approx(6.39)
    assert "non-commercial" in entry["license"]
    assert len(entry["sha256"]) == 64


def test_a_download_is_checked_and_moved_into_place(tmp_path: Path) -> None:
    entry = fake_entry(tmp_path, b"forest")
    folder = tmp_path / "models"
    assert not models.model_view(entry, folder)["downloaded"]
    path = models.download(entry, folder)
    assert path == folder / "fake-model" / "model.yml.gz"
    assert path.read_bytes() == b"forest"
    assert models.model_view(entry, folder)["downloaded"]
    assert not list(path.parent.glob("*.part"))


def test_a_download_with_the_wrong_checksum_is_not_kept(tmp_path: Path) -> None:
    entry = fake_entry(tmp_path, b"forest", sha="0" * 64)
    folder = tmp_path / "models"
    with pytest.raises(ValueError, match="checksum"):
        models.download(entry, folder)
    assert not models.model_path(entry, folder).exists()
    assert not list((folder / "fake-model").glob("*"))


def test_a_missing_model_asks_for_the_download(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PIXELNEXUS_MODELS_DIR", str(tmp_path))
    with pytest.raises(ValueError, match="Download model"):
        models.require(MODEL_ID)
    with pytest.raises(ValueError, match="Download model"):
        structured_edge(np.zeros((8, 8, 4), np.uint8), catalog_values(), NOTHING)


def test_the_representation() -> None:
    for output, count in (("edges", 3), ("thin", 4)):
        stages = structured_edge_representation(catalog_values(output=output))["stages"]
        assert len(stages) == count
        for stage in stages:
            assert all(ch >= " " for ch in stage["formula"] + stage.get("note", ""))


# The filter, with the downloaded model --------------------------------------------------------

downloaded = pytest.mark.skipif(
    not (REPO_MODEL / MODEL_ID / "model.yml.gz").is_file(),
    reason="The optional model is not downloaded.",
)


@pytest.fixture
def repo_models(monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("PIXELNEXUS_MODELS_DIR", str(REPO_MODEL))
    return REPO_MODEL / MODEL_ID / "model.yml.gz"


@downloaded
def test_the_downloaded_model_matches_the_catalog(repo_models: Path) -> None:
    entry = models.model_entry(MODEL_ID, CATALOG)
    assert entry is not None
    assert models.sha256_of(repo_models) == entry["sha256"]


@downloaded
def test_the_outputs_are_opencv(repo_models: Path) -> None:
    gray = disks(96, 96)
    image = np.dstack([gray, gray, gray, np.full_like(gray, 255)])
    sed = cv2.ximgproc.createStructuredEdgeDetection(str(repo_models))
    edges = sed.detectEdges(np.ascontiguousarray(image[..., :3].astype(np.float32) / 255))
    orientation = sed.computeOrientation(edges)
    thin = sed.edgesNms(edges, orientation, r=2, s=0, m=1)
    for output, values in (
        ("edges", edges * 255),
        ("thin", thin * 255),
        ("orientation", orientation * (255 / math.pi)),
    ):
        out = structured_edge(image, catalog_values(output=output), NOTHING)
        expected = np.clip(np.round(values.astype(np.float64)), 0, 255)
        np.testing.assert_array_equal(out[..., 0], expected)


@downloaded
def test_edges_lie_on_the_disk_outlines(repo_models: Path) -> None:
    gray = disks(128, 128)
    image = np.dstack([gray, gray, gray, np.full_like(gray, 255)])
    out = structured_edge(image, catalog_values(output="thin"), NOTHING)[..., 0]
    rows, cols = np.mgrid[0:128, 0:128]
    # The large disk of the Disks image at 128 x 128 has its center at (32, 80) and radius 18.
    ring = np.abs(np.hypot(rows - 80, cols - 32) - 18) < 3
    inside = np.hypot(rows - 80, cols - 32) < 12
    assert out[ring].max() > 100
    assert out[inside].max() < 20


# The engine API -------------------------------------------------------------------------------


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    with TestClient(create_app(Settings(max_workers=1, models_dir=tmp_path))) as test_client:
        yield test_client


def test_the_engine_lists_the_models(client: TestClient) -> None:
    listed = client.get(f"{API}/models").json()
    entry = next(m for m in listed if m["id"] == MODEL_ID)
    assert entry["downloaded"] is False
    assert entry["sizeMB"] == pytest.approx(6.39)


def test_an_unknown_model_cannot_be_downloaded(client: TestClient) -> None:
    assert client.post(f"{API}/models/no-such-model/download").status_code == 404
