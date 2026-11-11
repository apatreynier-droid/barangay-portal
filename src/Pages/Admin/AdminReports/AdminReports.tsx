import "../../../Styles/Admin/Pages/AdminDashboard.css";
import "../../../Styles/Admin/Pages/AdminReports.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthUser } from "../../../Utils/Shared/api";
import {
  ApiError,
  fetchAdminDashboard,
  fetchAdminReports,
} from "../../../Utils/Shared/api";
import type {
  AdminReportsData,
  AdminReportsQuery,
} from "../../../Types/Admin/AdminReportsType";
import {
  getPortalProfileName,
  getPortalRoleLabel,
} from "../../../Utils/Admin/AdminDisplay";
import AdminSidebar from "../../../components/Admin/AdminDashboard/AdminSidebar";
import AdminTopbar from "../../../components/Admin/AdminDashboard/AdminTopbar";
import useResponsiveSidebar from "../../../Utils/Shared/useResponsiveSidebar";
import ReportsStatsGrid from "../../../components/Admin/AdminReports/ReportsStatsGrid";
import MonthlyVolumeLineChart from "../../../components/Admin/AdminReports/MonthlyVolumeLineChart";
import ResidentsByPurokChart from "../../../components/Admin/AdminReports/ResidentsByPurokChart";
import DocumentTypePieChart from "../../../components/Admin/AdminReports/DocumentTypePieChart";
import CompletedRejectedBarChart from "../../../components/Admin/AdminReports/CompletedRejectedBarChart";
import GenerateReportCard from "../../../components/Admin/AdminReports/GenerateReportCard";
import ReportsFilterBar from "../../../components/Admin/AdminReports/ReportsFilterBar";
import ProcessingTimePanel from "../../../components/Admin/AdminReports/ProcessingTimePanel";
import RegistrationTrendPanel from "../../../components/Admin/AdminReports/RegistrationTrendPanel";
import PeriodComparisonPanel from "../../../components/Admin/AdminReports/PeriodComparisonPanel";
import PurokComparisonTable from "../../../components/Admin/AdminReports/PurokComparisonTable";
import PotholeAnalyticsPanel from "../../../components/Admin/AdminReports/PotholeAnalyticsPanel";
import RequestStatusBreakdown from "../../../components/Admin/AdminDashboard/RequestStatusBreakdown";
import {
  DEFAULT_REPORT_PRESET,
  describeReportRange,
  downloadReportsCsv,
  getPresetQuery,
  granularityLabel,
  isGranularityAllowed,
  isRangeInverted,
  printReports,
  type ReportPreset,
} from "../../../Utils/Admin/AdminReportsLogic";

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

