/** Registration, sign-in, sign-out and password reset. */

import {
  API_BASE_URL,
  ApiError,
  authedFetch,
  clearSession,
  parseErrorMessage,
  saveSession,
} from "./client";
import type { AuthResponse } from "./client";

/** Result of a registration. No session: an Administrator must approve it first. */
export type RegistrationResult = {
  message: string;
  email: string;
  account_status: string;
  reference_number: string;
};

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

export const registerUser = async (
  payload: RegisterPayload,
): Promise<RegistrationResult> => {
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

  return body as RegistrationResult;
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

  // Correct password, but the account is pending, rejected or deactivated.
  if (response.status === 403) {
    throw new ApiError(
      403,
      parseErrorMessage(body, "This account cannot sign in."),
      "account",
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

export const requestPasswordResetEmail = async (
  email: string,
): Promise<void> => {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the server. Please make sure the backend is running.",
      "email",
    );
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);

    // Backend messages are user-friendly, so they are shown as-is.
    throw new ApiError(
      response.status,
      parseErrorMessage(
        body,
        "We could not send the reset link right now. Please try again.",
      ),
      "email",
    );
  }
};

export const confirmPasswordReset = async (
  token: string,
  password: string,
): Promise<void> => {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the server. Please make sure the backend is running.",
    );
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);

    throw new ApiError(
      response.status,
      parseErrorMessage(
        body,
        "We could not reset your password. Please try again.",
      ),
    );
  }
};
