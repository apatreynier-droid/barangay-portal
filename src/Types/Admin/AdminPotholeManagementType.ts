export type PotholeStatus =
  | "pending"
  | "verified"
  | "under_maintenance"
  | "resolved"
  | "rejected";

/**
 * Where a report's coordinates came from. "gps": the resident's device GPS
 * (with its accuracy). "manual": a pin the resident placed on the map. "photo":
 * GPS metadata stored in the photo itself.
 */
export type PotholeLocationSource = "gps" | "manual" | "photo";

/**
 * "completed": the count is the model's real result (0 included). "failed": the
 * model could not process the photo. "not_run": no model was available. Only
 * "completed" carries a count.
 */
export type PotholeDetectionStatus = "completed" | "failed" | "not_run";

/** Which stored image of a report to load. */
export type PotholePhotoKind = "original" | "annotated";

/* -------------------------------------------------------------------------- */
/*  API payloads (backend/app/schemas.py)                                     */
/* -------------------------------------------------------------------------- */

export type ApiPotholePhoto = {
  original_filename: string;
  content_type: string;
  file_size: number;
};

export type ApiPotholeDetection = {
  number: number;
  confidence: number;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
};

export type ApiPotholeNearbyReport = {
  id: number;
  report_number: string;
  status: PotholeStatus;
  distance_m: number;
  detection_count: number | null;
  duplicate_of_report_id: number | null;
  reported_at: string;
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
  resolved_address: string | null;
  status: PotholeStatus;
  reported_at: string;
  updated_at: string;
  photo: ApiPotholePhoto;
  detection_status: PotholeDetectionStatus;
  detection_count: number | null;
  detection_threshold: number | null;
  detections: ApiPotholeDetection[];
  has_annotated_photo: boolean;
  verified_defect_count: number | null;
  duplicate_of_report_id: number | null;
  duplicate_of_report_number: string | null;
  distance_from_barangay_m: number | null;
  outside_barangay: boolean;
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
  nearby_reports: ApiPotholeNearbyReport[];
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
  by_purok: {
    purok: string;
    count: number;
    detected_potholes: number;
    verified_defects: number;
  }[];
  unspecified_purok: number;
  with_coordinates: number;
  total_detected_potholes: number;
  verified_unique_defects: number;
  top_puroks: string[];
  top_purok_detected: number;
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
  /** Reverse-geocoded place name, when a lookup succeeded. */
  resolvedAddress: string | null;
  detection: PotholeDetectionSummary;
  /** Unique defects an administrator confirmed (never set by the model). */
  verifiedDefectCount: number | null;
  /** The earlier report this photo duplicates, when an administrator said so. */
  duplicateOf: { recordId: number; id: string } | null;
  /** Metres from the barangay center; null when there are no coordinates. */
  distanceFromBarangayM: number | null;
  /** The coordinates lie outside the barangay radius (BARANGAY_RADIUS_KM). */
  outsideBarangay: boolean;
};

export type PotholeDetectionItem = {
  number: number;
  /** 0 to 1. */
  confidence: number;
};

export type PotholeDetectionSummary = {
  status: PotholeDetectionStatus;
  /** Null unless the detection completed. */
  count: number | null;
  threshold: number | null;
  items: PotholeDetectionItem[];
  hasAnnotatedPhoto: boolean;
};

export type PotholeNearbyReport = {
  recordId: number;
  id: string;
  status: PotholeStatus;
  distanceM: number;
  detectionCount: number | null;
  isDuplicate: boolean;
  reportedAt: string;
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
  nearbyReports: PotholeNearbyReport[];
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
  byPurok: {
    purok: string;
    count: number;
    detectedPotholes: number;
    verifiedDefects: number;
  }[];
  unspecifiedPurok: number;
  withCoordinates: number;
  /** Sum of per-photo AI counts: unverified, and not unique. */
  totalDetectedPotholes: number;
  /** Administrator-confirmed unique defects. */
  verifiedUniqueDefects: number;
  topPuroks: string[];
  topPurokDetected: number;
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
  | "detectionCount"
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
