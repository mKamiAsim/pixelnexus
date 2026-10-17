"""Check every catalog status against a real test run (PLAN.md Phase 10, catalog audit).

Usage, from the repository root, after a full test run that writes result files:
    pnpm --filter @pixelnexus/web exec vitest run --reporter=default \\
        --reporter=json --outputFile.json=../test-results/vitest.json
    pnpm --filter @pixelnexus/web exec playwright test --reporter=list,json   # see below
    uv run --extra cpu pytest --junitxml=test-results/pytest.xml
    uv run --extra cpu python tools/audit_catalog.py

Playwright writes JSON to the file in PLAYWRIGHT_JSON_OUTPUT_NAME, so set it to
../test-results/e2e.json for that run (web/test-results is cleared by Playwright).

For each entry it reports:
    - implemented-tested entries whose test files did not run, or had a failing test;
    - implemented-tested entries whose id is named in none of their test files. Some tools are
      tested through their functions, not by id. Those are listed in BY_FUNCTION with the reason,
      after a check by hand;
    - planned and unsupported entries that still list tests or an implementation.

It writes docs/_meta/catalog-audit.md and exits with 1 when anything is found.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path
from typing import Any

from catalog_lib import ROOT, load_catalog

OUT = ROOT / "docs" / "_meta" / "catalog-audit.md"

# Checked by hand on 2026-10-17. Each test file tests the function behind the entry.
BY_FUNCTION = {
    "metrics": "quality.test.ts tests MSE, MAE, PSNR and SSIM against skimage.metrics.",
    "resize": "resample.test.ts tests resizeImageTo against the NumPy reference.",
    "rotate-free": "resample.test.ts tests rotateImage against the NumPy reference.",
    "ai-click-select": "seedActions.test.ts tests the clicks sent to the provider.",
    "ai-matting": "aiSelectActions.test.ts and test_ai.py test soft mattes and MODNet sizes.",
    "ai-subject": "aiSelectActions.test.ts tests the answer becoming the selection.",
    "background-heuristic": "subject.test.ts tests the background as the rest of the subject.",
    "click-select-classical": "seeds.test.ts tests the seed map sent to the engine.",
    "color-range": "selection.test.ts tests colorRange.",
    "edge-assisted": "snap.test.ts tests snapping a selection to edges.",
    "object-select-classical": "test_interactive.py tests the graph cut from seeds.",
    "quick-selection": "quick.test.ts tests the SLIC superpixels and the growing.",
    "select-brightness": "selection.test.ts tests selectBrightness.",
    "select-hsv": "selection.test.ts tests selectHsv.",
    "subject-heuristic": "subject.test.ts tests the saliency maps and the subject.",
}


def vitest_results(path: Path) -> dict[str, bool]:
    data = json.loads(path.read_text())
    results: dict[str, bool] = {}
    for result in data.get("testResults", []):
        name = Path(result["name"]).resolve().relative_to(ROOT).as_posix()
        results[name] = result.get("status") == "passed"
    return results


def playwright_results(path: Path, test_dir: str = "web/tests/e2e") -> dict[str, bool]:
    data = json.loads(path.read_text())
    results: dict[str, bool] = {}

    def walk(suite: dict[str, Any]) -> None:
        for spec in suite.get("specs", []):
            name = f"{test_dir}/{spec['file']}"
            # A test that only passed on a retry counts as failed here.
            ok = spec.get("ok", False) and all(
                test.get("status") == "expected" for test in spec.get("tests", [])
            )
            results[name] = results.get(name, True) and ok
        for child in suite.get("suites", []):
            walk(child)

    for suite in data.get("suites", []):
        walk(suite)
    return results


def pytest_results(path: Path) -> dict[str, bool]:
    results: dict[str, bool] = {}
    for case in ET.parse(path).iter("testcase"):
        module = case.get("classname", "").split(".")
        # "engine.tests.test_ai" or "engine.tests.test_ai.TestClass" is engine/tests/test_ai.py.
        while module and not module[-1].startswith("test_"):
            module.pop()
        if not module:
            continue
        name = "/".join(module) + ".py"
        failed = any(child.tag in ("failure", "error") for child in case)
        results[name] = results.get(name, True) and not failed
    return results


def audit(results: dict[str, bool]) -> tuple[list[str], int]:
    bundle = load_catalog().bundle
    problems: list[str] = []
    tested = 0
    for section in ("filters", "tools"):
        for entry in bundle[section]:
            entry_id = entry["id"]
            status = entry.get("status")
            tests = entry.get("tests") or []
            if status in ("planned", "unsupported"):
                if tests or entry.get("implementation"):
                    problems.append(f"{entry_id}: {status}, but lists tests or an implementation")
                continue
            if status != "implemented-tested":
                continue
            tested += 1
            for test in tests:
                if test not in results:
                    problems.append(f"{entry_id}: {test} did not run")
                elif not results[test]:
                    problems.append(f"{entry_id}: {test} has a failing test")
            text = "".join((ROOT / t).read_text() for t in tests if (ROOT / t).is_file())
            named = re.search(r"[\"'`/]" + re.escape(entry_id) + r"[\"'`/.]", text)
            if not named and entry_id not in BY_FUNCTION:
                problems.append(f"{entry_id}: no test file names it")
    return problems, tested


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--vitest", type=Path, default=ROOT / "test-results/vitest.json")
    parser.add_argument("--playwright", type=Path, default=ROOT / "test-results/e2e.json")
    parser.add_argument("--pytest", type=Path, default=ROOT / "test-results/pytest.xml")
    args = parser.parse_args()
    for path in (args.vitest, args.playwright, args.pytest):
        if not path.is_file():
            print(f"Missing test results: {path}. See the usage at the top of this file.")
            return 2
    results = {
        **vitest_results(args.vitest),
        **playwright_results(args.playwright),
        **pytest_results(args.pytest),
    }
    problems, tested = audit(results)
    lines = [
        "# Catalog audit",
        "",
        f"Written by `tools/audit_catalog.py` on {date.today().isoformat()}, from the results "
        "of a full test run. This file is not part of the published site.",
        "",
        f"- Test files with results: {len(results)}, of which {sum(results.values())} passed.",
        f"- Entries marked implemented-tested: {tested}.",
        f"- Entries tested through their functions, checked by hand: {len(BY_FUNCTION)}.",
        f"- Problems: {len(problems)}.",
        "",
    ]
    if problems:
        lines += ["## Problems", "", *[f"- {p}" for p in problems], ""]
    lines += ["## Tested through their functions", "", "| Entry | Test |", "|---|---|"]
    lines += [f"| `{key}` | {value} |" for key, value in sorted(BY_FUNCTION.items())]
    OUT.write_text("\n".join(lines) + "\n")
    print("\n".join(lines[:9] + ([f"- {p}" for p in problems] if problems else [])))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
