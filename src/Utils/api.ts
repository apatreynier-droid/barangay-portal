import type { Request, RequestStatus } from "../Types/DashboardType";
import type { AdminDashboardData } from "../Types/AdminDashboardType";
import type {
  AdminResident,
  AdminResidentAccountStatus,
  AdminResidentDetail,
  AdminResidentUpdatePayload,
} from "../Types/AdminResidentsType";

const API_BASE_URL = "http://127.0.0.1:8000";

export const TOKEN_STORAGE_KEY = "barangay_portal_access_token";
export const USER_STORAGE_KEY = "barangay_portal_user";

export type AuthUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: AuthUser;
};

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
};

export type DocumentTypeOption = {
  id: number;
  document_name: string;
  description: string | null;
};

export type ApiNotification = {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  related_request_id: number | null;
  is_read: boolean;
  created_at: string;
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
  history: RequestStatusHistoryEntry[];
};

export class ApiError extends Error {
  status: number;
  field: string;

  constructor(status: number, message: string, field = "email") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.field = field;
  }
}

export type RegisterPayload = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  phone: string;
  address: string;
  middle_name?: string | null;
  suffix?: string | null;
  date_of_birth?: string | null;
  place_of_birth?: string | null;
  sex?: string | null;
  civil_status?: string | null;
  nationality?: string | null;
  religion?: string | null;
  voter_status?: string | null;
  house_no?: string | null;
  street?: string | null;
  purok?: string | null;
  years_of_residency?: number | null;
  occupation?: string | null;
  employer?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_number?: string | null;
  emergency_contact_address?: string | null;
};

const parseErrorMessage = (payload: unknown, fallback: string): string => {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;

    if (typeof detail === "string") {
      return detail;
    }
  }

  return fallback;
};

const saveSession = (auth: AuthResponse): void => {
  localStorage.setItem(TOKEN_STORAGE_KEY, auth.access_token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(auth.user));
};

export const getSessionUser = (): AuthUser | null => {
  const raw = localStorage.getItem(USER_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
};

export const getSessionToken = (): string | null => {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
};

export const clearSession = (): void => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
};

const handleUnauthorized = (): never => {
  clearSession();
  window.location.reload();
  throw new ApiError(401, "Your session has expired. Please sign in again.");
};

const authedFetch = async (
  path: string,
  options: RequestInit = {},
): Promise<Response> => {
  const token = getSessionToken();

  if (!token) {
    return handleUnauthorized();
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the server. Please make sure the backend is running.",
    );
  }

  if (response.status === 401) {
    return handleUnauthorized();
  }

  return response;
};

export const registerUser = async (
  payload: RegisterPayload,
): Promise<AuthResponse> => {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the server. Please make sure the backend is running.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (response.status === 409) {
    throw new ApiError(
      409,
      parseErrorMessage(body, "An account already exists for this email."),
      "email",
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not create the account."),
    );
  }

  const auth = body as AuthResponse;
  saveSession(auth);
  return auth;
};

export const loginUser = async (
  email: string,
  password: string,
): Promise<AuthResponse> => {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the server. Please make sure the backend is running.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (response.status === 401) {
    throw new ApiError(
      401,
      parseErrorMessage(body, "Incorrect email or password."),
      "password",
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Unable to sign in."),
    );
  }

  const auth = body as AuthResponse;
  saveSession(auth);
  return auth;
};

export const logoutUser = async (): Promise<void> => {
  try {
    await authedFetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Session is cleared locally regardless of the server outcome.
  }
  clearSession();
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

export const deleteDocumentRequest = async (requestId: number): Promise<void> => {
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

export const fetchNotifications = async (): Promise<ApiNotification[]> => {
  const response = await authedFetch("/api/notifications");
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load your notifications."),
    );
  }

  return (body as ApiNotification[]) ?? [];
};

export const markNotificationRead = async (id: number): Promise<void> => {
  const response = await authedFetch(`/api/notifications/${id}/read`, {
    method: "PATCH",
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      "Could not mark the notification as read.",
    );
  }
};

export const markAllNotificationsRead = async (): Promise<void> => {
  const response = await authedFetch("/api/notifications/read-all", {
    method: "POST",
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      "Could not mark your notifications as read.",
    );
  }
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
    ? formatDateValue(apiRequest.pickup_date)
    : undefined,
});
