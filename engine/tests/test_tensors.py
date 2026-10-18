"""Tensor shapes of downloaded models, read from their ONNX files."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pixelnexus_engine import models
from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings

onnx = pytest.importorskip("onnx")
from onnx import TensorProto, helper  # noqa: E402


def tiny_model(path: Path) -> None:
    weight = helper.make_tensor("w", TensorProto.FLOAT, [1], [2.0])
    graph = helper.make_graph(
        [helper.make_node("Mul", ["x", "w"], ["y"])],
        "tiny",
        [helper.make_tensor_value_info("x", TensorProto.FLOAT, ["batch", 3, "h", 8])],
        [helper.make_tensor_value_info("y", TensorProto.FLOAT, ["batch", 3, "h", 8])],
        [weight],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 10
    path.parent.mkdir(parents=True, exist_ok=True)
    onnx.save(model, str(path))


def entry(fmt: str, url: str) -> dict[str, object]:
    return {
        "id": "tiny",
        "name": "Tiny",
        "format": fmt,
        "sourceUrl": url,
        "sha256": "0" * 64,
        "sizeMB": 0.01,
    }


def test_onnx_files_give_their_inputs_and_outputs_without_weights(tmp_path: Path) -> None:
    tiny_model(tmp_path / "tiny" / "net.onnx")
    found = models.tensors(entry("onnx", "https://example.test/net.onnx"), tmp_path)
    assert found == [
        {
            "file": "net.onnx",
            "inputs": [{"name": "x", "type": "float", "shape": ["batch", 3, "h", 8]}],
            "outputs": [{"name": "y", "type": "float", "shape": ["batch", 3, "h", 8]}],
        }
    ]


def test_pytorch_weights_use_the_exported_file(tmp_path: Path) -> None:
    pth = entry("pytorch", "https://example.test/weights.pth")
    (tmp_path / "tiny").mkdir()
    (tmp_path / "tiny" / "weights.pth").write_bytes(b"")
    assert models.tensors(pth, tmp_path) == []
    tiny_model(tmp_path / "tiny" / "model.onnx")
    assert [f["file"] for f in models.tensors(pth, tmp_path)] == ["model.onnx"]


def test_the_route_needs_the_model_downloaded(tmp_path: Path) -> None:
    api = TestClient(create_app(Settings(models_dir=tmp_path)))
    response = api.get("/api/v1/models/modnet/tensors")
    assert response.status_code == 409
    assert "Download the model" in response.json()["detail"]
    assert api.get("/api/v1/models/nothing/tensors").status_code == 404
