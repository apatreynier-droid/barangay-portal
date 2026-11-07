/**
 * Display helpers for the analytics the backend computes with Pandas
 * (backend/app/analytics.py). Only formatting lives here: every number shown
 * comes from the API, nothing is recalculated or estimated in the browser.
 */

/** Philippine time, used for every report date and timestamp. */
export const MANILA_TIME_ZONE = "Asia/Manila";

/**
 * Fixed color per request status, in workflow order. Color follows the
 * status (never its rank), so a status keeps its color in every chart.
 * Lightness alternates between neighbours so adjacent segments stay
 * distinguishable for color-blind readers; validated with the dataviz
 * palette checker (worst adjacent CVD ΔE 11). Every segment is also listed
 * with its name, count and share, so identity never relies on color alone.
 */
export const REQUEST_STATUS_COLORS: Record<string, string> = {
  Pending: "#d97706",
  Approved: "#1d4ed8",
  Processing: "#a78bfa",
  "Ready for Pickup": "#0891b2",
  Completed: "#166534",
  Rejected: "#f87171",
};

/** Single-series bars use the portal's existing chart blue. */
export const SERIES_COLOR = "#2563eb";
/** Muted bar for the "Not specified" bucket (missing data, not a Purok). */
export const UNSPECIFIED_COLOR = "#94a3b8";

const numberFormat = new Intl.NumberFormat("en-PH");

export const formatCount = (value: number): string => numberFormat.format(value);

/** "42.9%" (one decimal, as computed by the backend). */
export const formatPercent = (value: number): string =>
  `${Number.isInteger(value) ? value : value.toFixed(1)}%`;

/** "+15 (+750%)", "−1 (−50%)", or "+3 (new)" when the previous period was 0. */
export const formatChange = (
  change: number,
  changePercentage: number | null,
): string => {
  const sign = change > 0 ? "+" : change < 0 ? "−" : "±";
  const absolute = `${sign}${formatCount(Math.abs(change))}`;

  if (changePercentage === null) {
    return change === 0 ? `${absolute}` : `${absolute} (new)`;
  }

  const pctSign = changePercentage > 0 ? "+" : changePercentage < 0 ? "−" : "";
  return `${absolute} (${pctSign}${formatPercent(Math.abs(changePercentage))})`;
};

/** Tone class for a change: more requests is neutral-good, fewer is muted. */
export const changeTone = (change: number): string =>
  change > 0 ? "is-up" : change < 0 ? "is-down" : "is-flat";

/**
 * Human-readable duration from hours: "18 min", "5.2 hrs", "3.4 days".
 * Returns "—" when the backend had no measurable records (null).
 */
export const formatDuration = (hours: number | null): string => {
  if (hours === null) {
    return "—";
  }

  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return minutes < 1 ? "< 1 min" : `${minutes} min`;
  }

  if (hours < 48) {
    return `${hours.toFixed(1)} hrs`;
  }

  return `${(hours / 24).toFixed(1)} days`;
};

/** Today's date in Manila as ISO `yyyy-mm-dd` (not the browser's zone). */
export const getManilaTodayIso = (): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const isoToUtcNoon = (iso: string): Date => new Date(`${iso}T12:00:00Z`);

/** "Nov 7, 2026" for an ISO calendar date (a date, so no time-zone shift). */
export const formatIsoDate = (iso: string): string => {
  const date = isoToUtcNoon(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

/** "Sep 1, 2026 – Nov 7, 2026" (single date when both ends match). */
export const formatIsoRange = (from: string, to: string): string =>
  from === to ? formatIsoDate(from) : `${formatIsoDate(from)} – ${formatIsoDate(to)}`;

/** A UTC API timestamp (with or without a zone marker) in Manila time. */
export const formatManilaDateTime = (value: string): string => {
  const trimmed = value.trim();
  const hasZone = /[zZ]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed);
  const date = new Date(hasZone ? trimmed : `${trimmed}Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

/** ISO date `days` before/after another ISO date. */
export const shiftIsoDate = (iso: string, days: number): string => {
  const date = isoToUtcNoon(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** First day of the month `months` away from the month of `iso`. */
export const shiftIsoMonthStart = (iso: string, months: number): string => {
  const date = isoToUtcNoon(iso);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
};

/** Number of calendar days in an inclusive ISO range. */
export const countIsoDays = (from: string, to: string): number =>
  Math.round(
    (isoToUtcNoon(to).getTime() - isoToUtcNoon(from).getTime()) / 86_400_000,
  ) + 1;

/**
 * Indexes of the x-axis labels to print when a chart has many points, so
 * labels never collide (every point still has its own hover tooltip).
 */
export const labelStride = (points: number, maxLabels: number): number =>
  Math.max(1, Math.ceil(points / Math.max(1, maxLabels)));
