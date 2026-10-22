export type RequestStatus =
  | "pending"
  | "approved"
  | "processing"
  | "ready"
  | "completed"
  | "rejected";

export interface RequestHistoryItem {
  id: string;
  referenceNo: string;
  documentType: string;
  purpose: string;
  dateRequested: string; // ISO date string
  dateUpdated: string; // ISO date string
  status: RequestStatus;
}

export interface RequestHistoryFiltersState {
  search: string;
  status: RequestStatus | "all";
  dateFrom: string;
  dateTo: string;
}

export interface StatusMeta {
  label: string;
  className: string;
}
