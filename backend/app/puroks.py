from __future__ import annotations

#: Single source of truth for the seven standardized Purok names used across
#: the Barangay Portal System. Every layer (registration, admin resident
#: management, dashboard statistics, reports, exports) must use exactly these
#: values. Do not maintain a separate Purok list in another file.
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

#: Documented mapping of legacy Purok labels to their standardized replacements.
#: Both legacy names referred to the Purok 3 area (confirmed against resident
#: address fields containing "Purok 3"), so both map to "Purok - 3". This map is
#: used by the data-migration script and is intentionally not applied silently by
#: the running application.
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
