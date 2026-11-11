import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  CircleAlert,
  Clock,
  ListChecks,
  Loader2,
  MapPin,
  MessageSquareText,
  PackageCheck,
  X,
} from "lucide-react";
import {
  ApiError,
  fetchRequestDetail,
  type RequestDetail,
} from "../../../Utils/Shared/api";
import { getStatusClass } from "../../../Utils/Resident/DashboardLogic";
import { formatPickupTime } from "../../../Utils/Shared/pickupTime";
import {
  formatManilaDateTime,
  formatPickupDate,
} from "../../../Utils/Shared/manilaTime";
import type { RequestStatus } from "../../../Types/Resident/DashboardType";
import "../../../Styles/Resident/Components/RequestDetailsModal.css";
import "../../../Styles/Resident/Components/PickupDetailsModal.css";

type PickupDetailsModalProps = {
  /** Database ID of the request (the notification's related_request_id). */
  requestId: number;
  onClose: () => void;
  /** Called when the session has expired (HTTP 401). */
  onSessionExpired?: () => void;
};

/** Status changes shown in the Request Summary, in workflow order. */
const MILESTONES: { status: RequestStatus; label: string }[] = [
  { status: "Approved", label: "Approved" },
  { status: "Processing", label: "Marked as Processing" },
  { status: "Ready for Pickup", label: "Marked as Ready for Pickup" },
];

/** When the request last entered `status` (from its real status history). */
const lastChangeTo = (detail: RequestDetail, status: string): string | null => {
  for (let index = detail.history.length - 1; index >= 0; index -= 1) {
    if (detail.history[index].new_status === status) {
      return detail.history[index].changed_at;
    }
  }
  return null;
};

const StatusBadge = ({ status }: { status: string }) => (
  <span className={`request-status ${getStatusClass(status as RequestStatus)}`}>
    {status}
  </span>
);

/**
 * "Document Pickup Details": everything a resident needs before collecting a
 * document. Always loads the latest saved request from the API (owner-only
 * endpoint), so an updated pickup schedule is shown as soon as it is opened.
 */
