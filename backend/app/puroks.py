from __future__ import annotations

#: Single source of truth for the seven standardized Purok names (backend).
#: Do not maintain a separate list elsewhere; the frontend mirror is
#: src/Utils/Shared/puroks.ts.
STANDARDIZED_PUROKS: tuple[str, ...] = (
    "Purok - 1",
    "Purok - 2",
    "Purok - 3",
    "Purok - 4",
    "Purok - 5",
    "Purok - 6",
    "Purok - 7",
)

#: Lookup set used for O(1) membership validation.
PUROK_SET: frozenset[str] = frozenset(STANDARDIZED_PUROKS)

#: Legacy labels -> standardized names (both referred to the Purok 3 area).
#: Documents migration 009_standardize_puroks.sql; never applied at runtime.
LEGACY_PUROK_MAPPING: dict[str, str] = {
    "Purok - 3 Lagab": "Purok - 3",
    "Purok - 3 Lagab Curvada": "Purok - 3",
}


def is_valid_purok(value: str | None) -> bool:
    """Return True when the value is None/empty or one of the standardized Puroks."""
    if value is None:
        return True
    return value.strip() == "" or value.strip() in PUROK_SET


def normalize_purok(value: str | None) -> str | None:
    """Return the stripped Purok, or None when empty/unspecified."""
    if value is None:
        return None
    stripped = value.strip()
    if stripped == "":
        return None
    return stripped


def validate_purok(value: str | None) -> str | None:
    """Return the normalized Purok or raise ValueError for unsupported values."""
    if not is_valid_purok(value):
        raise ValueError(
            f"Unsupported purok value: {value!r}. "
            f"Allowed values are: {', '.join(STANDARDIZED_PUROKS)}."
        )
    return normalize_purok(value)
