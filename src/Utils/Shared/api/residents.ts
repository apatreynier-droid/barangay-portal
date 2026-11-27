/** Admin management of resident accounts. */

import type {
  AdminResident,
  AdminResidentAccountStatus,
  AdminResidentDetail,
  AdminResidentUpdatePayload,
} from "../../../Types/Admin/AdminResidentsType";
import { ApiError, authedFetch, parseErrorMessage } from "./client";

export const fetchResidents = async (): Promise<AdminResident[]> => {
  const response = await authedFetch("/api/admin/residents");
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load the residents."),
    );
  }

  return (body as AdminResident[]) ?? [];
};

export const fetchResidentDetail = async (
  residentId: number,
): Promise<AdminResidentDetail> => {
  const response = await authedFetch(`/api/admin/residents/${residentId}`);
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load the resident details."),
    );
  }

  return body as AdminResidentDetail;
};

export const updateResident = async (
  residentId: number,
  payload: AdminResidentUpdatePayload,
): Promise<AdminResidentDetail> => {
  const response = await authedFetch(`/api/admin/residents/${residentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not update the resident."),
    );
  }

  return body as AdminResidentDetail;
};

export const updateResidentStatus = async (
  residentId: number,
  accountStatus: AdminResidentAccountStatus,
): Promise<AdminResidentDetail> => {
  const response = await authedFetch(
    `/api/admin/residents/${residentId}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_status: accountStatus }),
    },
  );
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not update the account status."),
    );
  }

  return body as AdminResidentDetail;
};
