export type PotholeStatus =
  | "pending"
  | "verified"
  | "under_maintenance"
  | "resolved"
  | "rejected";

export type PotholeRemark = {
  id: string;
  author: string;
  text: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
};

export type PotholeReport = {
  /** Human-readable report number, e.g. PH-2026-0001. */
  id: string;
  residentName: string;
  residentContact: string | null;
  residentAddress: string | null;
  imageUrl: string;
  imageAlt: string;
  purok: string;
  road: string;
  /** Landmark or free-text description of where the pothole is. */
  location: string;
  /** Null when the report was sent without GPS: it cannot be mapped. */
  latitude: number | null;
  longitude: number | null;
  /** ISO 8601 timestamp. */
  reportedAt: string;
  description: string;
  status: PotholeStatus;
  remarks: PotholeRemark[];
};

export type PotholeStats = {
  total: number;
  pending: number;
  verified: number;
  underMaintenance: number;
  resolved: number;
  rejected: number;
};

export type PotholeFilters = {
  search: string;
  /** A standardized Purok name, or "all". */
  purok: string;
  status: PotholeStatus | "all";
  /** ISO `yyyy-mm-dd`, or "" when not set. */
  dateFrom: string;
  /** ISO `yyyy-mm-dd`, or "" when not set. */
  dateTo: string;
};

export type PotholeSortKey =
  | "id"
  | "residentName"
  | "purok"
  | "road"
  | "location"
  | "reportedAt"
  | "status";

export type PotholeSortState = {
  key: PotholeSortKey;
  direction: "asc" | "desc";
};

export type PotholeAction =
  | "verify"
  | "start_maintenance"
  | "resolve"
  | "reject";
