/** Admin document requests, request history and attachments. */

import type {
  AdminDocumentRequest,
  AdminDocumentRequestActionPayload,
  AdminDocumentRequestDetail,
} from "../../../Types/Admin/AdminDocumentRequestsType";
import type {
  AdminRequestHistoryEntry,
} from "../../../Types/Admin/AdminRequestHistoryType";
import { ApiError, authedFetch, parseErrorMessage } from "./client";

export const fetchAdminDocumentRequests = async (): Promise<
  AdminDocumentRequest[]
> => {
  const response = await authedFetch("/api/admin/document-requests");
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load the document requests."),
    );
  }

  return (body as AdminDocumentRequest[]) ?? [];
};

export const fetchAdminRequestHistory = async (): Promise<
  AdminRequestHistoryEntry[]
> => {
  const response = await authedFetch("/api/admin/request-history");
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load the request history."),
    );
  }

  return (body as AdminRequestHistoryEntry[]) ?? [];
};

export const fetchAdminDocumentRequestDetail = async (
  requestId: number,
): Promise<AdminDocumentRequestDetail> => {
  const response = await authedFetch(
    `/api/admin/document-requests/${requestId}`,
  );
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load the request details."),
    );
  }

  return body as AdminDocumentRequestDetail;
};

export const updateAdminDocumentRequest = async (
  requestId: number,
  payload: AdminDocumentRequestActionPayload,
): Promise<AdminDocumentRequestDetail> => {
  const response = await authedFetch(
    `/api/admin/document-requests/${requestId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not update the document request."),
    );
  }

  return body as AdminDocumentRequestDetail;
};

/**
 * Downloads a request's image as a Blob (authenticated endpoint only).
 * Callers display it via an object URL and revoke it when done.
 */
export const fetchAdminRequestAttachment = async (
  requestId: number,
): Promise<Blob> => {
  const response = await authedFetch(
    `/api/admin/document-requests/${requestId}/attachment`,
  );

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load the attachment."),
    );
  }

  return response.blob();
};
