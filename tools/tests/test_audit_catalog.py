"""The catalog audit reads result files and finds what it promises, on a small fake repository."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

import audit_catalog
from catalog_lib import Catalog


def fake_repo(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, entries: list[dict[str, Any]]
) -> None:
    (tmp_path / "web").mkdir()
    (tmp_path / "web" / "box.test.ts").write_text('it("box", () => run("box"));')
    (tmp_path / "web" / "other.test.ts").write_text('it("other", () => run("other"));')
    monkeypatch.setattr(audit_catalog, "ROOT", tmp_path)
    bundle = {"filters": entries, "tools": []}
    monkeypatch.setattr(audit_catalog, "load_catalog", lambda: Catalog(bundle=bundle, origins={}))


def entry(**extra: Any) -> dict[str, Any]:
    return {"id": "box", "status": "implemented-tested", "tests": ["web/box.test.ts"], **extra}


def test_a_passing_named_test_is_no_problem(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_repo(tmp_path, monkeypatch, [entry()])
    assert audit_catalog.audit({"web/box.test.ts": True}) == ([], 1)


def test_failing_missing_and_unnamed_tests_are_found(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_repo(
        tmp_path,
        monkeypatch,
        [
            entry(),
            entry(id="sharp", tests=["web/other.test.ts"]),
            entry(id="late", tests=["web/late.test.ts"]),
            {"id": "plan", "status": "planned", "tests": ["web/box.test.ts"]},
        ],
    )
    problems, tested = audit_catalog.audit({"web/box.test.ts": False, "web/other.test.ts": True})
    assert tested == 3
    assert problems == [
        "box: web/box.test.ts has a failing test",
        "sharp: no test file names it",
        "late: web/late.test.ts did not run",
        "late: no test file names it",
        "plan: planned, but lists tests or an implementation",
    ]


def test_result_files_are_read(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(audit_catalog, "ROOT", tmp_path)
    vitest = tmp_path / "vitest.json"
    vitest.write_text(
        json.dumps(
            {
                "testResults": [
                    {"name": str(tmp_path / "web/a.test.ts"), "status": "passed"},
                    {"name": str(tmp_path / "web/b.test.ts"), "status": "failed"},
                ]
            }
        )
    )
    assert audit_catalog.vitest_results(vitest) == {"web/a.test.ts": True, "web/b.test.ts": False}

    e2e = tmp_path / "e2e.json"
    spec = {"file": "a.spec.ts", "ok": True, "tests": [{"status": "expected"}]}
    flaky = {"file": "b.spec.ts", "ok": True, "tests": [{"status": "flaky"}]}
    e2e.write_text(json.dumps({"suites": [{"specs": [spec], "suites": [{"specs": [flaky]}]}]}))
    assert audit_catalog.playwright_results(e2e) == {
        "web/tests/e2e/a.spec.ts": True,
        "web/tests/e2e/b.spec.ts": False,
    }

    junit = tmp_path / "pytest.xml"
    junit.write_text(
        "<testsuites><testsuite>"
        '<testcase classname="engine.tests.test_a" name="one"/>'
        '<testcase classname="engine.tests.test_b.TestGroup" name="two"><failure/></testcase>'
        "</testsuite></testsuites>"
    )
    assert audit_catalog.pytest_results(junit) == {
        "engine/tests/test_a.py": True,
        "engine/tests/test_b.py": False,
    }
