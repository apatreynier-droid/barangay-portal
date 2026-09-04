import type {
  CreateAccountFormData,
  CreateAccountErrors,
} from "../Types/CreateAccountType";

import { ApiError, registerUser } from "./api";

const PHONE_PATTERN = /^[0-9+\-\s]{10,15}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateStep = (
  step: number,
  formData: CreateAccountFormData,
): CreateAccountErrors => {
  const errors: CreateAccountErrors = {};

  if (step === 1) {
    if (!formData.lastName.trim()) {
      errors.lastName = "Last name is required";
    }

    if (!formData.firstName.trim()) {
      errors.firstName = "First name is required";
    }

    if (!formData.dateOfBirth) {
      errors.dateOfBirth = "Date of birth is required";
    }

    if (!formData.placeOfBirth.trim()) {
      errors.placeOfBirth = "Place of birth is required";
    }

    if (!formData.sex) {
      errors.sex = "Please select a sex";
    }

    if (!formData.civilStatus) {
      errors.civilStatus = "Please select a civil status";
    }
  }

  if (step === 2) {
    if (!formData.houseNo.trim()) {
      errors.houseNo = "House / unit no. is required";
    }

    if (!formData.street.trim()) {
      errors.street = "Street is required";
    }

    if (!formData.purok) {
      errors.purok = "Please select a purok / zone";
    }

    if (!formData.yearsOfResidency.trim()) {
      errors.yearsOfResidency = "Years of residency is required";
    } else if (!/^\d{1,3}$/.test(formData.yearsOfResidency.trim())) {
      errors.yearsOfResidency = "Enter a valid number of years";
    }

    if (!formData.contactNumber.trim()) {
      errors.contactNumber = "Contact number is required";
    } else if (!PHONE_PATTERN.test(formData.contactNumber.trim())) {
      errors.contactNumber = "Enter a valid contact number";
    }

    if (!formData.email.trim()) {
      errors.email = "Email address is required";
    } else if (!EMAIL_PATTERN.test(formData.email.trim())) {
      errors.email = "Please enter a valid email";
    }
  }

  if (step === 3) {
    if (!formData.emergencyName.trim()) {
      errors.emergencyName = "Emergency contact name is required";
    }

    if (!formData.emergencyRelationship) {
      errors.emergencyRelationship = "Please select a relationship";
    }

    if (!formData.emergencyContactNumber.trim()) {
      errors.emergencyContactNumber = "Contact number is required";
    } else if (!PHONE_PATTERN.test(formData.emergencyContactNumber.trim())) {
      errors.emergencyContactNumber = "Enter a valid contact number";
    }

    if (!formData.password) {
      errors.password = "Password is required";
    } else if (formData.password.length < 6) {
      errors.password = "Password must be at least 6 characters";
    }

    if (!formData.confirmPassword) {
      errors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    if (!formData.agreeToTerms) {
      errors.agreeToTerms = "You must agree before submitting your registration";
    }
  }

  return errors;
};

const composeAddress = (formData: CreateAccountFormData): string => {
  const segments = [
    `${formData.houseNo.trim()} ${formData.street.trim()}`.trim(),
    formData.purok,
    "Barangay San Jose, Caloocan City",
  ];

  return segments.filter(Boolean).join(", ").slice(0, 255);
};

const optional = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const optionalYear = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const submitRegistration = async (
  formData: CreateAccountFormData,
): Promise<void> => {
  await registerUser({
    first_name: formData.firstName.trim(),
    middle_name: optional(formData.middleName),
    last_name: formData.lastName.trim(),
    suffix: optional(formData.suffix),
    email: formData.email.trim(),
    password: formData.password,
    phone: formData.contactNumber.trim(),
    address: composeAddress(formData),
    date_of_birth: formData.dateOfBirth || null,
    place_of_birth: optional(formData.placeOfBirth),
    sex: optional(formData.sex),
    civil_status: optional(formData.civilStatus),
    nationality: optional(formData.nationality),
    religion: optional(formData.religion),
    voter_status: optional(formData.voterStatus),
    house_no: optional(formData.houseNo),
    street: optional(formData.street),
    purok: optional(formData.purok),
    years_of_residency: optionalYear(formData.yearsOfResidency),
    occupation: optional(formData.occupation),
    employer: optional(formData.employer),
    emergency_contact_name: optional(formData.emergencyName),
    emergency_contact_relationship: optional(
      formData.emergencyRelationship,
    ),
    emergency_contact_number: optional(formData.emergencyContactNumber),
    emergency_contact_address: optional(formData.emergencyAddress),
  });
};

export const generateReferenceNumber = (): string =>
  `BRY-${Math.floor(100000 + Math.random() * 900000)}`;

export const getCreateAccountError = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
};

export const getCreateAccountErrorField = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.field;
  }

  return "";
};
