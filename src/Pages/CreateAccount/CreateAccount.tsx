import { useState } from "react";

import CreateAccountHeader from "../../components/CreateAccount/CreateAccountHeader";
import CreateAccountForm from "../../components/CreateAccount/CreateAccountForm";

import "../../Styles/Shared/Pages/CreateAccount.css";

type CreateAccountProps = {
  onBackToLogin: () => void;
};

const CreateAccount = ({ onBackToLogin }: CreateAccountProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [successReference, setSuccessReference] = useState("");

  if (successReference) {
    return (
      <div className="create-account-page create-account-page--success">
        <div className="registration-success-card">
          <div className="success-check" aria-hidden="true">
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#16a34a"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12.5 9.5 18 19 7" />
            </svg>
          </div>

          <h1 className="success-title">Registration Submitted</h1>

          <p className="success-reference-label">Reference No.</p>
          <p className="success-reference-value">{successReference}</p>

          <p className="success-note">
            Your registration has been received and is pending verification by
            the Barangay Office. Please bring a valid ID for verification.
          </p>

          <button
            type="button"
            className="success-primary-button"
            onClick={() => setSuccessReference("")}
          >
            Register Another Resident
          </button>

          <button
            type="button"
            className="success-secondary-link"
            onClick={onBackToLogin}
          >
            Continue to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="create-account-page">
      <CreateAccountHeader currentStep={currentStep} />

      <main className="registration-main">
        <div className="registration-back-row">
          <button
            type="button"
            className="back-to-login"
            onClick={onBackToLogin}
          >
            ← Back to Login
          </button>
        </div>

        <CreateAccountForm
          onStepChange={setCurrentStep}
          onSuccess={(referenceNumber) => {
            setCurrentStep(1);
            setSuccessReference(referenceNumber);
          }}
        />

        <p className="registration-footer-note">
          Barangay Lagab • For inquiries, visit the Barangay Hall or call (02)
          8-XXX-XXXX
        </p>
      </main>
    </div>
  );
};

export default CreateAccount;
