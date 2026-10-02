import "../AdminDashboard/AdminDashboard.css";
import "../AdminResidents/AdminResidents.css";
import "./AdminRequestHistory.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../Utils/api";
import {
  fetchAdminDashboard,
  fetchAdminRequestHistory,
} from "../../Utils/api";
import type { AdminRequestHistoryEntry } from "../../Types/AdminRequestHistoryType";
import {
  ADMIN_DISPLAY_NAME,
  getPortalProfileName,
} from "../../Utils/AdminDisplay";
import AdminSidebar from "../../components/AdminDashboard/AdminSidebar";
import useResponsiveSidebar from "../../Utils/useResponsiveSidebar";
import AdminTopbar from "../../components/AdminDashboard/AdminTopbar";
import {
  DEFAULT_ADMIN_REQUEST_HISTORY_FILTERS,
  REQUEST_HISTORY_STATUS_OPTIONS,
  filterAdminRequestHistory,
  formatHistoryDateTime,
  getRequestDisplayId,
  getRequestHistoryStatusMeta,
  getUniqueHistoryDocuments,
} from "../../Utils/AdminRequestHistoryLogic";
import type { AdminRequestHistoryFiltersState } from "../../Utils/AdminRequestHistoryLogic";
import DatePickerInput from "../../components/Shared/DatePickerInput";
import "../../components/Shared/DatePickerInput.css";

type AdminRequestHistoryProps = {
  user: AuthUser;
  unreadNotifications: number;
  onDashboard: () => void;
  onResidents: () => void;
  onDocumentRequests: () => void;
  onApprovals: () => void;
  onDocumentManagement: () => void;
  onNotifications: () => void;
  onReports: () => void;
  onActivityLogs: () => void;
  onUserManagement: () => void;
  onLogout: () => void;
};

const AdminRequestHistory = ({
  user,
  unreadNotifications,
  onDashboard,
  onResidents,
  onDocumentRequests,
  onApprovals,
  onDocumentManagement,
  onNotifications,
  onReports,
  onActivityLogs,
  onUserManagement,
  onLogout,
}: AdminRequestHistoryProps) => {
  const [requests, setRequests] = useState<AdminRequestHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<AdminRequestHistoryFiltersState>(
    DEFAULT_ADMIN_REQUEST_HISTORY_FILTERS,
  );
  const [sidebarStats, setSidebarStats] = useState({ pending: 0, approved: 0 });

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      setRequests(await fetchAdminRequestHistory());
    } catch {
      setError("Could not load the request history. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Sidebar badges stay consistent with the dashboard without blocking the page.
  useEffect(() => {
    let cancelled = false;

    fetchAdminDashboard()
      .then((data) => {
        if (!cancelled) {
          setSidebarStats({
            pending: data.stats.pending,
            approved: data.stats.approved,
          });
        }
      })
      .catch(() => {
        // Badges are optional here; the request history still loads.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRequests = useMemo(
    () => filterAdminRequestHistory(requests, filters),
    [requests, filters],
  );

  const documentOptions = useMemo(
    () => getUniqueHistoryDocuments(requests),
    [requests],
  );

  const fullName = getPortalProfileName(user);

  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  return (
    <div className="admin-dashboard">
      <AdminSidebar
        pendingRequests={sidebarStats.pending}
        pendingApprovals={sidebarStats.pending}
        unreadNotifications={unreadNotifications}
        user={user}
        activeItem="request-history"
        onDashboard={onDashboard}
        onResidents={onResidents}
        onDocumentRequests={onDocumentRequests}
        onApprovals={onApprovals}
        onDocumentManagement={onDocumentManagement}
        onReports={onReports}
        onActivityLogs={onActivityLogs}
        onUserManagement={onUserManagement}
        onNotifications={onNotifications}
        onLogout={onLogout}
        isOpen={isDrawerOpen}
        onNavigate={closeDrawer}
      />

      {isDrawerOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={closeDrawer}
        />
      )}

      <main className="admin-main">
        <AdminTopbar
          fullName={fullName || "Administrator"}
          onMenuToggle={toggleDrawer}
          title="Request History"
          subtitle="Complete record of all document requests."
        />

        {error && (
          <div className="admin-error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadHistory()}>
              Retry
            </button>
          </div>
        )}

        <div className="reqhist-toolbar">
          <input
            type="search"
            className="reqhist-search"
            placeholder="Search by name, ID, or ref"
            value={filters.search}
            onChange={(event) =>
              setFilters((previous) => ({
                ...previous,
                search: event.target.value,
              }))
            }
            aria-label="Search request history"
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
            <option value="all">All</option>
            {REQUEST_HISTORY_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            className="reqhist-select"
            value={filters.document}
            onChange={(event) =>
              setFilters((previous) => ({
                ...previous,
                document: event.target.value,
              }))
            }
            aria-label="Filter by document type"
          >
            <option value="all">All</option>
            {documentOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <div className="reqhist-date">
            <DatePickerInput
              value={filters.dateFrom}
              onChange={(value) =>
                setFilters((previous) => ({
                  ...previous,
                  dateFrom: value,
                }))
              }
              ariaLabel="Submitted from date"
            />
          </div>

          <span className="reqhist-date-separator">to</span>

          <div className="reqhist-date">
            <DatePickerInput
              value={filters.dateTo}
              onChange={(value) =>
                setFilters((previous) => ({
                  ...previous,
                  dateTo: value,
                }))
              }
              ariaLabel="Submitted to date"
            />
          </div>

          <span className="reqhist-count">
            {filteredRequests.length} records
          </span>
        </div>

        {isLoading && requests.length === 0 ? (
          <p className="admin-loading-state">Loading the request history…</p>
        ) : (
          <div className="reqhist-table-wrapper">
            <table className="reqhist-table">
              <thead>
                <tr>
                  <th scope="col">Request ID</th>
                  <th scope="col">Reference No.</th>
                  <th scope="col">Resident</th>
                  <th scope="col">Document Type</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Status</th>
                  <th scope="col">Processed By</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="reqhist-empty">
                      No requests match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((request) => {
                    const statusMeta = getRequestHistoryStatusMeta(
                      request.status,
                    );

                    return (
                      <tr key={request.id}>
                        <td className="reqhist-request-id">
                          {getRequestDisplayId(request.id)}
                        </td>
                        <td className="reqhist-reference">
                          {request.request_number}
                        </td>
                        <td className="reqhist-resident">
                          {request.resident_name}
                        </td>
                        <td className="reqhist-document" title={request.document}>
                          {request.document}
                        </td>
                        <td className="reqhist-submitted">
                          {formatHistoryDateTime(request.submitted_at)}
                        </td>
                        <td>
                          <span
                            className={`reqhist-status ${statusMeta.className}`}
                          >
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="reqhist-processed">
                          {request.processed_by ? ADMIN_DISPLAY_NAME : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminRequestHistory;
