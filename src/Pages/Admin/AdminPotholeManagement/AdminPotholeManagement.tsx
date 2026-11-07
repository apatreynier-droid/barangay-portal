import "../../../Styles/Admin/Pages/AdminDashboard.css";
import "../../../Styles/Admin/Pages/AdminLogs.css";
import "../../../Styles/Admin/Pages/AdminResidents.css";
import "../../../Styles/Admin/Pages/AdminPotholeManagement.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAdminDashboard } from "../../../Utils/Shared/api";
import type { AuthUser } from "../../../Utils/Shared/api";
import { getPortalProfileName } from "../../../Utils/Admin/AdminDisplay";
import AdminSidebar from "../../../components/Admin/AdminDashboard/AdminSidebar";
import AdminTopbar from "../../../components/Admin/AdminDashboard/AdminTopbar";
import PotholeConfirmModal from "../../../components/Admin/AdminPotholeManagement/PotholeConfirmModal";
import PotholeDetailsModal from "../../../components/Admin/AdminPotholeManagement/PotholeDetailsModal";
import PotholeMap from "../../../components/Admin/AdminPotholeManagement/PotholeMap";
import PotholeReportsTable from "../../../components/Admin/AdminPotholeManagement/PotholeReportsTable";
import PotholeStatsGrid from "../../../components/Admin/AdminPotholeManagement/PotholeStatsGrid";
import PotholeToolbar from "../../../components/Admin/AdminPotholeManagement/PotholeToolbar";
import {
  DEFAULT_POTHOLE_FILTERS,
  DEFAULT_POTHOLE_PAGE_SIZE,
  DEFAULT_POTHOLE_SORT,
  POTHOLE_ACTION_META,
  POTHOLE_STATUSES,
  POTHOLE_STATUS_META,
  addPotholeRemark,
  applyPotholeAction,
  filterPotholeReports,
  getPotholeStats,
  hasActivePotholeFilters,
  hasPotholeCoordinates,
  sortPotholeReports,
} from "../../../Utils/Admin/AdminPotholeManagementLogic";
import { SAMPLE_POTHOLE_REPORTS } from "../../../Utils/Admin/AdminPotholeSampleData";
import type {
  PotholeAction,
  PotholeFilters,
  PotholeReport,
  PotholeSortKey,
  PotholeSortState,
} from "../../../Types/Admin/AdminPotholeManagementType";
import useResponsiveSidebar from "../../../Utils/Shared/useResponsiveSidebar";

/**
 * The backend has no pothole endpoints yet, so this page runs on sample data
 * held in React state: changes last until the page is reloaded or left. When
 * the API exists, load the reports into `reports`, send the updates in
 * handleConfirmAction/handleAddRemark, and set this to false.
 */
const IS_SAMPLE_DATA = true;
const TOAST_DURATION_MS = 5000;

type AdminPotholeManagementProps = {
  user: AuthUser;
  unreadNotifications: number;
  onDashboard: () => void;
  onResidents: () => void;
  onDocumentRequests: () => void;
  onRequestHistory: () => void;
  onApprovals: () => void;
  onDocumentManagement: () => void;
  onReports: () => void;
  onActivityLogs: () => void;
  onUserManagement: () => void;
  onNotifications: () => void;
  onLogout: () => void;
};

