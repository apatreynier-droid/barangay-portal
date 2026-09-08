import { useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";

import type {
  CreateAccountFormData,
  CreateAccountErrors,
} from "../../Types/CreateAccountType";

import {
  validateStep,
  submitRegistration,
  getCreateAccountError,
  getCreateAccountErrorField,
  generateReferenceNumber,
} from "../../Utils/CreateAccountLogic";

import "./CreateAccountForm.css";

const TOTAL_STEPS = 3;

const STEP_META: Record<number, { title: string; subtitle: string }> = {
  1: {
    title: "Personal Information",
    subtitle: "All fields marked with * are required",
  },
  2: {
    title: "Address & Contact Details",
    subtitle: "Provide your current residential address within the barangay",
  },
  3: {
    title: "Emergency Contact",
    subtitle:
      "Who should we reach in case of emergency, plus your account credentials",
  },
};

const SUFFIX_OPTIONS = ["Jr.", "Sr.", "II", "III", "IV"];
const SEX_OPTIONS = ["Male", "Female"];
const CIVIL_STATUS_OPTIONS = [
  "Single",
  "Married",
  "Widowed",
  "Separated",
  "Annulled",
];
const VOTER_STATUS_OPTIONS = ["Registered Voter", "Not Yet Registered"];
const PUROK_OPTIONS = [
  "Purok - 3 Lagab",
  "Purok - 3 Lagab Curvada",
];
const RELATIONSHIP_OPTIONS = [
  "Spouse",
  "Parent",
  "Sibling",
  "Child",
  "Relative",
  "Friend",
  "Guardian",
];

const INITIAL_FORM_DATA: CreateAccountFormData = {
  lastName: "",
  firstName: "",
  middleName: "",
  suffix: "",
  dateOfBirth: "",
  placeOfBirth: "",
  sex: "",
  civilStatus: "",
  nationality: "Filipino",
  religion: "",
  voterStatus: "",
  houseNo: "",
  street: "",
  purok: "",
  yearsOfResidency: "",
  contactNumber: "",
  email: "",
  occupation: "",
  employer: "",
  emergencyName: "",
  emergencyRelationship: "",
  emergencyContactNumber: "",
  emergencyAddress: "",
  password: "",
  confirmPassword: "",
  agreeToTerms: false,
};

type FormFieldProps = {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
};

const FormField = ({
  label,
  htmlFor,
  required = false,
  error,
  children,
}: FormFieldProps) => (
  <div className="form-field">
    <label className="field-label" htmlFor={htmlFor}>
      {label}
      {required && <span className="required-mark"> *</span>}
    </label>

    {children}

    {error && <span className="field-error">{error}</span>}
  </div>
);

const inputClass = (error?: string) =>
  `field-input${error ? " input-error" : ""}`;

interface CreateAccountFormProps {
  onStepChange?: (step: number) => void;
  onSuccess: (referenceNumber: string) => void;
}

const CreateAccountForm = ({
  onStepChange,
  onSuccess,
}: CreateAccountFormProps) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] =
    useState<CreateAccountFormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<CreateAccountErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState("");

  const handleChange = (
    event: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const target = event.target;
    const { name } = target;
    const value =
      target instanceof HTMLInputElement && target.type === "checkbox"
        ? target.checked
        : target.value;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (formError) {
      setFormError("");
    }

    if (errors[name as keyof CreateAccountErrors]) {
      setErrors((previous) => ({
        ...previous,
        [name]: undefined,
      }));
    }
  };

  const handleNext = () => {
    const stepErrors = validateStep(step, formData);

    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }

    setErrors({});
    setStep((previous) => {
      const next = Math.min(previous + 1, TOTAL_STEPS);
      onStepChange?.(next);
      return next;
    });
  };

  const handlePrevious = () => {
    setErrors({});
    setFormError("");
    setStep((previous) => {
      const next = Math.max(previous - 1, 1);
      onStepChange?.(next);
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const stepErrors = validateStep(TOTAL_STEPS, formData);

    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);
    setFormError("");

    try {
      await submitRegistration(formData);

      onSuccess(generateReferenceNumber());
    } catch (error) {
      const message = getCreateAccountError(error);
      const field = getCreateAccountErrorField(error);

      if (field === "email" || field === "phone") {
        setErrors((previous) => ({
          ...previous,
          [field === "phone" ? "contactNumber" : "email"]: message,
        }));
        setStep(2);
        onStepChange?.(2);
      } else {
        setFormError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="registration-form" onSubmit={handleSubmit}>
      {formError && (
        <p className="form-banner-error" role="alert">
          {formError}
        </p>
      )}

      <div className="registration-card">
        <header className="registration-card-header">
          <h2>{STEP_META[step].title}</h2>
          <p>{STEP_META[step].subtitle}</p>
        </header>

        <div className="registration-fields">
          {step === 1 && (
            <>
              <FormField
                label="Last Name"
                htmlFor="lastName"
                required
                error={errors.lastName}
              >
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={handleChange}
                  placeholder="e.g. Reyes"
                  disabled={isLoading}
                  className={inputClass(errors.lastName)}
                />
              </FormField>

              <FormField
                label="First Name"
                htmlFor="firstName"
                required
                error={errors.firstName}
              >
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={handleChange}
                  placeholder="e.g. Maria"
                  disabled={isLoading}
                  className={inputClass(errors.firstName)}
                />
              </FormField>

              <FormField
                label="Middle Name"
                htmlFor="middleName"
                error={errors.middleName}
              >
                <input
                  id="middleName"
                  name="middleName"
                  type="text"
                  value={formData.middleName}
                  onChange={handleChange}
                  placeholder="e.g. Santos"
                  disabled={isLoading}
                  className={inputClass(errors.middleName)}
                />
              </FormField>

              <FormField label="Suffix" htmlFor="suffix" error={errors.suffix}>
                <select
                  id="suffix"
                  name="suffix"
                  value={formData.suffix}
                  onChange={handleChange}
                  disabled={isLoading}
                  className={`${inputClass(errors.suffix)} field-select`}
                >
                  <option value="">— Select —</option>
                  {SUFFIX_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField
                label="Date of Birth"
                htmlFor="dateOfBirth"
                required
                error={errors.dateOfBirth}
              >
                <input
                  id="dateOfBirth"
                  name="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={handleChange}
                  disabled={isLoading}
                  className={inputClass(errors.dateOfBirth)}
                />
              </FormField>

              <FormField
                label="Place of Birth"
                htmlFor="placeOfBirth"
                required
                error={errors.placeOfBirth}
              >
                <input
                  id="placeOfBirth"
                  name="placeOfBirth"
                  type="text"
                  value={formData.placeOfBirth}
                  onChange={handleChange}
                  placeholder="City/Municipality, Province"
                  disabled={isLoading}
                  className={inputClass(errors.placeOfBirth)}
                />
              </FormField>

              <FormField label="Sex" htmlFor="sex" required error={errors.sex}>
                <select
                  id="sex"
                  name="sex"
                  value={formData.sex}
                  onChange={handleChange}
                  disabled={isLoading}
                  className={`${inputClass(errors.sex)} field-select`}
                >
                  <option value="">— Select —</option>
                  {SEX_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField
                label="Civil Status"
                htmlFor="civilStatus"
                required
                error={errors.civilStatus}
              >
                <select
                  id="civilStatus"
                  name="civilStatus"
                  value={formData.civilStatus}
                  onChange={handleChange}
                  disabled={isLoading}
                  className={`${inputClass(errors.civilStatus)} field-select`}
                >
                  <option value="">— Select —</option>
                  {CIVIL_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField
                label="Nationality"
                htmlFor="nationality"
                error={errors.nationality}
              >
                <input
                  id="nationality"
                  name="nationality"
                  type="text"
                  value={formData.nationality}
                  onChange={handleChange}
                  placeholder="e.g. Filipino"
                  disabled={isLoading}
                  className={inputClass(errors.nationality)}
                />
              </FormField>

              <FormField
                label="Religion"
                htmlFor="religion"
                error={errors.religion}
              >
                <input
                  id="religion"
                  name="religion"
                  type="text"
                  value={formData.religion}
                  onChange={handleChange}
                  placeholder="e.g. Roman Catholic"
                  disabled={isLoading}
                  className={inputClass(errors.religion)}
                />
              </FormField>

              <FormField
                label="Voter Status"
                htmlFor="voterStatus"
                error={errors.voterStatus}
              >
                <select
                  id="voterStatus"
                  name="voterStatus"
                  value={formData.voterStatus}
                  onChange={handleChange}
                  disabled={isLoading}
                  className={`${inputClass(errors.voterStatus)} field-select`}
                >
                  <option value="">— Select —</option>
                  {VOTER_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormField>
            </>
          )}

          {step === 2 && (
            <>
              <FormField
                label="House / Unit No."
                htmlFor="houseNo"
                required
                error={errors.houseNo}
              >
                <input
                  id="houseNo"
                  name="houseNo"
                  type="text"
                  value={formData.houseNo}
                  onChange={handleChange}
                  placeholder="e.g. 42-B"
                  disabled={isLoading}
                  className={inputClass(errors.houseNo)}
                />
              </FormField>

              <FormField
                label="Street / Road"
                htmlFor="street"
                required
                error={errors.street}
              >
                <input
                  id="street"
                  name="street"
                  type="text"
                  value={formData.street}
                  onChange={handleChange}
                  placeholder="e.g. Sampaguita Street"
                  disabled={isLoading}
                  className={inputClass(errors.street)}
                />
              </FormField>

              <FormField
                label="Purok / Zone"
                htmlFor="purok"
                required
                error={errors.purok}
              >
                <select
                  id="purok"
                  name="purok"
                  value={formData.purok}
                  onChange={handleChange}
                  disabled={isLoading}
                  className={`${inputClass(errors.purok)} field-select`}
                >
                  <option value="">— Select —</option>
                  {PUROK_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField
                label="Years of Residency"
                htmlFor="yearsOfResidency"
                required
                error={errors.yearsOfResidency}
              >
                <input
                  id="yearsOfResidency"
                  name="yearsOfResidency"
                  type="number"
                  min="0"
                  value={formData.yearsOfResidency}
                  onChange={handleChange}
                  placeholder="e.g. 5"
                  disabled={isLoading}
                  className={inputClass(errors.yearsOfResidency)}
                />
              </FormField>

              <FormField
                label="Contact Number"
                htmlFor="contactNumber"
                required
                error={errors.contactNumber}
              >
                <input
                  id="contactNumber"
                  name="contactNumber"
                  type="tel"
                  value={formData.contactNumber}
                  onChange={handleChange}
                  placeholder="09XX-XXX-XXXX"
                  disabled={isLoading}
                  className={inputClass(errors.contactNumber)}
                />
              </FormField>

              <FormField
                label="Email Address"
                htmlFor="email"
                required
                error={errors.email}
              >
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@email.com"
                  disabled={isLoading}
                  className={inputClass(errors.email)}
                />
              </FormField>

              <FormField
                label="Occupation"
                htmlFor="occupation"
                error={errors.occupation}
              >
                <input
                  id="occupation"
                  name="occupation"
                  type="text"
                  value={formData.occupation}
                  onChange={handleChange}
                  placeholder="e.g. Teacher"
                  disabled={isLoading}
                  className={inputClass(errors.occupation)}
                />
              </FormField>

              <FormField
                label="Employer / Company"
                htmlFor="employer"
                error={errors.employer}
              >
                <input
                  id="employer"
                  name="employer"
                  type="text"
                  value={formData.employer}
                  onChange={handleChange}
                  placeholder="e.g. DepEd"
                  disabled={isLoading}
                  className={inputClass(errors.employer)}
                />
              </FormField>
            </>
          )}
          {step === 3 && (
            <>
              <FormField
                label="Emergency Contact Name"
                htmlFor="emergencyName"
                required
                error={errors.emergencyName}
              >
                <input
                  id="emergencyName"
                  name="emergencyName"
                  type="text"
                  value={formData.emergencyName}
                  onChange={handleChange}
                  placeholder="e.g. Juan Reyes"
                  disabled={isLoading}
                  className={inputClass(errors.emergencyName)}
                />
              </FormField>

              <FormField
                label="Relationship"
                htmlFor="emergencyRelationship"
                required
                error={errors.emergencyRelationship}
              >
                <select
                  id="emergencyRelationship"
                  name="emergencyRelationship"
                  value={formData.emergencyRelationship}
                  onChange={handleChange}
                  disabled={isLoading}
                  className={`${inputClass(errors.emergencyRelationship)} field-select`}
                >
                  <option value="">— Select —</option>
                  {RELATIONSHIP_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField
                label="Contact Number"
                htmlFor="emergencyContactNumber"
                required
                error={errors.emergencyContactNumber}
              >
                <input
                  id="emergencyContactNumber"
                  name="emergencyContactNumber"
                  type="tel"
                  value={formData.emergencyContactNumber}
                  onChange={handleChange}
                  placeholder="09XX-XXX-XXXX"
                  disabled={isLoading}
                  className={inputClass(errors.emergencyContactNumber)}
                />
              </FormField>

              <FormField
                label="Address"
                htmlFor="emergencyAddress"
                error={errors.emergencyAddress}
              >
                <input
                  id="emergencyAddress"
                  name="emergencyAddress"
                  type="text"
                  value={formData.emergencyAddress}
                  onChange={handleChange}
                  placeholder="House/Street, Barangay, City"
                  disabled={isLoading}
                  className={inputClass(errors.emergencyAddress)}
                />
              </FormField>

              <p className="account-section-title">Account Security</p>

              <FormField
                label="Password"
                htmlFor="password"
                required
                error={errors.password}
              >
                <div className="password-wrapper">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="At least 6 characters"
                    disabled={isLoading}
                    className={inputClass(errors.password)}
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((previous) => !previous)}
                    disabled={isLoading}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </FormField>

              <FormField
                label="Confirm Password"
                htmlFor="confirmPassword"
                required
                error={errors.confirmPassword}
              >
                <div className="password-wrapper">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Re-enter your password"
                    disabled={isLoading}
                    className={inputClass(errors.confirmPassword)}
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() =>
                      setShowConfirmPassword((previous) => !previous)
                    }
                    disabled={isLoading}
                  >
                    {showConfirmPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </FormField>

              <div className="terms-field">
                <label className="terms-checkbox">
                  <input
                    type="checkbox"
                    name="agreeToTerms"
                    checked={formData.agreeToTerms}
                    onChange={handleChange}
                    disabled={isLoading}
                  />

                  <span>
                    I certify that the information provided is true and correct,
                    and I agree to the Barangay Portal&apos;s Terms and
                    Conditions and Privacy Policy.
                  </span>
                </label>

                {errors.agreeToTerms && (
                  <span className="field-error">{errors.agreeToTerms}</span>
                )}
              </div>
            </>
          )}
        </div>

        <div className="registration-card-footer">
          <button
            type="button"
            className="wizard-button wizard-button--secondary"
            onClick={handlePrevious}
            disabled={step === 1 || isLoading}
          >
            ← Previous
          </button>

          <div className="wizard-progress" aria-hidden="true">
            {Array.from({ length: TOTAL_STEPS }, (_, index) => index + 1).map(
              (stepNumber) => (
                <span
                  key={stepNumber}
                  className={`progress-dot ${stepNumber === step ? "progress-dot--active" : ""}`}
                ></span>
              ),
            )}
          </div>

          <button
            type={step === TOTAL_STEPS ? "submit" : "button"}
            className="wizard-button wizard-button--primary"
            onClick={step === TOTAL_STEPS ? undefined : handleNext}
            disabled={isLoading}
          >
            {isLoading
              ? "Submitting..."
              : step === TOTAL_STEPS
                ? "Submit Registration"
                : "Next →"}
          </button>
        </div>
      </div>
    </form>
  );
};

export default CreateAccountForm;
