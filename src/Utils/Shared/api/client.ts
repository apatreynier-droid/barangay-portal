/** Base URL, stored session and the authenticated fetch helpers. */

/** Port the FastAPI backend listens on (uvicorn ... --port 8000). */
const API_PORT = 8000;

/**
 * Base URL of the FastAPI backend.
 *
 * 1. `VITE_API_BASE_URL` (e.g. in `.env.local`) wins when set.
 * 2. Otherwise uses the host that served this page on port 8000, so the
 *    portal also works from other devices on the network (a hardcoded
 *    `127.0.0.1` would point a phone at itself).
 */
const resolveApiBaseUrl = (): string => {
  const configured = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const { protocol, hostname } = window.location;
  // IPv6 literals need brackets in a URL (browsers usually include them).
  const host =
    hostname.includes(":") && !hostname.startsWith("[")
      ? `[${hostname}]`
      : hostname;
  return `${protocol}//${host}:${API_PORT}`;
};

export const API_BASE_URL = resolveApiBaseUrl();

export const TOKEN_STORAGE_KEY = "barangay_portal_access_token";

export const USER_STORAGE_KEY = "barangay_portal_user";

export type AuthUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  purok: string | null;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: AuthUser;
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

export const parseErrorMessage = (payload: unknown, fallback: string): string => {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;

    if (typeof detail === "string") {
      return detail;
    }
  }

  return fallback;
};

export const saveSession = (auth: AuthResponse): void => {
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

export const authedFetch = async (
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

/* -------------------------------------------------------------------------- */
/*  Pothole reports (backend/app/potholes.py)                                 */
/* -------------------------------------------------------------------------- */

export const readJson = async <T>(response: Response, fallback: string): Promise<T> => {
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, parseErrorMessage(body, fallback));
  }

  return body as T;
};
