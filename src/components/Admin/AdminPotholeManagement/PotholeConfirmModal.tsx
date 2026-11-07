import { useRef, useState } from "react";
import "../../../Styles/Admin/Components/ResidentStatusConfirmModal.css";
import useModalBehavior from "./useModalBehavior";
import {
  MAX_POTHOLE_REMARK_LENGTH,
  POTHOLE_ACTION_META,
} from "../../../Utils/Admin/AdminPotholeManagementLogic";
import type { PotholeAction } from "../../../Types/Admin/AdminPotholeManagementType";

type PotholeConfirmModalProps = {
  action: PotholeAction;
  reportId: string;
  /** True while the change is being saved. */
  isSaving: boolean;
  /** Error returned by the server for the last attempt. */
  saveError: string;
  onCancel: () => void;
  onConfirm: (remark: string) => void;
};

const PotholeConfirmModal = ({
  action,
  reportId,
  isSaving,
  saveError,
  onCancel,
  onConfirm,
}: PotholeConfirmModalProps) => {
  const meta = POTHOLE_ACTION_META[action];
  const [remark, setRemark] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement | null>(null);
  // Escape/backdrop cannot close the dialog while the change is saving.
  const handleCancel = () => {
    if (!isSaving) onCancel();
  };
  useModalBehavior(dialogRef, handleCancel);

  const handleConfirm = () => {
    if (isSaving) return;
    const trimmed = remark.trim();

    if (meta.requiresRemark && !trimmed) {
      setError("Please enter the reason for rejecting this report.");
      return;
    }

    onConfirm(trimmed);
  };

  return (
    <div
      className="residents-confirm-backdrop pothole-confirm-backdrop"
      onClick={handleCancel}
      role="presentation"
    >
      <section
        ref={dialogRef}
        className="residents-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pothole-confirm-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`residents-confirm-icon ${
            meta.isDanger ? "danger" : "info"
          }`}
          aria-hidden="true"
        >
          {meta.isDanger ? "!" : "?"}
        </div>

        <h2 id="pothole-confirm-title">{meta.confirmTitle}</h2>
        <p>
          <strong>{reportId}</strong>: {meta.confirmBody}
        </p>

        <label className="pothole-confirm-field">
          <span>
            {meta.requiresRemark
              ? "Reason for rejection (required)"
              : "Remark (optional)"}
          </span>
          <textarea
            className="pothole-textarea"
            rows={3}
            maxLength={MAX_POTHOLE_REMARK_LENGTH}
            value={remark}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setRemark(event.target.value);
              setError("");
            }}
          />
        </label>

        {(error || saveError) && (
          <p className="pothole-field-error" role="alert">
            {error || saveError}
          </p>
        )}

        <div className="residents-confirm-actions">
          <button
            type="button"
            className="residents-confirm-cancel"
            onClick={handleCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`residents-confirm-accept ${
              meta.isDanger ? "danger" : "info"
            }`}
            onClick={handleConfirm}
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : meta.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
};

export default PotholeConfirmModal;
