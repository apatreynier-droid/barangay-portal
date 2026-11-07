export type PotholeStatus =
  | "pending"
  | "verified"
  | "under_maintenance"
  | "resolved"
  | "rejected";

/**
 * Where a report's coordinates came from. "gps": the resident's device GPS
 * (with its accuracy). "manual": a pin the resident placed on the map.
 */
export type PotholeLocationSource = "gps" | "manual";

/* -------------------------------------------------------------------------- */
/*  API payloads (backend/app/schemas.py)                                     */
/* -------------------------------------------------------------------------- */

export type ApiPotholePhoto = {
  original_filename: string;
  content_type: string;
  file_size: number;
};

export type ApiAdminPotholeReport = {
  id: number;
  report_number: string;
  resident_name: string;
  resident_contact: string | null;
  resident_address: string | null;
  purok: string | null;
  road_name: string | null;
  location_description: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  gps_accuracy_m: number | null;
  location_source: PotholeLocationSource | null;
  location_captured_at: string | null;
  status: PotholeStatus;
  reported_at: string;
  updated_at: string;
  photo: ApiPotholePhoto;
};

export type ApiPotholeUpdateEntry = {
  id: number;
  old_status: PotholeStatus | null;
  new_status: PotholeStatus | null;
  remark: string | null;
  changed_by_name: string | null;
  changed_by_role: string | null;
  created_at: string;
};

export type ApiAdminPotholeReportDetail = ApiAdminPotholeReport & {
  history: ApiPotholeUpdateEntry[];
};

export type ApiAdminPotholeSummary = {
  status_counts: {
    total: number;
    pending: number;
    verified: number;
    under_maintenance: number;
    resolved: number;
    rejected: number;
  };
  by_purok: { purok: string; count: number }[];
  unspecified_purok: number;
  with_coordinates: number;
};

/* -------------------------------------------------------------------------- */
/*  Page model                                                                */
/* -------------------------------------------------------------------------- */

export type PotholePhoto = {
  originalFilename: string;
  contentType: string;
  fileSize: number;
};

export type PotholeReport = {
  /** Database ID, used for API calls and the photo endpoint. */
  recordId: number;
  /** Report number shown to people, e.g. PH-2026-000001. Unique. */
  id: string;
  residentName: string;
  residentContact: string | null;
  residentAddress: string | null;
  photo: PotholePhoto;
  purok: string | null;
  road: string | null;
  /** Landmark or free-text description of where the pothole is. */
  location: string;
  /** Null when no position was captured: the report cannot be mapped. */
  latitude: number | null;
  longitude: number | null;
  /** GPS accuracy radius in metres (GPS reports only). */
  gpsAccuracyM: number | null;
  locationSource: PotholeLocationSource | null;
  /** ISO 8601 timestamp of the GPS fix (GPS reports only). */
  locationCapturedAt: string | null;
  /** ISO 8601 timestamp. */
  reportedAt: string;
  updatedAt: string;
  description: string | null;
  status: PotholeStatus;
};

export type PotholeHistoryEntry = {
  id: number;
  author: string;
  authorRole: string | null;
  oldStatus: PotholeStatus | null;
  newStatus: PotholeStatus | null;
  remark: string | null;
  /** ISO 8601 timestamp. */
  createdAt: string;
};

export type PotholeReportDetail = PotholeReport & {
  history: PotholeHistoryEntry[];
};

export type PotholeStats = {
  total: number;
  pending: number;
  verified: number;
  underMaintenance: number;
  resolved: number;
  rejected: number;
};

export type PotholeSummary = {
  stats: PotholeStats;
  byPurok: { purok: string; count: number }[];
  unspecifiedPurok: number;
  withCoordinates: number;
};

/** Purok filter value for reports sent without a Purok. */
export const UNSPECIFIED_PUROK = "unspecified";

export type PotholeFilters = {
  search: string;
  /** A standardized Purok name, "unspecified", or "all". */
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
  | "gpsAccuracyM"
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
