import "../AdminDashboard/AdminDashboard.css";
import "../AdminResidents/AdminResidents.css";
import "./AdminDocumentRequests.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../Utils/api";
import {
  fetchAdminDashboard,
  fetchAdminDocumentRequests,
} from "../../Utils/api";
import type { AdminDocumentRequest } from "../../Types/AdminDocumentRequestsType";
import { ADMIN_DISPLAY_NAME } from "../../Utils/AdminDisplay";
import AdminSidebar from "../../components/AdminDashboard/AdminSidebar";
import useResponsiveSidebar from "../../Utils/useResponsiveSidebar";
import AdminTopbar from "../../components/AdminDashboard/AdminTopbar";
import DocumentRequestsToolbar from "../../components/AdminDocumentRequests/DocumentRequestsToolbar";
import DocumentRequestsTable from "../../components/AdminDocumentRequests/DocumentRequestsTable";
import RequestDetailsView from "../../components/AdminDocumentRequests/RequestDetailsView";
import {
  DEFAULT_DOCUMENT_REQUESTS_FILTERS,
  filterDocumentRequests,
} from "../../Utils/AdminDocumentRequestsLogic";
import type { DocumentRequestsFiltersState } from "../../Utils/AdminDocumentRequestsLogic";

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
  onLogout: () => void;
};

const AdminDocumentRequests = ({
  unreadNotifications,
  onDashboard,
  onResidents,
  onRequestHistory,
  onApprovals,
  onDocumentManagement,
  onNotifications,
  onReports,
  onActivityLogs,
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

  const fullName = ADMIN_DISPLAY_NAME;
  const roleLabel = "Brgy. Administrator";

  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  return (
    <div className="admin-dashboard">
      <AdminSidebar
        pendingRequests={sidebarStats.pending}
        pendingApprovals={sidebarStats.pending}
        unreadNotifications={unreadNotifications}
        firstName={ADMIN_DISPLAY_NAME}
        lastName=""
        role={roleLabel}
        activeItem="document-requests"
        onDashboard={onDashboard}
        onResidents={onResidents}
        onDocumentRequests={() => undefined}
        onRequestHistory={onRequestHistory}
        onApprovals={onApprovals}
        onDocumentManagement={onDocumentManagement}
        onReports={onReports}
        onActivityLogs={onActivityLogs}
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
          role={roleLabel}
          unreadCount={unreadNotifications}
          onNotifications={onNotifications}
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

