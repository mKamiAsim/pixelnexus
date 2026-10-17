"""Check that the docs and the catalog agree (PLAN.md Phase 9).

Usage:
    uv run python tools/check_docs.py

It reports:
    - implemented entries without a docs page, and filter pages that no entry names;
    - source paths in entries and in the docs that do not exist;
    - implemented filter pages without their status facts or formula;
    - implemented filters without a formula, and tested entries without tests.

The exit code is 1 when anything is found.
"""

from __future__ import annotations

import re
import sys

from catalog_lib import FULL_STATUSES, ROOT, load_catalog

DOCS = ROOT / "docs"
# Backticked repository paths in the docs, such as `web/src/core/filters/linear/box.ts`.
PATH_IN_DOCS = re.compile(
    r"`((?:web|engine|tools|catalog|planning|docker|docs)/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)`"
)


def check() -> list[str]:
    bundle = load_catalog().bundle
    problems: list[str] = []
    named_pages: set[str] = set()

    for section in ("filters", "tools"):
        for entry in bundle[section]:
            entry_id = entry.get("id", "?")
            status = entry.get("status")
            page = entry.get("docsPage")
            if page:
                named_pages.add(page)
            implemented = status in FULL_STATUSES
            if implemented and not page:
                problems.append(f"{section}/{entry_id}: implemented, but has no docs page")
            elif page and not (DOCS / page).is_file():
                problems.append(f"{section}/{entry_id}: docs page docs/{page} is missing")
            for key in ("implementation", "representationSource"):
                ref = entry.get(key)
                if isinstance(ref, dict) and not (ROOT / ref.get("path", "")).is_file():
                    problems.append(
                        f"{section}/{entry_id}: {key} path {ref.get('path')} is missing"
                    )
            for test in entry.get("tests", []) or []:
                if not (ROOT / test).is_file():
                    problems.append(f"{section}/{entry_id}: test file {test} is missing")
            if status == "implemented-tested" and not entry.get("tests"):
                problems.append(f"{section}/{entry_id}: implemented-tested, but lists no tests")
            if section != "filters" or not implemented:
                continue
            if not entry.get("formula") and not entry.get("command"):
                problems.append(f"filters/{entry_id}: implemented, but has no formula")
            if page and (DOCS / page).is_file():
                text = (DOCS / page).read_text(encoding="utf-8")
                if f'"filters/{entry_id}-facts.md"' not in text:
                    problems.append(f"docs/{page}: does not show the status facts of {entry_id}")
                if entry.get("formula") and f'"filters/{entry_id}-formula.md"' not in text:
                    problems.append(f"docs/{page}: does not show the formula of {entry_id}")

    for page in sorted((DOCS / "filters").rglob("*.md")):
        relative = page.relative_to(DOCS).as_posix()
        if page.name != "index.md" and relative not in named_pages:
            problems.append(f"docs/{relative}: no catalog entry names this page")

    for page in sorted(DOCS.rglob("*.md")):
        if "_generated" in page.parts:
            continue
        for match in PATH_IN_DOCS.finditer(page.read_text(encoding="utf-8")):
            path = match.group(1)
            if not (ROOT / path).exists():
                problems.append(f"docs/{page.relative_to(DOCS).as_posix()}: path {path} is missing")
    return problems


def main() -> int:
    problems = check()
    for problem in problems:
        print(problem)
    print(f"Docs check: {len(problems)} problem(s).")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
