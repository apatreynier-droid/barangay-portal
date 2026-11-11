/**
 * Resident-facing dates and times, always shown in Philippine time
 * (Asia/Manila).
 *
 * The backend stores and sends event timestamps in UTC without a zone marker
 * (e.g. "2026-11-02T15:35:00"). Pickup dates are plain calendar dates
 * ("2026-11-12") already meant as Manila dates, so they are never shifted.
 */

export const PHILIPPINE_TIMEZONE = "Asia/Manila";

/** Parse a backend UTC timestamp ("Z" is added when no zone is given). */
export const parseUtcTimestamp = (value: string): Date => {
  const trimmed = value.trim().replace(" ", "T");

  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return new Date(trimmed);
  }

  return new Date(`${trimmed}Z`);
};

/** UTC timestamp -> "Nov 2, 2026, 10:35 PM" in Philippine time. */
export const formatManilaDateTime = (value: string): string => {
  const date = parseUtcTimestamp(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: PHILIPPINE_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

/**
 * Pickup date -> "Thu, November 12, 2026". A plain calendar date is shown
 * as-is (formatted in UTC so it can never move to the previous/next day);
 * a full timestamp is converted to Philippine time.
 */
export const formatPickupDate = (
  value: string,
  weekday: "short" | "long" = "short",
): string => {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = isDateOnly
    ? new Date(`${value}T00:00:00Z`)
    : parseUtcTimestamp(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: isDateOnly ? "UTC" : PHILIPPINE_TIMEZONE,
    weekday,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
};
