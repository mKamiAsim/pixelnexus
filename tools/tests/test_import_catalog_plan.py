from import_catalog_plan import ALIASES, PLAN_FILE, TOOL_GROUPS, parse_rows, stub_for


def test_plan_rows_match_catalog_totals() -> None:
    rows = parse_rows(PLAN_FILE.read_text(encoding="utf-8"))
    assert len(rows) == 337
    assert len({row.entry_id for row in rows}) == 337


def test_aliases_and_tool_groups_name_real_rows() -> None:
    ids = {row.entry_id for row in parse_rows(PLAN_FILE.read_text(encoding="utf-8"))}
    assert set(ALIASES) <= ids
    assert set(TOOL_GROUPS) <= ids


def test_unsupported_rows_get_unsupported_status() -> None:
    rows = parse_rows(PLAN_FILE.read_text(encoding="utf-8"))
    bm4d = next(row for row in rows if row.entry_id == "bm4d")
    path, data = stub_for(bm4d)
    assert path.parts[-2:] == ("nonlinear", "bm4d.yaml")
    assert data["status"] == "unsupported"
    assert "reason" in data and "phase" not in data
