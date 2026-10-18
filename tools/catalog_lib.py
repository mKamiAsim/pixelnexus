"""Load the PixelNexus catalog from YAML and validate it against the JSON Schema.

The studio has its own loader in ``web/build/catalog-plugin.ts``. Both loaders build the same
bundle shape and validate it against the same schema file, so they cannot disagree on structure.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
CATALOG_DIR = ROOT / "catalog"
SCHEMA_PATH = CATALOG_DIR / "schema" / "catalog.schema.json"

# Statuses that require the full set of fields and real code.
FULL_STATUSES = frozenset(
    {
        "implemented-tested",
        "implemented-untested",
        "partial",
        "optional-dependency",
        "optional-model",
    }
)


@dataclass(frozen=True)
class Issue:
    """A problem found in the catalog."""

    level: str  # "error" or "warning"
    location: str
    message: str

    def __str__(self) -> str:
        return f"{self.level}: {self.location}: {self.message}"


@dataclass
class Catalog:
    """The bundled catalog plus the source file of every list item."""

    bundle: dict[str, Any]
    origins: dict[str, list[Path]]

    def origin(self, section: str, index: int) -> Path:
        return self.origins[section][index]


def load_yaml(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def load_schema() -> dict[str, Any]:
    with SCHEMA_PATH.open(encoding="utf-8") as handle:
        schema: dict[str, Any] = json.load(handle)
    return schema


def _list_file(path: Path, key: str) -> list[Any]:
    data = load_yaml(path) or {}
    items = data.get(key, [])
    return list(items) if items else []


def load_catalog(catalog_dir: Path = CATALOG_DIR) -> Catalog:
    """Read every catalog file into one bundle."""
    origins: dict[str, list[Path]] = {}
    bundle: dict[str, Any] = {}

    single_files = {
        "families": ("families.yaml", "families"),
        "glossary": ("glossary.yaml", "terms"),
        "commonParams": ("common-params.yaml", "params"),
        "models": ("models.yaml", "models"),
        "providers": ("providers.yaml", "providers"),
        "providerPresets": ("providers.yaml", "presets"),
        "aiTasks": ("ai-tasks.yaml", "tasks"),
    }
    for section, (filename, key) in single_files.items():
        path = catalog_dir / filename
        items = _list_file(path, key) if path.exists() else []
        bundle[section] = items
        origins[section] = [path] * len(items)

    for section, folder in (("filters", "filters"), ("tools", "tools")):
        paths = sorted((catalog_dir / folder).rglob("*.yaml"))
        bundle[section] = [load_yaml(path) for path in paths]
        origins[section] = paths

    return Catalog(bundle=bundle, origins=origins)


def _location(catalog: Catalog, path: list[str | int]) -> str:
    if len(path) >= 2 and isinstance(path[0], str) and isinstance(path[1], int):
        section, index = path[0], path[1]
        file = catalog.origin(section, index)
        rest = "/".join(str(part) for part in path[2:])
        relative = file.relative_to(ROOT) if file.is_relative_to(ROOT) else file
        return f"{relative}{':' + rest if rest else ''}"
    return "/".join(str(part) for part in path) or "catalog"


def schema_issues(catalog: Catalog, schema: dict[str, Any] | None = None) -> Iterator[Issue]:
    """Yield one issue per schema violation."""
    validator = Draft202012Validator(schema or load_schema())
    for error in sorted(validator.iter_errors(catalog.bundle), key=lambda e: list(e.path)):
        yield Issue("error", _location(catalog, list(error.path)), error.message)


def entry_validator(definition: str, schema: dict[str, Any] | None = None) -> Draft202012Validator:
    """A validator for one definition, for example ``filter``, used by tests."""
    full = schema or load_schema()
    return Draft202012Validator(
        {"$schema": full["$schema"], "$defs": full["$defs"], "$ref": f"#/$defs/{definition}"}
    )
