"""AI tasks for the engine model provider: the route checks the task and the model, prompts are
validated, EfficientSAM refuses negative clicks, and where the real models are downloaded they
select a disk."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from pixelnexus_engine import inference
from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.filters import ai

pytest.importorskip("onnxruntime")
ROOT = Path(__file__).resolve().parents[2]
NOTHING = lambda _: None  # noqa: E731


@pytest.fixture(autouse=True)
def cpu_only(monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.setenv("PIXELNEXUS_DEVICE", "cpu")
    inference.device.cache_clear()
    yield
    inference.device.cache_clear()


def disk_scene() -> tuple[np.ndarray, np.ndarray]:
    rows, cols = np.mgrid[0:240, 0:320]
    disk = (rows - 120) ** 2 + (cols - 180) ** 2 < 60**2
    rgb = np.where(disk[..., None], [220, 60, 50], [40, 90, 160]).astype(float)
    rgb += np.random.default_rng(0).normal(0, 6, rgb.shape)
    image = np.dstack([np.clip(rgb, 0, 255), np.full((240, 320), 255)]).astype(np.uint8)
    return image, disk


def iou(mask: np.ndarray, truth: np.ndarray) -> float:
    inside = mask[..., 0] >= 128
    return float((inside & truth).sum() / (inside | truth).sum())


def test_prompts_need_a_click_or_a_box() -> None:
    with pytest.raises(ValueError, match="click or draw a box"):
        ai.prompts({"points": [], "box": None})
    points, box = ai.prompts(
        {
            "points": [{"x": 3, "y": 4, "positive": False}],
            "box": {"x": 1, "y": 2, "width": 10, "height": 5},
        }
    )
    assert points == [(3.0, 4.0, False)] and box == (1.0, 2.0, 11.0, 7.0)


def test_efficientsam_refuses_negative_clicks_instead_of_dropping_them() -> None:
    image, _ = disk_scene()
    params = {"model": "efficientsam-ti", "points": [{"x": 5, "y": 5, "positive": False}]}
    with pytest.raises(ValueError, match="no negative clicks"):
        ai.prompted_select(image, params, NOTHING)


def test_a_model_for_another_task_is_refused() -> None:
    image, _ = disk_scene()
    with pytest.raises(ValueError, match="does not do subject selection"):
        ai.subject_select(image, {"model": "sam2-1-tiny"}, NOTHING)
    with pytest.raises(ValueError, match="does not do click or box selection"):
        ai.prompted_select(
            image, {"model": "u2netp", "points": [{"x": 1, "y": 1, "positive": True}]}, NOTHING
        )


def client(tmp_path: Path, models_dir: Path | None = None) -> TestClient:
    return TestClient(create_app(Settings(models_dir=models_dir or tmp_path / "models")))


def upload(api: TestClient, image: np.ndarray) -> str:
    height, width = image.shape[:2]
    response = api.post(f"/api/v1/images?width={width}&height={height}", content=image.tobytes())
    return str(response.json()["id"])


def test_the_route_checks_the_task_and_the_model(tmp_path: Path) -> None:
    image, _ = disk_scene()
    with client(tmp_path) as api:
        image_id = upload(api, image)
        assert api.post("/api/v1/ai/teleport", json={"image": image_id}).status_code == 404
        wrong = api.post("/api/v1/ai/subject-select", json={"image": image_id, "model": "dncnn3"})
        assert wrong.status_code == 422
        later = api.post(
            "/api/v1/ai/super-resolution",
            json={"image": image_id, "model": "swin2sr-lightweight-x2"},
        )
        assert later.status_code == 501
        missing = api.post("/api/v1/ai/subject-select", json={"image": image_id})
        assert (
            missing.status_code == 409 and "Download the model BiRefNet lite first" in missing.text
        )
        bad_box = api.post(
            "/api/v1/ai/object-select",
            json={"image": image_id, "box": {"x": 0, "y": 0, "width": 0, "height": 4}},
        )
        assert bad_box.status_code == 422


# Real models, where they are on disk ------------------------------------------------------------


def on_disk(*names: str) -> Any:
    present = all((ROOT / "models" / name).is_dir() for name in names)
    return pytest.mark.skipif(not present, reason="the models are not downloaded here")


@pytest.fixture
def real_models(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PIXELNEXUS_MODELS_DIR", str(ROOT / "models"))


@on_disk("u2netp", "birefnet-lite")
@pytest.mark.parametrize("model", ["u2netp", "birefnet-lite"])
def test_real_subject_models_find_the_disk(real_models: None, model: str) -> None:
    image, disk = disk_scene()
    assert iou(ai.subject_select(image, {"model": model}, NOTHING), disk) > 0.95


@on_disk("efficientsam-ti", "sam2-1-tiny")
@pytest.mark.parametrize("model", ["efficientsam-ti", "sam2-1-tiny"])
@pytest.mark.parametrize(
    "prompt",
    [
        {"points": [{"x": 180, "y": 120, "positive": True}]},
        {"box": {"x": 110, "y": 50, "width": 140, "height": 140}},
    ],
)
def test_real_prompted_models_select_the_disk(
    real_models: None, model: str, prompt: dict[str, Any]
) -> None:
    image, disk = disk_scene()
    assert iou(ai.prompted_select(image, {"model": model, **prompt}, NOTHING), disk) > 0.95


@on_disk("sam2-1-tiny")
def test_real_sam2_takes_negative_clicks(real_models: None) -> None:
    image, disk = disk_scene()
    points = [{"x": 180, "y": 120, "positive": True}, {"x": 10, "y": 10, "positive": False}]
    assert (
        iou(ai.prompted_select(image, {"model": "sam2-1-tiny", "points": points}, NOTHING), disk)
        > 0.95
    )


@on_disk("u2netp")
def test_real_route_runs_a_task_as_a_job(tmp_path: Path) -> None:
    image, disk = disk_scene()
    with client(tmp_path, ROOT / "models") as api:
        image_id = upload(api, image)
        job = api.post(
            "/api/v1/ai/subject-select", json={"image": image_id, "model": "u2netp"}
        ).json()
        for _ in range(300):
            state = api.get(f"/api/v1/jobs/{job['id']}").json()["state"]
            if state in ("done", "failed"):
                break
            time.sleep(0.1)
        assert state == "done"
        result = api.get(f"/api/v1/jobs/{job['id']}/result")
        mask = np.frombuffer(result.content, np.uint8).reshape(240, 320, 4)
        assert iou(mask, disk) > 0.95
