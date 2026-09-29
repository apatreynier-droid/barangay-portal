import "./StaffActionConfirmModal.css";

export type StaffActionMode = "deactivate" | "activate" | "reset-password";

type StaffActionConfirmModalProps = {
  mode: StaffActionMode;
  accountName: string;
  accountEmail: string;
  isProcessing: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

const MODE_CONTENT: Record<
  StaffActionMode,
  { title: string; confirm: string; className: string }
> = {
  deactivate: {
    title: "Deactivate account?",
    confirm: "Deactivate",
    className: "danger",
  },
  activate: {
    title: "Activate account?",
    confirm: "Activate",
    className: "info",
  },
  "reset-password": {
    title: "Send password reset link?",
    confirm: "Send Reset PW",
    className: "warning",
  },
};

const StaffActionConfirmModal = ({
  mode,
  accountName,
  accountEmail,
  isProcessing,
  error = "",
  onCancel,
  onConfirm,
}: StaffActionConfirmModalProps) => {
  const content = MODE_CONTENT[mode];

  const description = (() => {
    if (mode === "deactivate") {
      return `${accountName} will no longer be able to sign in and any active session is signed out immediately. You can activate the account again anytime.`;
    }

    if (mode === "activate") {
      return `${accountName} will regain access to the portal.`;
    }

    return `A single-use reset link will be emailed to ${accountEmail}. The password is never shown here: ${accountName} sets a new one from the link.`;
  })();

  return (
    <div
      className="staff-confirm-backdrop"
      onClick={isProcessing ? undefined : onCancel}
      role="presentation"
    >
      <section
        className="staff-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-confirm-title"
      >
        <div
          className={`staff-confirm-icon ${content.className}`}
          aria-hidden="true"
        >
          {mode === "deactivate" ? "!" : mode === "activate" ? "✓" : "↺"}
        </div>

        <h2 id="staff-confirm-title">{content.title}</h2>
        <p>{description}</p>

        {error && (
          <p className="staff-confirm-error" role="alert">
            {error}
          </p>
        )}

        <div className="staff-confirm-actions">
          <button
            type="button"
            className="staff-confirm-cancel"
            onClick={onCancel}
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`staff-confirm-accept ${content.className}`}
            onClick={onConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? "Saving…" : content.confirm}
          </button>
        </div>
      </section>
    </div>
  );
};

export default StaffActionConfirmModal;
