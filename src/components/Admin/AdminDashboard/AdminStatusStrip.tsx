import type { AdminRecentRequest } from "../../../Types/Admin/AdminDashboardType";
import {
  ADMIN_STATUS_FILTER_OPTIONS,
  matchesAdminStatusFilter,
  type AdminStatusFilter,
} from "../../../Utils/Admin/AdminDashboardLogic";
import allIcon from "../../../assets/icons/files.png";
import pendingIcon from "../../../assets/icons/hourglass.png";
import approvedIcon from "../../../assets/icons/accept.png";
import processingIcon from "../../../assets/icons/clock.png";

type AdminStatusStripProps = {
  /** Latest requests (from GET /api/admin/dashboard); counts come from these rows. */
  requests: AdminRecentRequest[];
  /** Active status filter shared with the Recent Requests list. */
  activeFilter: AdminStatusFilter;
  /** Applies (or clears, via the active chip) the filter on the request list. */
  onFilterChange: (filter: AdminStatusFilter) => void;
};

/** Icon per filter chip, matching the stat-card icons for the same statuses. */
const FILTER_ICONS: Record<AdminStatusFilter, string> = {
  all: allIcon,
  Pending: pendingIcon,
  "Ready for Pickup": approvedIcon,
  Processing: processingIcon,
};

/**
 * Compact request-status summary shown at the top of the mobile dashboard.
 * Every chip is a real button wired to the Recent Requests list below it:
 * tapping (or keyboard-activating) a chip filters that list to the matching
 * status, and tapping the active chip again clears the filter. Counts are
 * derived from the actual recent-request rows the dashboard already loaded —
 * no decorative or fabricated numbers.
 */
const AdminStatusStrip = ({
  requests,
  activeFilter,
  onFilterChange,
}: AdminStatusStripProps) => {
  if (requests.length === 0) {
    return null;
  }

  const countFor = (filter: AdminStatusFilter): number =>
    requests.filter((request) =>
      matchesAdminStatusFilter(request.status, filter),
    ).length;

  return (
    <section className="admin-status-strip" aria-label="Request status summary">
      {ADMIN_STATUS_FILTER_OPTIONS.map((option) => {
        const isActive = activeFilter === option.key;

        return (
          <button
            key={option.key}
            type="button"
            className={`admin-status-chip${isActive ? " is-active" : ""}`}
            aria-pressed={isActive}
            onClick={() =>
              onFilterChange(isActive ? "all" : option.key)
            }
          >
            <span className="admin-status-chip-icon" aria-hidden="true">
              <img src={FILTER_ICONS[option.key]} alt="" />
            </span>
            <span className="admin-status-chip-label">{option.label}</span>
            <span className="admin-status-chip-count">{countFor(option.key)}</span>
          </button>
        );
      })}
    </section>
  );
};

export default AdminStatusStrip;
