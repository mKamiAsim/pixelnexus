"""Validate the PixelNexus catalog.

Usage:
    uv run python tools/check_catalog.py            # report problems, exit 1 on errors
    uv run python tools/check_catalog.py --summary  # also print counts by tier and status

Checks:
    * Every file matches the JSON Schema.
    * File names match ids. Filter files sit in the folder of their family.
    * Ids are unique across filters and tools. Related ids exist.
    * Shared parameter references exist. Parameter keys are unique.
    * Numeric defaults sit inside their range. Odd-only defaults are odd.
    * Formula placeholders name real parameters.
    * Entries with an implemented status point to existing code, tests and docs pages.
"""

from __future__ import annotations

import argparse
import ast
import re
import sys
from collections import Counter
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from catalog_lib import FULL_STATUSES, ROOT, Catalog, Issue, load_catalog, schema_issues

PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}")


def _rel(path: Path) -> str:
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def _param_keys(entry: dict[str, Any]) -> list[str]:
    keys: list[str] = []
    for param in entry.get("params", []) or []:
        keys.append(param.get("key") or param.get("ref") or "")
    return keys


def structure_issues(catalog: Catalog) -> Iterator[Issue]:
    bundle = catalog.bundle
    common = {p.get("key"): p for p in bundle["commonParams"]}
    family_ids = [f.get("id") for f in bundle["families"]]

    for family_id, count in Counter(family_ids).items():
        if count > 1:
            yield Issue("error", "catalog/families.yaml", f"family '{family_id}' is listed twice")

    seen: dict[str, str] = {}
    for section in ("filters", "tools"):
        for index, entry in enumerate(bundle[section]):
            if not isinstance(entry, dict):
                continue
            path = catalog.origin(section, index)
            where = _rel(path)
            entry_id = entry.get("id", "")

            if path.stem != entry_id:
                yield Issue("error", where, f"file name must be '{entry_id}.yaml'")
            if entry_id in seen:
                yield Issue("error", where, f"id '{entry_id}' is also used in {seen[entry_id]}")
            seen[entry_id] = where

            if section == "filters":
                family = entry.get("family")
                if family not in family_ids:
                    yield Issue("error", where, f"family '{family}' is not in families.yaml")
                if path.parent.name != family:
                    yield Issue("error", where, f"filter must live in catalog/filters/{family}/")
                if family in (entry.get("alsoIn") or []):
                    yield Issue("error", where, "alsoIn must not repeat the main family")

            yield from _param_issues(entry, common, where)
            yield from _formula_issues(entry, where)
            if section == "filters":
                yield from _engine_rule_issues(entry, where)
            if entry.get("status") in FULL_STATUSES:
                yield from _code_issues(entry, where, section)

    model_ids = {m.get("id") for m in bundle["models"] if isinstance(m, dict)}
    for index, entry in enumerate(bundle["filters"]):
        if not isinstance(entry, dict):
            continue
        where = _rel(catalog.origin("filters", index))
        model = entry.get("model")
        if model is not None and model not in model_ids:
            yield Issue("error", where, f"model '{model}' is not in models.yaml")
        if (model is not None) != (entry.get("status") == "optional-model"):
            yield Issue(
                "error", where, "an entry has a model exactly when its status is optional-model"
            )

    sections = {"tool": "tools", "filter": "filters"}
    for index, task in enumerate(bundle.get("aiTasks", [])):
        classical = task.get("classical") if isinstance(task, dict) else None
        if not isinstance(classical, dict):
            continue
        section = sections.get(str(classical.get("kind")), "")
        target = next(
            (
                e
                for e in bundle.get(section, [])
                if isinstance(e, dict) and e.get("id") == classical.get("id")
            ),
            None,
        )
        where = f"catalog/ai-tasks.yaml:{task.get('id', index)}"
        if target is None:
            yield Issue(
                "error",
                where,
                f"classical {classical.get('kind')} '{classical.get('id')}' does not exist",
            )
        elif target.get("status") not in FULL_STATUSES:
            yield Issue(
                "error", where, f"classical alternative '{classical.get('id')}' is not runnable"
            )

    all_ids = set(seen)
    for section in ("filters", "tools"):
        for index, entry in enumerate(bundle[section]):
            if not isinstance(entry, dict):
                continue
            for related in entry.get("related", []) or []:
                if related not in all_ids:
                    where = _rel(catalog.origin(section, index))
                    yield Issue("error", where, f"related id '{related}' does not exist")

    terms = [t.get("term", "").lower() for t in bundle["glossary"]]
    for term, count in Counter(terms).items():
        if count > 1:
            yield Issue("error", "catalog/glossary.yaml", f"term '{term}' is defined twice")


