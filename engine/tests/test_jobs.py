"""Contract tests for the image, filter and job routes of PLAN.md section 3.8.

The jobs use the internal diagnostics in pixelnexus_engine/diagnostics.py, so the tests check
the platform without depending on any image filter. Each job runs in a real child process.
"""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings

API = "/api/v1"


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    app = create_app(Settings(max_upload_mb=1, max_pixels=200_000, max_workers=2))
    with TestClient(app) as test_client:
        yield test_client


def upload(client: TestClient, pixels: np.ndarray) -> str:
    height, width = pixels.shape[:2]
    response = client.post(
        f"{API}/images",
        params={"width": width, "height": height},
        content=pixels.astype(np.uint8).tobytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    assert response.status_code == 200, response.text
    return str(response.json()["id"])


def wait_for(client: TestClient, job_id: str, timeout: float = 60.0) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status: dict[str, Any] = client.get(f"{API}/jobs/{job_id}").json()
        if status["state"] in ("done", "failed", "cancelled"):
            return status
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not finish")


def run_job(client: TestClient, filter_id: str, image: str, **params: Any) -> dict[str, Any]:
    response = client.post(
        f"{API}/jobs", json={"filter": filter_id, "image": image, "params": params}
    )
    assert response.status_code == 202, response.text
    return wait_for(client, response.json()["id"])


def test_upload_uses_the_content_hash_as_id(client: TestClient) -> None:
    pixels = np.arange(4 * 6 * 4, dtype=np.uint8).reshape(4, 6, 4)
    first = upload(client, pixels)
    assert upload(client, pixels) == first
    assert upload(client, pixels[:, ::-1]) != first
    meta = client.get(f"{API}/images/{first}/metadata").json()
    assert meta == {"id": first, "width": 6, "height": 4, "channels": 4}
    assert client.get(f"{API}/images/{'0' * 64}/metadata").status_code == 404


def test_upload_rejects_bad_sizes(client: TestClient) -> None:
    def post(width: int, height: int, data: bytes) -> int:
        return client.post(
            f"{API}/images", params={"width": width, "height": height}, content=data
        ).status_code

    assert post(3, 3, bytes(3 * 3 * 4 - 1)) == 422
    assert post(500, 500, bytes(16)) == 422  # more pixels than the limit
    assert post(600, 600, bytes(600 * 600 * 4)) == 413  # over 1 MB


def test_a_job_runs_and_returns_raw_rgba(client: TestClient) -> None:
    pixels = np.random.default_rng(1).integers(0, 256, size=(5, 7, 4)).astype(np.uint8)
    image = upload(client, pixels)
    status = run_job(client, "_invert", image)
    assert status["state"] == "done"
    assert status["progress"] == 1.0
    result = client.get(f"{API}/jobs/{status['id']}/result")
    assert result.headers["x-width"] == "7"
    assert result.headers["x-height"] == "5"
    out = np.frombuffer(result.content, dtype=np.uint8).reshape(5, 7, 4)
    assert np.array_equal(out[..., :3], 255 - pixels[..., :3])
    assert np.array_equal(out[..., 3], pixels[..., 3])


def test_tables_come_back_as_json(client: TestClient) -> None:
    image = upload(client, np.zeros((3, 8, 4), dtype=np.uint8))
    status = run_job(client, "_table", image)
    table = client.get(f"{API}/jobs/{status['id']}/result").json()
    assert table == {"kind": "table", "columns": ["width", "height"], "rows": [[8, 3]]}


def test_progress_streams_as_server_sent_events(client: TestClient) -> None:
    image = upload(client, np.zeros((2, 2, 4), dtype=np.uint8))
    job = client.post(
        f"{API}/jobs", json={"filter": "_wait", "image": image, "params": {"steps": 4}}
    ).json()
    with client.stream("GET", f"{API}/jobs/{job['id']}/events") as stream:
        assert stream.headers["content-type"].startswith("text/event-stream")
        events = [
            json.loads(line[len("data: ") :])
            for line in stream.iter_lines()
            if line.startswith("data: ")
        ]
    assert events[-1]["state"] == "done"
    progress = [e["progress"] for e in events]
    assert progress == sorted(progress)
    assert any(0 < p < 1 for p in progress)


def test_a_cancel_stops_a_running_job(client: TestClient) -> None:
    image = upload(client, np.zeros((2, 2, 4), dtype=np.uint8))
    job = client.post(
        f"{API}/jobs",
        json={"filter": "_wait", "image": image, "params": {"steps": 200, "seconds": 0.1}},
    ).json()
    deadline = time.monotonic() + 60
    while client.get(f"{API}/jobs/{job['id']}").json()["state"] != "running":
        assert time.monotonic() < deadline
        time.sleep(0.05)
    cancelled = client.delete(f"{API}/jobs/{job['id']}").json()
    assert cancelled["state"] == "cancelled"
    assert client.get(f"{API}/jobs/{job['id']}/result").status_code == 409


def test_a_failing_job_reports_its_error(client: TestClient) -> None:
    image = upload(client, np.zeros((2, 2, 4), dtype=np.uint8))
    status = run_job(client, "_fail", image)
    assert status["state"] == "failed"
    assert "on purpose" in status["error"]


def test_unknown_filters_images_and_jobs_are_404(client: TestClient) -> None:
    image = upload(client, np.zeros((2, 2, 4), dtype=np.uint8))
    assert client.post(f"{API}/jobs", json={"filter": "no-such", "image": image}).status_code == 404
    assert client.post(f"{API}/jobs", json={"filter": "_invert", "image": "x"}).status_code == 404
    assert client.get(f"{API}/jobs/nope").status_code == 404
    assert client.delete(f"{API}/jobs/nope").status_code == 404


def test_filters_list_the_science_entries_of_the_catalog(client: TestClient) -> None:
    filters = client.get(f"{API}/filters").json()
    ids = [f["id"] for f in filters]
    assert ids == sorted(ids)
    assert "wavelet-threshold" in ids
    assert not any(i.startswith("_") for i in ids)
    assert client.get(f"{API}/filters/wavelet-threshold").json()["id"] == "wavelet-threshold"
    assert client.get(f"{API}/filters/gaussian").status_code == 404


def test_representations_come_from_the_filter_code(client: TestClient) -> None:
    stages = client.post(f"{API}/filters/_table/representation", json={}).json()
    assert stages["kind"] == "stages"
    assert client.post(f"{API}/filters/_invert/representation", json={}).status_code == 501
    assert client.post(f"{API}/filters/no-such/representation", json={}).status_code == 404
