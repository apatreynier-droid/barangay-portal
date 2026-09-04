import type {
  RequestHistoryFiltersState,
  RequestHistoryItem,
  RequestStatus,
  StatusMeta,
} from "../Types/RequestHistoryType";

export const STATUS_META: Record<RequestStatus, StatusMeta> = {
  pending: { label: "Pending", className: "status-pending" },
  processing: { label: "Processing", className: "status-processing" },
  ready: { label: "Ready for pickup", className: "status-ready" },
  completed: { label: "Completed", className: "status-completed" },
  rejected: { label: "Rejected", className: "status-rejected" },
};

export function getStatusMeta(status: RequestStatus): StatusMeta {
  return STATUS_META[status];
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function filterRequestHistory(
  items: RequestHistoryItem[],
  filters: RequestHistoryFiltersState,
): RequestHistoryItem[] {
  const search = filters.search.trim().toLowerCase();
  const from = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const to = filters.dateTo ? new Date(filters.dateTo) : null;

  return items
    .filter((item) => {
      if (filters.status !== "all" && item.status !== filters.status) {
        return false;
      }

      if (search) {
        const haystack =
          `${item.documentType} ${item.purpose} ${item.referenceNo}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      const requested = new Date(item.dateRequested);
      if (from && requested < from) return false;
      if (to && requested > to) return false;

      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.dateRequested).getTime() -
        new Date(a.dateRequested).getTime(),
    );
}

export const DEFAULT_REQUEST_HISTORY_FILTERS: RequestHistoryFiltersState = {
  search: "",
  status: "all",
  dateFrom: "",
  dateTo: "",
};
