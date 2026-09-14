import type { FormData, FormErrors } from "../Types/ForgotPasswordType";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateForm = (formData: FormData): FormErrors => {
  const errors: FormErrors = {};

  if (!formData.email.trim()) {
    errors.email = "Email address is required";
  } else if (!EMAIL_PATTERN.test(formData.email.trim())) {
    errors.email = "Enter a valid email address";
  }

  return errors;
};

// SMTP/email-based recovery is not part of the backend yet, so this function
// is intentionally a no-op hook point. When the backend adds the password
// reset endpoint (e.g. POST /api/auth/forgot-password), replace the body of
// this function with the API call following the existing pattern in
// Utils/api.ts (see loginUser / registerUser), then surface any ApiError as a
// field error here. For now it resolves successfully so the page can show the
// generic "Check Your Email" confirmation, which deliberately never reveals
// whether an account exists for the submitted address.
export const requestPasswordReset = async (email: string): Promise<void> => {
  void email;
};

export const submitPasswordResetRequest = async (
  formData: FormData,
): Promise<FormErrors | null> => {
  try {
    await requestPasswordReset(formData.email.trim());
    return null;
  } catch {
    return {
      email: "Something went wrong. Please try again.",
    };
  }
};
