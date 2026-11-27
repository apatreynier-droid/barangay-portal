/** Pothole reports (backend/app/potholes/). */

import type {
  ApiAdminPotholeReport,
  ApiAdminPotholeReportDetail,
  ApiAdminPotholeSummary,
  PotholePhotoKind,
  PotholeStatus,
} from "../../../Types/Admin/AdminPotholeManagementType";
import { ApiError, authedFetch, parseErrorMessage, readJson } from "./client";
import type {
  NewPotholeReport,
  ResidentPotholeReport,
} from "../../../Types/Resident/PotholeReportType";

/**
 * Sends a resident's pothole report (multipart): photo, typed location and,
 * when captured, coordinates with their source (GPS or manual pin).
 */
export const submitPotholeReport = async (
  report: NewPotholeReport,
): Promise<ResidentPotholeReport> => {
  const formData = new FormData();
  formData.append("photo", report.photo, report.photo.name);
  formData.append("location_description", report.location);
  if (report.purok) formData.append("purok", report.purok);
  if (report.road) formData.append("road_name", report.road);
  if (report.notes) formData.append("notes", report.notes);

  const { position } = report;
  if (position) {
    formData.append("latitude", String(position.latitude));
    formData.append("longitude", String(position.longitude));
    formData.append("location_source", position.source);

    if (position.source === "gps") {
      if (position.accuracy !== null) {
        formData.append("gps_accuracy_m", String(position.accuracy));
      }
      formData.append("location_captured_at", position.capturedAt);
    }
  }

  // No Content-Type header: the browser sets the multipart boundary itself.
  const response = await authedFetch("/api/pothole-reports", {
    method: "POST",
    body: formData,
  });
  return readJson(response, "Could not send your report.");
};

/** The signed-in resident's own pothole reports. */
export const fetchMyPotholeReports = async (): Promise<
  ResidentPotholeReport[]
> => {
  const response = await authedFetch("/api/pothole-reports");
  return readJson(response, "Could not load your reports.");
};

export const fetchAdminPotholeReports = async (): Promise<
  ApiAdminPotholeReport[]
> => {
  const response = await authedFetch("/api/admin/pothole-reports");
  return readJson(response, "Could not load the pothole reports.");
};

export const fetchAdminPotholeSummary =
  async (): Promise<ApiAdminPotholeSummary> => {
    const response = await authedFetch("/api/admin/pothole-reports/summary");
    return readJson(response, "Could not load the pothole statistics.");
  };

export const fetchAdminPotholeReport = async (
  recordId: number,
): Promise<ApiAdminPotholeReportDetail> => {
  const response = await authedFetch(`/api/admin/pothole-reports/${recordId}`);
  return readJson(response, "Could not load the pothole report.");
};

const POTHOLE_PHOTO_PATHS: Record<PotholePhotoKind, string> = {
  original: "photo",
  annotated: "annotated-photo",
};

const readPhotoBlob = async (path: string): Promise<Blob> => {
  const response = await authedFetch(path);

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load the photo."),
    );
  }

  return response.blob();
};

/**
 * Downloads a report's photo as a Blob (authenticated endpoint only). Callers
 * display it via an object URL and revoke it when done.
 */
export const fetchAdminPotholePhoto = (
  recordId: number,
  kind: PotholePhotoKind = "original",
): Promise<Blob> =>
  readPhotoBlob(
    `/api/admin/pothole-reports/${recordId}/${POTHOLE_PHOTO_PATHS[kind]}`,
  );

/** A resident's own report photo; other residents' reports are refused. */
export const fetchMyPotholePhoto = (
  recordId: number,
  kind: PotholePhotoKind = "original",
): Promise<Blob> =>
  readPhotoBlob(`/api/pothole-reports/${recordId}/${POTHOLE_PHOTO_PATHS[kind]}`);

export const updateAdminPotholeStatus = async (
  recordId: number,
  status: Exclude<PotholeStatus, "pending">,
  remark: string,
  verifiedDefectCount?: number,
): Promise<ApiAdminPotholeReportDetail> => {
  const response = await authedFetch(
    `/api/admin/pothole-reports/${recordId}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        remark: remark || null,
        verified_defect_count: verifiedDefectCount ?? null,
      }),
    },
  );
  return readJson(response, "Could not update the report status.");
};

/** Links a report to the earlier report of the same defect (null: unlinks). */
export const setAdminPotholeDuplicate = async (
  recordId: number,
  duplicateOfRecordId: number | null,
): Promise<ApiAdminPotholeReportDetail> => {
  const response = await authedFetch(
    `/api/admin/pothole-reports/${recordId}/duplicate`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duplicate_of_report_id: duplicateOfRecordId }),
    },
  );
  return readJson(response, "Could not update the duplicate link.");
};

/** Runs the model again on a report whose detection did not complete. */
export const retryAdminPotholeDetection = async (
  recordId: number,
): Promise<ApiAdminPotholeReportDetail> => {
  const response = await authedFetch(
    `/api/admin/pothole-reports/${recordId}/detection`,
    { method: "POST" },
  );
  return readJson(response, "Could not run the detection.");
};

export const addAdminPotholeRemark = async (
  recordId: number,
  remark: string,
): Promise<ApiAdminPotholeReportDetail> => {
  const response = await authedFetch(
    `/api/admin/pothole-reports/${recordId}/remarks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remark }),
    },
  );
  return readJson(response, "Could not save the remark.");
};
