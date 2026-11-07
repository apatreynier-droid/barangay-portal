import { useRef, useState } from "react";
import "../../../Styles/Admin/Components/ResidentStatusConfirmModal.css";
import useModalBehavior from "../AdminPotholeManagement/useModalBehavior";
import { CheckCircle, XCircle } from "lucide-react";
import { ApproveIcon, RejectIcon } from "./ApprovalIcons";

export type RegistrationReviewMode = "approve" | "reject";

/** Matches AdminRegistrationRejectInput in backend/app/schemas.py. */
const MAX_REASON_LENGTH = 1000;

type RegistrationReviewModalProps = {
  mode: RegistrationReviewMode;
  residentName: string;
  isProcessing: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

const RegistrationReviewModal = ({
  mode,
  residentName,
  isProcessing,
  error,
  onCancel,
  onConfirm,
}: RegistrationReviewModalProps) => {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const isReject = mode === "reject";

  const closeIfIdle = () => {
    if (!isProcessing) {
      onCancel();
    }
  };

  useModalBehavior(dialogRef, closeIfIdle);

  const handleConfirm = () => {
    if (isReject && !reason.trim()) {
      setReasonError("Enter the reason for rejecting this registration.");
      return;
    }

    setReasonError("");
    onConfirm(reason.trim());
  };

  return (
    <div
      className="residents-confirm-backdrop"
      onClick={closeIfIdle}
      role="presentation"
    >
      <section
        ref={dialogRef}
        className="residents-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="registration-review-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`residents-confirm-icon ${isReject ? "danger" : "approve"}`}
          aria-hidden="true"
        >
          {isReject ? (
            <XCircle size={24} strokeWidth={2} />
          ) : (
            <CheckCircle size={24} strokeWidth={2} />
          )}
        </div>

        <h2 id="registration-review-title">
          {isReject ? "Reject registration?" : "Approve registration?"}
        </h2>
        <p>
          {isReject
            ? `${residentName} will not be able to sign in. The reason below is emailed to the resident.`
            : `${residentName} will be able to sign in to the Resident Portal and will be notified by email.`}
        </p>

        {isReject && (
          <div className="registration-reason-field">
            <label htmlFor="registration-rejection-reason">
              Reason for rejection
            </label>
            <textarea
              id="registration-rejection-reason"
              rows={4}
              maxLength={MAX_REASON_LENGTH}
              value={reason}
              disabled={isProcessing}
              aria-invalid={Boolean(reasonError)}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError("");
              }}
            />
            {reasonError && (
              <span className="registration-reason-error" role="alert">
                {reasonError}
              </span>
            )}
          </div>
        )}

        {error && (
          <p className="approvals-card-error" role="alert">
            {error}
          </p>
        )}

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
            className={`residents-confirm-accept approvals-confirm-accept ${
              isReject ? "danger" : "approve"
            }`}
            onClick={handleConfirm}
            disabled={isProcessing}
          >
            {isReject ? (
              <RejectIcon isLoading={isProcessing} />
            ) : (
              <ApproveIcon isLoading={isProcessing} />
            )}
            <span>
              {isProcessing ? "Saving…" : isReject ? "Reject" : "Approve"}
            </span>
          </button>
        </div>
      </section>
    </div>
  );
};

export default RegistrationReviewModal;