def _engine_rule_issues(entry: dict[str, Any], where: str) -> Iterator[Issue]:
    """Selections as inputs and size changes need the science engine, not the tiled engine."""
    for flag in ("needsSelection", "changesSize"):
        if entry.get(flag) and entry.get("engine") != "science":
            yield Issue("error", where, f"{flag} needs the science engine")
    if "selectionRole" in entry and not entry.get("needsSelection"):
        yield Issue("error", where, "selectionRole needs needsSelection")
    if entry.get("changesSize") and "scale" not in _param_keys(entry):
        yield Issue("error", where, "an entry that sets changesSize needs a scale parameter")
    if entry.get("changesSize") and entry.get("command"):
        yield Issue("error", where, "an entry with a command must not also set changesSize")


def _param_issues(entry: dict[str, Any], common: dict[str, Any], where: str) -> Iterator[Issue]:
    keys = _param_keys(entry)
    for key, count in Counter(keys).items():
        if count > 1:
            yield Issue("error", where, f"parameter '{key}' is defined twice")
    for raw in entry.get("params", []) or []:
        param = raw
        if "ref" in raw:
            shared = common.get(raw["ref"])
            if shared is None:
                yield Issue("error", where, f"shared parameter '{raw['ref']}' does not exist")
                continue
            param = {**shared, **{k: v for k, v in raw.items() if k != "ref"}}
            scopes = entry.get("channelScopes")
            if raw["ref"] == "channelScope" and scopes and param["default"] not in scopes:
                yield Issue("error", where, "channelScope default is not in channelScopes")
        kind = param.get("type")
        default = param.get("default")
        key = param.get("key")
        if kind in ("number", "integer", "angle") and isinstance(default, (int, float)):
            low, high = param.get("min"), param.get("max")
            if low is not None and high is not None and not low <= default <= high:
                yield Issue("error", where, f"default of '{key}' is outside {low} to {high}")
            if kind == "integer" and not float(default).is_integer():
                yield Issue("error", where, f"default of '{key}' must be an integer")
            if param.get("oddOnly") and int(default) % 2 == 0:
                yield Issue("error", where, f"default of '{key}' must be odd")
        if kind == "select":
            values = [option["value"] for option in param.get("options", [])]
            if default not in values:
                yield Issue("error", where, f"default of '{key}' is not one of its options")


def _formula_issues(entry: dict[str, Any], where: str) -> Iterator[Issue]:
    keys = set(_param_keys(entry))
    for name in PLACEHOLDER.findall(entry.get("formula", "") or ""):
        if name not in keys:
            yield Issue("error", where, f"formula placeholder '{name}' is not a parameter")


def _code_issues(entry: dict[str, Any], where: str, section: str) -> Iterator[Issue]:
    implementation = entry.get("implementation") or {}
    source = ROOT / implementation.get("path", "")
    if not source.is_file():
        missing = implementation.get("path")
        yield Issue("error", where, f"implementation file '{missing}' is missing")
    elif implementation.get("symbol", "") not in source.read_text(encoding="utf-8"):
        yield Issue("error", where, f"symbol '{implementation.get('symbol')}' is not in its file")
    elif section == "filters" and entry.get("command"):
        yield from _command_issues(entry, where)
    elif section == "filters":
        yield from _registration_issues(entry, source.read_text(encoding="utf-8"), where)
    for test in entry.get("tests", []) or []:
        if not (ROOT / test).is_file():
            yield Issue("error", where, f"test file '{test}' is missing")
    docs_page = entry.get("docsPage")
    if docs_page and not (ROOT / "docs" / docs_page).is_file():
        yield Issue("error", where, f"docs page 'docs/{docs_page}' is missing")


