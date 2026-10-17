"""The disk cache of image encoder results: a hit skips the encoder, other images or models miss,
the folder keeps to its budget, and 0 turns it off."""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from pixelnexus_engine import embeddings


@pytest.fixture
def models(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("PIXELNEXUS_MODELS_DIR", str(tmp_path))
    monkeypatch.setenv("PIXELNEXUS_EMBEDDINGS_MB", "1")
    return tmp_path


def image(seed: int) -> np.ndarray:
    return np.random.default_rng(seed).integers(0, 256, (16, 16, 3), dtype=np.uint8)


class Encoder:
    def __init__(self, size: int = 8) -> None:
        self.calls = 0
        self.size = size

    def __call__(self) -> dict[str, Any]:
        self.calls += 1
        return {"features": np.full((self.size,), self.calls, np.float32)}


def test_a_second_run_on_the_same_image_skips_the_encoder(models: Path) -> None:
    encode = Encoder()
    first = embeddings.cached("sam", image(0), encode)
    second = embeddings.cached("sam", image(0), encode)
    assert encode.calls == 1
    np.testing.assert_array_equal(first["features"], second["features"])
    assert len(list((models / ".embeddings").glob("*.npz"))) == 1


def test_another_image_or_model_misses(models: Path) -> None:
    encode = Encoder()
    embeddings.cached("sam", image(0), encode)
    embeddings.cached("sam", image(1), encode)
    embeddings.cached("other", image(0), encode)
    assert encode.calls == 3


def test_the_folder_keeps_to_its_budget_dropping_the_least_recently_used(models: Path) -> None:
    big = Encoder(size=100_000)  # 400 kB each, so 1 MB holds two
    for seed in range(3):
        embeddings.cached("sam", image(seed), big)
        later = time.time() + seed
        for file in (models / ".embeddings").glob("*.npz"):
            if file.stat().st_mtime > later - 1:
                os.utime(file, (later, later))
    kept = sorted(f.stem for f in (models / ".embeddings").glob("*.npz"))
    expected = sorted(embeddings.key("sam", image(seed)) for seed in (1, 2))
    assert kept == expected


def test_a_damaged_file_is_computed_again(models: Path) -> None:
    encode = Encoder()
    embeddings.cached("sam", image(0), encode)
    (models / ".embeddings" / f"{embeddings.key('sam', image(0))}.npz").write_bytes(b"broken")
    embeddings.cached("sam", image(0), encode)
    assert encode.calls == 2


def test_zero_turns_the_cache_off(models: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PIXELNEXUS_EMBEDDINGS_MB", "0")
    encode = Encoder()
    embeddings.cached("sam", image(0), encode)
    embeddings.cached("sam", image(0), encode)
    assert encode.calls == 2
    assert not (models / ".embeddings").exists()
