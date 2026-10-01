import "../AdminDashboard/AdminDashboard.css";
import "../AdminResidents/AdminResidents.css";
import "./AdminApprovals.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../Utils/api";
import { fetchAdminDocumentRequests } from "../../Utils/api";
import type { AdminDocumentRequest } from "../../Types/AdminDocumentRequestsType";
import { getPortalProfileName } from "../../Utils/AdminDisplay";
import AdminSidebar from "../../components/AdminDashboard/AdminSidebar";
import AdminTopbar from "../../components/AdminDashboard/AdminTopbar";
import useResponsiveSidebar from "../../Utils/useResponsiveSidebar";
import ApprovalRequestCard from "../../components/AdminApprovals/ApprovalRequestCard";
import {
  getPendingApprovals,
  removeRequestById,
} from "../../Utils/AdminApprovalsLogic";

type AdminApprovalsProps = {
  user: AuthUser;
  unreadNotifications: number;
  onDashboard: () => void;
  onResidents: () => void;
  onDocumentRequests: () => void;
  onRequestHistory: () => void;
  onDocumentManagement: () => void;
  onNotifications: () => void;
  onReports: () => void;
  onActivityLogs: () => void;
  onUserManagement: () => void;
  onLogout: () => void;
};

const AdminApprovals = ({
  user,
  unreadNotifications,
  onDashboard,
  onResidents,
  onDocumentRequests,
  onRequestHistory,
  onDocumentManagement,
  onNotifications,
  onReports,
  onActivityLogs,
  onUserManagement,
  onLogout,
}: AdminApprovalsProps) => {
  const [requests, setRequests] = useState<AdminDocumentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      setRequests(await fetchAdminDocumentRequests());
    } catch {
      setError("Could not load the pending approvals. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const pendingApprovals = useMemo(
    () => getPendingApprovals(requests),
    [requests],
  );

  const fullName = getPortalProfileName(user);

  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  return (
    <div className="admin-dashboard">
      <AdminSidebar
        pendingRequests={pendingApprovals.length}
        pendingApprovals={pendingApprovals.length}
        unreadNotifications={unreadNotifications}
        user={user}
        activeItem="approvals"
        onDashboard={onDashboard}
        onResidents={onResidents}
        onDocumentRequests={onDocumentRequests}
        onRequestHistory={onRequestHistory}
        onApprovals={() => undefined}
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
          title="Approvals"
          subtitle="Requests awaiting your approval."
        />

        {error && (
          <div className="admin-error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadRequests()}>
              Retry
            </button>
          </div>
        )}

        {isLoading && requests.length === 0 ? (
          <p className="admin-loading-state">Loading the approvals…</p>
        ) : (
          <>
            <span className="approvals-count-pill">
              {pendingApprovals.length} Pending Approval
              {pendingApprovals.length === 1 ? "" : "s"}
            </span>

            {pendingApprovals.length === 0 ? (
              <div className="approvals-empty">
                <p>No pending approvals right now.</p>
                <span>
                  Approved and rejected requests are moved to the Document
                  Requests workflow.
                </span>
              </div>
            ) : (
              <div className="approvals-list">
                {pendingApprovals.map((request) => (
                  <ApprovalRequestCard
                    key={request.id}
                    request={request}
                    onProcessed={(requestId) =>
                      setRequests((previous) =>
                        removeRequestById(previous, requestId),
                      )
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default AdminApprovals;
