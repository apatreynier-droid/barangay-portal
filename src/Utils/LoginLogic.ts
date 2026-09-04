import type { FormData, FormErrors } from "../Types/LoginType";

import { ApiError, loginUser } from "./api";

export const validateForm = (formData: FormData): FormErrors => {
  const errors: FormErrors = {};

  if (!formData.email.trim()) {
    errors.email = "Username is required";
  } else if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim()) &&
    !/^[a-zA-Z0-9._-]{3,}$/.test(formData.email.trim())
  ) {
    errors.email = "Enter a valid username or email";
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
        error.field === "password" ? "password" : "email";
      return { field, message: error.message };
    }

    return {
      field: "email",
      message: "Something went wrong. Please try again.",
    };
  }
};
