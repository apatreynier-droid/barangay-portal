/** Resident document requests and dashboard summary. */

import { ApiError, authedFetch, parseErrorMessage } from "./client";
import type {
  Request,
  RequestStatus,
} from "../../../Types/Resident/DashboardType";
import { withPickupTime } from "../pickupTime";

export type ApiRequest = {
  id: number;
  request_number: string;
  document_type_id: number;
  document: string;
  purpose: string;
  status: string;
  submitted_at: string;
  last_updated: string;
  pickup_date: string | null;
  pickup_time: string | null;
};

export type DocumentTypeOption = {
  id: number;
  document_name: string;
  description: string | null;
};

export type DashboardSummary = {
  total_requests: number;
  pending: number;
  processing: number;
  ready_for_pickup: number;
};

export type RequestStatusHistoryEntry = {
  old_status: string | null;
  new_status: string;
  remarks: string | null;
  changed_at: string;
};

export type RequestDetail = {
  id: number;
  request_number: string;
  document: string;
  purpose: string;
  status: string;
  admin_remarks: string | null;
  submitted_at: string;
  last_updated: string;
  pickup_date: string | null;
  pickup_time: string | null;
  /** The requesting resident's full name from their profile. */
  resident_name: string | null;
  /** Where to collect the document; only while Ready for Pickup. */
  pickup_location: string | null;
  /** What to bring / how to claim; empty unless Ready for Pickup. */
  pickup_instructions: string[];
  history: RequestStatusHistoryEntry[];
};

export const fetchDashboardSummary = async (): Promise<DashboardSummary> => {
  const response = await authedFetch("/api/dashboard-summary");
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load your dashboard summary."),
    );
  }

  return body as DashboardSummary;
};

export const fetchRequests = async (): Promise<ApiRequest[]> => {
  const response = await authedFetch("/api/requests");
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load your requests."),
    );
  }

  return (body as ApiRequest[]) ?? [];
};

export const fetchRequestDetail = async (
  requestId: number,
): Promise<RequestDetail> => {
  const response = await authedFetch(`/api/requests/${requestId}`);
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load the request details."),
    );
  }

  return body as RequestDetail;
};

export const createDocumentRequest = async (
  documentTypeId: number,
  purpose: string,
): Promise<ApiRequest> => {
  const response = await authedFetch("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_type_id: documentTypeId, purpose }),
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not submit your request."),
    );
  }

  return body as ApiRequest;
};

/**
 * Submits a document request with its required image (multipart). The backend
 * stores both atomically, so a failed upload never leaves a request behind.
 */
export const createDocumentRequestWithAttachment = async (
  documentTypeId: number,
  purpose: string,
  attachment: File,
): Promise<ApiRequest> => {
  const formData = new FormData();
  formData.append("document_type_id", String(documentTypeId));
  formData.append("purpose", purpose);
  formData.append("attachment", attachment, attachment.name);

  // No Content-Type header: the browser sets the multipart boundary itself.
  const response = await authedFetch("/api/requests/with-attachment", {
    method: "POST",
    body: formData,
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not submit your request."),
    );
  }

  return body as ApiRequest;
};

export const updateDocumentRequest = async (
  requestId: number,
  purpose: string,
): Promise<ApiRequest> => {
  const response = await authedFetch(`/api/requests/${requestId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose }),
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not update your request."),
    );
  }

  return body as ApiRequest;
};

export const deleteDocumentRequest = async (
  requestId: number,
): Promise<void> => {
  const response = await authedFetch(`/api/requests/${requestId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);

    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not delete your request."),
    );
  }
};

export const fetchDocumentTypes = async (): Promise<DocumentTypeOption[]> => {
  const response = await authedFetch("/api/document-types");
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load the document types."),
    );
  }

  return (body as DocumentTypeOption[]) ?? [];
};

const formatDateValue = (value: string): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const mapApiRequest = (apiRequest: ApiRequest): Request => ({
  id: apiRequest.request_number,
  numericId: apiRequest.id,
  document: apiRequest.document,
  purpose: apiRequest.purpose,
  status: apiRequest.status as RequestStatus,
  submittedDate: formatDateValue(apiRequest.submitted_at),
  updatedDate: formatDateValue(apiRequest.last_updated),
  pickupDate: apiRequest.pickup_date
    ? withPickupTime(
        formatDateValue(apiRequest.pickup_date),
        apiRequest.pickup_time,
      )
    : undefined,
});
