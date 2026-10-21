import "../../../Styles/Admin/Pages/AdminDashboard.css";
import "../../../Styles/Admin/Pages/AdminReports.css";
import { useCallback, useEffect, useState } from "react";
import type { AuthUser } from "../../../Utils/api";
import { fetchAdminDashboard, fetchAdminReports } from "../../../Utils/api";
import type { AdminReportsData } from "../../../Types/AdminReportsType";
import { getPortalProfileName } from "../../../Utils/AdminDisplay";
import AdminSidebar from "../../../components/Admin/AdminDashboard/AdminSidebar";
import AdminTopbar from "../../../components/Admin/AdminDashboard/AdminTopbar";
import useResponsiveSidebar from "../../../Utils/useResponsiveSidebar";
import ReportsStatsGrid from "../../../components/Admin/AdminReports/ReportsStatsGrid";
import MonthlyVolumeLineChart from "../../../components/Admin/AdminReports/MonthlyVolumeLineChart";
import ResidentsByPurokChart from "../../../components/Admin/AdminReports/ResidentsByPurokChart";
import DocumentTypePieChart from "../../../components/Admin/AdminReports/DocumentTypePieChart";
import CompletedRejectedBarChart from "../../../components/Admin/AdminReports/CompletedRejectedBarChart";
import GenerateReportCard from "../../../components/Admin/AdminReports/GenerateReportCard";
import {
  downloadReportsCsv,
  printReports,
} from "../../../Utils/AdminReportsLogic";

type AdminReportsProps = {
  user: AuthUser;
  unreadNotifications: number;
  onDashboard: () => void;
  onResidents: () => void;
  onDocumentRequests: () => void;
  onRequestHistory: () => void;
  onApprovals: () => void;
  onDocumentManagement: () => void;
  onNotifications: () => void;
  onActivityLogs: () => void;
  onUserManagement: () => void;
  onLogout: () => void;
};

const AdminReports = ({
  user,
  unreadNotifications,
  onDashboard,
  onResidents,
  onDocumentRequests,
  onRequestHistory,
  onApprovals,
  onDocumentManagement,
  onNotifications,
  onActivityLogs,
  onUserManagement,
  onLogout,
}: AdminReportsProps) => {
  const [data, setData] = useState<AdminReportsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarStats, setSidebarStats] = useState({ pending: 0, approved: 0 });

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      setData(await fetchAdminReports());
    } catch {
      setError("Could not load the reports data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  // Sidebar badges stay consistent with the dashboard without blocking the page.
  useEffect(() => {
    let cancelled = false;

    fetchAdminDashboard()
      .then((dashboardData) => {
        if (!cancelled) {
          setSidebarStats({
            pending: dashboardData.stats.pending,
            approved: dashboardData.stats.approved,
          });
        }
      })
      .catch(() => {
        // Badges are optional here; the reports still load.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const fullName = getPortalProfileName(user);

  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  return (
    <div className="admin-dashboard">
      <AdminSidebar
        pendingRequests={sidebarStats.pending}
        pendingApprovals={sidebarStats.pending}
        unreadNotifications={unreadNotifications}
        user={user}
        activeItem="reports"
        onDashboard={onDashboard}
        onResidents={onResidents}
        onDocumentRequests={onDocumentRequests}
        onRequestHistory={onRequestHistory}
        onApprovals={onApprovals}
        onDocumentManagement={onDocumentManagement}
        onNotifications={onNotifications}
        onActivityLogs={onActivityLogs}
        onUserManagement={onUserManagement}
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
          title="Reports"
          subtitle="Barangay reporting and monitoring."
        />

        {error && (
          <div className="admin-error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadReports()}>
              Retry
            </button>
          </div>
        )}

        {isLoading && !data ? (
          <p className="admin-loading-state">Loading the reports…</p>
        ) : (
          data && (
            <>
              <ReportsStatsGrid summary={data.summary} />

              <div className="reports-charts-grid">
                <MonthlyVolumeLineChart data={data.monthly} />
                <ResidentsByPurokChart data={data.residents_by_purok} />
              </div>

              <div className="reports-charts-grid reports-charts-grid-secondary">
                <DocumentTypePieChart data={data.document_types} />
                <CompletedRejectedBarChart data={data.monthly} />
              </div>

              <GenerateReportCard
                onExportCsv={() => downloadReportsCsv(data)}
                onPrint={printReports}
              />
            </>
          )
        )}
      </main>
    </div>
  );
};

export default AdminReports;
