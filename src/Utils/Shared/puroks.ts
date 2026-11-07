/**
 * Single source of truth for the seven standardized Purok names used across
 * the Barangay Portal System.
 *
 * Every layer that renders or accepts a Purok (resident registration,
 * admin resident tables/filters/details, reports, exports) must use this list
 * so the values stay consistent from the frontend to the database.
 *
 * Legacy labels "Purok - 3 Lagab" and "Purok - 3 Lagab Curvada" are
 * intentionally NOT included. They were standardized to "Purok - 3"
 * (see backend migration 009_standardize_puroks.sql).
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

/** Builds <option> elements for a Purok dropdown, including a blank prompt. */
export function purokOptions(): readonly string[] {
  return STANDARDIZED_PUROKS;
}
