import type { AdminDocumentRequest } from "../../Types/Admin/AdminDocumentRequestsType";
import { getRequestStatusMeta } from "./AdminResidentsLogic";
import type { ResidentStatusMeta } from "./AdminResidentsLogic";

export type DocumentRequestsFiltersState = {
  search: string;
  status: string;
  document: string;
};

export const DEFAULT_DOCUMENT_REQUESTS_FILTERS: DocumentRequestsFiltersState = {
  search: "",
  status: "all",
  document: "all",
};

export const REQUEST_STATUS_OPTIONS = [
  "Pending",
  "Approved",
  "Processing",
  "Ready for Pickup",
  "Completed",
  "Rejected",
];

export function getDocumentRequestStatusMeta(
  status: string,
): ResidentStatusMeta {
  return getRequestStatusMeta(status);
}

export function getUniqueDocuments(requests: AdminDocumentRequest[]): string[] {
  return Array.from(
    new Set(requests.map((request) => request.document.trim())),
  ).sort((a, b) => a.localeCompare(b));
}

export function filterDocumentRequests(
  requests: AdminDocumentRequest[],
  filters: DocumentRequestsFiltersState,
): AdminDocumentRequest[] {
  const search = filters.search.trim().toLowerCase();

  return requests.filter((request) => {
    if (filters.status !== "all" && request.status !== filters.status) {
      return false;
    }

    if (filters.document !== "all" && request.document !== filters.document) {
      return false;
    }

    if (search) {
      const haystack =
        `${request.resident_name} ${request.request_number}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

export function formatFee(fee: number): string {
  if (!fee) {
    return "Free";
  }

  return `₱${Number.isInteger(fee) ? fee : fee.toFixed(2)}`;
}

export function formatSubmittedDateTime(value: string): string {
  return `${value.slice(0, 10)} ${value.slice(11, 16)}`;
}
