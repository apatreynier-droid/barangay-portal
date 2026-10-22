import "../../../Styles/Admin/Pages/AdminDashboard.css";
import { useCallback, useEffect, useState } from "react";
import type { ApiNotification, AuthUser } from "../../../Utils/Shared/api";
import { fetchAdminDashboard } from "../../../Utils/Shared/api";
import type { AdminDashboardData } from "../../../Types/Admin/AdminDashboardType";
import { getPortalProfileName } from "../../../Utils/Admin/AdminDisplay";
import type { AdminStatusFilter } from "../../../Utils/Admin/AdminDashboardLogic";
import AdminSidebar from "../../../components/Admin/AdminDashboard/AdminSidebar";
import AdminTopbar from "../../../components/Admin/AdminDashboard/AdminTopbar";
import AdminStatusStrip from "../../../components/Admin/AdminDashboard/AdminStatusStrip";
import AdminStatsGrid from "../../../components/Admin/AdminDashboard/AdminStatsGrid";
import MonthlyRequestsChart from "../../../components/Admin/AdminDashboard/MonthlyRequestsChart";
import DocumentTypeDonut from "../../../components/Admin/AdminDashboard/DocumentTypeDonut";
import AdminRecentRequests from "../../../components/Admin/AdminDashboard/AdminRecentRequests";
import RecentRegistrations from "../../../components/Admin/AdminDashboard/RecentRegistrations";
import AdminNotificationsCard from "../../../components/Admin/AdminDashboard/AdminNotificationsCard";
import useResponsiveSidebar from "../../../Utils/Shared/useResponsiveSidebar";

type AdminDashboardProps = {
  user: AuthUser;
  unreadNotifications: number;
  /** Live notifications from GET /api/notifications (polled by App). */
  notifications: ApiNotification[];
  onNotifications: () => void;
  onResidents: () => void;
  onDocumentRequests: () => void;
  onRequestHistory: () => void;
  onApprovals: () => void;
  onDocumentManagement: () => void;
  onReports: () => void;
  onActivityLogs: () => void;
  onUserManagement: () => void;
  onLogout: () => void;
  /**
   * Opens the existing Document Requests details screen for one request
   * (the dashboard passes the request number through router state).
   */
  onOpenRequest: (requestNumber: string) => void;
};

const AdminDashboard = ({
  user,
  unreadNotifications,
  notifications,
  onNotifications,
  onResidents,
  onDocumentRequests,
  onRequestHistory,
  onApprovals,
  onDocumentManagement,
  onReports,
  onActivityLogs,
  onUserManagement,
  onLogout,
  onOpenRequest,
}: AdminDashboardProps) => {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  /** Status-strip filter shared by the strip and the Recent Requests list. */
  const [statusFilter, setStatusFilter] = useState<AdminStatusFilter>("all");

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      setData(await fetchAdminDashboard());
    } catch {
      setError("Could not load the dashboard data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const fullName = getPortalProfileName(user);

  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  return (
    <div className="admin-dashboard">
      <AdminSidebar
        pendingRequests={data?.stats.pending ?? 0}
        pendingApprovals={data?.stats.pending ?? 0}
        unreadNotifications={unreadNotifications}
        user={user}
        activeItem="dashboard"
        onDashboard={() => undefined}
        onResidents={onResidents}
        onDocumentRequests={onDocumentRequests}
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
          unreadNotifications={unreadNotifications}
          onNotifications={onNotifications}
        />

        {error && (
          <div className="admin-error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadDashboard()}>
              Retry
            </button>
          </div>
        )}

        {isLoading && !data ? (
          <p className="admin-loading-state">Loading the dashboard…</p>
        ) : (
          data && (
            /* Mobile-first order: status summary → Pending/Approved →
               Recent Requests → remaining stats → charts → registrations →
               notifications. The desktop grid in AdminDashboard.css places
               these same sections back into the analytics-oriented layout. */
            <div className="admin-dashboard-layout">
              <AdminStatusStrip
                requests={data.recent_requests}
                activeFilter={statusFilter}
                onFilterChange={setStatusFilter}
              />

              <AdminStatsGrid stats={data.stats} group="highlights" />

              <AdminRecentRequests
                requests={data.recent_requests}
                statusFilter={statusFilter}
                onClearFilter={() => setStatusFilter("all")}
                onViewAll={onDocumentRequests}
                onOpenRequest={onOpenRequest}
              />

              <AdminStatsGrid stats={data.stats} group="remaining" />

              <div className="admin-charts-grid">
                <MonthlyRequestsChart data={data.monthly} />
                <DocumentTypeDonut data={data.document_types} />
              </div>

              <div className="admin-side-stack">
                <RecentRegistrations
                  registrations={data.recent_registrations}
                />
                <AdminNotificationsCard
                  notifications={notifications}
                  activities={data.recent_activity}
                  onOpen={onNotifications}
                />
              </div>
            </div>
          )
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
