import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { AdminRecentRequest } from "../../../Types/Admin/AdminDashboardType";
import {
  ADMIN_STATUS_FILTER_OPTIONS,
  formatShortDate,
  getAdminStatusClass,
  getAdminStatusLabel,
  matchesAdminStatusFilter,
  type AdminStatusFilter,
} from "../../../Utils/Admin/AdminDashboardLogic";
import useModalBehavior from "../AdminPotholeManagement/useModalBehavior";

type AdminRecentRequestsModalProps = {
  /** Latest requests (from GET /api/admin/dashboard). */
  requests: AdminRecentRequest[];
  /** Status shown in the list; the tabs inside the modal change it. */
  filter: AdminStatusFilter;
  onFilterChange: (filter: AdminStatusFilter) => void;
  onClose: () => void;
  /** Opens one request's details screen. */
  onOpenRequest: (requestNumber: string) => void;
  /** Opens the full Document Requests page. */
  onViewAll: () => void;
};

/**
 * Recent requests for one status, opened from the dashboard's status strip.
 * Tabs switch the status without closing; a row opens the request's details.
 */
const AdminRecentRequestsModal = ({
  requests,
  filter,
  onFilterChange,
  onClose,
  onOpenRequest,
  onViewAll,
}: AdminRecentRequestsModalProps) => {
  const dialogRef = useRef<HTMLElement | null>(null);
  useModalBehavior(dialogRef, onClose);

  // Keep the dashboard from scrolling behind the open modal.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const visibleRequests = useMemo(
    () =>
      requests.filter((request) =>
        matchesAdminStatusFilter(request.status, filter),
      ),
    [requests, filter],
  );

  const countFor = (key: AdminStatusFilter): number =>
    requests.filter((request) => matchesAdminStatusFilter(request.status, key))
      .length;

  return createPortal(
    <div
      className="admin-requests-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <section
        ref={dialogRef}
        className="admin-requests-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-requests-modal-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-requests-modal-header">
          <div>
            <h2 id="admin-requests-modal-title">Recent Requests</h2>
            <p>
              {visibleRequests.length}{" "}
              {filter === "all"
                ? `request${visibleRequests.length === 1 ? "" : "s"}`
                : `${getAdminStatusLabel(filter).toLowerCase()} request${
                    visibleRequests.length === 1 ? "" : "s"
                  }`}
            </p>
          </div>

          <button
            type="button"
            className="admin-requests-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>

        <div
          className="admin-requests-modal-tabs"
          role="group"
          aria-label="Filter by status"
        >
          {ADMIN_STATUS_FILTER_OPTIONS.map((option) => {
            const isActive = filter === option.key;

            return (
              <button
                key={option.key}
                type="button"
                className={`admin-requests-modal-tab${isActive ? " is-active" : ""}`}
                aria-pressed={isActive}
                onClick={() => onFilterChange(option.key)}
              >
                {option.label}
                <span className="admin-requests-modal-tab-count">
                  {countFor(option.key)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="admin-requests-modal-body">
          {visibleRequests.length === 0 ? (
            <p className="admin-requests-modal-empty">
              {filter === "all"
                ? "No document requests yet."
                : `No recent requests with the “${getAdminStatusLabel(filter)}” status.`}
            </p>
          ) : (
            <ul className="admin-requests-modal-list">
              {visibleRequests.map((request) => (
                <li key={request.request_number}>
                  <button
                    type="button"
                    className="admin-request-card"
                    onClick={() => onOpenRequest(request.request_number)}
                    aria-label={`Open request ${request.request_number} from ${request.resident_name}`}
                  >
                    <span className="admin-request-card-top">
                      <span className="admin-request-id">
                        {request.request_number}
                      </span>
                      <span
                        className={`admin-status-pill ${getAdminStatusClass(
                          request.status,
                        )}`}
                      >
                        {getAdminStatusLabel(request.status)}
                      </span>
                    </span>

                    <span className="admin-request-card-resident">
                      {request.resident_name}
                    </span>

                    <span className="admin-request-card-meta">
                      {request.document}
                      <span aria-hidden="true"> · </span>
                      <time dateTime={request.submitted_at}>
                        {formatShortDate(request.submitted_at)}
                      </time>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="admin-requests-modal-footer">
          <button
            type="button"
            className="admin-requests-modal-view-all"
            onClick={onViewAll}
          >
            View all in Document Requests
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
};

export default AdminRecentRequestsModal;
