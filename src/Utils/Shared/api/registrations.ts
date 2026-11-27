/** Admin review of resident registrations. */

import type {
  AdminRegistration,
  AdminRegistrationActionResult,
} from "../../../Types/Admin/AdminRegistrationsType";
import { ApiError, authedFetch, parseErrorMessage } from "./client";

export const fetchRegistrations = async (): Promise<AdminRegistration[]> => {
  const response = await authedFetch("/api/admin/registrations");
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load the registrations."),
    );
  }

  return body as AdminRegistration[];
};

const postRegistrationAction = async (
  path: string,
  fallback: string,
  payload?: { reason: string },
): Promise<AdminRegistrationActionResult> => {
  const response = await authedFetch(path, {
    method: "POST",
    ...(payload && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, parseErrorMessage(body, fallback));
  }

  return body as AdminRegistrationActionResult;
};

export const approveRegistration = (
  residentId: number,
): Promise<AdminRegistrationActionResult> =>
  postRegistrationAction(
    `/api/admin/registrations/${residentId}/approve`,
    "Could not approve the registration.",
  );

export const rejectRegistration = (
  residentId: number,
  reason: string,
): Promise<AdminRegistrationActionResult> =>
  postRegistrationAction(
    `/api/admin/registrations/${residentId}/reject`,
    "Could not reject the registration.",
    { reason },
  );

export const retryRegistrationEmail = (
  residentId: number,
): Promise<AdminRegistrationActionResult> =>
  postRegistrationAction(
    `/api/admin/registrations/${residentId}/email/retry`,
    "Could not retry the email.",
  );
