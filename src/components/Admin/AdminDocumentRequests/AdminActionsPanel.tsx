import { useState } from "react";
import type {
  AdminDocumentRequestActionPayload,
  AdminDocumentRequestDetail,
} from "../../../Types/Admin/AdminDocumentRequestsType";
import { updateAdminDocumentRequest } from "../../../Utils/Shared/api";
import { toTimeInputValue } from "../../../Utils/Shared/pickupTime";
import DatePickerInput from "../../Shared/DatePickerInput";

type AdminActionsPanelProps = {
  request: AdminDocumentRequestDetail;
  /**
   * True for administrator accounts. Rejecting a request (and approving a
   * pending one) is an administrator action; Staff accounts process approved
   * work forward. The backend rejects the request with HTTP 403 otherwise.
   */
  canReview: boolean;
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
  canReview,
  onUpdated,
}: AdminActionsPanelProps) => {
  const [remarks, setRemarks] = useState(request.admin_remarks ?? "");
  const [pickupDate, setPickupDate] = useState(
    request.pickup_date?.slice(0, 10) ?? "",
  );
  const [pickupTime, setPickupTime] = useState(
    toTimeInputValue(request.pickup_time),
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

  const savePickupSchedule = () => {
    void applyAction(
      {
        pickup_date: pickupDate || undefined,
        pickup_time: pickupTime || undefined,
      },
      "Pickup schedule saved. The resident was notified by email and in the portal.",
    );
  };

  // Sends the schedule with the status change, so the resident's single
  // "Ready for Pickup" email already contains the pickup date and time.
  const markReadyForPickup = () => {
    if (pickupTime && !pickupDate) {
      setNotice("");
      setError("Choose a pickup date for this time, or clear the time.");
      return;
    }
    void applyAction({
      status: "Ready for Pickup",
      pickup_date: pickupDate || undefined,
      pickup_time: pickupTime || undefined,
    });
  };

  const currentIndex = STATUS_FLOW.indexOf(request.status);
  const status = request.status;
  const remarksChanged =
    remarks.trim() !== (request.admin_remarks ?? "").trim();
  const savedPickupTime = toTimeInputValue(request.pickup_time);
  const pickupChanged =
    pickupDate !== (request.pickup_date ?? "").slice(0, 10) ||
    pickupTime !== savedPickupTime;
  // A schedule needs a date, and a saved time can be changed but not erased
  // (the API keeps the stored value when a field is left out).
  const canSavePickup =
    pickupChanged && pickupDate !== "" && !(pickupTime === "" && savedPickupTime);

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

      {(status === "Processing" || status === "Ready for Pickup") && (
        <div className="docreq-actions-field docreq-pickup-date">
          <span>
            Pickup Schedule
            {status === "Processing" && (
              <span className="docreq-pickup-optional"> (optional)</span>
            )}
          </span>
          <div className="docreq-pickup-schedule">
            <div className="docreq-pickup-part docreq-pickup-part--date">
              <span className="docreq-pickup-sublabel">Date</span>
              <DatePickerInput
                value={pickupDate}
                onChange={setPickupDate}
                disabled={isSaving}
                ariaLabel="Pickup date"
              />
            </div>
            <label className="docreq-pickup-part docreq-pickup-part--time">
              <span className="docreq-pickup-sublabel">Time</span>
              <input
                type="time"
                value={pickupTime}
                onChange={(event) => setPickupTime(event.target.value)}
                disabled={isSaving}
                aria-label="Pickup time"
              />
            </label>
          </div>
          <p className="docreq-pickup-hint">
            {status === "Processing"
              ? "Set it now and the resident's “Ready for Pickup” email will include the date and time."
              : pickupDate
                ? "Saving emails the resident the Ready for Pickup notice with this date and time."
                : "Choose the date (and time) the resident can collect the document."}
          </p>
          {status === "Ready for Pickup" && (
            <div className="docreq-actions-buttons">
              <button
                type="button"
                className="docreq-save-button"
                onClick={savePickupSchedule}
                disabled={isSaving || !canSavePickup}
              >
                {isSaving ? "Saving…" : "Save Schedule"}
              </button>
            </div>
          )}
        </div>
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
        <p className="docreq-actions-note">
          This request is awaiting review. Approve or reject it in the
          Approvals page — processing unlocks once it is approved.
        </p>
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
          {canReview && (
            <button
              type="button"
              className="docreq-reject-button"
              onClick={() => applyStatus("Rejected")}
              disabled={isSaving}
            >
              Reject
            </button>
          )}
        </div>
      )}

      {status === "Processing" && (
        <div className="docreq-actions-buttons">
          <button
            type="button"
            className="docreq-approve-button"
            onClick={markReadyForPickup}
            disabled={isSaving}
          >
            Mark as Ready for Pickup
          </button>
          {canReview && (
            <button
              type="button"
              className="docreq-reject-button"
              onClick={() => applyStatus("Rejected")}
              disabled={isSaving}
            >
              Reject
            </button>
          )}
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