const AdminPotholeManagement = ({
  user,
  unreadNotifications,
  onDashboard,
  onResidents,
  onDocumentRequests,
  onRequestHistory,
  onApprovals,
  onDocumentManagement,
  onReports,
  onActivityLogs,
  onUserManagement,
  onNotifications,
  onLogout,
}: AdminPotholeManagementProps) => {
  const [reports, setReports] = useState<PotholeReport[]>(
    SAMPLE_POTHOLE_REPORTS,
  );
  const [filters, setFilters] = useState<PotholeFilters>(
    DEFAULT_POTHOLE_FILTERS,
  );
  const [sort, setSort] = useState<PotholeSortState>(DEFAULT_POTHOLE_SORT);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_POTHOLE_PAGE_SIZE);
  /** The report highlighted in both the map and the table. */
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [detailsReportId, setDetailsReportId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PotholeAction | null>(null);
  const [toast, setToast] = useState("");
  const [sidebarStats, setSidebarStats] = useState({
    pending: 0,
    pendingRegistrations: 0,
  });
  const mapSectionRef = useRef<HTMLElement | null>(null);
  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  // Sidebar badges stay consistent with the dashboard without blocking the page.
  useEffect(() => {
    let cancelled = false;

    fetchAdminDashboard()
      .then((data) => {
        if (!cancelled) {
          setSidebarStats({
            pending: data.stats.pending,
            pendingRegistrations: data.stats.pending_registrations,
          });
        }
      })
      .catch(() => {
        // Badges are optional here; the page does not depend on them.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(""), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const stats = useMemo(() => getPotholeStats(reports), [reports]);
  const filteredReports = useMemo(
    () => filterPotholeReports(reports, filters),
    [reports, filters],
  );
  const sortedReports = useMemo(
    () => sortPotholeReports(filteredReports, sort),
    [filteredReports, sort],
  );

  // Clamped here because a status change can shrink the filtered list.
  const totalPages = Math.max(1, Math.ceil(sortedReports.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageReports = sortedReports.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const reportsWithoutGps = filteredReports.filter(
    (report) => !hasPotholeCoordinates(report),
  ).length;

  // Looked up on every render so the open panel always shows the latest data.
  const detailsReport =
    reports.find((report) => report.id === detailsReportId) ?? null;

  const handleFiltersChange = (changes: Partial<PotholeFilters>) => {
    setFilters((previous) => ({ ...previous, ...changes }));
    setPage(1);
  };

  const handleClearFilters = () => {
    setFilters(DEFAULT_POTHOLE_FILTERS);
    setPage(1);
  };

  const handleSort = (key: PotholeSortKey) => {
    setSort((previous) => ({
      key,
      direction:
        previous.key === key && previous.direction === "asc" ? "desc" : "asc",
    }));
    setPage(1);
  };

  const handlePageSizeChange = (nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPage(1);
  };

  // Clicking a marker brings its row into view on the right table page.
  const handleMarkerSelect = (reportId: string) => {
    setSelectedReportId(reportId);

    const index = sortedReports.findIndex((report) => report.id === reportId);
    if (index >= 0) {
      setPage(Math.floor(index / pageSize) + 1);
    }
  };

  const handleMarkerDeselect = (reportId: string) => {
    setSelectedReportId((current) => (current === reportId ? null : current));
  };

  const handleLocate = (reportId: string) => {
    setSelectedReportId(reportId);
    mapSectionRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  };

  const saveNotice = IS_SAMPLE_DATA ? " Sample data: not saved." : "";

  const handleConfirmAction = (remark: string) => {
    if (!detailsReport || !pendingAction) {
      return;
    }

    const { targetStatus } = POTHOLE_ACTION_META[pendingAction];

    setReports((current) =>
      applyPotholeAction(
        current,
        detailsReport.id,
        pendingAction,
        remark,
        getPortalProfileName(user),
      ),
    );
    setToast(
      `${detailsReport.id} is now ${POTHOLE_STATUS_META[targetStatus].label}.${saveNotice}`,
    );
    setPendingAction(null);
  };

  const handleAddRemark = (text: string) => {
    if (!detailsReport) {
      return;
    }

    setReports((current) =>
      addPotholeRemark(
        current,
        detailsReport.id,
        text,
        getPortalProfileName(user),
      ),
    );
    setToast(`Remark added to ${detailsReport.id}.${saveNotice}`);
  };

  return (
    <div className="admin-dashboard">
      <AdminSidebar
        pendingRequests={sidebarStats.pending}
        pendingApprovals={
          sidebarStats.pending + sidebarStats.pendingRegistrations
        }
        unreadNotifications={unreadNotifications}
        user={user}
        activeItem="pothole-management"
        onDashboard={onDashboard}
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
          fullName={getPortalProfileName(user) || "Administrator"}
          onMenuToggle={toggleDrawer}
          title="Pothole Management"
          subtitle="Review pothole reports, see their locations, and track repairs."
          unreadNotifications={unreadNotifications}
          onNotifications={onNotifications}
        />

        {IS_SAMPLE_DATA && (
          <div className="pothole-sample-notice" role="note">
            <strong>Sample data.</strong> The system has no pothole report
            database yet, so these reports are examples. Status changes and
            remarks only update this screen and are lost when you reload or
            leave the page.
          </div>
        )}

        <PotholeStatsGrid stats={stats} />

        <PotholeToolbar
          filters={filters}
          resultCount={filteredReports.length}
          totalCount={reports.length}
          onChange={handleFiltersChange}
          onClear={handleClearFilters}
        />

        <section
          ref={mapSectionRef}
          className="admin-panel pothole-map-panel"
          aria-labelledby="pothole-map-title"
        >
          <div className="admin-panel-header pothole-map-header">
            <h2 id="pothole-map-title" className="admin-panel-title">
              Pothole Map
            </h2>

            <ul className="pothole-legend" aria-label="Marker colors">
              {POTHOLE_STATUSES.map((status) => (
                <li key={status}>
                  <span
                    className={`pothole-legend-dot pothole-pin--${status}`}
                    aria-hidden="true"
                  >
                    {POTHOLE_STATUS_META[status].glyph}
                  </span>
                  {POTHOLE_STATUS_META[status].label}
                </li>
              ))}
            </ul>
          </div>

          <PotholeMap
            reports={filteredReports}
            selectedReportId={selectedReportId}
            onSelect={handleMarkerSelect}
            onDeselect={handleMarkerDeselect}
            onViewDetails={setDetailsReportId}
          />

          {reportsWithoutGps > 0 && (
            <p className="pothole-map-footnote">
              {reportsWithoutGps === 1
                ? "1 report has no GPS coordinates and is only listed in the table."
                : `${reportsWithoutGps} reports have no GPS coordinates and are only listed in the table.`}
            </p>
          )}
        </section>

        <PotholeReportsTable
          reports={pageReports}
          totalResults={sortedReports.length}
          page={currentPage}
          pageSize={pageSize}
          sort={sort}
          selectedReportId={selectedReportId}
          canClearFilters={hasActivePotholeFilters(filters)}
          onSort={handleSort}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
          onViewDetails={setDetailsReportId}
          onLocate={handleLocate}
          onClearFilters={handleClearFilters}
        />

        {detailsReport && (
          <PotholeDetailsModal
            // Remount per report so its draft remark never carries over.
            key={detailsReport.id}
            report={detailsReport}
            isSampleData={IS_SAMPLE_DATA}
            isActive={pendingAction === null}
            onClose={() => setDetailsReportId(null)}
            onAction={setPendingAction}
            onAddRemark={handleAddRemark}
          />
        )}

        {detailsReport && pendingAction && (
          <PotholeConfirmModal
            action={pendingAction}
            reportId={detailsReport.id}
            onCancel={() => setPendingAction(null)}
            onConfirm={handleConfirmAction}
          />
        )}

        {toast && (
          <div className="pothole-toast" role="status">
            {toast}
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminPotholeManagement;
