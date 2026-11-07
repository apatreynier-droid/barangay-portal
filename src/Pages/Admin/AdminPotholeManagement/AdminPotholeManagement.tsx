import "../../../Styles/Admin/Pages/AdminDashboard.css";
import "../../../Styles/Admin/Pages/AdminLogs.css";
import "../../../Styles/Admin/Pages/AdminResidents.css";
import "../../../Styles/Admin/Pages/AdminPotholeManagement.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  ApiError,
  addAdminPotholeRemark,
  fetchAdminDashboard,
  fetchAdminPotholeReport,
  fetchAdminPotholeReports,
  fetchAdminPotholeSummary,
  updateAdminPotholeStatus,
} from "../../../Utils/Shared/api";
import type { AuthUser } from "../../../Utils/Shared/api";
import { getPortalProfileName } from "../../../Utils/Admin/AdminDisplay";
import AdminSidebar from "../../../components/Admin/AdminDashboard/AdminSidebar";
import AdminTopbar from "../../../components/Admin/AdminDashboard/AdminTopbar";
import PotholeConfirmModal from "../../../components/Admin/AdminPotholeManagement/PotholeConfirmModal";
import PotholeDetailsModal from "../../../components/Admin/AdminPotholeManagement/PotholeDetailsModal";
import PotholeMap from "../../../components/Admin/AdminPotholeManagement/PotholeMap";
import PotholePurokSummary from "../../../components/Admin/AdminPotholeManagement/PotholePurokSummary";
import PotholeReportsTable from "../../../components/Admin/AdminPotholeManagement/PotholeReportsTable";
import PotholeStatsGrid from "../../../components/Admin/AdminPotholeManagement/PotholeStatsGrid";
import PotholeToolbar from "../../../components/Admin/AdminPotholeManagement/PotholeToolbar";
import {
  DEFAULT_POTHOLE_FILTERS,
  DEFAULT_POTHOLE_PAGE_SIZE,
  DEFAULT_POTHOLE_SORT,
  POTHOLE_ACTION_META,
  POTHOLE_REFRESH_INTERVAL_MS,
  POTHOLE_STATUSES,
  POTHOLE_STATUS_META,
  filterPotholeReports,
  hasActivePotholeFilters,
  hasPotholeCoordinates,
  mapApiPotholeDetail,
  mapApiPotholeReport,
  mapApiPotholeSummary,
  sortPotholeReports,
} from "../../../Utils/Admin/AdminPotholeManagementLogic";
import { releasePotholePhotos } from "../../../Utils/Admin/potholePhotoCache";
import type {
  PotholeAction,
  PotholeFilters,
  PotholeHistoryEntry,
  PotholeReport,
  PotholeReportDetail,
  PotholeSortKey,
  PotholeSortState,
  PotholeSummary,
} from "../../../Types/Admin/AdminPotholeManagementType";
import { isAdministrator } from "../../../Utils/Shared/routePaths";
import useResponsiveSidebar from "../../../Utils/Shared/useResponsiveSidebar";

const TOAST_DURATION_MS = 5000;

