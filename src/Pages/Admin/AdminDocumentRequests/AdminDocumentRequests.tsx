import "../../../Styles/Admin/Pages/AdminDashboard.css";
import "../../../Styles/Admin/Pages/AdminResidents.css";
import "../../../Styles/Admin/Pages/AdminDocumentRequests.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { AuthUser } from "../../../Utils/api";
import {
  fetchAdminDashboard,
  fetchAdminDocumentRequests,
} from "../../../Utils/api";
import type { AdminDocumentRequest } from "../../../Types/AdminDocumentRequestsType";
import { getPortalProfileName } from "../../../Utils/AdminDisplay";
import {
  ADMIN_DOCUMENT_REQUESTS_PATH,
  isAdministrator,
} from "../../../Utils/routePaths";
import AdminSidebar from "../../../components/Admin/AdminDashboard/AdminSidebar";
import useResponsiveSidebar from "../../../Utils/useResponsiveSidebar";
import AdminTopbar from "../../../components/Admin/AdminDashboard/AdminTopbar";
import DocumentRequestsToolbar from "../../../components/Admin/AdminDocumentRequests/DocumentRequestsToolbar";
import DocumentRequestsTable from "../../../components/Admin/AdminDocumentRequests/DocumentRequestsTable";
import RequestDetailsView from "../../../components/Admin/AdminDocumentRequests/RequestDetailsView";
import {
  DEFAULT_DOCUMENT_REQUESTS_FILTERS,
  filterDocumentRequests,
} from "../../../Utils/AdminDocumentRequestsLogic";
import type { DocumentRequestsFiltersState } from "../../../Utils/AdminDocumentRequestsLogic";

type AdminDocumentRequestsProps = {
  user: AuthUser;
  unreadNotifications: number;
  onDashboard: () => void;
  onResidents: () => void;
  onRequestHistory: () => void;
  onApprovals: () => void;
  onDocumentManagement: () => void;
  onNotifications: () => void;
  onReports: () => void;
  onActivityLogs: () => void;
  onUserManagement: () => void;
  onLogout: () => void;
};

const AdminDocumentRequests = ({
  user,
  unreadNotifications,
  onDashboard,
  onResidents,
  onRequestHistory,
  onApprovals,
  onDocumentManagement,
  onNotifications,
  onReports,
  onActivityLogs,
  onUserManagement,
  onLogout,
}: AdminDocumentRequestsProps) => {
  const [requests, setRequests] = useState<AdminDocumentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<DocumentRequestsFiltersState>(
    DEFAULT_DOCUMENT_REQUESTS_FILTERS,
  );
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(
    null,
  );
  const [sidebarStats, setSidebarStats] = useState({ pending: 0, approved: 0 });

  /**
   * Deep link from the Admin Dashboard's Recent Requests list: the dashboard
   * navigates here with { state: { requestNumber } }, and once the list is
   * loaded the matching request opens directly in the details view. The
   * state is cleared immediately afterwards so a browser back/forward or a
   * remount never reopens a stale request.
   */
  const location = useLocation();
  const navigate = useNavigate();
  const pendingRequestNumber =
    (location.state as { requestNumber?: string } | null)?.requestNumber ??
    null;

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      setRequests(await fetchAdminDocumentRequests());
    } catch {
      setError("Could not load the document requests. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  // Open the deep-linked request once the list has loaded (see above).
  useEffect(() => {
    if (pendingRequestNumber === null || requests.length === 0) {
      return;
    }

    const match = requests.find(
      (request) => request.request_number === pendingRequestNumber,
    );

    if (match) {
      setSelectedRequestId(match.id);
    }

    navigate(ADMIN_DOCUMENT_REQUESTS_PATH, { replace: true, state: null });
  }, [pendingRequestNumber, requests, navigate]);

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
        // Badges are optional here; the requests list still loads.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRequests = useMemo(
    () => filterDocumentRequests(requests, filters),
    [requests, filters],
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
        activeItem="document-requests"
        onDashboard={onDashboard}
        onResidents={onResidents}
        onDocumentRequests={() => undefined}
        onRequestHistory={onRequestHistory}
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
          title="Document Requests"
          subtitle="Review and process document requests."
        />

        {error && (
          <div className="admin-error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadRequests()}>
              Retry
            </button>
          </div>
        )}

        {selectedRequestId !== null ? (
          <RequestDetailsView
            requestId={selectedRequestId}
            canReview={isAdministrator(user)}
            onBack={() => setSelectedRequestId(null)}
            onChanged={() => void loadRequests()}
          />
        ) : (
          <>
            <DocumentRequestsToolbar
              requests={requests}
              search={filters.search}
              status={filters.status}
              document={filters.document}
              resultCount={filteredRequests.length}
              totalCount={requests.length}
              onSearchChange={(search) =>
                setFilters((previous) => ({ ...previous, search }))
              }
              onStatusChange={(status) =>
                setFilters((previous) => ({ ...previous, status }))
              }
              onDocumentChange={(document) =>
                setFilters((previous) => ({ ...previous, document }))
              }
            />

            {isLoading && requests.length === 0 ? (
              <p className="admin-loading-state">
                Loading the document requests…
              </p>
            ) : (
              <DocumentRequestsTable
                requests={filteredRequests}
                onView={(request) => setSelectedRequestId(request.id)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default AdminDocumentRequests;

