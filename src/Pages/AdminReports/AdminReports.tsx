import "../AdminDashboard/AdminDashboard.css";
import "./AdminReports.css";
import { useCallback, useEffect, useState } from "react";
import type { AuthUser } from "../../Utils/api";
import { fetchAdminDashboard, fetchAdminReports } from "../../Utils/api";
import type { AdminReportsData } from "../../Types/AdminReportsType";
import { ADMIN_DISPLAY_NAME } from "../../Utils/AdminDisplay";
import AdminSidebar from "../../components/AdminDashboard/AdminSidebar";
import AdminTopbar from "../../components/AdminDashboard/AdminTopbar";
import ReportsStatsGrid from "../../components/AdminReports/ReportsStatsGrid";
import MonthlyVolumeLineChart from "../../components/AdminReports/MonthlyVolumeLineChart";
import ResidentsByPurokChart from "../../components/AdminReports/ResidentsByPurokChart";
import DocumentTypePieChart from "../../components/AdminReports/DocumentTypePieChart";
import CompletedRejectedBarChart from "../../components/AdminReports/CompletedRejectedBarChart";
import GenerateReportCard from "../../components/AdminReports/GenerateReportCard";
import {
  downloadReportsCsv,
  printReports,
} from "../../Utils/AdminReportsLogic";

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
  onLogout: () => void;
};

const AdminReports = ({
  unreadNotifications,
  onDashboard,
  onResidents,
  onDocumentRequests,
  onRequestHistory,
  onApprovals,
  onDocumentManagement,
  onNotifications,
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

  const fullName = ADMIN_DISPLAY_NAME;
  const roleLabel = "Brgy. Administrator";

  return (
    <div className="admin-dashboard">
      <AdminSidebar
        pendingRequests={sidebarStats.pending}
        pendingApprovals={sidebarStats.pending}
        unreadNotifications={unreadNotifications}
        firstName={ADMIN_DISPLAY_NAME}
        lastName=""
        role={roleLabel}
        activeItem="reports"
        onDashboard={onDashboard}
        onResidents={onResidents}
        onDocumentRequests={onDocumentRequests}
        onRequestHistory={onRequestHistory}
        onApprovals={onApprovals}
        onDocumentManagement={onDocumentManagement}
        onNotifications={onNotifications}
        onLogout={onLogout}
      />

      <main className="admin-main">
        <AdminTopbar
          fullName={fullName || "Administrator"}
          role={roleLabel}
          unreadCount={unreadNotifications}
          onNotifications={onNotifications}
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
