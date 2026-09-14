import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { FormData, FormErrors } from "../../Types/ForgotPasswordType";
import {
  submitPasswordResetRequest,
  validateForm,
} from "../../Utils/ForgotPasswordLogic";
import emailIcon from "../../assets/icons/email.png";
import logo from "../../assets/logo-256.png";
import "./ForgotPasswordPage.css";

type ForgotPasswordPageProps = {
  onBackToLogin: () => void;
};

const BrandBadge = () => (
  <div className="forgot-brand-badge" aria-hidden="true">
    <img src={logo} alt="" className="forgot-brand-badge-img" />
  </div>
);

const MailIcon = () => (
  <img
    src={emailIcon}
    alt=""
    width="28"
    height="28"
    aria-hidden="true"
    style={{ display: "block" }}
  />
);

const ForgotPasswordPage = ({ onBackToLogin }: ForgotPasswordPageProps) => {
  const [formData, setFormData] = useState<FormData>({ email: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setFormData((prev) => ({ ...prev, email: e.target.value }));

    if (errors.email) {
      setErrors((prev) => ({ ...prev, email: "" }));
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    const validationErrors = validateForm(formData);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      const submitFailure = await submitPasswordResetRequest(formData);

      if (submitFailure) {
        setErrors(submitFailure);
        return;
      }

      setSubmittedEmail(formData.email.trim());
      setIsSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTryDifferentEmail = (): void => {
    setFormData({ email: "" });
    setErrors({});
    setIsSubmitted(false);
  };

  return (
    <div className="forgot-page">
      <header className="forgot-brand">
        <BrandBadge />
        <p className="forgot-brand-republic">Republic of the Philippines</p>
        <h1 className="forgot-brand-title">Barangay Lagab Document Portal</h1>
        <p className="forgot-brand-subtitle">
          Document Request &amp; Management System
        </p>
      </header>

      {isSubmitted ? (
        <section className="forgot-card forgot-card--success">
          <div className="forgot-success-icon" aria-hidden="true">
            <MailIcon />
          </div>

          <h2 className="forgot-card-title forgot-card-title--center">
            Check Your Email
          </h2>

          <p className="forgot-success-message">
            If an account exists for <strong>{submittedEmail}</strong>,
            we&apos;ve sent a password reset link. Please check your inbox and
            spam folder.
          </p>

          <div className="forgot-expect-box">
            <p className="forgot-expect-title">What to expect:</p>
            <ul className="forgot-expect-list">
              <li>
                The link expires in <strong>15 minutes</strong>
              </li>
              <li>It can only be used once</li>
              <li>Check your spam or junk folder</li>
            </ul>
          </div>

          <button
            type="button"
            className="forgot-submit-button"
            onClick={handleTryDifferentEmail}
          >
            Try a Different Email
          </button>

          <button
            type="button"
            className="forgot-back-link forgot-back-link--center"
            onClick={onBackToLogin}
          >
            ← Back to Sign In
          </button>
        </section>
      ) : (
        <section className="forgot-card">
          <button
            type="button"
            className="forgot-back-link"
            onClick={onBackToLogin}
          >
            ← Back to Sign In
          </button>

          <h2 className="forgot-card-title">Forgot Password?</h2>
          <p className="forgot-card-description">
            Enter your registered email address and we&apos;ll send you a secure
            reset link.
          </p>

          <form className="forgot-form" onSubmit={handleSubmit} noValidate>
            <div className="forgot-form-group">
              <label htmlFor="email" className="forgot-field-label">
                Email Address
              </label>

              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className={`forgot-form-input ${errors.email ? "input-error" : ""}`}
                autoComplete="email"
                disabled={isLoading}
              />

              {errors.email && (
                <span className="forgot-error-message">{errors.email}</span>
              )}
            </div>

            <button
              type="submit"
              className="forgot-submit-button"
              disabled={isLoading}
            >
              {isLoading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        </section>
      )}

      <footer className="forgot-footer">
        © 2026 Barangay Document Portal. All rights reserved.
      </footer>
    </div>
  );
};

export default ForgotPasswordPage;
