import "../../../Styles/Admin/Pages/AdminDashboard.css";
import "../../../Styles/Admin/Pages/AdminResidents.css";
import "../../../Styles/Admin/Pages/AdminApprovals.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../../Utils/Shared/api";
import {
  fetchAdminDocumentRequests,
  fetchRegistrations,
} from "../../../Utils/Shared/api";
import type { AdminDocumentRequest } from "../../../Types/Admin/AdminDocumentRequestsType";
import type { AdminRegistration } from "../../../Types/Admin/AdminRegistrationsType";
import { getPortalProfileName } from "../../../Utils/Admin/AdminDisplay";
import AdminSidebar from "../../../components/Admin/AdminDashboard/AdminSidebar";
import AdminTopbar from "../../../components/Admin/AdminDashboard/AdminTopbar";
import useResponsiveSidebar from "../../../Utils/Shared/useResponsiveSidebar";
import ApprovalRequestCard from "../../../components/Admin/AdminApprovals/ApprovalRequestCard";
import RegistrationApprovals from "../../../components/Admin/AdminApprovals/RegistrationApprovals";
import {
  getPendingApprovals,
  removeRequestById,
} from "../../../Utils/Admin/AdminApprovalsLogic";
import { countPendingRegistrations } from "../../../Utils/Admin/AdminRegistrationsLogic";

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

type ApprovalsTab = "registrations" | "documents";

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
  const [activeTab, setActiveTab] = useState<ApprovalsTab>("registrations");
  const [requests, setRequests] = useState<AdminDocumentRequest[]>([]);
  const [registrations, setRegistrations] = useState<AdminRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const [loadedRequests, loadedRegistrations] = await Promise.all([
        fetchAdminDocumentRequests(),
        fetchRegistrations(),
      ]);
      setRequests(loadedRequests);
      setRegistrations(loadedRegistrations);
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

  const pendingRegistrations = useMemo(
    () => countPendingRegistrations(registrations),
    [registrations],
  );

  const fullName = getPortalProfileName(user);

  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  return (
    <div className="admin-dashboard">
      <AdminSidebar
        pendingRequests={pendingApprovals.length}
        pendingApprovals={pendingApprovals.length + pendingRegistrations}
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
          subtitle="Registrations and requests awaiting your approval."
        />

        {error && (
          <div className="admin-error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadRequests()}>
              Retry
            </button>
          </div>
        )}

        <div className="approvals-tabs" role="group" aria-label="Approval type">
          <button
            type="button"
            className={`approvals-tab${
              activeTab === "registrations" ? " active" : ""
            }`}
            aria-pressed={activeTab === "registrations"}
            onClick={() => setActiveTab("registrations")}
          >
            Resident Registrations ({pendingRegistrations})
          </button>
          <button
            type="button"
            className={`approvals-tab${
              activeTab === "documents" ? " active" : ""
            }`}
            aria-pressed={activeTab === "documents"}
            onClick={() => setActiveTab("documents")}
          >
            Document Requests ({pendingApprovals.length})
          </button>
        </div>

        {isLoading && requests.length === 0 && registrations.length === 0 ? (
          <p className="admin-loading-state">Loading the approvals…</p>
        ) : activeTab === "registrations" ? (
          <RegistrationApprovals
            registrations={registrations}
            onRegistrationUpdated={(updated) =>
              setRegistrations((previous) =>
                previous.map((registration) =>
                  registration.id === updated.id ? updated : registration,
                ),
              )
            }
            onReload={() => void loadRequests()}
          />
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
