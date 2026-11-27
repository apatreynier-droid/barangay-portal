/** Admin management of staff accounts. */

import type {
  AdminStaffAccount,
  AdminStaffAccountStatus,
  AdminStaffCreatePayload,
  AdminStaffUpdatePayload,
} from "../../../Types/Admin/AdminUserManagementType";
import { ApiError, authedFetch, parseErrorMessage } from "./client";

export const fetchStaffAccounts = async (): Promise<AdminStaffAccount[]> => {
  const response = await authedFetch("/api/admin/staff");
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load the staff accounts."),
    );
  }

  return (body as AdminStaffAccount[]) ?? [];
};

export const createStaffAccount = async (
  payload: AdminStaffCreatePayload,
): Promise<AdminStaffAccount> => {
  const response = await authedFetch("/api/admin/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not create the staff account."),
      "email",
    );
  }

  return body as AdminStaffAccount;
};

export const updateStaffAccount = async (
  staffId: number,
  payload: AdminStaffUpdatePayload,
): Promise<AdminStaffAccount> => {
  const response = await authedFetch(`/api/admin/staff/${staffId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not update the staff account."),
      "email",
    );
  }

  return body as AdminStaffAccount;
};

export const updateStaffAccountStatus = async (
  staffId: number,
  accountStatus: AdminStaffAccountStatus,
): Promise<AdminStaffAccount> => {
  const response = await authedFetch(`/api/admin/staff/${staffId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_status: accountStatus }),
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not update the account status."),
    );
  }

  return body as AdminStaffAccount;
};

/**
 * Emails a password-reset link to the account owner and returns the
 * confirmation message. The administrator never sees or sets the password.
 */
export const resetStaffPassword = async (staffId: number): Promise<string> => {
  const response = await authedFetch(
    `/api/admin/staff/${staffId}/reset-password`,
    { method: "POST" },
  );
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not send the password reset link."),
    );
  }

  return (body as { message?: string } | null)?.message ?? "";
};
