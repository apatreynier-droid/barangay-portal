import "./LogoutConfirmation.css";

type LogoutConfirmationProps = {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const LogoutConfirmation = ({
  isOpen,
  onCancel,
  onConfirm,
}: LogoutConfirmationProps) => {
  if (!isOpen) return null;

  return (
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
          <button type="button" className="logout-cancel-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="logout-confirm-button" onClick={onConfirm}>
            Log out
          </button>
        </div>
      </section>
    </div>
  );
};

export default LogoutConfirmation;
