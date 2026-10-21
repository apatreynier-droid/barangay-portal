import { useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, deleteDocumentRequest } from "../../../Utils/api";
import type { Request } from "../../../Types/DashboardType";
import "../../../Styles/Resident/Components/DeleteRequestModal.css";

type DeleteRequestModalProps = {
  request: Request;
  onClose: () => void;
  onDeleted: () => void;
};

const DeleteRequestModal = ({
  request,
  onClose,
  onDeleted,
}: DeleteRequestModalProps) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);
    setError("");

    try {
      await deleteDocumentRequest(request.numericId);
      onDeleted();
    } catch (deleteError) {
      setError(
        deleteError instanceof ApiError
          ? deleteError.message
          : "Could not delete your request.",
      );
      setIsDeleting(false);
    }
  };

  return createPortal(
    <div
      className="delete-request-backdrop"
      onClick={isDeleting ? undefined : onClose}
      role="presentation"
    >
      <section
        className="delete-request-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-request-title"
      >
        <div className="delete-request-icon" aria-hidden="true">
          !
        </div>
        <h2 id="delete-request-title">Delete this request?</h2>
        <p>
          <strong>{request.id}</strong> will be permanently removed from your
          records. This action cannot be undone.
        </p>

        {error && (
          <p className="delete-request-error" role="alert">
            {error}
          </p>
        )}

        <div className="delete-request-actions">
          <button
            type="button"
            className="delete-request-cancel"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="delete-request-confirm"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
};

export default DeleteRequestModal;