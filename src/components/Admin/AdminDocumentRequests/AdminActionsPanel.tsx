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
  // Rejecting is final, so the Reject button asks for a second click first.
  const [confirmReject, setConfirmReject] = useState(false);

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

  const requestReject = () => {
    setError("");
    setNotice("");
    setConfirmReject(true);
  };

  const confirmRejectRequest = () => {
    setConfirmReject(false);
    applyStatus("Rejected");
  };

  const currentIndex = STATUS_FLOW.indexOf(request.status);
  const status = request.status;
  const isRejected = status === "Rejected";
  const isCompleted = status === "Completed";

  // The one forward action for each status, and whether it may be rejected there.
  const nextAction: { label: string; onClick: () => void; canReject: boolean } | null =
    status === "Approved"
      ? { label: "Mark as Processing", onClick: () => applyStatus("Processing"), canReject: true }
      : status === "Processing"
        ? { label: "Mark as Ready for Pickup", onClick: markReadyForPickup, canReject: true }
        : status === "Ready for Pickup"
          ? { label: "Mark as Completed", onClick: () => applyStatus("Completed"), canReject: false }
          : null;
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
      <div className="docreq-actions-header">
        <h3>Admin Actions</h3>
        {currentIndex >= 0 && (
          <span className="docreq-actions-progress">
            {isCompleted
              ? "All steps done"
              : `Step ${currentIndex + 1} of ${STATUS_FLOW.length}`}
          </span>
        )}
      </div>

      <ol
        className={`docreq-stepper${isRejected ? " is-rejected" : ""}`}
        aria-label="Request progress"
      >
        {STATUS_FLOW.map((step, index) => {
          // A completed request has every step done, including the last one.
          const isDone = index < currentIndex || (isCompleted && index === currentIndex);
          const isCurrent = index === currentIndex && !isCompleted;
          const state = isDone ? "done" : isCurrent ? "current" : "upcoming";

          return (
            <li
              key={step}
              className={`docreq-step is-${state}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span className="docreq-step-marker" aria-hidden="true">
                {isDone ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 12.5l4.5 4.5L19 7.5"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span className="docreq-step-label">{step}</span>
              <span className="docreq-sr-only">
                {isDone ? " (done)" : isCurrent ? " (current)" : ""}
              </span>
            </li>
          );
        })}
      </ol>

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

      {nextAction && confirmReject && (
        <div className="docreq-reject-confirm" role="alertdialog" aria-label="Confirm rejection">
          <p>
            <strong>Reject this request?</strong> The resident will see it as
            rejected and no further actions will be available.
          </p>
          <div className="docreq-actions-buttons">
            <button
              type="button"
              className="docreq-secondary-button"
              onClick={() => setConfirmReject(false)}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="docreq-reject-button"
              onClick={confirmRejectRequest}
              disabled={isSaving}
            >
              {isSaving ? "Rejecting…" : "Yes, reject"}
            </button>
          </div>
        </div>
      )}

      {nextAction && !confirmReject && (
        <div className="docreq-actions-buttons docreq-actions-buttons--main">
          <button
            type="button"
            className="docreq-approve-button"
            onClick={nextAction.onClick}
            disabled={isSaving}
          >
            {nextAction.label}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 12h14M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {canReview && nextAction.canReject && (
            <button
              type="button"
              className="docreq-reject-outline-button"
              onClick={requestReject}
              disabled={isSaving}
            >
              Reject
            </button>
          )}
        </div>
      )}

      {(isCompleted || isRejected) && (
        <p
          className={`docreq-actions-note docreq-actions-note--${
            isCompleted ? "completed" : "rejected"
          }`}
        >
          {isCompleted
            ? "This request has been completed. No further actions are available."
            : "This request was rejected. No further actions are available."}
        </p>
      )}
    </section>
  );
};

export default AdminActionsPanel;
