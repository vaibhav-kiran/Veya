"""Small helpers shared by the schemas: tolerant list/text parsing for model output."""

from typing import Any

PLACEHOLDERS = {"", "none", "null", "n/a", "na", "unknown", "not specified", "not mentioned", "-"}


def as_list(value: Any) -> Any:
    """Models sometimes return "a, b" or a single string instead of a list."""
    if value is None:
        return []
    if isinstance(value, str):
        items = [part.strip() for part in value.split(",")] if "," in value else [value.strip()]
        return [item for item in items if item.lower() not in PLACEHOLDERS]
    if isinstance(value, list):
        return [item for item in value if not (isinstance(item, str) and item.strip().lower() in PLACEHOLDERS)]
    return value


def as_text(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        return ", ".join(str(item) for item in value) or None
    if isinstance(value, str) and value.strip().lower() in PLACEHOLDERS:
        return None
    return value.strip() if isinstance(value, str) else value
