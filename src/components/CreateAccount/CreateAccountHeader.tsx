import logo from "../../assets/logo-256.png";
import "../../Styles/Shared/Components/CreateAccountHeader.css";

const STEPS = ["Personal Info", "Address & Contact", "Emergency Contact"];

type CreateAccountHeaderProps = {
  currentStep: number;
};

const CreateAccountHeader = ({ currentStep }: CreateAccountHeaderProps) => {
  return (
    <header className="registration-header">
      <div className="registration-header-top">
        <div className="registration-logo">
          <img src={logo} alt="Barangay logo" />
        </div>

        <div className="registration-header-text">
          <span className="registration-eyebrow">Republika ng Pilipinas</span>
          <h1 className="registration-heading">Barangay Registration Form</h1>
          <p className="registration-subheading">
            Barangay Lagab • Compostela • Davao De Oro
          </p>
        </div>
      </div>

      <nav className="registration-stepper" aria-label="Registration steps">
        {STEPS.map((label, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <div
              key={label}
              className={`registration-step ${isCompleted ? "registration-step--completed" : ""} ${isCurrent ? "registration-step--current" : ""}`}
            >
              <span className="step-indicator" aria-hidden="true">
                {isCompleted ? "✓" : stepNumber}
              </span>

              <span className="step-label">{label}</span>

              {stepNumber < STEPS.length && (
                <span className="step-connector" aria-hidden="true"></span>
              )}
            </div>
          );
        })}
      </nav>
    </header>
  );
};

export default CreateAccountHeader;
