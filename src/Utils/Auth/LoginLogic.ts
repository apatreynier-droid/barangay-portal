import type { FormData, FormErrors } from "../../Types/Auth/LoginType";

import { ApiError, loginUser } from "../Shared/api";

export const validateForm = (formData: FormData): FormErrors => {
  const errors: FormErrors = {};

  // Accounts sign in with their email address only (there are no usernames).
  // Rejecting anything else here keeps a guessed username from using up the
  // login attempts that lead to a temporary block.
  if (!formData.email.trim()) {
    errors.email = "Email address is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
    errors.email =
      "Enter the email address you registered with (for example, juan@gmail.com)";
  }

  if (!formData.password) {
    errors.password = "Password is required";
  } else if (formData.password.length < 6) {
    errors.password = "Password must be at least 6 characters";
  }

  return errors;
};

type LoginFailure = {
  field: keyof FormErrors;
  message: string;
};

export const authenticateUser = async (
  formData: FormData,
): Promise<LoginFailure | null> => {
  try {
    await loginUser(formData.email.trim(), formData.password);
    return null;
  } catch (error) {
    if (error instanceof ApiError) {
      const field: keyof FormErrors =
        error.field === "password" || error.field === "account"
          ? error.field
          : "email";
      return { field, message: error.message };
    }

    return {
      field: "email",
      message: "Something went wrong. Please try again.",
    };
  }
};
