/**
 * Single source of truth for the seven standardized Purok names (frontend).
 * Mirrors STANDARDIZED_PUROKS in backend/app/puroks.py.
 *
 * Legacy labels ("Purok - 3 Lagab", "Purok - 3 Lagab Curvada") are
 * intentionally excluded; they were merged into "Purok - 3" by migration 009.
 */
export const STANDARDIZED_PUROKS: readonly string[] = [
  "Purok - 1",
  "Purok - 2",
  "Purok - 3",
  "Purok - 4",
  "Purok - 5",
  "Purok - 6",
  "Purok - 7",
];

export type Purok = (typeof STANDARDIZED_PUROKS)[number];

/** Returns true when the value is exactly one of the standardized Puroks. */
export function isStandardizedPurok(value: string): value is Purok {
  return STANDARDIZED_PUROKS.includes(value as Purok);
}

/** The Purok values for a dropdown (callers add any blank prompt option). */
export function purokOptions(): readonly string[] {
  return STANDARDIZED_PUROKS;
}
