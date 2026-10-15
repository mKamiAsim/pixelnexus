"""Internal diagnostic jobs for the contract tests. They are not catalog filters.

- ``_invert`` inverts the colors and keeps alpha, a quick job with a known result.
- ``_wait`` reports progress in steps and sleeps between them, so tests can watch progress and
  cancel a running job.
- ``_fail`` raises an error, so tests can check that a failed job reports it.
- ``_table`` returns a small table, so tests can check JSON results.
"""

from __future__ import annotations

import time
from typing import Any

from pixelnexus_engine.registry import Progress, Rgba, register


@register("_invert")
def invert(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    out = image.copy()
    out[..., :3] = 255 - image[..., :3]
    progress(1.0)
    return out


@register("_wait")
def wait(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    steps = int(params.get("steps", 5))
    for step in range(steps):
        time.sleep(float(params.get("seconds", 0.05)))
        progress((step + 1) / steps)
    return image


@register("_fail")
def fail(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    raise RuntimeError("The diagnostic job failed on purpose.")


@register(
    "_table",
    representation=lambda params: {"kind": "stages", "stages": [{"name": "Count", "formula": "n"}]},
)
def table(image: Rgba, params: dict[str, Any], progress: Progress) -> dict[str, Any]:
    height, width = image.shape[:2]
    return {"kind": "table", "columns": ["width", "height"], "rows": [[width, height]]}
