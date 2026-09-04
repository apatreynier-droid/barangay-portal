import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ApiError,
  fetchRequestDetail,
  type RequestDetail,
} from "../../Utils/api";
import { getStatusClass } from "../../Utils/DashboardLogic";
import type { Request } from "../../Types/DashboardType";
import "./RequestDetailsModal.css";
import filesIcon from "../../assets/icons/files.png";

type RequestDetailsModalProps = {
  request: Request;
  onClose: () => void;
};

const formatDateTime = (value: string): string => {
  const date = new Date(value + "Z");

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
            <p className="request-details-label">Request details</p>
            <h2 id="request-details-title">{request.id}</h2>
          </div>

          <button
            type="button"
            className="request-details-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {isLoading && (
          <p className="request-details-loading">
            Loading details from the database…
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
              <div className="request-details-document">
                <div className="document-icon">
                  <img src={filesIcon} alt="" />
                </div>
                <div>
                  <h3>{detail.document}</h3>
                  <span>Reference No. {detail.request_number}</span>
                </div>
              </div>

              <span
                className={`request-status ${getStatusClass(detail.status as Request["status"])}`}
              >
                {detail.status}
              </span>
            </div>

            <dl className="request-details-grid">
              <div className="request-details-item">
                <dt>Request type</dt>
                <dd>{detail.document}</dd>
              </div>

              <div className="request-details-item">
                <dt>Status</dt>
                <dd>{detail.status}</dd>
              </div>

              <div className="request-details-item">
                <dt>Submitted</dt>
                <dd>{formatDateTime(detail.submitted_at)}</dd>
              </div>

              <div className="request-details-item">
                <dt>Last updated</dt>
                <dd>{formatDateTime(detail.last_updated)}</dd>
              </div>

              <div className="request-details-item">
                <dt>Pickup date</dt>
                <dd>
                  {detail.pickup_date
                    ? new Date(detail.pickup_date).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "To be scheduled"}
                </dd>
              </div>

              <div className="request-details-item">
                <dt>Admin remarks</dt>
                <dd>{detail.admin_remarks ?? "None yet"}</dd>
              </div>
            </dl>

            <div className="request-details-purpose">
              <h4>Purpose of request</h4>
              <p>{detail.purpose}</p>
            </div>

            <div className="request-details-history">
              <h4>Status history</h4>

              {detail.history.length === 0 ? (
                <p className="request-details-history-empty">
                  No status updates recorded yet.
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
                            ? `${entry.old_status} → ${entry.new_status}`
                            : entry.new_status}
                        </strong>
                        <time>{formatDateTime(entry.changed_at)}</time>
                        {entry.remarks && <p>{entry.remarks}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default RequestDetailsModal;
