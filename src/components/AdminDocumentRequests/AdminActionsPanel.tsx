import { useState } from "react";
import type {
  AdminDocumentRequestActionPayload,
  AdminDocumentRequestDetail,
} from "../../Types/AdminDocumentRequestsType";
import { updateAdminDocumentRequest } from "../../Utils/api";

type AdminActionsPanelProps = {
  request: AdminDocumentRequestDetail;
  onUpdated: (updated: AdminDocumentRequestDetail) => void;
};

const STATUS_FLOW = [
  "Pending",
  "Approved",
  "Processing",
  "Ready for Pickup",
  "Completed",
];

const AdminActionsPanel = ({
  request,
  onUpdated,
}: AdminActionsPanelProps) => {
  const [remarks, setRemarks] = useState(request.admin_remarks ?? "");
  const [pickupDate, setPickupDate] = useState(
    request.pickup_date?.slice(0, 10) ?? "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const applyAction = async (payload: AdminDocumentRequestActionPayload) => {
    setIsSaving(true);
    setError("");

    try {
      onUpdated(await updateAdminDocumentRequest(request.id, payload));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not update the document request.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const applyStatus = (status: string) => {
    void applyAction({
      status,
      admin_remarks: remarks.trim() || undefined,
      pickup_date: pickupDate || undefined,
    });
  };

  const currentIndex = STATUS_FLOW.indexOf(request.status);

  return (
    <section className="residents-info-card docreq-actions-card">
      <h3>Admin Actions</h3>

      <p className="docreq-actions-label">Status Flow</p>
      <div className="docreq-status-flow">
        {STATUS_FLOW.map((step, index) => (
          <span className="docreq-flow-step-wrapper" key={step}>
            {index > 0 && (
              <span className="docreq-flow-arrow" aria-hidden="true">
                →
              </span>
            )}
            <button
              type="button"
              className={`docreq-flow-step${
                index === currentIndex ? " current" : ""
              }${index < currentIndex ? " done" : ""}`}
              onClick={() => {
                if (index !== currentIndex) applyStatus(step);
              }}
              disabled={isSaving || index === currentIndex}
              title={
                index === currentIndex
                  ? "Current status"
                  : `Set status to ${step}`
              }
            >
              {step}
            </button>
          </span>
        ))}
      </div>

      <label className="docreq-actions-field">
        <span>Remarks / Notes</span>
        <textarea
          rows={3}
          placeholder="Add remarks or notes..."
          value={remarks}
          onChange={(event) => setRemarks(event.target.value)}
          maxLength={2000}
          disabled={isSaving}
        />
      </label>

      <label className="docreq-actions-field">
        <span>Set Pickup Date</span>
        <input
          type="date"
          value={pickupDate}
          onChange={(event) => setPickupDate(event.target.value)}
          disabled={isSaving}
        />
      </label>

      {error && (
        <p className="docreq-actions-error" role="alert">
          {error}
        </p>
      )}

      <div className="docreq-actions-buttons">
        <button
          type="button"
          className="docreq-approve-button"
          onClick={() => applyStatus("Approved")}
          disabled={isSaving || request.status === "Approved"}
        >
          Approve
        </button>
        <button
          type="button"
          className="docreq-reject-button"
          onClick={() => applyStatus("Rejected")}
          disabled={isSaving || request.status === "Rejected"}
        >
          Reject
        </button>
      </div>
    </section>
  );
};

export default AdminActionsPanel;
