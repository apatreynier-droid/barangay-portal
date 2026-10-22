import "../../../Styles/Admin/Pages/AdminDashboard.css";
import "../../../Styles/Admin/Pages/AdminLogs.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../../Utils/Shared/api";
import { fetchAdminDashboard, fetchActivityLogs } from "../../../Utils/Shared/api";
import type { AdminActivityLog } from "../../../Types/Admin/AdminLogsType";
import { getPortalProfileName } from "../../../Utils/Admin/AdminDisplay";
import AdminSidebar from "../../../components/Admin/AdminDashboard/AdminSidebar";
import AdminTopbar from "../../../components/Admin/AdminDashboard/AdminTopbar";
import ActivityLogsToolbar from "../../../components/Admin/AdminLogs/ActivityLogsToolbar";
import ActivityLogsTable from "../../../components/Admin/AdminLogs/ActivityLogsTable";
import {
  DEFAULT_ACTIVITY_LOGS_FILTERS,
  filterActivityLogs,
} from "../../../Utils/Admin/AdminLogsLogic";
import type { ActivityLogsFiltersState } from "../../../Utils/Admin/AdminLogsLogic";
import useResponsiveSidebar from "../../../Utils/Shared/useResponsiveSidebar";

type AdminLogsProps = {
  user: AuthUser;
  unreadNotifications: number;
  onDashboard: () => void;
  onResidents: () => void;
  onDocumentRequests: () => void;
  onRequestHistory: () => void;
  onApprovals: () => void;
  onDocumentManagement: () => void;
  onReports: () => void;
  onUserManagement: () => void;
  onNotifications: () => void;
  onLogout: () => void;
};

const AdminLogs = ({
  user,
  unreadNotifications,
  onDashboard,
  onResidents,
  onDocumentRequests,
  onRequestHistory,
  onApprovals,
  onDocumentManagement,
  onReports,
  onUserManagement,
  onNotifications,
  onLogout,
}: AdminLogsProps) => {
  const [logs, setLogs] = useState<AdminActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<ActivityLogsFiltersState>(
    DEFAULT_ACTIVITY_LOGS_FILTERS,
  );
  const [sidebarStats, setSidebarStats] = useState({ pending: 0, approved: 0 });

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      setLogs(await fetchActivityLogs());
    } catch {
      setError("Could not load the activity logs. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

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
        // Badges are optional here; the logs list still loads.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredLogs = useMemo(
    () => filterActivityLogs(logs, filters),
    [logs, filters],
  );

  const fullName = getPortalProfileName(user);

  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  return (
    <div className="admin-dashboard">
      <AdminSidebar
        pendingRequests={sidebarStats.pending}
        pendingApprovals={sidebarStats.approved}
        unreadNotifications={unreadNotifications}
        user={user}
        activeItem="activity-logs"
        onDashboard={onDashboard}
        onResidents={onResidents}
        onDocumentRequests={onDocumentRequests}
        onRequestHistory={onRequestHistory}
        onApprovals={onApprovals}
        onDocumentManagement={onDocumentManagement}
        onReports={onReports}
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
          title="Activity Logs"
          subtitle="Audit trail of all system activity."
        />

        {error && (
          <div className="admin-error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadLogs()}>
              Retry
            </button>
          </div>
        )}

        {isLoading && logs.length === 0 ? (
          <p className="admin-loading-state">Loading the activity logs…</p>
        ) : (
          <>
            <ActivityLogsToolbar
              search={filters.search}
              actionType={filters.actionType}
              resultCount={filteredLogs.length}
              onSearchChange={(search) =>
                setFilters((previous) => ({ ...previous, search }))
              }
              onActionTypeChange={(actionType) =>
                setFilters((previous) => ({ ...previous, actionType }))
              }
            />

            <ActivityLogsTable logs={filteredLogs} />
          </>
        )}

        <div className="admin-logs-notice">
          <strong>Audit Trail Notice:</strong> All actions performed in this
          system are logged and timestamped for accountability and compliance.
          Log entries cannot be edited or deleted.
        </div>
      </main>
    </div>
  );
};

export default AdminLogs;