BROWSER_REGISTRY = ROOT / "web" / "src" / "core" / "filters" / "registry.ts"
COMMANDS = ROOT / "web" / "src" / "app" / "commands.ts"


def _command_issues(entry: dict[str, Any], where: str) -> Iterator[Issue]:
    """An entry that runs through a studio command names a command that exists."""
    command = entry.get("command", "")
    source = COMMANDS.read_text(encoding="utf-8") if COMMANDS.is_file() else ""
    if f'id: "{command}"' not in source:
        yield Issue("error", where, f"command '{command}' is not in {_rel(COMMANDS)}")


def _registration_issues(entry: dict[str, Any], source: str, where: str) -> Iterator[Issue]:
    """A filter is registered with its engine under its catalog id."""
    if entry.get("engine") == "science":
        yield from _engine_registration_issues(entry, source, where)
        return
    if entry.get("engine") != "browser":
        return
    entry_id = entry.get("id", "")
    symbol = (entry.get("implementation") or {}).get("symbol", "")
    if f'id: "{entry_id}"' not in source:
        yield Issue("error", where, f'the implementation does not declare id "{entry_id}"')
    registry = BROWSER_REGISTRY.read_text(encoding="utf-8") if BROWSER_REGISTRY.is_file() else ""
    if not re.search(rf"\b{re.escape(symbol)}\b", registry):
        yield Issue("error", where, f"'{symbol}' is not registered in {_rel(BROWSER_REGISTRY)}")


ENGINE_FILTERS = ROOT / "engine" / "src" / "pixelnexus_engine" / "filters"


def _engine_registration_issues(entry: dict[str, Any], source: str, where: str) -> Iterator[Issue]:
    """A science filter registers its catalog id, in a module the filters package imports."""
    entry_id = entry.get("id", "")
    if not re.search(rf'register\(\s*"{re.escape(entry_id)}"', source):
        yield Issue("error", where, f'the implementation does not register "{entry_id}"')
    path = ROOT / (entry.get("implementation") or {}).get("path", "")
    package = ENGINE_FILTERS / "__init__.py"
    if path.parent != ENGINE_FILTERS or path.stem not in _imported_modules(package):
        yield Issue("error", where, f"'{path.stem}' is not imported in {_rel(package)}")


def _imported_modules(package: Path) -> set[str]:
    """The names imported from pixelnexus_engine.filters in the package's __init__.py."""
    if not package.is_file():
        return set()
    tree = ast.parse(package.read_text(encoding="utf-8"))
    return {
        alias.name
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom) and node.module == "pixelnexus_engine.filters"
        for alias in node.names
    }


def summary(catalog: Catalog) -> str:
    rows = [*catalog.bundle["filters"], *catalog.bundle["tools"]]
    tiers = Counter(r.get("tier") for r in rows if isinstance(r, dict))
    statuses = Counter(r.get("status") for r in rows if isinstance(r, dict))
    lines = [
        f"Entries: {len(rows)} ({len(catalog.bundle['filters'])} filters, "
        f"{len(catalog.bundle['tools'])} tools)"
    ]
    lines.append("By tier:   " + ", ".join(f"{k} {v}" for k, v in sorted(tiers.items())))
    lines.append("By status: " + ", ".join(f"{k} {v}" for k, v in sorted(statuses.items())))
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--summary", action="store_true", help="print counts by tier and status")
    args = parser.parse_args(argv)

    catalog = load_catalog()
    issues = [*schema_issues(catalog), *structure_issues(catalog)]
    for issue in issues:
        print(issue)
    errors = sum(1 for issue in issues if issue.level == "error")
    if args.summary or not errors:
        print(summary(catalog))
    print(f"Catalog check: {errors} error(s).")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
