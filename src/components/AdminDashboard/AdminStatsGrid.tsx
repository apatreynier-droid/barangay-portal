import residentsIcon from "../../assets/icons/Residents.png";
import hourglassIcon from "../../assets/icons/hourglass.png";
import acceptIcon from "../../assets/icons/accept.png";
import clockIcon from "../../assets/icons/clock.png";
import stampIcon from "../../assets/icons/stamp.png";
import rejectIcon from "../../assets/icons/reject.png";
import type { AdminStats } from "../../Types/AdminDashboardType";

type StatCard = {
  key: string;
  icon: string;
  /** Live value straight from the dashboard payload; never invented. */
  value: (stats: AdminStats) => number;
  label: string;
  /** Supporting text; a function when it derives from another live value. */
  note: string | ((stats: AdminStats) => string);
  tone: string;
  noteClass?: string;
  /** Pending/Approved drive the admin workflow, so they get extra emphasis. */
  highlight?: boolean;
};

/**
 * Which half of the six statistics a grid instance renders. The dashboard
 * splits them so the mobile section order can surface Pending/Approved next
 * to the request summary while the remaining four cards flow after the
 * Recent Requests panel; on desktop CSS merges both halves back into the
 * single three-per-row grid (see .admin-dashboard-layout in AdminDashboard.css).
 */
export type AdminStatsGroup = "highlights" | "remaining";

type AdminStatsGridProps = {
  stats: AdminStats;
  group?: AdminStatsGroup;
};

/** Ordered Pending → Approved → Residents → Processing → Completed → Rejected. */
const ALL_CARDS: StatCard[] = [
  {
    key: "pending",
    icon: hourglassIcon,
    value: (stats) => stats.pending,
    label: "Pending Requests",
    note: "Action needed",
    tone: "amber",
    noteClass: "admin-stat-note-warning",
    highlight: true,
  },
  {
    key: "approved",
    icon: acceptIcon,
    value: (stats) => stats.approved,
    label: "Approved",
    note: "Awaiting processing",
    tone: "green",
    highlight: true,
  },
  {
    key: "residents",
    icon: residentsIcon,
    value: (stats) => stats.total_residents,
    label: "Total Residents",
    note: (stats) => `+${stats.new_residents_this_month} this month`,
    tone: "blue",
    noteClass: "admin-stat-note-muted",
  },
  {
    key: "processing",
    icon: clockIcon,
    value: (stats) => stats.processing,
    label: "Processing",
    note: "In progress",
    tone: "purple",
    noteClass: "admin-stat-note-purple",
  },
  {
    key: "completed",
    icon: stampIcon,
    value: (stats) => stats.completed,
    label: "Completed",
    note: "This month",
    tone: "teal",
  },
  {
    key: "rejected",
    icon: rejectIcon,
    value: (stats) => stats.rejected,
    label: "Rejected",
    note: "This month",
    tone: "red",
    noteClass: "admin-stat-note-danger",
  },
];

const HIGHLIGHT_KEYS = new Set(["pending", "approved"]);

const AdminStatsGrid = ({ stats, group = "remaining" }: AdminStatsGridProps) => {
  const cards = ALL_CARDS.filter((card) =>
    group === "highlights"
      ? HIGHLIGHT_KEYS.has(card.key)
      : !HIGHLIGHT_KEYS.has(card.key),
  );

  return (
    <div className={`admin-stats-grid admin-stats-grid--${group}`}>
      {cards.map((card) => (
        <article
          key={card.key}
          className={`admin-stat-card${
            card.highlight ? " admin-stat-card--highlight" : ""
          }`}
        >
          <span className={`admin-stat-icon ${card.tone}`} aria-hidden="true">
            <img src={card.icon} alt="" />
          </span>

          <div className="admin-stat-body">
            <p className="admin-stat-value">{card.value(stats)}</p>
            <p className="admin-stat-label">{card.label}</p>
            <p className={`admin-stat-note ${card.noteClass ?? ""}`}>
              {typeof card.note === "function" ? card.note(stats) : card.note}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
};

export default AdminStatsGrid;
