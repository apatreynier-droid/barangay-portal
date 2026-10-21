import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { FormData, FormErrors } from "../../Types/ResetPasswordType";
import {
  readResetToken,
  submitNewPassword,
  validateForm,
} from "../../Utils/ResetPasswordLogic";
import logo from "../../assets/logo-256.png";
import showIcon from "../../assets/show.png";
import hideIcon from "../../assets/hide.png";
import "../../Styles/Shared/Pages/ResetPasswordPage.css";

type ResetPasswordPageProps = {
  onBackToLogin: () => void;
  onRequestNewLink: () => void;
};

const BrandBadge = () => (
  <div className="reset-brand-badge" aria-hidden="true">
    <img src={logo} alt="" className="reset-brand-badge-img" />
  </div>
);

/** Generic padlock icon — intentionally not tied to any mail provider. */
const LockIcon = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#16a34a"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);

const WarningIcon = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#b23a48"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12 3.5 21 19.5H3L12 3.5Z" />
    <path d="M12 9.5v4.5" />
    <path d="M12 17h.01" />
  </svg>
);

const BrandHeader = () => (
  <header className="reset-brand">
    <BrandBadge />
    <p className="reset-brand-republic">Republic of the Philippines</p>
    <h1 className="reset-brand-title">Barangay Lagab Document Portal</h1>
    <p className="reset-brand-subtitle">
      Document Request &amp; Management System
    </p>
  </header>
);

const ResetPasswordPage = ({
  onBackToLogin,
  onRequestNewLink,
}: ResetPasswordPageProps) => {
  const [token] = useState(() => readResetToken(window.location.search));
  const [formData, setFormData] = useState<FormData>({
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const field = event.target.name as keyof FormData;
    const value = event.target.value;

    setFormData((previous) => ({ ...previous, [field]: value }));

    if (submitError) {
      setSubmitError("");
    }

    if (errors[field]) {
      setErrors((previous) => ({ ...previous, [field]: "" }));
    }
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();

    if (!token) {
      return;
    }

    const validationErrors = validateForm(formData);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setSubmitError("");
    setIsLoading(true);

    try {
      const failure = await submitNewPassword(token, formData);

      if (failure) {
        setSubmitError(failure);
        return;
      }

      setIsSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="reset-page">
        <BrandHeader />

        <section className="reset-card reset-card--center">
          <div className="reset-status-icon reset-status-icon--warning">
            <WarningIcon />
          </div>

          <h2 className="reset-card-title reset-card-title--center">
            Reset Link Not Usable
          </h2>

          <p className="reset-success-message">
            This page needs the secure link from your password reset email.
            Open that link again, or request a new one below.
          </p>

          <button
            type="button"
            className="reset-submit-button"
            onClick={onRequestNewLink}
          >
            Request a New Link
          </button>

          <button
            type="button"
            className="reset-secondary-button"
            onClick={onBackToLogin}
          >
            Back to Sign In
          </button>
        </section>

        <footer className="reset-footer">
          © 2026 Barangay Document Portal. All rights reserved.
        </footer>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="reset-page">
        <BrandHeader />

        <section className="reset-card reset-card--center">
          <div className="reset-status-icon">
            <LockIcon />
          </div>

          <h2 className="reset-card-title reset-card-title--center">
            Password Updated
          </h2>

          <p className="reset-success-message">
            Your password has been changed. You can now sign in with your new
            password. For your security, any device that was still signed in
            has been signed out.
          </p>

          <button
            type="button"
            className="reset-submit-button"
            onClick={onBackToLogin}
          >
            Sign In
          </button>
        </section>

        <footer className="reset-footer">
          © 2026 Barangay Document Portal. All rights reserved.
        </footer>
      </div>
    );
  }

  return (
    <div className="reset-page">
      <BrandHeader />

      <section className="reset-card">
        <h2 className="reset-card-title">Choose a New Password</h2>
        <p className="reset-card-description">
          Enter a new password for your Barangay document portal account.
        </p>

        {submitError && (
          <div className="reset-alert" role="alert">
            <p className="reset-alert-text">{submitError}</p>
            <button
              type="button"
              className="reset-alert-link"
              onClick={onRequestNewLink}
            >
              Request a new reset link
            </button>
          </div>
        )}

        <form className="reset-form" onSubmit={handleSubmit} noValidate>
          <div className="reset-form-group">
            <label htmlFor="password" className="reset-field-label">
              New Password
            </label>

            <div className="reset-input-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your new password"
                className={`reset-form-input ${errors.password ? "input-error" : ""}`}
                autoComplete="new-password"
                disabled={isLoading}
              />

              <button
                type="button"
                className="reset-password-toggle"
                onClick={() => setShowPassword((previous) => !previous)}
                disabled={isLoading}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <img src={showPassword ? hideIcon : showIcon} alt="" />
              </button>
            </div>

            {errors.password && (
              <span className="reset-error-message">{errors.password}</span>
            )}
          </div>

          <div className="reset-form-group">
            <label htmlFor="confirmPassword" className="reset-field-label">
              Confirm New Password
            </label>

            <div className="reset-input-wrapper">
              <input
                type={showConfirmPassword ? "text" : "password"}
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Re-enter your new password"
                className={`reset-form-input ${errors.confirmPassword ? "input-error" : ""}`}
                autoComplete="new-password"
                disabled={isLoading}
              />

              <button
                type="button"
                className="reset-password-toggle"
                onClick={() => setShowConfirmPassword((previous) => !previous)}
                disabled={isLoading}
                aria-label={
                  showConfirmPassword ? "Hide password" : "Show password"
                }
              >
                <img
                  src={showConfirmPassword ? hideIcon : showIcon}
                  alt=""
                />
              </button>
            </div>

            {errors.confirmPassword && (
              <span className="reset-error-message">
                {errors.confirmPassword}
              </span>
            )}
          </div>

          <button
            type="submit"
            className="reset-submit-button"
            disabled={isLoading}
          >
            {isLoading ? "Updating..." : "Update Password"}
          </button>
        </form>

        <button
          type="button"
          className="reset-back-link"
          onClick={onBackToLogin}
        >
          ← Back to Sign In
        </button>
      </section>

      <footer className="reset-footer">
        © 2026 Barangay Document Portal. All rights reserved.
      </footer>
    </div>
  );
};

export default ResetPasswordPage;
