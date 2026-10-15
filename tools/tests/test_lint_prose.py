from pathlib import Path

import pytest

from lint_prose import check_text, lint_file


def levels(text: str) -> list[str]:
    return [level for level, _ in check_text(text)]


@pytest.mark.parametrize(
    "text",
    [
        "The filter is fast \N{EM DASH} and exact.",
        "Use values 3\N{EN DASH}15.",
        "This is great -- really.",
        "It works!",
        "\N{LEFT DOUBLE QUOTATION MARK}Quoted\N{RIGHT DOUBLE QUOTATION MARK} text.",
        "Moreover, it blurs.",
        "This is a powerful method.",
        "You can simply apply it.",
        "This is not just a blur.",
        "A robust method for everyone.",
        "Pick a colour.",
        "Let's dive in.",
    ],
)
def test_bad_prose_is_an_error(text: str) -> None:
    assert "error" in levels(text)


@pytest.mark.parametrize(
    "text",
    [
        "The median filter replaces each pixel with the middle value of its neighbors.",
        "Use a robust estimator when outliers are common.",
        "Adjust sigma to change the blur.",
        "Frei-Chen and Richardson-Lucy use plain hyphens.",
        "Use values 3 to 15.",
    ],
)
def test_good_prose_passes(text: str) -> None:
    assert levels(text) == []


def test_semicolon_and_long_sentence_are_warnings() -> None:
    assert levels("One part; another part.") == ["warning"]
    long_sentence = " ".join(["word"] * 35) + "."
    assert levels(long_sentence) == ["warning"]


def test_markdown_skips_code_math_and_tables(tmp_path: Path) -> None:
    page = tmp_path / "page.md"
    page.write_text(
        "\n".join(
            [
                "# Title",
                "",
                "Run `mkdocs build --strict` to check.",
                "",
                "```bash",
                "echo 'simply -- powerful!'",
                "```",
                "",
                "| A | B |",
                "|---|---|",
                "| 1 | 2 |",
                "",
                "$$",
                "a -- b!",
                "$$",
                "",
                "!!! note",
                "    Inline maths \\(x!\\) is skipped.",
                "",
                "```mermaid",
                "flowchart LR",
                "  A --> B",
                "```",
            ]
        ),
        encoding="utf-8",
    )
    assert lint_file(page) == []


def test_markdown_reports_line_numbers(tmp_path: Path) -> None:
    page = tmp_path / "page.md"
    page.write_text("# Title\n\nGood line.\n\nThis is seamless.\n", encoding="utf-8")
    findings = lint_file(page)
    assert [(f.line, f.level) for f in findings] == [(5, "error")]


def test_yaml_checks_prose_fields_only(tmp_path: Path) -> None:
    entry = tmp_path / "entry.yaml"
    entry.write_text(
        "id: just-a-test\nformula: 'a -- b!'\nsummary: This is a powerful filter.\n",
        encoding="utf-8",
    )
    findings = lint_file(entry)
    assert len(findings) == 1
    assert "powerful" in findings[0].message


def test_citations_keep_their_spelling_but_not_their_dashes() -> None:
    title = "IEC 61966-2-1. Colour measurement and management, part 2-1, default RGB colour space"
    assert [level for level, _ in check_text(title, citation=True)] == []
    assert "error" in [level for level, _ in check_text(title)]
    assert "error" in [level for level, _ in check_text("A title — with a dash", True)]


def test_citations_keep_robust_in_their_titles() -> None:
    title = "Bay, H. et al. Speeded-up robust features (SURF)."
    assert [level for level, _ in check_text(title, citation=True)] == []
    assert "error" in [level for level, _ in check_text(title)]