const PickupDetailsModal = ({
  requestId,
  onClose,
  onSessionExpired,
}: PickupDetailsModalProps) => {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  // Kept in a ref so a new callback identity from the parent (which re-renders
  // every minute) never reloads the details.
  const sessionExpiredRef = useRef(onSessionExpired);

  useEffect(() => {
    sessionExpiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError("");

      try {
        const data = await fetchRequestDetail(requestId);
        if (!cancelled) setDetail(data);
      } catch (loadError) {
        if (cancelled) return;
        if (loadError instanceof ApiError && loadError.status === 401) {
          sessionExpiredRef.current?.();
          return;
        }
        setError(
          loadError instanceof ApiError && loadError.status === 404
            ? "This request is no longer available. It may have been removed."
            : loadError instanceof ApiError
              ? loadError.message
              : "Could not load the pickup details. Please try again.",
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const pickupTime = formatPickupTime(detail?.pickup_time);
  const remarks = detail?.admin_remarks?.trim();
  const milestones = detail
    ? MILESTONES.map((milestone) => ({
        ...milestone,
        at: lastChangeTo(detail, milestone.status),
      })).filter((milestone) => milestone.at !== null)
    : [];

  return createPortal(
    <div
      className="request-details-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="request-details-modal pickup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pickup-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="request-details-header">
          <div className="pickup-modal-heading">
            <span className="pickup-modal-icon" aria-hidden="true">
              <PackageCheck size={22} strokeWidth={1.9} />
            </span>
            <div>
              <h2 id="pickup-modal-title">Document Pickup Details</h2>
              {detail && (
                <p className="pickup-modal-subtitle">
                  Request {detail.request_number}
                </p>
              )}
            </div>
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
            Loading pickup details…
          </p>
        )}

        {error && (
          <p className="request-details-error" role="alert">
            {error}
          </p>
        )}

        {detail && (
          <div className="request-details-body pickup-modal-body">
            {/* ------------------------- Pickup Information ------------------------- */}
            <section
              className="pickup-modal-section"
              aria-labelledby="pickup-info-title"
            >
              <h3 id="pickup-info-title" className="pickup-modal-section-title">
                Pickup Information
              </h3>

              <div
                className={`pickup-schedule-card${
                  detail.pickup_date ? "" : " is-pending"
                }`}
              >
                <div className="pickup-schedule-top">
                  <span className="pickup-schedule-label">Pickup schedule</span>
                  <StatusBadge status={detail.status} />
                </div>

                {detail.pickup_date ? (
                  <>
                    <p className="pickup-schedule-date">
                      <CalendarDays size={20} strokeWidth={2} aria-hidden="true" />
                      <span>{formatPickupDate(detail.pickup_date, "long")}</span>
                    </p>
                    <p className="pickup-schedule-time">
                      <Clock size={18} strokeWidth={2} aria-hidden="true" />
                      {pickupTime ? (
                        <span>
                          {pickupTime}{" "}
                          <span className="pickup-schedule-zone">
                            Philippine time
                          </span>
                        </span>
                      ) : (
                        <span className="pickup-schedule-missing">
                          Time to be confirmed by the Barangay office
                        </span>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="pickup-schedule-pending">
                    <CircleAlert size={18} strokeWidth={2} aria-hidden="true" />
                    <span>
                      The pickup date and time have not been set yet. The
                      Barangay office will confirm your schedule.
                    </span>
                  </p>
                )}

                {detail.pickup_location && (
                  <p className="pickup-schedule-location">
                    <MapPin size={18} strokeWidth={2} aria-hidden="true" />
                    <span>{detail.pickup_location}</span>
                  </p>
                )}
              </div>

              {detail.status !== "Ready for Pickup" && (
                <p className="pickup-modal-note">
                  This request is now <strong>{detail.status}</strong>.
                </p>
              )}

              {detail.pickup_instructions.length > 0 && (
                <div className="pickup-modal-block">
                  <h4>
                    <ListChecks size={16} strokeWidth={2} aria-hidden="true" />
                    Pickup instructions
                  </h4>
                  <ul className="pickup-instructions">
                    {detail.pickup_instructions.map((instruction) => (
                      <li key={instruction}>{instruction}</li>
                    ))}
                  </ul>
                </div>
              )}

              {remarks && (
                <div className="pickup-modal-block">
                  <h4>
                    <MessageSquareText size={16} strokeWidth={2} aria-hidden="true" />
                    Remarks from the Barangay office
                  </h4>
                  <p className="request-details-remarks">{remarks}</p>
                </div>
              )}
            </section>

            {/* ------------------------- Request Information ------------------------ */}
            <section
              className="pickup-modal-section"
              aria-labelledby="pickup-request-title"
            >
              <h3 id="pickup-request-title" className="pickup-modal-section-title">
                Request Information
              </h3>
              <dl className="request-details-facts pickup-modal-facts">
                <div className="request-details-fact">
                  <dt>Request ID</dt>
                  <dd className="pickup-modal-mono">{detail.request_number}</dd>
                </div>
                <div className="request-details-fact">
                  <dt>Document type</dt>
                  <dd>{detail.document}</dd>
                </div>
                {detail.resident_name && (
                  <div className="request-details-fact">
                    <dt>Resident name</dt>
                    <dd>{detail.resident_name}</dd>
                  </div>
                )}
                <div className="request-details-fact">
                  <dt>Submitted</dt>
                  <dd>{formatManilaDateTime(detail.submitted_at)}</dd>
                </div>
                <div className="request-details-fact">
                  <dt>Current status</dt>
                  <dd>
                    <StatusBadge status={detail.status} />
                  </dd>
                </div>
              </dl>
            </section>

            {/* --------------------------- Request Summary -------------------------- */}
            <section
              className="pickup-modal-section"
              aria-labelledby="pickup-summary-title"
            >
              <h3 id="pickup-summary-title" className="pickup-modal-section-title">
                Request Summary
              </h3>
              <ol className="request-details-timeline">
                <li className={milestones.length === 0 ? "latest" : ""}>
                  <span className="timeline-dot" aria-hidden="true"></span>
                  <div className="timeline-content">
                    <strong>Submitted</strong>
                    <time dateTime={detail.submitted_at}>
                      {formatManilaDateTime(detail.submitted_at)}
                    </time>
                  </div>
                </li>
                {milestones.map((milestone, index) => (
                  <li
                    key={milestone.status}
                    className={index === milestones.length - 1 ? "latest" : ""}
                  >
                    <span className="timeline-dot" aria-hidden="true"></span>
                    <div className="timeline-content">
                      <strong>{milestone.label}</strong>
                      <time dateTime={milestone.at ?? undefined}>
                        {formatManilaDateTime(milestone.at ?? "")}
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="pickup-modal-footnote">
                Times are shown in Philippine time (Asia/Manila).
              </p>
            </section>
          </div>
        )}

        <footer className="pickup-modal-footer">
          <button type="button" className="pickup-modal-close" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
};

export default PickupDetailsModal;