/** "November 11, 2026, 9:42 AM" in Philippine time (printed report). */
const formatPrintTimestamp = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

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
  const [preset, setPreset] = useState<ReportPreset>(DEFAULT_REPORT_PRESET);
  const [query, setQuery] = useState<AdminReportsQuery>(() =>
    getPresetQuery(DEFAULT_REPORT_PRESET),
  );
  /** Only the latest request may update the page (filters can change fast). */
  const latestRequest = useRef(0);
  const [sidebarStats, setSidebarStats] = useState({
    pending: 0,
    approved: 0,
    pendingRegistrations: 0,
  });

  const loadReports = useCallback(async () => {
    if (isRangeInverted(query)) {
      return;
    }

    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    setIsLoading(true);
    setError("");

    try {
      const result = await fetchAdminReports(query);
      if (latestRequest.current === requestId) {
        setData(result);
      }
    } catch (caught) {
      if (latestRequest.current === requestId) {
        // 422 = the backend rejected the filters; show its explanation.
        setError(
          caught instanceof ApiError && caught.status === 422
            ? caught.message
            : "Could not load the reports data. Please try again.",
        );
      }
    } finally {
      if (latestRequest.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [query]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const handlePresetChange = (next: ReportPreset) => {
    setPreset(next);
    if (next !== "custom") {
      setQuery(getPresetQuery(next));
    }
  };

  const handleQueryChange = (changes: Partial<AdminReportsQuery>) => {
    if (changes.dateFrom !== undefined || changes.dateTo !== undefined) {
      setPreset("custom");
    }
    setQuery((current) => {
      const next = { ...current, ...changes };
      // Keep the interval usable when a longer range is picked.
      if (!isGranularityAllowed(next.granularity, next)) {
        next.granularity = isGranularityAllowed("weekly", next) ? "weekly" : "monthly";
      }
      return next;
    });
  };

  // Sidebar badges stay consistent with the dashboard without blocking the page.
  useEffect(() => {
    let cancelled = false;

    fetchAdminDashboard()
      .then((dashboardData) => {
        if (!cancelled) {
          setSidebarStats({
            pending: dashboardData.stats.pending,
            pendingRegistrations: dashboardData.stats.pending_registrations,
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
  // "Prepared by" on the printed report. Administrators are shown by role only
  // (the portal never displays their account name), Staff by their own name.
  const preparedByName =
    user.role === "staff" ? `${user.first_name} ${user.last_name}`.trim() : "";
  const preparedByRole = getPortalRoleLabel(user);

  // "Date generated" on the printed report: refreshed whenever printing starts.
  const [printedAt, setPrintedAt] = useState(() => formatPrintTimestamp(new Date()));
  useEffect(() => {
    const handleBeforePrint = () => setPrintedAt(formatPrintTimestamp(new Date()));
    window.addEventListener("beforeprint", handleBeforePrint);
    return () => window.removeEventListener("beforeprint", handleBeforePrint);
  }, []);

  const interval = data ? granularityLabel(data.filters.granularity) : "";
  // The volume charts follow the selected interval (daily/weekly/...).
  const trend = (data?.trend ?? []).map((point) => ({
    month: point.label,
    requests: point.requests,
    completed: point.completed,
    rejected: point.rejected,
  }));

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

      <main className="admin-main reports-page">
        <AdminTopbar
          fullName={fullName || "Administrator"}
          onMenuToggle={toggleDrawer}
          title="Reports"
          subtitle="Barangay reporting and monitoring."
        />

        {/* Formal letterhead, shown only on paper in place of the top bar
            (print styles in AdminReports.css). */}
        <header className="reports-print-header" aria-hidden="true">
          <div className="reports-letterhead">
            <img
              className="reports-letterhead-logo"
              src="/logo-lagab.png"
              alt=""
            />
            <div className="reports-letterhead-text">
              <p>Republic of the Philippines</p>
              <p>Province of Davao de Oro</p>
              <p>Municipality of Compostela</p>
              <p className="reports-letterhead-barangay">Barangay Lagab</p>
            </div>
          </div>
          <h1 className="reports-print-title">Barangay Reports and Analytics</h1>
          {data && (
            <table className="reports-print-meta">
              <tbody>
                <tr>
                  <th scope="row">Reporting period</th>
                  <td>{describeReportRange(data)}</td>
                  <th scope="row">Date generated</th>
                  <td>{printedAt}</td>
                </tr>
                <tr>
                  <th scope="row">Interval</th>
                  <td>{interval}</td>
                  <th scope="row">Time zone</th>
                  <td>Philippine Standard Time ({data.filters.timezone})</td>
                </tr>
              </tbody>
            </table>
          )}
        </header>

        {error && (
          <div className="admin-error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadReports()}>
              Retry
            </button>
          </div>
        )}

        <ReportsFilterBar
          preset={preset}
          query={query}
          appliedRange={data ? describeReportRange(data) : null}
          isLoading={isLoading}
          onPresetChange={handlePresetChange}
          onQueryChange={handleQueryChange}
        />

        {isLoading && !data ? (
          <p className="admin-loading-state">Loading the reports…</p>
        ) : (
          data && (
            <div
              className={`reports-content${isLoading ? " is-updating" : ""}`}
              aria-busy={isLoading}
            >
              <ReportsStatsGrid
                summary={data.summary}
                comparison={data.comparison}
              />

              <div className="reports-charts-grid">
                <MonthlyVolumeLineChart
                  data={trend}
                  title={`${interval} Request Volume`}
                />
                <ResidentsByPurokChart data={data.residents_by_purok} />
              </div>

              <div className="reports-charts-grid reports-charts-grid-secondary">
                <DocumentTypePieChart data={data.document_types} />
                <CompletedRejectedBarChart
                  data={trend}
                  title={`Completed vs Rejected (${interval})`}
                />
              </div>

              <div className="reports-charts-grid reports-charts-grid-even">
                <RequestStatusBreakdown
                  items={data.status_breakdown}
                  scope="Requests submitted in this period, by current status"
                />
                <ProcessingTimePanel stats={data.processing_time} />
              </div>

              <div className="reports-charts-grid reports-charts-grid-even">
                <RegistrationTrendPanel
                  stats={data.registrations}
                  intervalLabel={interval}
                />
                <PeriodComparisonPanel
                  comparison={data.comparison}
                  completion={data.completion}
                />
              </div>

              <PurokComparisonTable
                rows={data.purok_distribution}
                showPotholes={data.potholes.available}
              />

              <PotholeAnalyticsPanel
                stats={data.potholes}
                intervalLabel={interval}
              />

              {/* Signatories, shown only on paper. */}
              <section className="reports-print-signatures" aria-hidden="true">
                <div className="reports-signature">
                  <p className="reports-signature-caption">Prepared by:</p>
                  <p className="reports-signature-line">{preparedByName}</p>
                  <p className="reports-signature-role">{preparedByRole}</p>
                </div>
                <div className="reports-signature">
                  <p className="reports-signature-caption">Noted by:</p>
                  <p className="reports-signature-line"></p>
                  <p className="reports-signature-role">Punong Barangay</p>
                </div>
              </section>

              <GenerateReportCard
                onExportCsv={() => downloadReportsCsv(data)}
                onPrint={printReports}
              />
            </div>
          )
        )}
      </main>
    </div>
  );
};

export default AdminReports;
