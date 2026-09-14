import { useState } from "react";
import type { FormEvent, ChangeEvent } from "react";
import type { FormData, FormErrors } from "../../Types/LoginType";
import { validateForm, authenticateUser } from "../../Utils/LoginLogic";
import logo from "../../assets/logo-256.png";
import showIcon from "../../assets/show.png";
import hideIcon from "../../assets/hide.png";
import "./LoginPage.css";

type LoginPageProps = {
  onLoginSuccess: () => void;
  onCreateAccount: () => void;
  onForgotPassword: () => void;
};

const UserIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.8-3.2 4.6-5 8-5s6.2 1.8 8 5" />
  </svg>
);

const LockIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

const RecordsIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
    <circle cx="10" cy="7" r="4" />
    <path d="M21 11h-6M21 8h-6" />
  </svg>
);

const ShieldIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 22s8-3.6 8-10V5l-8-3-8 3v7c0 6.4 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const HouseIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M10 21v-6h4v6" />
  </svg>
);

const CertificateIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="9" r="5" />
    <path d="m8.5 13.5-1.5 8 5-3 5 3-1.5-8" />
  </svg>
);

const DirectoryIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13z" />
    <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    <path d="M9 8h7M9 11.5h7" />
  </svg>
);

const BRAND_FEATURES = [
  { label: "Resident Records", Icon: RecordsIcon },
  { label: "Barangay Clearance", Icon: ShieldIcon },
  { label: "Permit & Residency", Icon: HouseIcon },
  { label: "Certificates", Icon: CertificateIcon },
  { label: "Officials Directory", Icon: DirectoryIcon },
];

const LoginPage = ({
  onLoginSuccess,
  onCreateAccount,
  onForgotPassword,
}: LoginPageProps) => {
  const [formData, setFormData] = useState<FormData>({
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
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
    setSuccessMessage("");

    try {
      const loginFailure = await authenticateUser(formData);

      if (loginFailure) {
        setErrors({ [loginFailure.field]: loginFailure.message });
        return;
      }

      setSuccessMessage("Login successful! Welcome back.");

      setFormData({
        email: "",
        password: "",
      });

      onLoginSuccess();
    } finally {
      setIsLoading(false);
    }
  };

  const togglePasswordVisibility = (): void => {
    setShowPassword((prev) => !prev);
  };

  return (
    <div className="login-container">
      <aside className="brand-panel">
        <div className="brand-inner">
          <header className="brand-header">
            <div className="brand-logo-badge">
              <img src={logo} alt="Barangay logo" />
            </div>

            <div className="brand-header-text">
              <span className="brand-republic">
                Republic of the Philippines
              </span>
              <span className="brand-lgu">Local Government Unit</span>
            </div>
          </header>

          <p className="brand-eyebrow">Barangay Management System</p>

          <h1 className="brand-title">
            Serving the Community,
            <br />
            <span className="brand-title-highlight">One Record at a Time.</span>
          </h1>

          <p className="brand-description">
            A unified platform for barangay officials to manage residents,
            certifications, barangay clearance, permit & recidency, and
            community services efficiently.
          </p>

          <ul className="brand-features">
            {BRAND_FEATURES.map(({ label, Icon }) => (
              <li key={label}>
                <span className="feature-icon" aria-hidden="true">
                  <Icon />
                </span>
                {label}
              </li>
            ))}
          </ul>

          <hr className="brand-divider" />

          <p className="brand-footer">
            Authorized personnel only. All access is logged and monitored in
            accordance with the Data Privacy Act of 2012 (R.A. 10173).
          </p>
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-content">
          <section className="auth-card">
            <h2 className="login-title">Welcome back</h2>
            <p className="login-subtitle">Sign in to your official account</p>

            {successMessage && (
              <div className="success-message" role="status">
                <span className="success-icon">✓</span>
                {successMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="email" className="field-label">
                  Username/Email-address
                </label>

                <div
                  className={`input-wrapper ${errors.email ? "input-error" : ""}`}
                >
                  <span className="input-icon">
                    <UserIcon />
                  </span>

                  <input
                    type="text"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="e.g. brgy.admin"
                    className="form-input"
                    autoComplete="username"
                    disabled={isLoading}
                  />
                </div>

                {errors.email && (
                  <span className="error-message">{errors.email}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="password" className="field-label">
                  Password
                </label>

                <div
                  className={`input-wrapper input-password ${errors.password ? "input-error" : ""}`}
                >
                  <span className="input-icon">
                    <LockIcon />
                  </span>

                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Enter your password"
                    className="form-input"
                    autoComplete="current-password"
                    disabled={isLoading}
                  />

                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="toggle-password"
                    disabled={isLoading}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    <img src={showPassword ? hideIcon : showIcon} alt="" />
                  </button>
                </div>

                {errors.password && (
                  <span className="error-message">{errors.password}</span>
                )}
              </div>

              <div className="form-row">
                <label className="remember-me">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={isLoading}
                  />
                  <span>Remember me</span>
                </label>

                <button
                  type="button"
                  className="forgot-link"
                  onClick={onForgotPassword}
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                className="submit-button"
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          </section>

          <p className="login-register">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              className="help-link"
              onClick={onCreateAccount}
            >
              Register
            </button>
          </p>

          <footer className="login-footer">
            <span className="footer-line" aria-hidden="true"></span>
            <span className="footer-text">© 2026 Barangay System</span>
            <span className="footer-line" aria-hidden="true"></span>
          </footer>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
