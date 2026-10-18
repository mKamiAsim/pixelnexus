"""Parameter checks against the catalog.

The studio checks values against the catalog before it sends a job. The engine checks them
again, so a direct API call cannot pass a value outside the catalog rules. Missing values get
their catalog default, so filter code can read every key without a fallback of its own.
"""

from __future__ import annotations

import math
import re
from typing import Any

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


class ParamError(ValueError):
    """A value breaks the catalog rules. The message is shown to the user."""


def resolve_params(entry: dict[str, Any], common: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The entry's parameters with shared ones expanded, as the studio's entryParams does.

    The channel scope offers only the scopes the entry allows.
    """
    shared = {param["key"]: param for param in common}
    allowed = entry.get("channelScopes")
    out = []
    for param in entry.get("params", []) or []:
        if "ref" in param:
            overrides = {key: value for key, value in param.items() if key != "ref"}
            param = {**shared[param["ref"]], **overrides}
        if param["key"] == "channelScope" and allowed and param.get("options"):
            param = {
                **param,
                "options": [o for o in param["options"] if o["value"] in allowed],
            }
        out.append(param)
    return out


def check_params(definitions: list[dict[str, Any]], values: dict[str, Any]) -> dict[str, Any]:
    """Check values against parameter definitions and fill in defaults. Raises ParamError."""
    known = {param["key"] for param in definitions}
    unknown = sorted(set(values) - known)
    if unknown:
        raise ParamError(f"Unknown parameter: {', '.join(unknown)}.")
    out: dict[str, Any] = {}
    for param in definitions:
        key = param["key"]
        if key not in values:
            out[key] = param["default"]
            continue
        out[key] = _checked(param, values[key])
    return out


def _checked(param: dict[str, Any], value: Any) -> Any:
    label = param.get("label", param["key"])
    kind = param["type"]
    if kind in ("number", "integer", "angle"):
        if isinstance(value, bool) or not isinstance(value, int | float):
            raise ParamError(f"{label} must be a number.")
        if not math.isfinite(value):
            raise ParamError(f"{label} must be a finite number.")
        if kind == "integer" and not float(value).is_integer():
            raise ParamError(f"{label} must be a whole number.")
        low, high = param.get("min"), param.get("max")
        if (low is not None and value < low) or (high is not None and value > high):
            raise ParamError(f"{label} must be from {low} to {high}.")
        if param.get("oddOnly") and int(value) % 2 == 0:
            raise ParamError(f"{label} must be odd.")
        return int(value) if kind == "integer" else float(value)
    if kind == "select":
        options = [option["value"] for option in param.get("options", [])]
        if value not in options:
            raise ParamError(f'{label} has no option "{value}".')
        return value
    if kind == "boolean":
        if not isinstance(value, bool):
            raise ParamError(f"{label} must be true or false.")
        return value
    if kind == "color":
        if not isinstance(value, str) or not HEX_COLOR.match(value.strip()):
            raise ParamError(f"{label}: use a color like #808080.")
        return value.strip().lower()
    if not isinstance(value, str):
        raise ParamError(f"{label} must be text.")
    return value
