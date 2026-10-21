import { createPortal } from "react-dom";
import "../../Styles/Shared/Components/LogoutConfirmation.css";

type LogoutConfirmationProps = {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

// The logout dialog is shared by Admin and Resident sidebars and is
// placed at the top page level so it always appears above other elements.
const LogoutConfirmation = ({
  isOpen,
  onCancel,
  onConfirm,
}: LogoutConfirmationProps) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="logout-confirmation-backdrop" role="presentation">
      <section
        className="logout-confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-confirmation-title"
      >
        <div className="logout-confirmation-icon" aria-hidden="true">
          ?
        </div>
        <h2 id="logout-confirmation-title">Log out?</h2>
        <p>Are you sure you want to log out of your account?</p>
        <div className="logout-confirmation-actions">
          <button
            type="button"
            className="logout-cancel-button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="logout-confirm-button"
            onClick={onConfirm}
          >
            Log out
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
};

export default LogoutConfirmation;
