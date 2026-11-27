/** Admin dashboard, reports and activity logs. */

import type { AdminActivityLog } from "../../../Types/Admin/AdminLogsType";
import type {
  AdminDashboardData,
} from "../../../Types/Admin/AdminDashboardType";
import type {
  AdminReportsData,
  AdminReportsQuery,
} from "../../../Types/Admin/AdminReportsType";
import { ApiError, authedFetch, parseErrorMessage } from "./client";

export const fetchAdminDashboard = async (): Promise<AdminDashboardData> => {
  const response = await authedFetch("/api/admin/dashboard");
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load the admin dashboard."),
    );
  }

  return body as AdminDashboardData;
};

/**
 * Administrator reports, computed by the backend's Pandas analytics service
 * for the given Manila-time date range ("" dates = all time / today).
 */
export const fetchAdminReports = async (
  query?: AdminReportsQuery,
): Promise<AdminReportsData> => {
  const params = new URLSearchParams();
  if (query?.dateFrom) {
    params.set("date_from", query.dateFrom);
  }
  if (query?.dateTo) {
    params.set("date_to", query.dateTo);
  }
  if (query?.granularity) {
    params.set("granularity", query.granularity);
  }
  const search = params.toString();
  const response = await authedFetch(
    `/api/admin/reports${search ? `?${search}` : ""}`,
  );
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load the reports data."),
    );
  }

  return body as AdminReportsData;
};

export const fetchActivityLogs = async (): Promise<AdminActivityLog[]> => {
  const response = await authedFetch("/api/admin/activity-logs");
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load the activity logs."),
    );
  }

  return (body as AdminActivityLog[]) ?? [];
};
