import type { FormData, FormErrors } from "../../Types/Auth/ForgotPasswordType";
import { ApiError, requestPasswordResetEmail } from "../Shared/api";

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

// Asks the backend to email a single-use reset link. The backend always
// answers with the same generic message, so this page can never reveal
// whether an account exists for the submitted address; only delivery
// problems (rate limit, mail server unavailable) surface as an error here.
export const requestPasswordReset = async (email: string): Promise<void> => {
  await requestPasswordResetEmail(email);
};

export const submitPasswordResetRequest = async (
  formData: FormData,
): Promise<FormErrors | null> => {
  try {
    await requestPasswordReset(formData.email.trim());
    return null;
  } catch (error) {
    return {
      email:
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Please try again.",
    };
  }
};
