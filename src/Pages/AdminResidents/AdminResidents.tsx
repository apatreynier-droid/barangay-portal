import "../AdminDashboard/AdminDashboard.css";
import "./AdminResidents.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../Utils/api";
import { fetchAdminDashboard, fetchResidents } from "../../Utils/api";
import type { AdminResident } from "../../Types/AdminResidentsType";
import { ADMIN_DISPLAY_NAME } from "../../Utils/AdminDisplay";
import AdminSidebar from "../../components/AdminDashboard/AdminSidebar";
import useResponsiveSidebar from "../../Utils/useResponsiveSidebar";
import AdminTopbar from "../../components/AdminDashboard/AdminTopbar";
import ResidentsToolbar from "../../components/AdminResidents/ResidentsToolbar";
import ResidentsTable from "../../components/AdminResidents/ResidentsTable";
import ResidentDetailsView from "../../components/AdminResidents/ResidentDetailsView";
import {
  DEFAULT_RESIDENTS_FILTERS,
  filterResidents,
} from "../../Utils/AdminResidentsLogic";
import type { ResidentsFiltersState } from "../../Utils/AdminResidentsLogic";

type AdminResidentsProps = {
  user: AuthUser;
  unreadNotifications: number;
  onDashboard: () => void;
  onDocumentRequests: () => void;
  onRequestHistory: () => void;
  onApprovals: () => void;
  onDocumentManagement: () => void;
  onNotifications: () => void;
  onReports: () => void;
  onActivityLogs: () => void;
  onLogout: () => void;
};

const AdminResidents = ({
  unreadNotifications,
  onDashboard,
  onDocumentRequests,
  onRequestHistory,
  onApprovals,
  onDocumentManagement,
  onNotifications,
  onReports,
  onActivityLogs,
  onLogout,
}: AdminResidentsProps) => {
  const [residents, setResidents] = useState<AdminResident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<ResidentsFiltersState>(
    DEFAULT_RESIDENTS_FILTERS,
  );
  const [selectedResidentId, setSelectedResidentId] = useState<number | null>(
    null,
  );
  const [sidebarStats, setSidebarStats] = useState({ pending: 0, approved: 0 });

  const loadResidents = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      setResidents(await fetchResidents());
    } catch {
      setError("Could not load the residents. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadResidents();
  }, [loadResidents]);

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
        // Badges are optional here; the residents list still loads.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredResidents = useMemo(
    () => filterResidents(residents, filters),
    [residents, filters],
  );

  const fullName = ADMIN_DISPLAY_NAME;
  const roleLabel = "Brgy. Administrator";

  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  return (
    <div className="admin-dashboard">
      <AdminSidebar
        pendingRequests={sidebarStats.pending}
        pendingApprovals={sidebarStats.approved}
        unreadNotifications={unreadNotifications}
        firstName={ADMIN_DISPLAY_NAME}
        lastName=""
        role={roleLabel}
        activeItem="residents"
        onDashboard={onDashboard}
        onResidents={() => undefined}
        onDocumentRequests={onDocumentRequests}
        onRequestHistory={onRequestHistory}
        onApprovals={onApprovals}
        onDocumentManagement={onDocumentManagement}
        onReports={onReports}
        onActivityLogs={onActivityLogs}
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
          title="Residents"
          subtitle="Manage registered residents of Barangay Lagab."
        />

        {selectedResidentId !== null ? (
          <ResidentDetailsView
            residentId={selectedResidentId}
            onBack={() => setSelectedResidentId(null)}
            onResidentChanged={() => void loadResidents()}
          />
        ) : (
          <>
            {error && (
              <div className="admin-error-banner" role="alert">
                <span>{error}</span>
                <button type="button" onClick={() => void loadResidents()}>
                  Retry
                </button>
              </div>
            )}

            <ResidentsToolbar
              residents={residents}
              search={filters.search}
              purok={filters.purok}
              status={filters.status}
              resultCount={filteredResidents.length}
              totalCount={residents.length}
              onSearchChange={(search) =>
                setFilters((previous) => ({ ...previous, search }))
              }
              onPurokChange={(purok) =>
                setFilters((previous) => ({ ...previous, purok }))
              }
              onStatusChange={(status) =>
                setFilters((previous) => ({ ...previous, status }))
              }
            />

            {isLoading && residents.length === 0 ? (
              <p className="admin-loading-state">Loading the residents…</p>
            ) : (
              <ResidentsTable
                residents={filteredResidents}
                onView={(resident) => setSelectedResidentId(resident.id)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default AdminResidents;
