"""Filter jobs, each in its own process.

A job runs in a separate process, started with "spawn", so a heavy filter never blocks the API
and a cancel really stops the work: the process is terminated. A dispatcher thread starts queued
jobs while fewer than ``max_workers`` run, and reads the progress and the result each process
sends through its queue. Every change bumps the job's version, which the event stream watches.
"""

from __future__ import annotations

import multiprocessing as mp
import queue
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from pixelnexus_engine.images import StoredImage
from pixelnexus_engine.registry import FILTERS, Result, Rgba, load_filters

TERMINAL = frozenset({"done", "failed", "cancelled"})
KEEP_FINISHED = 64


def _worker(filter_id: str, pixels: Rgba, params: dict[str, Any], out: Any) -> None:
    """Run one filter in a child process and send messages back through the queue."""
    load_filters()
    spec = FILTERS[filter_id]

    def progress(fraction: float) -> None:
        out.put(("progress", min(1.0, max(0.0, float(fraction)))))

    try:
        out.put(("done", spec.run(pixels, params, progress)))
    except Exception as error:  # the message goes back to the studio
        out.put(("failed", f"{type(error).__name__}: {error}"))


@dataclass
class Job:
    id: str
    filter_id: str
    image: StoredImage
    params: dict[str, Any]
    state: str = "queued"
    progress: float = 0.0
    error: str | None = None
    result: Result | None = None
    version: int = 0
    finished_at: float | None = None
    process: Any = None
    channel: Any = None
    started_at: float | None = field(default=None)

    def status(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "filter": self.filter_id,
            "image": self.image.id,
            "state": self.state,
            "progress": self.progress,
            "error": self.error,
        }


class JobManager:
    def __init__(self, max_workers: int) -> None:
        self._context = mp.get_context("spawn")
        self._max_workers = max(1, max_workers)
        self._jobs: dict[str, Job] = {}
        self._lock = threading.RLock()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, name="pixelnexus-jobs", daemon=True)
        self._thread.start()

    # Public API ------------------------------------------------------------------------------

    def submit(self, filter_id: str, image: StoredImage, params: dict[str, Any]) -> Job:
        job = Job(uuid.uuid4().hex, filter_id, image, dict(params))
        with self._lock:
            self._jobs[job.id] = job
            self._forget_old()
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def cancel(self, job_id: str) -> Job | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.state in TERMINAL:
                return job
            if job.process is not None:
                job.process.terminate()
            self._finish(job, "cancelled")
            return job

    def shutdown(self) -> None:
        self._stop.set()
        self._thread.join(timeout=5)
        with self._lock:
            for job in self._jobs.values():
                if job.state not in TERMINAL and job.process is not None:
                    job.process.terminate()

    # Dispatcher ------------------------------------------------------------------------------

    def _loop(self) -> None:
        while not self._stop.is_set():
            with self._lock:
                running = [j for j in self._jobs.values() if j.state == "running"]
                for job in running:
                    self._drain(job)
                running = [j for j in running if j.state == "running"]
                queued = [j for j in self._jobs.values() if j.state == "queued"]
                for job in queued[: self._max_workers - len(running)]:
                    self._start(job)
            time.sleep(0.02)

    def _start(self, job: Job) -> None:
        job.channel = self._context.Queue()
        job.process = self._context.Process(
            target=_worker,
            args=(job.filter_id, job.image.pixels, job.params, job.channel),
            daemon=True,
        )
        job.process.start()
        job.state = "running"
        job.started_at = time.monotonic()
        job.version += 1

    def _drain(self, job: Job) -> None:
        alive = job.process.is_alive()
        while True:
            try:
                # A process that has ended may still have its last message in the pipe.
                kind, value = (
                    job.channel.get(timeout=0.2) if not alive else job.channel.get_nowait()
                )
            except queue.Empty:
                break
            if kind == "progress":
                job.progress = value
                job.version += 1
            elif kind == "done":
                job.result = value
                job.progress = 1.0
                self._finish(job, "done")
                return
            else:
                job.error = str(value)
                self._finish(job, "failed")
                return
        if not alive:
            job.error = "The job stopped without a result."
            self._finish(job, "failed")

    def _finish(self, job: Job, state: str) -> None:
        job.state = state
        job.finished_at = time.monotonic()
        job.version += 1
        if job.process is not None:
            job.process.join(timeout=1)
        job.process = None
        job.channel = None

    def _forget_old(self) -> None:
        finished = sorted(
            (j for j in self._jobs.values() if j.state in TERMINAL),
            key=lambda j: j.finished_at or 0.0,
        )
        for job in finished[: max(0, len(finished) - KEEP_FINISHED)]:
            del self._jobs[job.id]
