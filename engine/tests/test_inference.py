"""The model runtime: the device choice with its fallbacks, the session cache, and the download
manager with extra files, resume, progress, delete and the background routes."""

from __future__ import annotations

import base64
import hashlib
import io
import itertools
import time
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from pixelnexus_engine import inference, models
from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.probe_model import PROBE_ONNX_BASE64
from pixelnexus_engine.registry import find_catalog

ort = pytest.importorskip("onnxruntime")


@pytest.fixture(autouse=True)
def fresh_device() -> Any:
    inference.device.cache_clear()
    yield
    inference.device.cache_clear()


class FakeSession:
    def __init__(self, providers: list[str], fail_on_run: bool) -> None:
        self.providers = providers
        self.fail_on_run = fail_on_run

    def get_providers(self) -> list[str]:
        return self.providers

    def run(self, *_: Any) -> list[Any]:
        if self.fail_on_run and self.providers[0] == inference.CUDA:
            raise RuntimeError("cuDNN is unavailable: libcudnn.so not found")
        return [np.zeros(1)]


class FakeRuntime:
    """An onnxruntime stand-in whose CUDA session opens but fails on its first run."""

    __version__ = "0.0-test"

    def __init__(self, providers: list[str], fail_on_run: bool = True) -> None:
        self.providers = providers
        self.fail_on_run = fail_on_run

    def get_available_providers(self) -> list[str]:
        return self.providers

    def InferenceSession(self, _model: bytes, providers: list[str]) -> FakeSession:
        return FakeSession(providers, self.fail_on_run)


def use_runtime(monkeypatch: pytest.MonkeyPatch, fake: Any, preference: str = "auto") -> None:
    monkeypatch.setattr(inference, "runtime", lambda: fake)
    monkeypatch.setenv("PIXELNEXUS_DEVICE", preference)


# Device choice ----------------------------------------------------------------------------------


def test_without_a_runtime_the_engine_says_how_to_install_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    use_runtime(monkeypatch, None)
    chosen = inference.device()
    assert chosen.name == "none" and "uv sync --extra cpu" in chosen.note
    assert inference.describe()["runtime"] is None
    with pytest.raises(ValueError, match="no model runtime"):
        inference._session.__wrapped__("x.onnx", 0.0)


