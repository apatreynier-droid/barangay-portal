import type { AdminRegistration } from "../../../Types/Admin/AdminRegistrationsType";
import {
  formatManilaDateTime,
  getEmailStatusLabel,
  getRegistrationStatusMeta,
  PENDING_REGISTRATION_STATUS,
} from "../../../Utils/Admin/AdminRegistrationsLogic";
import { ApprovalStatusPill, ApproveIcon, RejectIcon } from "./ApprovalIcons";

type RegistrationCardProps = {
  registration: AdminRegistration;
  isRetryingEmail: boolean;
  onView: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRetryEmail: () => void;
};

const RegistrationCard = ({
  registration,
  isRetryingEmail,
  onView,
  onApprove,
  onReject,
  onRetryEmail,
}: RegistrationCardProps) => {
  const statusMeta = getRegistrationStatusMeta(registration.status);
  const isPending = registration.status === PENDING_REGISTRATION_STATUS;

  return (
    <section className="approvals-card">
      <div className="approvals-card-header">
        <span className="approvals-card-id">{registration.resident_code}</span>
        <ApprovalStatusPill
          status={registration.status}
          label={statusMeta.label}
          className={statusMeta.className}
        />
      </div>

      <dl className="approvals-card-grid">
        <div className="approvals-card-field">
          <dt>Full Name</dt>
          <dd>{registration.name}</dd>
        </div>
        <div className="approvals-card-field">
          <dt>Email Address</dt>
          <dd>{registration.email}</dd>
        </div>
        <div className="approvals-card-field">
          <dt>Contact Number</dt>
          <dd>{registration.contact_number || "—"}</dd>
        </div>
        <div className="approvals-card-field">
          <dt>Address</dt>
          <dd>{registration.address || "—"}</dd>
        </div>
        <div className="approvals-card-field">
          <dt>Purok</dt>
          <dd>{registration.purok || "—"}</dd>
        </div>
        <div className="approvals-card-field">
          <dt>Registered</dt>
          <dd>{formatManilaDateTime(registration.registered_at)}</dd>
        </div>
      </dl>

      {registration.reviewed_at && (
        <p className="approvals-card-note">
          {isPending ? "Previously rejected" : "Reviewed"} by{" "}
          {registration.reviewed_by || "an administrator"} on{" "}
          {formatManilaDateTime(registration.reviewed_at)}
        </p>
      )}

      {registration.rejection_reason && (
        <p className="approvals-card-note">
          <strong>{isPending ? "Previous reason:" : "Reason:"}</strong>{" "}
          {registration.rejection_reason}
        </p>
      )}

      {registration.email_status && (
        <p
          className={`approvals-card-note${
            registration.email_status === "failed" ? " is-warning" : ""
          }`}
        >
          Email to resident: {getEmailStatusLabel(registration.email_status)}
          {registration.email_status === "failed" && (
            <button
              type="button"
              className="approvals-link-button"
              disabled={isRetryingEmail}
              onClick={onRetryEmail}
            >
              {isRetryingEmail ? "Retrying…" : "Retry email"}
            </button>
          )}
        </p>
      )}

      <div className="approvals-card-actions">
        <button
          type="button"
          className="approvals-secondary-button"
          onClick={onView}
        >
          View Details
        </button>
        {isPending && (
          <>
            <button
              type="button"
              className="approvals-approve-button"
              onClick={onApprove}
            >
              <ApproveIcon />
              <span>Approve</span>
            </button>
            <button
              type="button"
              className="approvals-reject-button"
              onClick={onReject}
            >
              <RejectIcon />
              <span>Reject</span>
            </button>
          </>
        )}
      </div>
    </section>
  );
};

export default RegistrationCard;
