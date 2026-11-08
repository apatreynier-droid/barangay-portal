import { toUtcTimestamp } from "./AdminDashboardLogic";
import {
  UNSPECIFIED_PUROK,
  type ApiAdminPotholeReport,
  type ApiAdminPotholeReportDetail,
  type ApiAdminPotholeSummary,
  type PotholeAction,
  type PotholeFilters,
  type PotholeHistoryEntry,
  type PotholeReport,
  type PotholeReportDetail,
  type PotholeSortKey,
  type PotholeSortState,
  type PotholeSummary,
  type PotholeStatus,
} from "../../Types/Admin/AdminPotholeManagementType";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

/** Also the workflow order used when sorting by status. */
export const POTHOLE_STATUSES: PotholeStatus[] = [
  "pending",
  "verified",
  "under_maintenance",
  "resolved",
  "rejected",
];

export const POTHOLE_STATUS_META: Record<
  PotholeStatus,
  { label: string; glyph: string }
> = {
  pending: { label: "Pending", glyph: "P" },
  verified: { label: "Verified", glyph: "V" },
  under_maintenance: { label: "Under Maintenance", glyph: "M" },
  resolved: { label: "Resolved", glyph: "R" },
  rejected: { label: "Rejected", glyph: "X" },
};

export const POTHOLE_ACTION_META: Record<
  PotholeAction,
  {
    label: string;
    targetStatus: PotholeStatus;
    confirmTitle: string;
    confirmBody: string;
    confirmLabel: string;
    isDanger: boolean;
    /** Rejecting a resident's report must always say why. */
    requiresRemark: boolean;
  }
> = {
  verify: {
    label: "Verify Report",
    targetStatus: "verified",
    confirmTitle: "Verify this report?",
    confirmBody: "This confirms that the pothole exists at the reported location.",
    confirmLabel: "Verify",
    isDanger: false,
    requiresRemark: false,
  },
  start_maintenance: {
    label: "Mark as Under Maintenance",
    targetStatus: "under_maintenance",
    confirmTitle: "Mark as under maintenance?",
    confirmBody: "This shows that repair work on the pothole has started.",
    confirmLabel: "Mark Under Maintenance",
    isDanger: false,
    requiresRemark: false,
  },
  resolve: {
    label: "Mark as Resolved",
    targetStatus: "resolved",
    confirmTitle: "Mark as resolved?",
    confirmBody: "This closes the report because the pothole has been repaired.",
    confirmLabel: "Mark Resolved",
    isDanger: false,
    requiresRemark: false,
  },
  reject: {
    label: "Reject Report",
    targetStatus: "rejected",
    confirmTitle: "Reject this report?",
    confirmBody: "This closes the report without any repair work.",
    confirmLabel: "Reject Report",
    isDanger: true,
    requiresRemark: true,
  },
};

const AVAILABLE_ACTIONS: Record<PotholeStatus, PotholeAction[]> = {
  pending: ["verify", "reject"],
  verified: ["start_maintenance", "reject"],
  under_maintenance: ["resolve"],
  resolved: [],
  rejected: [],
};

/**
 * Actions a Staff account may take (repair progress). The backend enforces
 * this; the UI only hides buttons that would be refused.
 */
const STAFF_ACTIONS: PotholeAction[] = ["start_maintenance", "resolve"];

/** Above this many metres a GPS fix is flagged as low accuracy. */
export const LOW_GPS_ACCURACY_M = 50;

/** How often the page re-checks the server for new reports. */
export const POTHOLE_REFRESH_INTERVAL_MS = 60_000;

export const POTHOLE_PAGE_SIZE_OPTIONS = [5, 10, 25];
export const DEFAULT_POTHOLE_PAGE_SIZE = 10;
export const MAX_POTHOLE_REMARK_LENGTH = 500;

export const DEFAULT_POTHOLE_FILTERS: PotholeFilters = {
  search: "",
  purok: "all",
  status: "all",
  dateFrom: "",
  dateTo: "",
};

export const DEFAULT_POTHOLE_SORT: PotholeSortState = {
  key: "reportedAt",
  direction: "desc",
};

/* -------------------------------------------------------------------------- */
/*  API mapping                                                               */
/* -------------------------------------------------------------------------- */

