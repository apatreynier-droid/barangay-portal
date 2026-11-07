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
  onCancel: () => void;
  onConfirm: (remark: string) => void;
};

const PotholeConfirmModal = ({
  action,
  reportId,
  onCancel,
  onConfirm,
}: PotholeConfirmModalProps) => {
  const meta = POTHOLE_ACTION_META[action];
  const [remark, setRemark] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement | null>(null);
  useModalBehavior(dialogRef, onCancel);

  const handleConfirm = () => {
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
      onClick={onCancel}
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
              : "Administrator remark (optional)"}
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

        {error && (
          <p className="pothole-field-error" role="alert">
            {error}
          </p>
        )}

        <div className="residents-confirm-actions">
          <button
            type="button"
            className="residents-confirm-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`residents-confirm-accept ${
              meta.isDanger ? "danger" : "info"
            }`}
            onClick={handleConfirm}
          >
            {meta.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
};

export default PotholeConfirmModal;
