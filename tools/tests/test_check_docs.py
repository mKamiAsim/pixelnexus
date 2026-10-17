"""The docs check finds what it promises, on a small fake repository."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

import check_docs
from catalog_lib import Catalog


def fake_repo(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, filters: list[dict[str, Any]]
) -> Path:
    """A repository with one source file, these filter entries and an empty docs tree."""
    docs = tmp_path / "docs"
    (docs / "filters" / "linear").mkdir(parents=True)
    (tmp_path / "web").mkdir()
    (tmp_path / "web" / "box.ts").write_text("x")
    monkeypatch.setattr(check_docs, "ROOT", tmp_path)
    monkeypatch.setattr(check_docs, "DOCS", docs)
    bundle = {"filters": filters, "tools": []}
    monkeypatch.setattr(check_docs, "load_catalog", lambda: Catalog(bundle=bundle, origins={}))
    return docs


def entry(**extra: Any) -> dict[str, Any]:
    return {
        "id": "box",
        "status": "implemented-tested",
        "formula": "x",
        "implementation": {"path": "web/box.ts", "symbol": "boxFilter"},
        "tests": ["web/box.ts"],
        "docsPage": "filters/linear/box.md",
        **extra,
    }


GOOD_PAGE = '--8<-- "filters/box-facts.md"\n--8<-- "filters/box-formula.md"\n'


def test_a_complete_entry_passes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    docs = fake_repo(tmp_path, monkeypatch, [entry()])
    (docs / "filters" / "linear" / "box.md").write_text(GOOD_PAGE)
    assert check_docs.check() == []


def test_each_kind_of_problem_is_found(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    broken = entry(
        formula=None,
        tests=[],
        implementation={"path": "web/gone.ts", "symbol": "x"},
    )
    docs = fake_repo(tmp_path, monkeypatch, [broken, entry(id="median", docsPage=None)])
    (docs / "filters" / "linear" / "box.md").write_text("No snippets, and `web/missing.ts`.\n")
    (docs / "filters" / "linear" / "orphan.md").write_text("# Orphan\n")
    problems = "\n".join(check_docs.check())
    assert "filters/box: implementation path web/gone.ts is missing" in problems
    assert "filters/box: implemented-tested, but lists no tests" in problems
    assert "filters/box: implemented, but has no formula" in problems
    assert "does not show the status facts of box" in problems
    assert "filters/median: implemented, but has no docs page" in problems
    assert "docs/filters/linear/orphan.md: no catalog entry names this page" in problems
    assert "path web/missing.ts is missing" in problems
