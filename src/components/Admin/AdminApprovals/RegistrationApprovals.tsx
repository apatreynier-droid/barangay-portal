import { useMemo, useState } from "react";
import "../../../Styles/Admin/Pages/AdminRequestHistory.css";
import "../../../Styles/Shared/Components/DatePickerInput.css";
import type {
  AdminRegistration,
  AdminRegistrationActionResult,
} from "../../../Types/Admin/AdminRegistrationsType";
import {
  ApiError,
  approveRegistration,
  rejectRegistration,
  retryRegistrationEmail,
} from "../../../Utils/Shared/api";
import {
  DEFAULT_REGISTRATION_FILTERS,
  filterRegistrations,
  REGISTRATION_STATUS_OPTIONS,
} from "../../../Utils/Admin/AdminRegistrationsLogic";
import DatePickerInput from "../../Shared/DatePickerInput";
import RegistrationCard from "./RegistrationCard";
import RegistrationDetailsModal from "./RegistrationDetailsModal";
import RegistrationReviewModal, {
  type RegistrationReviewMode,
} from "./RegistrationReviewModal";

type RegistrationApprovalsProps = {
  registrations: AdminRegistration[];
  onRegistrationUpdated: (registration: AdminRegistration) => void;
  onReload: () => void;
};

type ReviewTarget = {
  mode: RegistrationReviewMode;
  registration: AdminRegistration;
};

type Notice = { message: string; isWarning: boolean };

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const noticeFromResult = (result: AdminRegistrationActionResult): Notice => ({
  message: result.message,
  isWarning: result.email_delivery === "failed",
});

const RegistrationApprovals = ({
  registrations,
  onRegistrationUpdated,
  onReload,
}: RegistrationApprovalsProps) => {
  const [filters, setFilters] = useState(DEFAULT_REGISTRATION_FILTERS);
  const [details, setDetails] = useState<AdminRegistration | null>(null);
  const [review, setReview] = useState<ReviewTarget | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const visibleRegistrations = useMemo(
    () => filterRegistrations(registrations, filters),
    [registrations, filters],
  );

  const openReview = (
    mode: RegistrationReviewMode,
    registration: AdminRegistration,
  ) => {
    setDetails(null);
    setReviewError("");
    setReview({ mode, registration });
  };

  const handleConfirmReview = async (reason: string) => {
    if (!review) {
      return;
    }

    setIsProcessing(true);
    setReviewError("");
    setNotice(null);

    try {
      const result =
        review.mode === "approve"
          ? await approveRegistration(review.registration.id)
          : await rejectRegistration(review.registration.id, reason);

      onRegistrationUpdated(result.registration);
      setNotice(noticeFromResult(result));
      setReview(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Another administrator got there first: show what is true now.
        setNotice({ message: error.message, isWarning: true });
        setReview(null);
        onReload();
      } else {
        setReviewError(
          getErrorMessage(error, "Could not save the review. Please try again."),
        );
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetryEmail = async (registration: AdminRegistration) => {
    setRetryingId(registration.id);
    setNotice(null);

    try {
      const result = await retryRegistrationEmail(registration.id);
      onRegistrationUpdated(result.registration);
      setNotice(noticeFromResult(result));
    } catch (error) {
      setNotice({
        message: getErrorMessage(error, "Could not retry the email."),
        isWarning: true,
      });
      onReload();
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <>
      <div className="reqhist-toolbar approvals-toolbar">
        <input
          type="search"
          className="reqhist-search"
          placeholder="Search by name, email, or code"
          value={filters.search}
          onChange={(event) =>
            setFilters((previous) => ({
              ...previous,
              search: event.target.value,
            }))
          }
          aria-label="Search registrations"
        />

        <select
          className="reqhist-select"
          value={filters.status}
          onChange={(event) =>
            setFilters((previous) => ({
              ...previous,
              status: event.target.value,
            }))
          }
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {REGISTRATION_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="reqhist-date">
          <DatePickerInput
            value={filters.dateFrom}
            onChange={(value) =>
              setFilters((previous) => ({ ...previous, dateFrom: value }))
            }
            ariaLabel="Registered from date"
          />
        </div>

        <span className="reqhist-date-separator">to</span>

        <div className="reqhist-date">
          <DatePickerInput
            value={filters.dateTo}
            onChange={(value) =>
              setFilters((previous) => ({ ...previous, dateTo: value }))
            }
            ariaLabel="Registered to date"
          />
        </div>

        <span className="reqhist-count">
          {visibleRegistrations.length} record
          {visibleRegistrations.length === 1 ? "" : "s"}
        </span>
      </div>

      {notice && (
        <p
          className={`approvals-notice${notice.isWarning ? " is-warning" : ""}`}
          role="status"
        >
          {notice.message}
        </p>
      )}

      {visibleRegistrations.length === 0 ? (
        <div className="approvals-empty">
          <p>No registrations match these filters.</p>
          <span>
            New resident registrations appear here until they are reviewed.
          </span>
        </div>
      ) : (
        <div className="approvals-list">
          {visibleRegistrations.map((registration) => (
            <RegistrationCard
              key={registration.id}
              registration={registration}
              isRetryingEmail={retryingId === registration.id}
              onView={() => setDetails(registration)}
              onApprove={() => openReview("approve", registration)}
              onReject={() => openReview("reject", registration)}
              onRetryEmail={() => void handleRetryEmail(registration)}
            />
          ))}
        </div>
      )}

      {details && (
        <RegistrationDetailsModal
          registration={details}
          onClose={() => setDetails(null)}
          onApprove={() => openReview("approve", details)}
          onReject={() => openReview("reject", details)}
        />
      )}

      {review && (
        <RegistrationReviewModal
          mode={review.mode}
          residentName={review.registration.name}
          isProcessing={isProcessing}
          error={reviewError}
          onCancel={() => setReview(null)}
          onConfirm={(reason) => void handleConfirmReview(reason)}
        />
      )}
    </>
  );
};

export default RegistrationApprovals;