def test_a_cuda_session_that_fails_on_its_first_run_falls_back_to_the_cpu(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    use_runtime(monkeypatch, FakeRuntime([inference.CUDA, inference.CPU]))
    chosen = inference.device()
    assert chosen.name == "cpu" and chosen.providers == (inference.CPU,)
    assert "CUDA did not work" in chosen.note and "cuDNN" in chosen.note


def test_a_working_cuda_is_chosen_unless_the_cpu_is_asked_for(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeRuntime([inference.CUDA, inference.CPU], fail_on_run=False)
    use_runtime(monkeypatch, fake)
    assert inference.device().name == "cuda"
    inference.device.cache_clear()
    use_runtime(monkeypatch, fake, "cpu")
    assert inference.device().name == "cpu"


def test_asking_for_cuda_without_it_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    use_runtime(monkeypatch, FakeRuntime([inference.CPU]), "cuda")
    chosen = inference.device()
    assert chosen.name == "cpu" and "--extra cuda" in chosen.note


def test_an_unknown_preference_means_auto(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PIXELNEXUS_DEVICE", "tpu")
    assert inference.preference() == "auto"


def test_the_real_runtime_runs_the_probe_on_the_cpu(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("PIXELNEXUS_DEVICE", "cpu")
    assert inference._probe(ort, [inference.CPU]) is None
    path = tmp_path / "probe.onnx"
    path.write_bytes(base64.b64decode(PROBE_ONNX_BASE64))
    first = inference.session(path)
    assert inference.session(path) is first
    out = first.run(None, {"x": np.ones((1, 3, 5, 5), np.float32)})[0]
    assert out.shape == (1, 3, 5, 5)


# Downloads --------------------------------------------------------------------------------------


def source_file(tmp_path: Path, name: str, content: bytes) -> dict[str, Any]:
    path = tmp_path / "source" / name
    path.parent.mkdir(exist_ok=True)
    path.write_bytes(content)
    return {
        "sourceUrl": path.as_uri(),
        "sha256": hashlib.sha256(content).hexdigest(),
        "sizeMB": len(content) / 1e6,
    }


def two_file_entry(tmp_path: Path) -> dict[str, Any]:
    main = source_file(tmp_path, "net.onnx", b"graph")
    extra = source_file(tmp_path, "net.onnx_data", b"weights" * 100)
    return {"id": "two-files", "name": "Two files", **main, "extraFiles": [extra]}


def test_every_file_is_downloaded_checked_and_reported(tmp_path: Path) -> None:
    entry = two_file_entry(tmp_path)
    folder = tmp_path / "models"
    seen: list[tuple[int, int]] = []
    path = models.download(entry, folder, lambda done, total: seen.append((done, total)))
    assert path == folder / "two-files" / "net.onnx"
    assert (folder / "two-files" / "net.onnx_data").read_bytes() == b"weights" * 100
    assert models.is_downloaded(entry, folder)
    assert seen[-1][0] == seen[-1][1] == 705
    assert all(a[0] <= b[0] for a, b in itertools.pairwise(seen))
    view = models.model_view(entry, folder)
    assert view["files"] == 2 and view["downloaded"]
    models.delete(entry, folder)
    assert not (folder / "two-files").exists()


def test_a_bad_extra_file_is_not_kept_and_the_good_one_stays(tmp_path: Path) -> None:
    entry = two_file_entry(tmp_path)
    entry["extraFiles"][0]["sha256"] = "0" * 64
    folder = tmp_path / "models"
    with pytest.raises(ValueError, match=r"net\.onnx_data does not match"):
        models.download(entry, folder)
    assert sorted(p.name for p in (folder / "two-files").iterdir()) == ["net.onnx"]
    assert not models.is_downloaded(entry, folder)


class FakeResponse(io.BytesIO):
    def __init__(self, body: bytes, status: int) -> None:
        super().__init__(body)
        self.status = status

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


def test_a_broken_download_continues_with_a_range_request(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    content = b"0123456789" * 50
    entry = {
        "id": "resume",
        "name": "Resume",
        "sourceUrl": "https://example.test/model.onnx",
        "sha256": hashlib.sha256(content).hexdigest(),
        "sizeMB": len(content) / 1e6,
    }
    folder = tmp_path / "models"
    part = folder / "resume" / "model.onnx.part"
    part.parent.mkdir(parents=True)
    part.write_bytes(content[:120])
    asked: list[str | None] = []

    def fake_open(request: Any, timeout: float) -> FakeResponse:
        asked.append(request.get_header("Range"))
        return FakeResponse(content[120:], 206)

    monkeypatch.setattr(models.urllib.request, "urlopen", fake_open)
    models.download(entry, folder)
    assert asked == ["bytes=120-"]
    assert (folder / "resume" / "model.onnx").read_bytes() == content


def test_a_server_that_ignores_the_range_sends_the_whole_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    content = b"abcdefghij" * 20
    entry = {
        "id": "whole",
        "name": "Whole",
        "sourceUrl": "https://example.test/m.onnx",
        "sha256": hashlib.sha256(content).hexdigest(),
        "sizeMB": len(content) / 1e6,
    }
    folder = tmp_path / "models"
    (folder / "whole").mkdir(parents=True)
    (folder / "whole" / "m.onnx.part").write_bytes(b"stale")
    monkeypatch.setattr(
        models.urllib.request, "urlopen", lambda request, timeout: FakeResponse(content, 200)
    )
    models.download(entry, folder)
    assert (folder / "whole" / "m.onnx").read_bytes() == content


# Routes -----------------------------------------------------------------------------------------


def test_the_routes_download_in_the_background_and_delete(tmp_path: Path) -> None:
    entry = two_file_entry(tmp_path)
    catalog = tmp_path / "catalog"
    catalog.mkdir()
    real = find_catalog()
    assert real is not None
    (catalog / "filters").symlink_to(real)
    for shared in real.parent.glob("*.yaml"):
        if shared.name != "models.yaml":
            (catalog / shared.name).symlink_to(shared)
    (catalog / "models.yaml").write_text(
        "models:\n"
        f"  - id: two-files\n    name: Two files\n    task: other\n    license: MIT\n"
        f"    sourceUrl: {entry['sourceUrl']}\n    sha256: {entry['sha256']}\n"
        f"    sizeMB: {entry['sizeMB']}\n    format: onnx\n    runtimes: [engine]\n"
        "    extraFiles:\n"
        f"      - sourceUrl: {entry['extraFiles'][0]['sourceUrl']}\n"
        f"        sha256: {entry['extraFiles'][0]['sha256']}\n"
        f"        sizeMB: {entry['extraFiles'][0]['sizeMB']}\n",
        encoding="utf-8",
    )
    settings = Settings(catalog_dir=catalog / "filters", models_dir=tmp_path / "models")
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/models/nothing").status_code == 404
        started = client.post("/api/v1/models/two-files/download")
        assert started.status_code == 202
        for _ in range(100):
            body = client.get("/api/v1/models/two-files").json()
            if body["downloaded"]:
                break
            time.sleep(0.05)
        assert body["downloaded"] and body["files"] == 2 and "download" not in body
        assert client.delete("/api/v1/models/two-files").json()["downloaded"] is False
        for _ in range(200):
            info = client.get("/api/v1/info").json()
            if info["inference"]:
                break
            time.sleep(0.1)
        assert info["inference"]["device"] in ("cpu", "cuda")
        assert info["inference"]["runtime"].startswith("onnxruntime")
