import "./ResidentStatusConfirmModal.css";

type ResidentStatusConfirmModalProps = {
  mode: "deactivate" | "activate";
  residentName: string;
  isProcessing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const ResidentStatusConfirmModal = ({
  mode,
  residentName,
  isProcessing,
  onCancel,
  onConfirm,
}: ResidentStatusConfirmModalProps) => {
  const isDeactivate = mode === "deactivate";

  return (
    <div
      className="residents-confirm-backdrop"
      onClick={isProcessing ? undefined : onCancel}
      role="presentation"
    >
      <section
        className="residents-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="residents-confirm-title"
      >
        <div
          className={`residents-confirm-icon ${
            isDeactivate ? "danger" : "info"
          }`}
          aria-hidden="true"
        >
          {isDeactivate ? "!" : "?"}
        </div>

        <h2 id="residents-confirm-title">
          {isDeactivate ? "Deactivate account?" : "Activate account?"}
        </h2>
        <p>
          {isDeactivate
            ? `${residentName} will no longer be able to sign in to the resident portal. You can activate the account again anytime.`
            : `${residentName} will regain access to the resident portal.`}
        </p>

        <div className="residents-confirm-actions">
          <button
            type="button"
            className="residents-confirm-cancel"
            onClick={onCancel}
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`residents-confirm-accept ${
              isDeactivate ? "danger" : "info"
            }`}
            onClick={onConfirm}
            disabled={isProcessing}
          >
            {isProcessing
              ? "Saving…"
              : isDeactivate
                ? "Deactivate"
                : "Activate"}
          </button>
        </div>
      </section>
    </div>
  );
};

export default ResidentStatusConfirmModal;
