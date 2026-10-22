import { useState } from "react";
import { createPortal } from "react-dom";
import {
  ApiError,
  mapApiRequest,
  updateDocumentRequest,
} from "../../../Utils/Shared/api";
import type { Request } from "../../../Types/Resident/DashboardType";
import "../../../Styles/Resident/Components/EditRequestModal.css";

type EditRequestModalProps = {
  request: Request;
  onClose: () => void;
  onSaved: (updated: Request) => void;
};

const EditRequestModal = ({
  request,
  onClose,
  onSaved,
}: EditRequestModalProps) => {
  const [purpose, setPurpose] = useState(request.purpose);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const trimmedPurpose = purpose.trim();
  const canSave = trimmedPurpose.length > 0 && !isSaving;

  const handleSave = async () => {
    if (!canSave) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const updated = await updateDocumentRequest(
        request.numericId,
        trimmedPurpose,
      );
      onSaved(mapApiRequest(updated));
    } catch (saveError) {
      setError(
        saveError instanceof ApiError
          ? saveError.message
          : "Could not update your request.",
      );
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="edit-request-backdrop" onClick={onClose} role="presentation">
      <div
        className="edit-request-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-request-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="edit-request-header">
          <div>
            <p className="edit-request-label">Edit request</p>
            <h2 id="edit-request-title">{request.id}</h2>
          </div>

          <button
            type="button"
            className="edit-request-close"
            onClick={onClose}
            aria-label="Close"
            disabled={isSaving}
          >
            ×
          </button>
        </header>

        <div className="edit-request-body">
          <div className="edit-request-field">
            <label className="edit-request-field-label" htmlFor="edit-document">
              Document
            </label>
            <input
              id="edit-document"
              type="text"
              className="edit-request-input"
              value={request.document}
              disabled
            />
            <p className="edit-request-hint">
              The document type cannot be changed after submission.
            </p>
          </div>

          <div className="edit-request-field">
            <label className="edit-request-field-label" htmlFor="edit-purpose">
              Purpose
            </label>
            <textarea
              id="edit-purpose"
              className="edit-request-textarea"
              placeholder="Enter the reason for your request"
              rows={4}
              maxLength={2000}
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              disabled={isSaving}
            />
          </div>

          {error && (
            <p className="edit-request-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="edit-request-actions">
          <button
            type="button"
            className="edit-request-cancel"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="edit-request-save"
            onClick={handleSave}
            disabled={!canSave}
          >
            {isSaving ? "Saving…" : "Save Changes"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
};

export default EditRequestModal;