const ROLE_LABELS: Record<string, string> = {
  resident: "Resident",
  staff: "Staff",
  admin: "Administrator",
  super_admin: "Super Admin",
};

export const mapApiPotholeReport = (
  report: ApiAdminPotholeReport,
): PotholeReport => ({
  recordId: report.id,
  id: report.report_number,
  residentName: report.resident_name,
  residentContact: report.resident_contact,
  residentAddress: report.resident_address,
  photo: {
    originalFilename: report.photo.original_filename,
    contentType: report.photo.content_type,
    fileSize: report.photo.file_size,
  },
  purok: report.purok,
  road: report.road_name,
  location: report.location_description,
  latitude: report.latitude,
  longitude: report.longitude,
  gpsAccuracyM: report.gps_accuracy_m,
  locationSource: report.location_source,
  locationCapturedAt: report.location_captured_at
    ? toUtcTimestamp(report.location_captured_at)
    : null,
  reportedAt: toUtcTimestamp(report.reported_at),
  updatedAt: toUtcTimestamp(report.updated_at),
  description: report.notes,
  status: report.status,
});

export const mapApiPotholeDetail = (
  detail: ApiAdminPotholeReportDetail,
): PotholeReportDetail => ({
  ...mapApiPotholeReport(detail),
  history: detail.history.map(
    (entry): PotholeHistoryEntry => ({
      id: entry.id,
      author: entry.changed_by_name ?? "Deleted account",
      authorRole: entry.changed_by_role
        ? (ROLE_LABELS[entry.changed_by_role] ?? entry.changed_by_role)
        : null,
      oldStatus: entry.old_status,
      newStatus: entry.new_status,
      remark: entry.remark,
      createdAt: toUtcTimestamp(entry.created_at),
    }),
  ),
});

export const mapApiPotholeSummary = (
  summary: ApiAdminPotholeSummary,
): PotholeSummary => ({
  stats: {
    total: summary.status_counts.total,
    pending: summary.status_counts.pending,
    verified: summary.status_counts.verified,
    underMaintenance: summary.status_counts.under_maintenance,
    resolved: summary.status_counts.resolved,
    rejected: summary.status_counts.rejected,
  },
  byPurok: summary.by_purok,
  unspecifiedPurok: summary.unspecified_purok,
  withCoordinates: summary.with_coordinates,
});

/* -------------------------------------------------------------------------- */
/*  Filtering, sorting and pagination                                         */
/* -------------------------------------------------------------------------- */

/** The report's calendar day (`yyyy-mm-dd`) in the viewer's time zone. */
const toLocalIsoDate = (timestamp: string): string => {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
};

export const hasActivePotholeFilters = (filters: PotholeFilters): boolean =>
  filters.search.trim() !== "" ||
  filters.purok !== DEFAULT_POTHOLE_FILTERS.purok ||
  filters.status !== DEFAULT_POTHOLE_FILTERS.status ||
  filters.dateFrom !== "" ||
  filters.dateTo !== "";

export const filterPotholeReports = (
  reports: PotholeReport[],
  filters: PotholeFilters,
): PotholeReport[] => {
  const term = filters.search.trim().toLowerCase();

  return reports.filter((report) => {
    if (filters.purok === UNSPECIFIED_PUROK) {
      if (report.purok !== null) {
        return false;
      }
    } else if (filters.purok !== "all" && report.purok !== filters.purok) {
      return false;
    }

    if (filters.status !== "all" && report.status !== filters.status) {
      return false;
    }

    const reportedOn = toLocalIsoDate(report.reportedAt);
    if (filters.dateFrom && reportedOn < filters.dateFrom) {
      return false;
    }
    if (filters.dateTo && reportedOn > filters.dateTo) {
      return false;
    }

    if (!term) {
      return true;
    }

    return [
      report.id,
      report.residentName,
      report.purok,
      report.road,
      report.location,
    ].some((value) => value?.toLowerCase().includes(term));
  });
};

