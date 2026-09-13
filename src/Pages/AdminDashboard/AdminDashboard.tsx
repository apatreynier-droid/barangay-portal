import "./AdminDashboard.css";
import { useCallback, useEffect, useState } from "react";
import type { AuthUser } from "../../Utils/api";
import { fetchAdminDashboard } from "../../Utils/api";
import type { AdminDashboardData } from "../../Types/AdminDashboardType";
import { ADMIN_DISPLAY_NAME } from "../../Utils/AdminDisplay";
import AdminSidebar from "../../components/AdminDashboard/AdminSidebar";
import AdminTopbar from "../../components/AdminDashboard/AdminTopbar";
import AdminStatsGrid from "../../components/AdminDashboard/AdminStatsGrid";
import MonthlyRequestsChart from "../../components/AdminDashboard/MonthlyRequestsChart";
import DocumentTypeDonut from "../../components/AdminDashboard/DocumentTypeDonut";
import AdminRecentRequests from "../../components/AdminDashboard/AdminRecentRequests";
import RecentRegistrations from "../../components/AdminDashboard/RecentRegistrations";
import AdminNotificationsCard from "../../components/AdminDashboard/AdminNotificationsCard";

type AdminDashboardProps = {
  user: AuthUser;
  unreadNotifications: number;
  onNotifications: () => void;
  onResidents: () => void;
  onDocumentRequests: () => void;
  onRequestHistory: () => void;
  onApprovals: () => void;
  onLogout: () => void;
};

const AdminDashboard = ({
  unreadNotifications,
  onNotifications,
  onResidents,
  onDocumentRequests,
  onRequestHistory,
  onApprovals,
  onLogout,
}: AdminDashboardProps) => {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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

  const fullName = ADMIN_DISPLAY_NAME;
  const roleLabel = "Brgy. Administrator";

  return (
    <div className="admin-dashboard">
      <AdminSidebar
        pendingRequests={data?.stats.pending ?? 0}
        pendingApprovals={data?.stats.pending ?? 0}
        unreadNotifications={unreadNotifications}
        firstName={ADMIN_DISPLAY_NAME}
        lastName=""
        role={roleLabel}
        activeItem="dashboard"
        onDashboard={() => undefined}
        onResidents={onResidents}
        onDocumentRequests={onDocumentRequests}
        onRequestHistory={onRequestHistory}
        onApprovals={onApprovals}
        onNotifications={onNotifications}
        onLogout={onLogout}
      />

      <main className="admin-main">
        <AdminTopbar
          fullName={fullName || "Administrator"}
          role={roleLabel}
          unreadCount={unreadNotifications}
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
            <>
              <AdminStatsGrid stats={data.stats} />

              <div className="admin-charts-grid">
                <MonthlyRequestsChart data={data.monthly} />
                <DocumentTypeDonut data={data.document_types} />
              </div>

              <div className="admin-bottom-grid">
                <AdminRecentRequests requests={data.recent_requests} />

                <div className="admin-side-stack">
                  <RecentRegistrations
                    registrations={data.recent_registrations}
                  />
                  <AdminNotificationsCard
                    activities={data.recent_activity}
                  />
                </div>
              </div>
            </>
          )
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
