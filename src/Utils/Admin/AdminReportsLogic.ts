import type {
  AdminReportsData,
  AdminReportsQuery,
  ReportGranularity,
} from "../../Types/Admin/AdminReportsType";
import {
  countIsoDays,
  formatIsoRange,
  formatManilaDateTime,
  getManilaTodayIso,
  shiftIsoDate,
  shiftIsoMonthStart,
} from "./AdminAnalyticsDisplay";

/* -------------------------------------------------------------------------- */
/*  Date-range presets                                                        */
/* -------------------------------------------------------------------------- */

export type ReportPreset =
  | "this_month"
  | "last_30_days"
  | "last_3_months"
  | "last_12_months"
  | "this_year"
  | "last_year"
  | "all_time"
  | "custom";

export const REPORT_PRESETS: { key: ReportPreset; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_30_days", label: "Last 30 days" },
  { key: "last_3_months", label: "Last 3 months" },
  { key: "last_12_months", label: "Last 12 months" },
  { key: "this_year", label: "This year" },
  { key: "last_year", label: "Last year" },
  { key: "all_time", label: "All time" },
  { key: "custom", label: "Custom range" },
];

export const REPORT_GRANULARITIES: { key: ReportGranularity; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

/** Most points the backend returns per interval (mirrors analytics.py). */
export const MAX_TREND_POINTS: Record<ReportGranularity, number> = {
  daily: 400,
  weekly: 260,
  monthly: 240,
  yearly: 100,
};

/** Interval that suits a preset when it is first selected. */
const PRESET_GRANULARITY: Record<Exclude<ReportPreset, "custom">, ReportGranularity> = {
  this_month: "daily",
  last_30_days: "daily",
  last_3_months: "weekly",
  last_12_months: "monthly",
  this_year: "monthly",
  last_year: "monthly",
  all_time: "monthly",
};

export const DEFAULT_REPORT_PRESET: Exclude<ReportPreset, "custom"> =
  "last_12_months";

/**
 * The Manila-time date range of a preset. "Today" is the current Philippine
 * calendar day, not the browser's local day.
 */
export const getPresetRange = (
  preset: Exclude<ReportPreset, "custom">,
  todayIso: string = getManilaTodayIso(),
): Pick<AdminReportsQuery, "dateFrom" | "dateTo"> => {
  const year = Number(todayIso.slice(0, 4));

  switch (preset) {
    case "this_month":
      return { dateFrom: shiftIsoMonthStart(todayIso, 0), dateTo: todayIso };
    case "last_30_days":
      return { dateFrom: shiftIsoDate(todayIso, -29), dateTo: todayIso };
    case "last_3_months":
      return { dateFrom: shiftIsoMonthStart(todayIso, -2), dateTo: todayIso };
    case "last_12_months":
      return { dateFrom: shiftIsoMonthStart(todayIso, -11), dateTo: todayIso };
    case "this_year":
      return { dateFrom: `${year}-01-01`, dateTo: todayIso };
    case "last_year":
      return { dateFrom: `${year - 1}-01-01`, dateTo: `${year - 1}-12-31` };
    case "all_time":
      return { dateFrom: "", dateTo: "" };
  }
};

export const getPresetQuery = (
  preset: Exclude<ReportPreset, "custom">,
): AdminReportsQuery => ({
  ...getPresetRange(preset),
  granularity: PRESET_GRANULARITY[preset],
});

/** True when both dates are set and the start is after the end. */
export const isRangeInverted = (query: AdminReportsQuery): boolean =>
  query.dateFrom !== "" && query.dateTo !== "" && query.dateFrom > query.dateTo;

/**
 * Whether an interval can be used for the range (too many points would be
 * rejected by the backend). Unknown lengths (all time) are allowed; the
 * backend then answers with a clear message if the range is too long.
 */
export const isGranularityAllowed = (
  granularity: ReportGranularity,
  query: AdminReportsQuery,
): boolean => {
  if (query.dateFrom === "") {
    return true;
  }

  const to = query.dateTo || getManilaTodayIso();
  const days = countIsoDays(query.dateFrom, to);
  const approximatePoints =
    granularity === "daily"
      ? days
      : granularity === "weekly"
        ? Math.ceil(days / 7) + 1
        : granularity === "monthly"
          ? Math.ceil(days / 28) + 1
          : Math.ceil(days / 365) + 1;
  return approximatePoints <= MAX_TREND_POINTS[granularity];
};

const GRANULARITY_NOUN: Record<ReportGranularity, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export const granularityLabel = (granularity: ReportGranularity): string =>
  GRANULARITY_NOUN[granularity];

/** Readable description of the range the backend actually used. */
export const describeReportRange = (data: AdminReportsData): string => {
  const { filters } = data;
  const range = formatIsoRange(filters.date_from, filters.date_to);
  return filters.is_all_time ? `All time (${range})` : range;
};

/* -------------------------------------------------------------------------- */
/*  CSV export                                                                */
/* -------------------------------------------------------------------------- */

/** Escapes a CSV field when it contains commas, quotes, or line breaks. */
const escapeCsvField = (value: string | number | null): string => {
  const text = value === null ? "" : String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const toCsvRows = (rows: (string | number | null)[][]): string =>
  rows.map((row) => row.map(escapeCsvField).join(",")).join("\n");

const hours = (value: number | null): string | number =>
  value === null ? "" : value;

/**
 * Builds a full CSV workbook of the reports data for the selected range.
 * All values come from the live `/api/admin/reports` payload; timestamps are
 * written in Philippine time (Asia/Manila).
 */
export const buildReportsCsv = (data: AdminReportsData): string => {
  const {
    filters,
    summary,
    resident_summary,
    trend,
    purok_distribution,
    document_types,
    status_breakdown,
    completion,
    processing_time,
    registrations,
    comparison,
    potholes,
    export_requests,
  } = data;

  const sections: string[] = [];

  sections.push(
    toCsvRows([
      ["Barangay Lagab - Reports Export"],
      ["Generated", formatManilaDateTime(data.generated_at)],
      ["Period", describeReportRange(data)],
      ["Interval", granularityLabel(filters.granularity)],
      ["Time zone", filters.timezone],
      [],
      ["Summary"],
      ["Registered Residents (current)", resident_summary.total_registered],
      ["Active Residents (current)", resident_summary.active],
      ["Pending Registrations (current)", resident_summary.pending],
      ["Rejected Registrations (current)", resident_summary.rejected],
      ["Deactivated Residents (current)", resident_summary.deactivated],
      ["New Registrations in Period", summary.new_registrations],
      ["Requests Submitted in Period", summary.total_requests],
      ["Completed", summary.completed],
      ["Rejected", summary.rejected],
      ["Still Open", summary.open_requests],
      ["Completion Rate", `${summary.completion_rate}%`],
      ["Rejection Rate", `${summary.rejection_rate}%`],
      ["Requests Completed in Period", completion.completed_in_period],
      ["Requests Rejected in Period", completion.rejected_in_period],
    ]),
  );

  if (comparison) {
    sections.push(
      toCsvRows([
        [],
        [
          "Compared with Previous Period",
          formatIsoRange(comparison.previous_from, comparison.previous_to),
        ],
        ["Metric", "Current", "Previous", "Change", "Change %"],
        ...comparison.metrics.map((metric) => [
          metric.label,
          metric.current,
          metric.previous,
          metric.change,
          metric.change_percentage === null ? "" : `${metric.change_percentage}%`,
        ]),
      ]),
    );
  }

  sections.push(
    toCsvRows([
      [],
      [`${granularityLabel(filters.granularity)} Request Volume`],
      ["Period Start", "Period End", "Requests", "Completed", "Rejected"],
      ...trend.map((point) => [
        point.period_start,
        point.period_end,
        point.requests,
        point.completed,
        point.rejected,
      ]),
    ]),
  );

  sections.push(
    toCsvRows([
      [],
      ["Requests by Status"],
      ["Status", "Requests", "Share"],
      ...status_breakdown.map((row) => [row.status, row.count, `${row.percentage}%`]),
    ]),
  );

  sections.push(
    toCsvRows([
      [],
      ["Requests by Document Type"],
      ["Document", "Requests", "Share"],
      ...document_types.map((entry) => [
        entry.document_name,
        entry.count,
        `${entry.percentage ?? 0}%`,
      ]),
    ]),
  );

  sections.push(
    toCsvRows([
      [],
      ["Processing Time (requests completed in period, hours)"],
      ["Measured Requests", processing_time.overall.count],
      ["Average", hours(processing_time.overall.average_hours)],
      ["Median", hours(processing_time.overall.median_hours)],
      ["90th Percentile", hours(processing_time.overall.p90_hours)],
      ["Fastest", hours(processing_time.overall.min_hours)],
      ["Slowest", hours(processing_time.overall.max_hours)],
      ["Excluded (missing timestamps)", processing_time.excluded_records],
      [],
      ["Stage", "Measured", "Average Hours", "Median Hours"],
      ...processing_time.stages.map((stage) => [
        stage.stage,
        stage.count,
        hours(stage.average_hours),
        hours(stage.median_hours),
      ]),
      [],
      ["Document", "Completed", "Average Hours", "Median Hours"],
      ...processing_time.by_document_type.map((row) => [
        row.document_name,
        row.count,
        hours(row.average_hours),
        hours(row.median_hours),
      ]),
    ]),
  );

  sections.push(
    toCsvRows([
      [],
      ["Purok Comparison"],
      [
        "Purok",
        "Registered Residents",
        "Residents Share",
        "Requests in Period",
        "Requests Share",
        "Requests per Resident",
        "Pothole Reports in Period",
      ],
      ...purok_distribution.map((row) => [
        row.purok,
        row.residents,
        `${row.resident_percentage}%`,
        row.requests,
        `${row.request_percentage}%`,
        row.requests_per_resident ?? "",
        row.potholes ?? "",
      ]),
    ]),
  );

  sections.push(
    toCsvRows([
      [],
      ["Resident Registrations"],
      ["Period Start", "Period End", "Registrations", "Approved", "Pending", "Rejected"],
      ...registrations.trend.map((point) => [
        point.period_start,
        point.period_end,
        point.registrations,
        point.approved,
        point.pending,
        point.rejected,
      ]),
    ]),
  );

  if (potholes.available) {
    sections.push(
      toCsvRows([
        [],
        ["Pothole Reports"],
        ["Total", potholes.total],
        ["Resolved", potholes.resolved],
        ["Unresolved", potholes.unresolved],
        ["Rejected", potholes.rejected],
        ["Resolution Rate", `${potholes.resolution_rate}%`],
        [],
        ["Status", "Reports", "Share"],
        ...potholes.by_status.map((row) => [row.label, row.count, `${row.percentage}%`]),
        [],
        ["Road", "Reports", "Share"],
        ...potholes.by_road.map((row) => [row.road_name, row.count, `${row.percentage}%`]),
      ]),
    );
  }

  sections.push(
    toCsvRows([
      [],
      ["Request Records"],
      ["Request Number", "Resident", "Document", "Status", "Submitted (Philippine time)"],
      ...export_requests.map((row) => [
        row.request_number,
        row.resident_name,
        row.document,
        row.status,
        formatManilaDateTime(row.submitted_at),
      ]),
    ]),
  );

  return sections.join("\n");
};

/** Triggers a browser download of the reports CSV file. */
export const downloadReportsCsv = (data: AdminReportsData): void => {
  // UTF-8 BOM so spreadsheet apps read "–" and "ñ" correctly.
  const blob = new Blob(["﻿", buildReportsCsv(data)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `barangay-reports-${data.filters.date_from}-to-${data.filters.date_to}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** Opens the browser print dialog for the current reports page. */
export const printReports = (): void => {
  window.print();
};
