import { useState } from "react";
import type { AdminDocumentRequest } from "../../Types/AdminDocumentRequestsType";
import {
  formatFee,
  formatSubmittedDateTime,
} from "../../Utils/AdminDocumentRequestsLogic";
import { updateAdminDocumentRequest } from "../../Utils/api";

type ApprovalRequestCardProps = {
  request: AdminDocumentRequest;
  onProcessed: (requestId: number) => void;
};

const ApprovalRequestCard = ({
  request,
  onProcessed,
}: ApprovalRequestCardProps) => {
  const [remarks, setRemarks] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const processRequest = async (status: "Approved" | "Rejected") => {
    setIsSubmitting(true);
    setError("");

    try {
      await updateAdminDocumentRequest(request.id, {
        status,
        admin_remarks: remarks.trim() ? remarks.trim() : undefined,
        pickup_date: status === "Approved" && pickupDate ? pickupDate : undefined,
      });
      onProcessed(request.id);
    } catch (submitError) {
      setError(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : `Could not ${status.toLowerCase()} the request. Please try again.`,
      );
      setIsSubmitting(false);
    }
  };

  return (
    <section className="approvals-card">
      <div className="approvals-card-header">
        <span className="approvals-card-id">{request.request_number}</span>
        <span className="admin-status-pill status-pending">Pending</span>
      </div>

      <dl className="approvals-card-grid">
        <div className="approvals-card-field">
          <dt>Resident</dt>
          <dd>{request.resident_name}</dd>
        </div>
        <div className="approvals-card-field">
          <dt>Document</dt>
          <dd>{request.document}</dd>
        </div>
        <div className="approvals-card-field">
          <dt>Purpose</dt>
          <dd>{request.purpose}</dd>
        </div>
        <div className="approvals-card-field">
          <dt>Fee</dt>
          <dd className="approvals-card-fee">{formatFee(request.fee)}</dd>
        </div>
        <div className="approvals-card-field">
          <dt>Submitted</dt>
          <dd>{formatSubmittedDateTime(request.submitted_at)}</dd>
        </div>
        <div className="approvals-card-field">
          <dt>Reference</dt>
          <dd>{request.request_number}</dd>
        </div>
      </dl>

      <div className="approvals-card-inputs">
        <label className="approvals-card-input approvals-card-input-remarks">
          <span>Remarks</span>
          <input
            type="text"
            placeholder="Add remarks (optional)…"
            value={remarks}
            disabled={isSubmitting}
            onChange={(event) => setRemarks(event.target.value)}
          />
        </label>

        <label className="approvals-card-input approvals-card-input-date">
          <span>Pickup Date</span>
          <input
            type="date"
            value={pickupDate}
            disabled={isSubmitting}
            onChange={(event) => setPickupDate(event.target.value)}
          />
        </label>
      </div>

      {error && (
        <p className="approvals-card-error" role="alert">
          {error}
        </p>
      )}

      <div className="approvals-card-actions">
        <button
          type="button"
          className="approvals-approve-button"
          disabled={isSubmitting}
          onClick={() => void processRequest("Approved")}
        >
          ✓ Approve
        </button>
        <button
          type="button"
          className="approvals-reject-button"
          disabled={isSubmitting}
          onClick={() => void processRequest("Rejected")}
        >
          ✕ Reject
        </button>
      </div>
    </section>
  );
};

export default ApprovalRequestCard;
