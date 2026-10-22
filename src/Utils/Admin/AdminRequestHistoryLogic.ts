import type { AdminRequestHistoryEntry } from "../../Types/Admin/AdminRequestHistoryType";
import { getRequestStatusMeta } from "./AdminResidentsLogic";
import type { ResidentStatusMeta } from "./AdminResidentsLogic";

export type AdminRequestHistoryFiltersState = {
  search: string;
  status: string;
  document: string;
  dateFrom: string;
  dateTo: string;
};

export const DEFAULT_ADMIN_REQUEST_HISTORY_FILTERS: AdminRequestHistoryFiltersState =
  {
    search: "",
    status: "all",
    document: "all",
    dateFrom: "",
    dateTo: "",
  };

export const REQUEST_HISTORY_STATUS_OPTIONS = [
  "Pending",
  "Approved",
  "Processing",
  "Ready for Pickup",
  "Completed",
  "Rejected",
];

export function getRequestHistoryStatusMeta(status: string): ResidentStatusMeta {
  return getRequestStatusMeta(status);
}

export function getUniqueHistoryDocuments(
  requests: AdminRequestHistoryEntry[],
): string[] {
  return Array.from(
    new Set(requests.map((request) => request.document.trim())),
  ).sort((a, b) => a.localeCompare(b));
}

export function getRequestDisplayId(id: number): string {
  return `BR-${String(id).padStart(4, "0")}`;
}

export function formatHistoryDateTime(value: string): string {
  return `${value.slice(0, 10)} ${value.slice(11, 16)}`;
}

export function filterAdminRequestHistory(
  requests: AdminRequestHistoryEntry[],
  filters: AdminRequestHistoryFiltersState,
): AdminRequestHistoryEntry[] {
  const search = filters.search.trim().toLowerCase();
  const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : null;
  const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`) : null;

  return requests.filter((request) => {
    if (filters.status !== "all" && request.status !== filters.status) {
      return false;
    }

    if (filters.document !== "all" && request.document !== filters.document) {
      return false;
    }

    if (search) {
      const haystack =
        `${request.resident_name} ${request.request_number} ${request.document}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    const submitted = new Date(request.submitted_at);
    if (!Number.isNaN(submitted.getTime())) {
      if (from && submitted < from) return false;
      if (to && submitted > to) return false;
    }

    return true;
  });
}
