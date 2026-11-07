import type {
  PotholeAction,
  PotholeFilters,
  PotholeReport,
  PotholeSortKey,
  PotholeSortState,
  PotholeStats,
  PotholeStatus,
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
/*  Stats                                                                     */
/* -------------------------------------------------------------------------- */

export const getPotholeStats = (reports: PotholeReport[]): PotholeStats => {
  const countOf = (status: PotholeStatus) =>
    reports.filter((report) => report.status === status).length;

  return {
    total: reports.length,
    pending: countOf("pending"),
    verified: countOf("verified"),
    underMaintenance: countOf("under_maintenance"),
    resolved: countOf("resolved"),
    rejected: countOf("rejected"),
  };
};

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
    if (filters.purok !== "all" && report.purok !== filters.purok) {
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
    ].some((value) => value.toLowerCase().includes(term));
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

  return a[key].localeCompare(b[key], undefined, {
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
/*  Report updates (immutable: they return a new list)                        */
/* -------------------------------------------------------------------------- */

export const getAvailablePotholeActions = (
  status: PotholeStatus,
): PotholeAction[] => AVAILABLE_ACTIONS[status];

export const addPotholeRemark = (
  reports: PotholeReport[],
  reportId: string,
  text: string,
  author: string,
): PotholeReport[] =>
  reports.map((report) =>
    report.id === reportId
      ? {
          ...report,
          remarks: [
            ...report.remarks,
            {
              id: `${report.id}-R${report.remarks.length + 1}`,
              author,
              text,
              createdAt: new Date().toISOString(),
            },
          ],
        }
      : report,
  );

/** Moves a report to the action's status, recording the remark if one is given. */
export const applyPotholeAction = (
  reports: PotholeReport[],
  reportId: string,
  action: PotholeAction,
  remark: string,
  author: string,
): PotholeReport[] => {
  const { targetStatus } = POTHOLE_ACTION_META[action];
  const updated = reports.map((report) =>
    report.id === reportId ? { ...report, status: targetStatus } : report,
  );

  return remark
    ? addPotholeRemark(
        updated,
        reportId,
        `${POTHOLE_STATUS_META[targetStatus].label}: ${remark}`,
        author,
      )
    : updated;
};

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

export const formatPotholeCoordinates = (report: PotholeReport): string =>
  hasPotholeCoordinates(report)
    ? `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`
    : "Not provided";
