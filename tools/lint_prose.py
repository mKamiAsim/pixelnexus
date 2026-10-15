"""Check docs and catalog text against planning/WRITING_STYLE.md.

Usage:
    uv run python tools/lint_prose.py                 # docs/, catalog/ and README.md
    uv run python tools/lint_prose.py path/to/file.md # only the given files
    uv run python tools/lint_prose.py --strict        # warnings also fail

Code blocks, inline code, maths, links, Mermaid diagrams and admonition markers are removed
before the checks run, so command flags and LaTeX never trigger a rule.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGETS = [ROOT / "docs", ROOT / "catalog", ROOT / "README.md"]
SKIP_DIRS = {"_generated", "schema"}

# Catalog keys that hold code, maths or identifiers rather than prose.
NON_PROSE_KEYS = {
    "id",
    "default",
    "ref",
    "key",
    "path",
    "symbol",
    "formula",
    "pseudocode",
    "url",
    "doi",
    "sha256",
    "supportRadius",
    "docsPage",
    "related",
    "tests",
    "tags",
    "value",
    "time",
    "memory",
    "family",
    "alsoIn",
    "tier",
    "engine",
    "phase",
    "status",
    "group",
    "output",
    "representation",
    "representationLabel",
    "channelScopes",
    "demos",
    "preview",
    "license",
    "licenseUrl",
    "sourceUrl",
    "runtimes",
    "task",
    "location",
    "consent",
    "platforms",
}

BANNED_WORDS = [
    "moreover",
    "furthermore",
    "additionally",
    "in addition",
    "notably",
    "importantly",
    "overall",
    "in conclusion",
    "ultimately",
    "that said",
    "it is worth noting",
    "needless to say",
    "seamless",
    "seamlessly",
    "powerful",
    "cutting-edge",
    "state-of-the-art",
    "game-changer",
    "leverage",
    "leverages",
    "utilize",
    "utilizes",
    "utilise",
    "delve",
    "comprehensive",
    "crucial",
    "pivotal",
    "elevate",
    "unlock",
    "empower",
    "journey",
    "landscape",
    "realm",
    "tapestry",
    "intricate",
    "holistic",
    "effortless",
    "effortlessly",
    "streamline",
    "simply",
    "just",
    "easy",
    "easily",
    "obviously",
    "of course",
]
APOSTROPHE = "['\N{RIGHT SINGLE QUOTATION MARK}]"
START_WITH_POINT = "start with the point"
BANNED_PATTERNS = [
    (re.compile(r"\bnot just\b", re.I), "avoid 'not just X, but Y'"),
    (re.compile(rf"\bisn{APOSTROPHE}t just\b", re.I), "avoid 'isn't just'"),
    (re.compile(rf"\blet{APOSTROPHE}s (dive|explore|take a look)\b", re.I), START_WITH_POINT),
    (re.compile(r"\bdive in(to)?\b", re.I), START_WITH_POINT),
    (re.compile(r"\bin this (section|page|chapter),? we will\b", re.I), START_WITH_POINT),
]
# "robust" is allowed only in its statistical meaning.
ROBUST = re.compile(
    r"\brobust(ly)?\b(?!\s+(estimat|statistic|regression|fit|loss|norm|m-estimator|mean|scale))",
    re.I,
)
BRITISH = re.compile(
    r"\b(colour\w*|licence\w*|neighbour\w*|centre\w*|grey\w*|behaviour\w*|favourite\w*|"
    r"normalis\w*|equalis\w*|regularis\w*|optimis\w*|visualis\w*|analys(e|ed|ing)|"
    r"labell(ed|ing))\b",
    re.I,
)
# Emoji blocks plus the miscellaneous symbols and dingbats blocks.
EMOJI = re.compile(
    "[\U0001f000-\U0001f2ff\U0001f300-\U0001faff\N{BLACK SUN WITH RAYS}-\N{DOUBLE CURLY LOOP}]"
)
CURLY = re.compile(
    "[\N{LEFT SINGLE QUOTATION MARK}\N{RIGHT SINGLE QUOTATION MARK}"
    "\N{LEFT DOUBLE QUOTATION MARK}\N{RIGHT DOUBLE QUOTATION MARK}]"
)
SENTENCE_END = re.compile(r"(?<=[.?])\s+(?=[A-Z0-9])")
WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9'-]*")
MAX_WORDS = 30


@dataclass(frozen=True)
class Finding:
    level: str
    file: str
    line: int
    message: str

    def __str__(self) -> str:
        return f"{self.file}:{self.line}: {self.level}: {self.message}"


def strip_inline(text: str) -> str:
    """Remove inline code, maths, links, HTML and entities from one line of prose."""
    text = re.sub(r"`[^`]*`", " ", text)
    text = re.sub(r"\$\$.*?\$\$|\$[^$]+\$", " ", text)
    text = re.sub(r"\\\(.*?\\\)|\\\[.*?\\\]", " ", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)  # images
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)  # links keep their text
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&[a-z]+;|&#\d+;", " ", text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"\{\{[^}]*\}\}", " ", text)
    return text


def markdown_prose(text: str) -> Iterator[tuple[int, str]]:
    """Yield (line number, prose) for lines that hold prose."""
    in_fence = False
    fence = ""
    in_math = False
    in_front_matter = False
    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.rstrip()
        stripped = line.strip()
        if number == 1 and stripped == "---":
            in_front_matter = True
            continue
        if in_front_matter:
            in_front_matter = stripped != "---"
            continue
        match = re.match(r"^(\s*)(`{3,}|~{3,})", line)
        if match:
            marker = match.group(2)
            if not in_fence:
                in_fence, fence = True, marker[0] * len(marker)
            elif marker.startswith(fence):
                in_fence = False
            continue
        if in_fence:
            continue
        one_line_math = len(stripped) > 4 and stripped.startswith("$$") and stripped.endswith("$$")
        if one_line_math:
            continue
        if stripped in ("$$", r"\[", r"\]"):
            in_math = not in_math
            continue
        if in_math:
            continue
        if re.match(r"^\s*\|?\s*:?-{3,}", stripped) or stripped in ("---", "***"):
            continue  # table separators and rules
        if stripped.startswith("--8<--"):
            continue  # snippet includes
        stripped = re.sub(r"^(!!!|\?\?\?\+?)\s+\w+", " ", stripped)  # admonition markers
        yield number, strip_inline(stripped)


def yaml_prose(path: Path) -> Iterator[tuple[int, str, bool]]:
    """Yield (line number, prose, is citation) for prose strings in a catalog YAML file.

    Text inside `references` is a citation. Titles keep their original spelling and length.
    """
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    def find_line(fragment: str) -> int:
        head = fragment.strip().splitlines()[0][:40] if fragment.strip() else ""
        for number, line in enumerate(lines, start=1):
            if head and head in line:
                return number
        return 1

    def walk(node: Any, key: str | None, citation: bool) -> Iterator[tuple[int, str, bool]]:
        if key in NON_PROSE_KEYS:
            return
        if isinstance(node, dict):
            for child_key, value in node.items():
                yield from walk(value, str(child_key), citation or child_key == "references")
        elif isinstance(node, list):
            for item in node:
                yield from walk(item, key, citation)
        elif isinstance(node, str):
            yield find_line(node), strip_inline(node), citation

    yield from walk(yaml.safe_load(text), None, False)


def check_text(prose: str, citation: bool = False) -> Iterator[tuple[str, str]]:
    """Yield (level, message) for one piece of prose.

    A citation keeps the spelling, the words and the length of the cited title, so those checks
    are skipped. A title such as "Compared to State-of-the-Art Methods" stays as published.
    Dashes, quotes and the other character rules still apply.
    """
    if "\N{EM DASH}" in prose:
        yield "error", "em dash found. Use a full stop or a comma."
    if "\N{EN DASH}" in prose:
        yield "error", "en dash found. Use a hyphen in names and 'to' in ranges."
    if re.search(r"(?<![-!<])--(?![->])", prose):
        yield "error", "double hyphen found in prose."
    if CURLY.search(prose):
        yield "error", "curly quote found. Use straight quotes."
    if "!" in prose:
        yield "error", "exclamation mark found."
    if EMOJI.search(prose):
        yield "error", "emoji found."
    lowered = prose.lower()
    for word in [] if citation else BANNED_WORDS:
        if re.search(rf"(?<![\w-]){re.escape(word)}(?![\w-])", lowered):
            yield "error", f"avoid the word '{word}'."
    for pattern, message in BANNED_PATTERNS:
        if pattern.search(prose):
            yield "error", message
    if not citation and ROBUST.search(prose):
        yield "error", "'robust' is allowed only in its statistical meaning."
    british = None if citation else BRITISH.search(prose)
    if british:
        yield "error", f"use American spelling instead of '{british.group(0)}'."
    if ";" in prose:
        yield "warning", "semicolon found. Split the sentence."
    for sentence in [] if citation else SENTENCE_END.split(prose):
        words = WORD.findall(sentence)
        if len(words) > MAX_WORDS:
            yield "warning", f"sentence has {len(words)} words. Aim for 20 or fewer."


def lint_file(path: Path) -> list[Finding]:
    relative = str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)
    pieces: list[tuple[int, str, bool]]
    if path.suffix == ".md":
        pieces = [(n, t, False) for n, t in markdown_prose(path.read_text(encoding="utf-8"))]
    elif path.suffix in (".yaml", ".yml"):
        pieces = list(yaml_prose(path))
    else:
        return []
    return [
        Finding(level, relative, line, message)
        for line, prose, citation in pieces
        for level, message in check_text(prose, citation)
    ]


def collect(targets: list[Path]) -> list[Path]:
    files: list[Path] = []
    for target in targets:
        if target.is_file():
            files.append(target)
        elif target.is_dir():
            for path in sorted(target.rglob("*")):
                if path.suffix in (".md", ".yaml", ".yml") and not SKIP_DIRS & set(path.parts):
                    files.append(path)
    return files


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("paths", nargs="*", type=Path)
    parser.add_argument("--strict", action="store_true", help="treat warnings as errors")
    args = parser.parse_args(argv)

    files = collect([path.resolve() for path in args.paths] or DEFAULT_TARGETS)
    findings = [finding for path in files for finding in lint_file(path)]
    for finding in findings:
        print(finding)
    errors = sum(1 for f in findings if f.level == "error")
    warnings = len(findings) - errors
    print(f"Prose lint: {len(files)} file(s), {errors} error(s), {warnings} warning(s).")
    return 1 if errors or (args.strict and warnings) else 0


if __name__ == "__main__":
    sys.exit(main())
