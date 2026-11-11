import type { PotholeStatus } from "../../Types/Admin/AdminPotholeManagementType";
import type { ResidentPotholeReport } from "../../Types/Resident/PotholeReportType";

export const STATUS_DISPLAY: Record<
  PotholeStatus,
  { label: string; tone: string }
> = {
  pending: { label: "Under review", tone: "is-review" },
  verified: { label: "Verified", tone: "is-verified" },
  under_maintenance: { label: "Being repaired", tone: "is-maintenance" },
  resolved: { label: "Repaired", tone: "is-repaired" },
  rejected: { label: "Not accepted", tone: "is-rejected" },
};

/** MySQL timestamps arrive in UTC without a zone marker. */
const parseUtcTimestamp = (timestamp: string): Date =>
  new Date(
    /[zZ]|[+-]\d{2}:?\d{2}$/.test(timestamp) ? timestamp : `${timestamp}Z`,
  );

export const formatReportDate = (timestamp: string): string =>
  parseUtcTimestamp(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const formatReportDateTime = (timestamp: string): string =>
  parseUtcTimestamp(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export const describeReportLocation = (
  report: ResidentPotholeReport,
): string => {
  if (report.location_source === "gps") {
    return report.gps_accuracy_m === null
      ? "GPS location"
      : `GPS location (±${Math.round(report.gps_accuracy_m)} m)`;
  }
  if (report.location_source === "photo") {
    return "Location from the photo's GPS data";
  }
  return report.location_source === "manual"
    ? "Pinned on the map"
    : "No map location";
};

/** One line for the "My reports" list. */
export const describeReportDetection = (
  report: ResidentPotholeReport,
): string => {
  if (report.detection_status !== "completed") {
    return "AI check not completed";
  }
  if (report.detection_count === 0) {
    return "AI found no potholes";
  }
  return report.detection_count === 1
    ? "AI found 1 possible pothole"
    : `AI found ${report.detection_count} possible potholes`;
};
