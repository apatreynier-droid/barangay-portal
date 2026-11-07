import { useRef } from "react";
import "../../../Styles/Admin/Components/ResidentStatusConfirmModal.css";
import type { AdminRegistration } from "../../../Types/Admin/AdminRegistrationsType";
import {
  formatManilaDateTime,
  getEmailStatusLabel,
  getRegistrationStatusMeta,
  PENDING_REGISTRATION_STATUS,
} from "../../../Utils/Admin/AdminRegistrationsLogic";
import useModalBehavior from "../AdminPotholeManagement/useModalBehavior";
import { ApprovalStatusPill, ApproveIcon, RejectIcon } from "./ApprovalIcons";

type RegistrationDetailsModalProps = {
  registration: AdminRegistration;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
};

type DetailField = { label: string; value: string | number | null };

const DetailSection = ({
  title,
  fields,
}: {
  title: string;
  fields: DetailField[];
}) => (
  <section className="registration-details-section">
    <h3>{title}</h3>
    <dl className="registration-details-grid">
      {fields.map((field) => (
        <div className="approvals-card-field" key={field.label}>
          <dt>{field.label}</dt>
          <dd>{field.value === null || field.value === "" ? "—" : field.value}</dd>
        </div>
      ))}
    </dl>
  </section>
);

const RegistrationDetailsModal = ({
  registration,
  onClose,
  onApprove,
  onReject,
}: RegistrationDetailsModalProps) => {
  const dialogRef = useRef<HTMLElement | null>(null);
  useModalBehavior(dialogRef, onClose);

  const statusMeta = getRegistrationStatusMeta(registration.status);
  const isPending = registration.status === PENDING_REGISTRATION_STATUS;

  return (
    <div
      className="residents-confirm-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <section
        ref={dialogRef}
        className="registration-details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="registration-details-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="registration-details-header">
          <div>
            <h2 id="registration-details-title">{registration.name}</h2>
            <span className="approvals-card-id">
              {registration.resident_code}
            </span>
          </div>
          <ApprovalStatusPill
            status={registration.status}
            label={statusMeta.label}
            className={statusMeta.className}
          />
        </header>

        <DetailSection
          title="Registration"
          fields={[
            {
              label: "Registered",
              value: formatManilaDateTime(registration.registered_at),
            },
            {
              label: isPending ? "Previously Rejected" : "Reviewed",
              value: registration.reviewed_at
                ? formatManilaDateTime(registration.reviewed_at)
                : null,
            },
            {
              label: isPending ? "Previously Rejected By" : "Reviewed By",
              value: registration.reviewed_by,
            },
            {
              label: isPending ? "Previous Reason" : "Rejection Reason",
              value: registration.rejection_reason,
            },
            {
              label: "Email to Resident",
              value: registration.email_status
                ? getEmailStatusLabel(registration.email_status)
                : null,
            },
          ]}
        />

        <DetailSection
          title="Personal Information"
          fields={[
            { label: "Date of Birth", value: registration.date_of_birth },
            { label: "Place of Birth", value: registration.place_of_birth },
            { label: "Sex", value: registration.sex },
            { label: "Civil Status", value: registration.civil_status },
            { label: "Nationality", value: registration.nationality },
            { label: "Religion", value: registration.religion },
            { label: "Voter Status", value: registration.voter_status },
            { label: "Occupation", value: registration.occupation },
            { label: "Employer", value: registration.employer },
          ]}
        />

        <DetailSection
          title="Address"
          fields={[
            { label: "Full Address", value: registration.address },
            { label: "House No.", value: registration.house_no },
            { label: "Street", value: registration.street },
            { label: "Purok", value: registration.purok },
            {
              label: "Years of Residency",
              value: registration.years_of_residency,
            },
          ]}
        />

        <DetailSection
          title="Contact Information"
          fields={[
            { label: "Email Address", value: registration.email },
            { label: "Contact Number", value: registration.contact_number },
          ]}
        />

        <DetailSection
          title="Emergency Contact"
          fields={[
            { label: "Name", value: registration.emergency_contact_name },
            {
              label: "Relationship",
              value: registration.emergency_contact_relationship,
            },
            {
              label: "Contact Number",
              value: registration.emergency_contact_number,
            },
            { label: "Address", value: registration.emergency_contact_address },
          ]}
        />

        <div className="approvals-card-actions registration-details-actions">
          <button
            type="button"
            className="approvals-secondary-button"
            onClick={onClose}
          >
            Close
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
    </div>
  );
};

export default RegistrationDetailsModal;
