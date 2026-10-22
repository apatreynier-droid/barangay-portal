import type { AdminReportsData } from "../../Types/Admin/AdminReportsType";

const formatExportDateTime = (value: string): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

/** Escapes a CSV field when it contains commas, quotes, or line breaks. */
const escapeCsvField = (value: string | number): string => {
  const text = String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const toCsvRows = (rows: (string | number)[][]): string =>
  rows.map((row) => row.map(escapeCsvField).join(",")).join("\n");

/**
 * Builds a full CSV workbook of the reports data (summary, monthly volume,
 * purok distribution, document types, and the individual request records).
 * All values come from the live `/api/admin/reports` payload.
 */
export const buildReportsCsv = (data: AdminReportsData): string => {
  const { summary, monthly, residents_by_purok, document_types, export_requests } =
    data;

  const sections: string[] = [];

  sections.push(
    toCsvRows([
      ["Barangay Lagab - Reports Export"],
      ["Generated", formatExportDateTime(new Date().toISOString())],
      [],
      ["Summary"],
      ["Total Residents", summary.total_residents],
      ["Active Residents", summary.active_residents],
      ["Total Requests", summary.total_requests],
      ["Completed", summary.completed],
      ["Rejected", summary.rejected],
      ["Completion Rate", `${summary.completion_rate}%`],
      ["Rejection Rate", `${summary.rejection_rate}%`],
    ]),
  );

  sections.push(
    toCsvRows([
      [],
      ["Monthly Request Volume"],
      ["Month", "Requests", "Completed", "Rejected"],
      ...monthly.map((point) => [
        point.month,
        point.requests,
        point.completed,
        point.rejected,
      ]),
    ]),
  );

  sections.push(
    toCsvRows([
      [],
      ["Residents by Purok"],
      ["Purok", "Residents"],
      ...residents_by_purok.map((entry) => [entry.purok, entry.count]),
    ]),
  );

  sections.push(
    toCsvRows([
      [],
      ["Requests by Document Type"],
      ["Document", "Requests"],
      ...document_types.map((entry) => [entry.document_name, entry.count]),
    ]),
  );

  sections.push(
    toCsvRows([
      [],
      ["Request Records"],
      ["Request Number", "Resident", "Document", "Status", "Submitted"],
      ...export_requests.map((row) => [
        row.request_number,
        row.resident_name,
        row.document,
        row.status,
        formatExportDateTime(row.submitted_at),
      ]),
    ]),
  );

  return sections.join("\n");
};

/** Triggers a browser download of the reports CSV file. */
export const downloadReportsCsv = (data: AdminReportsData): void => {
  const blob = new Blob([buildReportsCsv(data)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `barangay-reports-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** Opens the browser print dialog for the current reports page. */
export const printReports = (): void => {
  window.print();
};
