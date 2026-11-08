import "../../../Styles/Admin/Pages/AdminDashboard.css";
import "../../../Styles/Admin/Pages/AdminResidents.css";
import "../../../Styles/Admin/Pages/AdminDocumentRequests.css";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { AuthUser } from "../../../Utils/Shared/api";
import {
  fetchAdminDashboard,
  fetchAdminDocumentRequests,
} from "../../../Utils/Shared/api";
import type { AdminDocumentRequest } from "../../../Types/Admin/AdminDocumentRequestsType";
import { getPortalProfileName } from "../../../Utils/Admin/AdminDisplay";
import {
  ADMIN_DOCUMENT_REQUESTS_PATH,
  isAdministrator,
} from "../../../Utils/Shared/routePaths";
import AdminSidebar from "../../../components/Admin/AdminDashboard/AdminSidebar";
import useResponsiveSidebar from "../../../Utils/Shared/useResponsiveSidebar";
import AdminTopbar from "../../../components/Admin/AdminDashboard/AdminTopbar";
import DocumentRequestsToolbar from "../../../components/Admin/AdminDocumentRequests/DocumentRequestsToolbar";
import DocumentRequestsTable from "../../../components/Admin/AdminDocumentRequests/DocumentRequestsTable";
import RequestDetailsView from "../../../components/Admin/AdminDocumentRequests/RequestDetailsView";
import {
  DEFAULT_DOCUMENT_REQUESTS_FILTERS,
  filterDocumentRequests,
} from "../../../Utils/Admin/AdminDocumentRequestsLogic";
import type { DocumentRequestsFiltersState } from "../../../Utils/Admin/AdminDocumentRequestsLogic";

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
  const [sidebarStats, setSidebarStats] = useState({
    pending: 0,
    approved: 0,
    pendingRegistrations: 0,
  });

  /**
   * Deep link from the dashboard ({ state: { requestNumber } }): the matching
   * request opens once the list loads, then the state is cleared so
   * back/forward or a remount never reopens it.
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
            pendingRegistrations: data.stats.pending_registrations,
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

  /**
   * The details view replaces the list in place, so filters survive. The
   * scroll position is saved so "Back to Request" returns to the same spot.
   */
  const listScrollY = useRef<number | null>(null);

  const openRequestDetails = (requestId: number) => {
    listScrollY.current = window.scrollY;
    setSelectedRequestId(requestId);
    window.scrollTo({ top: 0 });
  };

  const backToRequestList = () => {
    setSelectedRequestId(null);
  };

  // Layout effect: restore before paint so the list never flashes at the top.
  useLayoutEffect(() => {
    if (selectedRequestId === null && listScrollY.current !== null) {
      window.scrollTo({ top: listScrollY.current });
      listScrollY.current = null;
    }
  }, [selectedRequestId]);

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
        pendingApprovals={
          sidebarStats.pending + sidebarStats.pendingRegistrations
        }
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
            onBack={backToRequestList}
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
                onView={(request) => openRequestDetails(request.id)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default AdminDocumentRequests;