const compareBy = (
  a: PotholeReport,
  b: PotholeReport,
  key: PotholeSortKey,
): number => {
  if (key === "reportedAt") {
    return Date.parse(a.reportedAt) - Date.parse(b.reportedAt);
  }

  if (key === "status") {
    return (
      POTHOLE_STATUSES.indexOf(a.status) - POTHOLE_STATUSES.indexOf(b.status)
    );
  }

  if (key === "gpsAccuracyM") {
    // Reports without a GPS accuracy sort after every measured one.
    return (
      (a.gpsAccuracyM ?? Number.POSITIVE_INFINITY) -
      (b.gpsAccuracyM ?? Number.POSITIVE_INFINITY)
    );
  }

  return (a[key] ?? "").localeCompare(b[key] ?? "", undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

export const sortPotholeReports = (
  reports: PotholeReport[],
  sort: PotholeSortState,
): PotholeReport[] => {
  const direction = sort.direction === "asc" ? 1 : -1;

  return [...reports].sort(
    (a, b) =>
      direction * compareBy(a, b, sort.key) ||
      // Newest first within equal values, so the order never looks random.
      compareBy(b, a, "reportedAt"),
  );
};

/** Page numbers to show, with null marking a gap (e.g. 1 … 4 5 6 … 12). */
export const getPageNumbers = (
  currentPage: number,
  totalPages: number,
): (number | null)[] => {
  const pages: (number | null)[] = [];

  for (let page = 1; page <= totalPages; page += 1) {
    if (
      page === 1 ||
      page === totalPages ||
      Math.abs(page - currentPage) <= 1
    ) {
      pages.push(page);
    } else if (pages[pages.length - 1] !== null) {
      pages.push(null);
    }
  }

  return pages;
};

/* -------------------------------------------------------------------------- */
/*  Actions                                                                   */
/* -------------------------------------------------------------------------- */

export const getAvailablePotholeActions = (
  status: PotholeStatus,
  isAdministratorAccount: boolean,
): PotholeAction[] =>
  AVAILABLE_ACTIONS[status].filter(
    (action) => isAdministratorAccount || STAFF_ACTIONS.includes(action),
  );

/* -------------------------------------------------------------------------- */
/*  Display helpers                                                           */
/* -------------------------------------------------------------------------- */

export const hasPotholeCoordinates = (
  report: PotholeReport,
): report is PotholeReport & { latitude: number; longitude: number } =>
  report.latitude !== null && report.longitude !== null;

export const formatPotholeDate = (timestamp: string): string =>
  new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const formatPotholeDateTime = (timestamp: string): string =>
  new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export const formatPotholeCoordinate = (value: number | null): string =>
  value === null ? "—" : value.toFixed(6);

export const formatPotholeCoordinates = (report: PotholeReport): string =>
  hasPotholeCoordinates(report)
    ? `${report.latitude.toFixed(6)}, ${report.longitude.toFixed(6)}`
    : "Not captured";

/** "±8 m" for GPS reports; manual pins and missing positions have none. */
export const formatPotholeAccuracy = (report: PotholeReport): string => {
  if (report.locationSource === "gps") {
    return report.gpsAccuracyM === null
      ? "Not reported"
      : `±${Math.round(report.gpsAccuracyM)} m`;
  }

  return report.locationSource === "manual" ? "Manual pin" : "—";
};

export const isLowPotholeAccuracy = (report: PotholeReport): boolean =>
  report.locationSource === "gps" &&
  report.gpsAccuracyM !== null &&
  report.gpsAccuracyM > LOW_GPS_ACCURACY_M;

export const getPotholeLocationSourceLabel = (report: PotholeReport): string => {
  if (report.locationSource === "gps") {
    return "Device GPS";
  }

  if (report.locationSource === "manual") {
    return "Pinned manually on the map (not GPS-verified)";
  }

  return "Not captured";
};

export const formatPotholeFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** One line describing a history entry (submission, status change, remark). */
export const describePotholeHistoryEntry = (
  entry: PotholeHistoryEntry,
): string => {
  if (entry.newStatus && entry.oldStatus === null) {
    return "Report submitted.";
  }

  if (entry.newStatus) {
    const change = `Status changed to ${POTHOLE_STATUS_META[entry.newStatus].label}`;
    return entry.remark ? `${change}: ${entry.remark}` : `${change}.`;
  }

  return entry.remark ?? "";
};

export const displayPurok = (purok: string | null): string =>
  purok ?? "Not specified";

export const displayRoad = (road: string | null): string =>
  road ?? "Not specified";
