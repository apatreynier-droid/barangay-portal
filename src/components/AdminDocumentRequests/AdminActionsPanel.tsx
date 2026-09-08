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
  const [notice, setNotice] = useState("");

  const applyAction = async (
    payload: AdminDocumentRequestActionPayload,
    successMessage = "",
  ) => {
    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      onUpdated(await updateAdminDocumentRequest(request.id, payload));

      if (successMessage) {
        setNotice(successMessage);
      }
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

  const applyStatus = (newStatus: string) => {
    void applyAction({ status: newStatus });
  };

  const saveRemarks = () => {
    void applyAction(
      { admin_remarks: remarks.trim() || undefined },
      "Remarks saved.",
    );
  };

  const savePickupDate = () => {
    void applyAction(
      { pickup_date: pickupDate || undefined },
      "Pickup date saved.",
    );
  };

  const currentIndex = STATUS_FLOW.indexOf(request.status);
  const status = request.status;
  const remarksChanged =
    remarks.trim() !== (request.admin_remarks ?? "").trim();
  const pickupDateChanged =
    pickupDate !== (request.pickup_date ?? "").slice(0, 10);

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
            <span
              className={`docreq-flow-step${
                index === currentIndex ? " current" : ""
              }${index < currentIndex ? " done" : ""}`}
              title={
                index === currentIndex ? "Current status" : `Goes to ${step}`
              }
            >
              {step}
            </span>
          </span>
        ))}
      </div>

      {status === "Processing" && (
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
          <div className="docreq-actions-buttons">
            <button
              type="button"
              className="docreq-save-button"
              onClick={saveRemarks}
              disabled={isSaving || !remarksChanged}
            >
              {isSaving ? "Saving…" : "Save Remarks"}
            </button>
          </div>
        </label>
      )}

      {status === "Ready for Pickup" && (
        <label className="docreq-actions-field">
          <span>Set Pickup Date</span>
          <input
            type="date"
            value={pickupDate}
            onChange={(event) => setPickupDate(event.target.value)}
            disabled={isSaving}
          />
          <div className="docreq-actions-buttons">
            <button
              type="button"
              className="docreq-save-button"
              onClick={savePickupDate}
              disabled={isSaving || !pickupDateChanged}
            >
              {isSaving ? "Saving…" : "Save Pickup Date"}
            </button>
          </div>
        </label>
      )}

      {error && (
        <p className="docreq-actions-error" role="alert">
          {error}
        </p>
      )}

      {notice && !error && (
        <p className="docreq-actions-success" role="status">
          {notice}
        </p>
      )}

      {status === "Pending" && (
        <div className="docreq-actions-buttons">
          <button
            type="button"
            className="docreq-approve-button"
            onClick={() => applyStatus("Approved")}
            disabled={isSaving}
          >
            Approve
          </button>
          <button
            type="button"
            className="docreq-reject-button"
            onClick={() => applyStatus("Rejected")}
            disabled={isSaving}
          >
            Reject
          </button>
        </div>
      )}

      {status === "Approved" && (
        <div className="docreq-actions-buttons">
          <button
            type="button"
            className="docreq-approve-button"
            onClick={() => applyStatus("Processing")}
            disabled={isSaving}
          >
            Mark as Processing
          </button>
          <button
            type="button"
            className="docreq-reject-button"
            onClick={() => applyStatus("Rejected")}
            disabled={isSaving}
          >
            Reject
          </button>
        </div>
      )}

      {status === "Processing" && (
        <div className="docreq-actions-buttons">
          <button
            type="button"
            className="docreq-approve-button"
            onClick={() => applyStatus("Ready for Pickup")}
            disabled={isSaving}
          >
            Mark as Ready for Pickup
          </button>
          <button
            type="button"
            className="docreq-reject-button"
            onClick={() => applyStatus("Rejected")}
            disabled={isSaving}
          >
            Reject
          </button>
        </div>
      )}

      {status === "Ready for Pickup" && (
        <div className="docreq-actions-buttons">
          <button
            type="button"
            className="docreq-approve-button"
            onClick={() => applyStatus("Completed")}
            disabled={isSaving}
          >
            Mark as Completed
          </button>
        </div>
      )}

      {(status === "Completed" || status === "Rejected") && (
        <p className="docreq-actions-note">
          {status === "Completed"
            ? "This request has been completed. No further actions are available."
            : "This request was rejected. No further actions are available."}
        </p>
      )}
    </section>
  );
};

export default AdminActionsPanel;
