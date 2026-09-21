import type { FormData, FormErrors } from "../Types/ResetPasswordType";
import { ApiError, confirmPasswordReset } from "./api";

/** Matches the backend rule in app/schemas.py (ResetPasswordInput). */
export const MIN_PASSWORD_LENGTH = 6;

export const validateForm = (formData: FormData): FormErrors => {
  const errors: FormErrors = {};

  if (!formData.password) {
    errors.password = "Password is required";
  } else if (formData.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  if (!formData.confirmPassword) {
    errors.confirmPassword = "Please confirm your new password";
  } else if (formData.password !== formData.confirmPassword) {
    errors.confirmPassword = "Passwords do not match";
  }

  return errors;
};

/** Reads the token from the reset link (?token=...), or "" when missing. */
export const readResetToken = (search: string): string =>
  new URLSearchParams(search).get("token")?.trim() ?? "";

/**
 * Sends the new password to the backend, which validates the reset token
 * (unknown, expired and already-used links are all rejected there).
 * Returns a user-friendly message, or null when the password was updated.
 */
export const submitNewPassword = async (
  token: string,
  formData: FormData,
): Promise<string | null> => {
  try {
    await confirmPasswordReset(token, formData.password);
    return null;
  } catch (error) {
    return error instanceof ApiError
      ? error.message
      : "Something went wrong. Please try again.";
  }
};
