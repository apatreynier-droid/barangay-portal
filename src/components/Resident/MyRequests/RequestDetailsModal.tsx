import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Loader2, X } from "lucide-react";
import {
  ApiError,
  fetchRequestDetail,
  type RequestDetail,
} from "../../../Utils/Shared/api";
import { getStatusClass } from "../../../Utils/Resident/DashboardLogic";
import type { Request } from "../../../Types/Resident/DashboardType";
import "../../../Styles/Resident/Components/RequestDetailsModal.css";

type RequestDetailsModalProps = {
  request: Request;
  onClose: () => void;
};

// Same rule as the Notifications page: the backend sends UTC timestamps
// without a zone marker, and residents read them in Philippine time.
const PHILIPPINE_TIMEZONE = "Asia/Manila";

const parseUtcTimestamp = (value: string): Date => {
  const trimmed = value.trim().replace(" ", "T");

  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return new Date(trimmed);
  }

  return new Date(`${trimmed}Z`);
};

const formatDateTime = (value: string): string => {
  const date = parseUtcTimestamp(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: PHILIPPINE_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

// Pickup dates are plain calendar dates ("2026-11-05"), so they are shown
// as-is without shifting them through a timezone.
const formatPickupDate = (value: string): string => {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = isDateOnly
    ? new Date(`${value}T00:00:00Z`)
    : parseUtcTimestamp(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: isDateOnly ? "UTC" : PHILIPPINE_TIMEZONE,
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const RequestDetailsModal = ({
  request,
  onClose,
}: RequestDetailsModalProps) => {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadDetail = async () => {
      setIsLoading(true);
      setError("");

      try {
        const data = await fetchRequestDetail(request.numericId);

        if (!cancelled) {
          setDetail(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof ApiError
              ? loadError.message
              : "Could not load the request details.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [request.numericId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const remarks = detail?.admin_remarks?.trim();

  return createPortal(
    <div
      className="request-details-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="request-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="request-details-header">
          <div>
            <p className="request-details-label">Request</p>
            <h2 id="request-details-title">{request.id}</h2>
          </div>

          <button
            type="button"
            className="request-details-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>

        {isLoading && (
          <p className="request-details-loading" role="status">
            <Loader2
              className="request-details-spinner"
              size={18}
              strokeWidth={2}
              aria-hidden="true"
            />
            Loading details…
          </p>
        )}

        {error && (
          <p className="request-details-error" role="alert">
            {error}
          </p>
        )}

        {detail && (
          <div className="request-details-body">
            <div className="request-details-summary">
              <span className="request-details-doc-icon" aria-hidden="true">
                <FileText size={22} strokeWidth={1.9} />
              </span>
              <h3>{detail.document}</h3>
              <span
                className={`request-status ${getStatusClass(
                  detail.status as Request["status"],
                )}`}
              >
                {detail.status}
              </span>
            </div>

            <dl className="request-details-facts">
              <div className="request-details-fact">
                <dt>Submitted</dt>
                <dd>{formatDateTime(detail.submitted_at)}</dd>
              </div>

              <div className="request-details-fact">
                <dt>Last updated</dt>
                <dd>{formatDateTime(detail.last_updated)}</dd>
              </div>

              <div className="request-details-fact">
                <dt>Pickup</dt>
                {detail.pickup_date ? (
                  <dd>{formatPickupDate(detail.pickup_date)}</dd>
                ) : (
                  <dd className="is-empty">Not scheduled yet</dd>
                )}
              </div>
            </dl>

            <section className="request-details-section">
              <h4>Purpose</h4>
              <p className="request-details-purpose">{detail.purpose}</p>
            </section>

            {remarks && (
              <section className="request-details-section">
                <h4>Note from the barangay hall</h4>
                <p className="request-details-remarks">{remarks}</p>
              </section>
            )}

            <section className="request-details-section">
              <h4>History</h4>

              {detail.history.length === 0 ? (
                <p className="request-details-history-empty">
                  No status changes yet.
                </p>
              ) : (
                <ol className="request-details-timeline">
                  {detail.history.map((entry, index) => (
                    <li
                      key={`${entry.changed_at}-${index}`}
                      className={
                        index === detail.history.length - 1 ? "latest" : ""
                      }
                    >
                      <span className="timeline-dot" aria-hidden="true"></span>
                      <div className="timeline-content">
                        <strong>
                          {entry.old_status
                            ? `${entry.old_status} - ${entry.new_status}`
                            : entry.new_status}
                        </strong>
                        <time dateTime={entry.changed_at}>
                          {formatDateTime(entry.changed_at)}
                        </time>
                        {entry.remarks && <p>{entry.remarks}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default RequestDetailsModal;
