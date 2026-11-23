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
  /** Opens the Recent Requests modal on the chosen status. */
  onOpenStatus: (filter: AdminStatusFilter) => void;
};

/** Icon per filter chip, matching the stat-card icons for the same statuses. */
const FILTER_ICONS: Record<AdminStatusFilter, string> = {
  all: allIcon,
  Pending: pendingIcon,
  Approved: approvedIcon,
  Processing: processingIcon,
};

/**
 * Compact status summary for the dashboard. Each chip opens the Recent
 * Requests modal on that status; counts come from the loaded rows.
 */
const AdminStatusStrip = ({ requests, onOpenStatus }: AdminStatusStripProps) => {
  if (requests.length === 0) {
    return null;
  }

  const countFor = (filter: AdminStatusFilter): number =>
    requests.filter((request) =>
      matchesAdminStatusFilter(request.status, filter),
    ).length;

  return (
    <section className="admin-status-strip" aria-label="Request status summary">
      {ADMIN_STATUS_FILTER_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          className="admin-status-chip"
          aria-haspopup="dialog"
          onClick={() => onOpenStatus(option.key)}
        >
          <span className="admin-status-chip-icon" aria-hidden="true">
            <img src={FILTER_ICONS[option.key]} alt="" />
          </span>
          <span className="admin-status-chip-label">{option.label}</span>
          <span className="admin-status-chip-count">{countFor(option.key)}</span>
        </button>
      ))}
    </section>
  );
};

export default AdminStatusStrip;
