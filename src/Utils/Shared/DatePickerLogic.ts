/**
 * Pure date helpers for the shared calendar/date-picker dropdown.
 *
 * Values are exchanged with the rest of the app as ISO `yyyy-mm-dd` strings
 * (the same shape the API expects for `pickup_date`), while users read and
 * type the `mm/dd/yyyy` display format.
 */

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const MONTH_SHORT_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const WEEKDAY_SHORT_NAMES = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export const WEEKDAY_FULL_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Placeholder shown inside the date field. */
export const DEFAULT_DATE_PLACEHOLDER = "mm/dd/yyyy";

/** Number of years shown per page in the compact year picker. */
export const YEAR_RANGE_SIZE = 12;

export type ViewMonth = { year: number; month: number };

export type CalendarDay = {
  /** `yyyy-mm-dd` value used for selection and keyboard focus. */
  iso: string;
  /** Day of the month (1-31). */
  day: number;
  /** False for the leading/trailing days borrowed from adjacent months. */
  inCurrentMonth: boolean;
  isToday: boolean;
};

export type CalendarWeek = CalendarDay[];

export type ParsedDateText =
  | { status: "empty" }
  | { status: "valid"; iso: string }
  | { status: "invalid" };

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const FULL_ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

export function toIsoDate(
  year: number,
  monthIndex: number,
  day: number,
): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

export function toIsoDateFromDate(date: Date): string {
  return toIsoDate(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getTodayIso(): string {
  return toIsoDateFromDate(new Date());
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function buildIsoFromParts(
  yearText: string,
  monthText: string,
  dayText: string,
): ParsedDateText {
  if (
    !/^\d{4}$/.test(yearText) ||
    !/^\d{1,2}$/.test(monthText) ||
    !/^\d{1,2}$/.test(dayText)
  ) {
    return { status: "invalid" };
  }

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month - 1)) {
    return { status: "invalid" };
  }

  return { status: "valid", iso: toIsoDate(year, month - 1, day) };
}

/**
 * Parses user input as a date. Accepts `mm/dd/yyyy`, `m/d/yyyy`, the same
 * with `-`, `.` or spaces, ISO `yyyy-mm-dd` (also pasted) and the compact
 * `mmddyyyy`/`yyyymmdd` forms typed on numeric keyboards. Impossible dates
 * such as `02/30/2026` are rejected.
 */
export function parseDateText(text: string): ParsedDateText {
  const trimmed = text.trim();
  if (!trimmed) {
    return { status: "empty" };
  }

  if (/^\d{8}$/.test(trimmed)) {
    return /^(19|20)/.test(trimmed)
      ? buildIsoFromParts(
          trimmed.slice(0, 4),
          trimmed.slice(4, 6),
          trimmed.slice(6, 8),
        )
      : buildIsoFromParts(
          trimmed.slice(4, 8),
          trimmed.slice(0, 2),
          trimmed.slice(2, 4),
        );
  }

  const parts = trimmed.split(/[/\-.\s]+/);
  if (parts.length !== 3) {
    return { status: "invalid" };
  }

  return parts[0].length === 4
    ? buildIsoFromParts(parts[0], parts[1], parts[2])
    : buildIsoFromParts(parts[2], parts[0], parts[1]);
}

/** Month (and year) that should be shown for an ISO value. */
export function getViewMonthFromIso(
  iso: string,
  fallback: Date = new Date(),
): ViewMonth {
  const match = ISO_DATE_PATTERN.exec(iso.trim());
  if (match) {
    const month = Number(match[2]) - 1;
    if (month >= 0 && month <= 11) {
      return { year: Number(match[1]), month };
    }
  }
  return { year: fallback.getFullYear(), month: fallback.getMonth() };
}

export function addMonths(
  year: number,
  month: number,
  delta: number,
): ViewMonth {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

function isoParts(iso: string): [number, number, number] | null {
  const match = FULL_ISO_DATE_PATTERN.exec(iso.trim());
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
}

export function moveIsoByDays(iso: string, delta: number): string {
  const now = new Date();
  const parts = isoParts(iso);
  const year = parts ? parts[0] : now.getFullYear();
  const month = parts ? parts[1] : now.getMonth();
  const day = parts ? parts[2] : now.getDate();

  return toIsoDateFromDate(new Date(year, month, day + delta));
}

export function moveIsoByMonths(iso: string, delta: number): string {
  const now = new Date();
  const parts = isoParts(iso);
  const year = parts ? parts[0] : now.getFullYear();
  const month = parts ? parts[1] : now.getMonth();
  const day = parts ? parts[2] : now.getDate();
  const target = addMonths(year, month, delta);

  return toIsoDate(
    target.year,
    target.month,
    Math.min(day, daysInMonth(target.year, target.month)),
  );
}

export function getIsoWeekday(iso: string): number {
  const parts = isoParts(iso);
  if (!parts) {
    return new Date().getDay();
  }
  return new Date(parts[0], parts[1], parts[2]).getDay();
}

export function isIsoInMonth(
  iso: string,
  year: number,
  month: number,
): boolean {
  const parts = isoParts(iso);
  return parts !== null && parts[0] === year && parts[1] === month;
}

/** Day that should receive roving focus when a month is displayed. */
export function getPreferredDayIso(
  year: number,
  month: number,
  preferredIso: string,
  todayIso: string,
): string {
  if (isIsoInMonth(preferredIso, year, month)) {
    return preferredIso;
  }
  if (isIsoInMonth(todayIso, year, month)) {
    return todayIso;
  }
  return toIsoDate(year, month, 1);
}

/**
 * Six Sunday-to-Saturday rows covering the given month, including the
 * leading/trailing days of the adjacent months (always 42 cells so the
 * calendar keeps a stable height while navigating).
 */
export function buildCalendarWeeks(
  year: number,
  month: number,
  todayIso: string = getTodayIso(),
): CalendarWeek[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const weeks: CalendarWeek[] = [];

  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const days: CalendarDay[] = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const offset = dayIndex - firstWeekday + weekIndex * 7;
      const date = new Date(year, month, 1 + offset);
      const iso = toIsoDateFromDate(date);

      days.push({
        iso,
        day: date.getDate(),
        inCurrentMonth:
          date.getMonth() === month && date.getFullYear() === year,
        isToday: iso === todayIso,
      });
    }

    weeks.push(days);
  }

  return weeks;
}

export function formatMonthYear(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

/** First year of the 12-year page that contains the given year. */
export function getYearRangeStart(
  year: number,
  size: number = YEAR_RANGE_SIZE,
): number {
  return Math.floor(year / size) * size;
}

export function formatYearRange(
  year: number,
  size: number = YEAR_RANGE_SIZE,
): string {
  const start = getYearRangeStart(year, size);
  return `${start} – ${start + size - 1}`;
}

/** Screen-reader label for a day cell, e.g. "Friday, September 25, 2026". */
export function formatDayAriaLabel(iso: string): string {
  const parts = isoParts(iso);
  if (!parts) {
    return iso;
  }

  const [year, month, day] = parts;
  const weekday = new Date(year, month, day).getDay();

  return `${WEEKDAY_FULL_NAMES[weekday]}, ${MONTH_NAMES[month]} ${day}, ${year}`;
}

/** `2026-09-25…` → `09/25/2026`; returns "" when the value is not an ISO date. */
export function formatIsoToDisplay(iso: string): string {
  const match = ISO_DATE_PATTERN.exec(iso.trim());
  if (!match) {
    return "";
  }
  return `${match[2]}/${match[3]}/${match[1]}`;
}
