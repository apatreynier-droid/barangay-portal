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
  /** The AI's count for this photo, offered as a starting point when verifying. */
  aiDetectionCount: number | null;
  /** A duplicate confirms no defect of its own, so it asks for no number. */
  isDuplicate: boolean;
  onCancel: () => void;
  /** The count is set only when verifying a report that is not a duplicate. */
  onConfirm: (remark: string, verifiedDefectCount?: number) => void;
};

const MAX_DEFECT_COUNT = 100;

const PotholeConfirmModal = ({
  action,
  reportId,
  isSaving,
  saveError,
  aiDetectionCount,
  isDuplicate,
  onCancel,
  onConfirm,
}: PotholeConfirmModalProps) => {
  const meta = POTHOLE_ACTION_META[action];
  const asksForDefectCount = action === "verify" && !isDuplicate;
  const [remark, setRemark] = useState("");
  const [defectCount, setDefectCount] = useState(
    String(Math.max(1, aiDetectionCount ?? 1)),
  );
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

    if (!asksForDefectCount) {
      onConfirm(trimmed);
      return;
    }

    const count = Number(defectCount);
    if (!Number.isInteger(count) || count < 1 || count > MAX_DEFECT_COUNT) {
      setError(`Enter a whole number from 1 to ${MAX_DEFECT_COUNT}.`);
      return;
    }

    onConfirm(trimmed, count);
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

        {asksForDefectCount && (
          <label className="pothole-confirm-field">
            <span>Unique potholes you confirm in this report</span>
            <input
              type="number"
              className="pothole-number-input"
              min={1}
              max={MAX_DEFECT_COUNT}
              step={1}
              value={defectCount}
              onChange={(event) => {
                setDefectCount(event.target.value);
                setError("");
              }}
            />
            <small className="pothole-confirm-hint">
              {aiDetectionCount === null
                ? "The AI did not produce a count for this photo."
                : `The AI counted ${aiDetectionCount}. Correct this if the photo shows otherwise.`}
            </small>
          </label>
        )}

        {action === "verify" && isDuplicate && (
          <p className="pothole-confirm-hint">
            This report is marked as a duplicate, so it adds no new defect to
            the unique totals.
          </p>
        )}

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
