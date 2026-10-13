import copy
from typing import Any

import pytest

from catalog_lib import entry_validator, load_catalog, load_schema, schema_issues
from check_catalog import structure_issues


@pytest.fixture(scope="module")
def catalog() -> Any:
    return load_catalog()


def entry(catalog: Any, entry_id: str) -> dict[str, Any]:
    for item in catalog.bundle["filters"]:
        if item["id"] == entry_id:
            return copy.deepcopy(item)
    raise KeyError(entry_id)


def test_repository_catalog_is_valid(catalog: Any) -> None:
    issues = [*schema_issues(catalog), *structure_issues(catalog)]
    assert [str(i) for i in issues] == []


def test_catalog_has_every_planned_entry(catalog: Any) -> None:
    total = len(catalog.bundle["filters"]) + len(catalog.bundle["tools"])
    assert total == 337


@pytest.mark.parametrize("sample", ["gaussian", "median", "sobel"])
def test_full_samples_pass_as_implemented(catalog: Any, sample: str) -> None:
    item = entry(catalog, sample)
    item["status"] = "implemented-tested"
    errors = list(entry_validator("filter", load_schema()).iter_errors(item))
    assert errors == []


def test_implemented_entry_needs_full_fields(catalog: Any) -> None:
    item = entry(catalog, "gaussian")
    item["status"] = "implemented-tested"
    del item["formula"]
    errors = list(entry_validator("filter").iter_errors(item))
    assert any("'formula' is a required property" in e.message for e in errors)


def test_stub_entry_needs_only_planning_fields(catalog: Any) -> None:
    stub = {
        "id": "x",
        "name": "X",
        "family": "linear",
        "tier": "core",
        "engine": "browser",
        "phase": "5a",
        "status": "planned",
    }
    assert list(entry_validator("filter").iter_errors(stub)) == []


def test_planned_tier_needs_a_reason() -> None:
    stub = {
        "id": "x",
        "name": "X",
        "family": "linear",
        "tier": "planned",
        "engine": "none",
        "status": "planned",
    }
    errors = list(entry_validator("filter").iter_errors(stub))
    assert any("'reason' is a required property" in e.message for e in errors)


def test_engine_none_cannot_be_implemented() -> None:
    stub = {
        "id": "x",
        "name": "X",
        "family": "linear",
        "tier": "planned",
        "engine": "none",
        "status": "implemented-tested",
        "reason": "r",
    }
    assert list(entry_validator("filter").iter_errors(stub)) != []


def test_bad_formula_placeholder_is_reported(catalog: Any) -> None:
    broken = copy.deepcopy(catalog)
    for item in broken.bundle["filters"]:
        if item["id"] == "gaussian":
            item["formula"] += " {{radius}}"
    messages = [i.message for i in structure_issues(broken)]
    assert "formula placeholder 'radius' is not a parameter" in messages


def test_default_outside_range_is_reported(catalog: Any) -> None:
    broken = copy.deepcopy(catalog)
    for item in broken.bundle["filters"]:
        if item["id"] == "median":
            item["params"][0]["default"] = 4
    messages = [i.message for i in structure_issues(broken)]
    assert "default of 'size' must be odd" in messages


def test_shared_parameter_override_must_be_an_option(catalog: Any) -> None:
    broken = copy.deepcopy(catalog)
    for item in broken.bundle["filters"]:
        if item["id"] == "sobel":
            for param in item["params"]:
                if param.get("ref") == "outputMapping":
                    param["default"] = "rainbow"
    messages = [i.message for i in structure_issues(broken)]
    assert "default of 'outputMapping' is not one of its options" in messages


def test_channel_scope_default_must_be_allowed(catalog: Any) -> None:
    broken = copy.deepcopy(catalog)
    for item in broken.bundle["filters"]:
        if item["id"] == "sobel":
            item["channelScopes"] = ["rgb"]
    messages = [i.message for i in structure_issues(broken)]
    assert "channelScope default is not in channelScopes" in messages


def test_browser_filter_must_be_registered(catalog: Any) -> None:
    broken = copy.deepcopy(catalog)
    for item in broken.bundle["filters"]:
        if item["id"] == "gaussian":
            item["status"] = "implemented-tested"
            item["implementation"] = {
                "path": "web/src/core/filters/linear/gaussian.ts",
                "symbol": "gaussianKernel1d",
            }
    messages = [i.message for i in structure_issues(broken)]
    assert any("'gaussianKernel1d' is not registered" in m for m in messages)


def test_registered_browser_filter_passes(catalog: Any) -> None:
    fine = copy.deepcopy(catalog)
    for item in fine.bundle["filters"]:
        if item["id"] == "gaussian":
            item["status"] = "implemented-tested"
    messages = [i.message for i in structure_issues(fine)]
    assert not any("registered" in m or "declare id" in m for m in messages)
