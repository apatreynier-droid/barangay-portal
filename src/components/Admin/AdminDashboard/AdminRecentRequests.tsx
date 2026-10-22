import { useMemo } from "react";
import type { AdminRecentRequest } from "../../../Types/Admin/AdminDashboardType";
import {
  formatRelativeTime,
  formatShortDate,
  getAdminStatusClass,
  getAdminStatusLabel,
  matchesAdminStatusFilter,
  type AdminStatusFilter,
} from "../../../Utils/Admin/AdminDashboardLogic";

type AdminRecentRequestsProps = {
  requests: AdminRecentRequest[];
  /** Active status filter from the dashboard's status strip. */
  statusFilter: AdminStatusFilter;
  /** Opens the full Document Requests page (the existing "view all" target). */
  onViewAll: () => void;
  /**
   * Opens the existing request-details screen for one request (deep-linked
   * through the Document Requests page).
   */
  onOpenRequest: (requestNumber: string) => void;
  /** Clears the status strip filter (used by the filtered empty state). */
  onClearFilter: () => void;
};

/**
 * Latest document requests. On phones each request renders as a compact,
 * fully readable card (request number on one line, resident, document +
 * date, status badge on the right); on wider screens the classic table is
 * kept, now including the submitted date and a request-number button that
 * opens the same details screen as the mobile cards.
 */
const AdminRecentRequests = ({
  requests,
  statusFilter,
  onViewAll,
  onOpenRequest,
  onClearFilter,
}: AdminRecentRequestsProps) => {
  const visibleRequests = useMemo(
    () =>
      requests.filter((request) =>
        matchesAdminStatusFilter(request.status, statusFilter),
      ),
    [requests, statusFilter],
  );

  const filterLabel = getAdminStatusLabel(statusFilter);

  return (
    <section className="admin-panel admin-recent-requests">
      <div className="admin-panel-header">
        <h3 className="admin-panel-title">Recent Requests</h3>

        {requests.length > 0 && (
          <button
            type="button"
            className="admin-panel-link"
            onClick={onViewAll}
          >
            View all
          </button>
        )}
      </div>

      {requests.length === 0 ? (
        <p className="admin-empty-note">No document requests yet.</p>
      ) : (
        <>
          {/* Mobile: readable request cards replace the desktop table. */}
          <ul className="admin-request-cards">
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

          {/* Tablet/desktop: the existing table, with the submitted date. */}
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Resident</th>
                  <th>Document</th>
                  <th>Submitted</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {visibleRequests.map((request) => (
                  <tr key={request.request_number}>
                    <td>
                      <button
                        type="button"
                        className="admin-request-link"
                        onClick={() => onOpenRequest(request.request_number)}
                        aria-label={`Open request ${request.request_number} from ${request.resident_name}`}
                      >
                        {request.request_number}
                      </button>
                    </td>
                    <td>{request.resident_name}</td>
                    <td>{request.document}</td>
                    <td>{formatShortDate(request.submitted_at)}</td>
                    <td>
                      <span
                        className={`admin-status-pill ${getAdminStatusClass(
                          request.status,
                        )}`}
                      >
                        {getAdminStatusLabel(request.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visibleRequests.length === 0 && (
            <div className="admin-filter-empty">
              <p className="admin-empty-note">
                No recent requests with the “{filterLabel}” status.
              </p>
              <button
                type="button"
                className="admin-panel-link"
                onClick={onClearFilter}
              >
                Show all requests
              </button>
            </div>
          )}
        </>
      )}

      {requests.length > 0 && (
        <p className="admin-table-footnote">
          Latest update {formatRelativeTime(requests[0].submitted_at)}
        </p>
      )}
    </section>
  );
};

export default AdminRecentRequests;
