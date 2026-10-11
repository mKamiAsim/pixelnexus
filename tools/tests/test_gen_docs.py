from gen_docs import build


def test_status_table_totals_match_catalog() -> None:
    text = build()["catalog-status.md"]
    assert "| **Total** | **338** |" in text


def test_family_table_lists_every_family() -> None:
    text = build()["catalog-families.md"]
    assert text.count("\n| ") == 1 + 14 + 1  # header, families, selection tools
