"""The filters the engine can run, and the catalog entries that name the engine.

A filter is a function of an RGBA image, its parameters and a progress callback. It returns
an RGBA image, or a JSON-ready dict for features and tables. Filters register themselves by
id in ``FILTERS``. The catalog stays the single source of truth for what a filter is: the
engine lists the catalog entries whose engine is "science" and says which of them it can run.

Ids that start with an underscore are internal diagnostics for the contract tests. They are not
catalog filters and are never listed.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import yaml
from numpy.typing import NDArray

Rgba = NDArray[np.uint8]
Progress = Callable[[float], None]
Result = Rgba | dict[str, Any]
Run = Callable[[Rgba, dict[str, Any], Progress], Result]
Representation = Callable[[dict[str, Any]], dict[str, Any]]


@dataclass(frozen=True)
class EngineFilter:
    id: str
    run: Run
    representation: Representation | None = None


FILTERS: dict[str, EngineFilter] = {}


def register(filter_id: str, representation: Representation | None = None) -> Callable[[Run], Run]:
    def decorate(run: Run) -> Run:
        FILTERS[filter_id] = EngineFilter(filter_id, run, representation)
        return run

    return decorate


def load_filters() -> None:
    """Import the modules that register filters. Child processes call this too."""
    from pixelnexus_engine import diagnostics  # noqa: F401, registers by import


def find_catalog(start: Path | None = None) -> Path | None:
    """The catalog/filters folder of the repository, searched upward from a start folder."""
    here = (start or Path.cwd()).resolve()
    for folder in (here, *here.parents):
        candidate = folder / "catalog" / "filters"
        if candidate.is_dir():
            return candidate
    return None


def science_entries(catalog_dir: Path | None) -> list[dict[str, Any]]:
    """The catalog entries that run in this engine, sorted by id."""
    if catalog_dir is None:
        return []
    entries = []
    for path in sorted(catalog_dir.rglob("*.yaml")):
        entry = yaml.safe_load(path.read_text(encoding="utf-8"))
        if isinstance(entry, dict) and entry.get("engine") == "science":
            entries.append(entry)
    return sorted(entries, key=lambda e: str(e.get("id")))