type LoadState = "loading" | "ready" | "error";

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

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const formatTime = (moment: Date): string =>
  moment.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

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
  const [reports, setReports] = useState<PotholeReport[]>([]);
  const [summary, setSummary] = useState<PotholeSummary | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filters, setFilters] = useState<PotholeFilters>(
    DEFAULT_POTHOLE_FILTERS,
  );
  const [sort, setSort] = useState<PotholeSortState>(DEFAULT_POTHOLE_SORT);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_POTHOLE_PAGE_SIZE);
  /** The report highlighted in both the map and the table. */
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [detailsReportId, setDetailsReportId] = useState<string | null>(null);
  const [history, setHistory] = useState<PotholeHistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  const [pendingAction, setPendingAction] = useState<PotholeAction | null>(null);
  const [isSavingAction, setIsSavingAction] = useState(false);
  const [actionError, setActionError] = useState("");
  const [isSavingRemark, setIsSavingRemark] = useState(false);
  const [toast, setToast] = useState("");
  const [sidebarStats, setSidebarStats] = useState({
    pending: 0,
    pendingRegistrations: 0,
  });
  const mapSectionRef = useRef<HTMLElement | null>(null);
  /** Report numbers already shown, to announce newly arrived reports. */
  const knownIdsRef = useRef<Set<string> | null>(null);
  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();
  const isAdministratorAccount = isAdministrator(user);

  /**
   * Loads every report and the database-computed statistics. A background
   * refresh keeps the current data on screen if the server cannot be reached.
   */
  const loadData = useCallback(async (background: boolean) => {
    if (background) {
      setIsRefreshing(true);
    }

    try {
      const [apiReports, apiSummary] = await Promise.all([
        fetchAdminPotholeReports(),
        fetchAdminPotholeSummary(),
      ]);
      const nextReports = apiReports.map(mapApiPotholeReport);

      const known = knownIdsRef.current;
      if (known) {
        const arrived = nextReports.filter((report) => !known.has(report.id));
        if (arrived.length > 0) {
          setToast(
            arrived.length === 1
              ? `New pothole report received: ${arrived[0].id}.`
              : `${arrived.length} new pothole reports received.`,
          );
        }
      }
      knownIdsRef.current = new Set(nextReports.map((report) => report.id));

      setReports(nextReports);
      setSummary(mapApiPotholeSummary(apiSummary));
      setLastUpdated(new Date());
      setLoadError("");
      setLoadState("ready");
    } catch (error) {
      setLoadError(errorMessage(error, "Could not load the pothole reports."));
      if (!background) {
        setLoadState("error");
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  // New resident reports appear without reloading: re-check periodically and
  // whenever the tab becomes visible again.
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void loadData(true);
      }
    };
    const timer = window.setInterval(
      refreshIfVisible,
      POTHOLE_REFRESH_INTERVAL_MS,
    );
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [loadData]);

  // Free the downloaded photos when the page closes.
  useEffect(() => releasePotholePhotos, []);

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

  const reportsWithoutLocation = filteredReports.filter(
    (report) => !hasPotholeCoordinates(report),
  ).length;

  // Looked up on every render so the open panel always shows the latest data.
  const detailsReport =
    reports.find((report) => report.id === detailsReportId) ?? null;
  const detailsRecordId = detailsReport?.recordId ?? null;

  /** Puts a fresh copy of one report (from a detail/update call) in the list. */
  const applyDetail = useCallback((detail: PotholeReportDetail) => {
    const { history: nextHistory, ...report } = detail;
    setReports((current) =>
      current.map((entry) =>
        entry.recordId === report.recordId ? report : entry,
      ),
    );
    setHistory(nextHistory);
    setHistoryError("");
  }, []);

  // The history (status changes and remarks) is loaded per opened report.
  useEffect(() => {
    if (detailsRecordId === null) {
      return;
    }

    let cancelled = false;
    setHistory(null);
    setHistoryError("");

    fetchAdminPotholeReport(detailsRecordId)
      .then((detail) => {
        if (!cancelled) applyDetail(mapApiPotholeDetail(detail));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setHistoryError(errorMessage(error, "Could not load the history."));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detailsRecordId, historyReloadKey, applyDetail]);

  const refreshSummary = () => {
    fetchAdminPotholeSummary()
      .then((apiSummary) => setSummary(mapApiPotholeSummary(apiSummary)))
      .catch(() => {
        // The next background refresh corrects the statistics.
      });
  };

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
    // A report hidden by the filters has no marker: show everything again.
    if (!filteredReports.some((report) => report.id === reportId)) {
      setFilters(DEFAULT_POTHOLE_FILTERS);
      setPage(1);
    }

    setSelectedReportId(reportId);
    mapSectionRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  };

  const handleOpenDetails = (reportId: string) => {
    setActionError("");
    setDetailsReportId(reportId);
  };

  const handleCloseDetails = () => {
    setDetailsReportId(null);
    setPendingAction(null);
    setHistory(null);
  };

  const handleConfirmAction = async (remark: string) => {
    if (!detailsReport || !pendingAction || isSavingAction) {
      return;
    }

    const { targetStatus } = POTHOLE_ACTION_META[pendingAction];
    if (targetStatus === "pending") {
      return;
    }

    setIsSavingAction(true);
    setActionError("");

    try {
      const detail = await updateAdminPotholeStatus(
        detailsReport.recordId,
        targetStatus,
        remark,
      );
      applyDetail(mapApiPotholeDetail(detail));
      refreshSummary();
      setToast(
        `${detailsReport.id} is now ${POTHOLE_STATUS_META[targetStatus].label}.`,
      );
      setPendingAction(null);
    } catch (error) {
      setActionError(errorMessage(error, "Could not update the report."));
      // Someone else changed the report first: show its real status.
      if (error instanceof ApiError && error.status === 409) {
        void loadData(true);
        setHistoryReloadKey((key) => key + 1);
      }
    } finally {
      setIsSavingAction(false);
    }
  };

  const handleAddRemark = async (text: string): Promise<boolean> => {
    if (!detailsReport) {
      return false;
    }

    setIsSavingRemark(true);

    try {
      const detail = await addAdminPotholeRemark(detailsReport.recordId, text);
      applyDetail(mapApiPotholeDetail(detail));
      setToast(`Remark added to ${detailsReport.id}.`);
      return true;
    } catch (error) {
      setToast(errorMessage(error, "Could not save the remark."));
      return false;
    } finally {
      setIsSavingRemark(false);
    }
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
          subtitle="Review residents' pothole reports, see where they are, and track repairs."
          unreadNotifications={unreadNotifications}
          onNotifications={onNotifications}
        />

        {loadState === "loading" && (
          <div className="pothole-page-state" aria-busy="true">
            Loading pothole reports…
          </div>
        )}

        {loadState === "error" && (
          <div className="pothole-page-state is-error" role="alert">
            <strong>Pothole reports could not be loaded.</strong>
            <span>{loadError}</span>
            <button
              type="button"
              className="pothole-button pothole-button--primary"
              onClick={() => {
                setLoadState("loading");
                void loadData(false);
              }}
            >
              Try again
            </button>
          </div>
        )}

        {loadState === "ready" && summary && (
          <>
            <div className="pothole-refresh-bar">
              <span className="pothole-refresh-text" role="status">
                {loadError
                  ? `Could not refresh: ${loadError}`
                  : lastUpdated
                    ? `Updated ${formatTime(lastUpdated)} · checks for new reports every minute`
                    : ""}
              </span>
              <button
                type="button"
                className="pothole-button"
                onClick={() => void loadData(true)}
                disabled={isRefreshing}
              >
                <RefreshCw
                  size={14}
                  className={isRefreshing ? "pothole-photo-spin" : undefined}
                  aria-hidden="true"
                />
                {isRefreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <PotholeStatsGrid stats={summary.stats} />

            <PotholeToolbar
              filters={filters}
              resultCount={filteredReports.length}
              totalCount={reports.length}
              onChange={handleFiltersChange}
              onClear={handleClearFilters}
            />

            <div className="pothole-overview">
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
                  onViewDetails={handleOpenDetails}
                />

                {reportsWithoutLocation > 0 && (
                  <p className="pothole-map-footnote">
                    {reportsWithoutLocation === 1
                      ? "1 report has no captured location and is only listed in the table."
                      : `${reportsWithoutLocation} reports have no captured location and are only listed in the table.`}
                  </p>
                )}
              </section>

              <PotholePurokSummary
                summary={summary}
                activePurok={filters.purok}
                onSelectPurok={(purok) => handleFiltersChange({ purok })}
              />
            </div>

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
              onViewDetails={handleOpenDetails}
              onLocate={handleLocate}
              onClearFilters={handleClearFilters}
            />
          </>
        )}

        {detailsReport && (
          <PotholeDetailsModal
            // Remount per report so its draft remark never carries over.
            key={detailsReport.id}
            report={detailsReport}
            history={history}
            historyError={historyError}
            isAdministratorAccount={isAdministratorAccount}
            isActive={pendingAction === null}
            isSavingRemark={isSavingRemark}
            onClose={handleCloseDetails}
            onAction={(action) => {
              setActionError("");
              setPendingAction(action);
            }}
            onAddRemark={handleAddRemark}
            onLocate={() => {
              const reportId = detailsReport.id;
              handleCloseDetails();
              handleLocate(reportId);
            }}
            onRetryHistory={() => setHistoryReloadKey((key) => key + 1)}
          />
        )}

        {detailsReport && pendingAction && (
          <PotholeConfirmModal
            action={pendingAction}
            reportId={detailsReport.id}
            isSaving={isSavingAction}
            saveError={actionError}
            onCancel={() => {
              setPendingAction(null);
              setActionError("");
            }}
            onConfirm={(remark) => void handleConfirmAction(remark)}
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
