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
  value: number;
  label: string;
  note: string;
  tone: string;
  noteClass?: string;
};

type AdminStatsGridProps = {
  stats: AdminStats;
};

const AdminStatsGrid = ({ stats }: AdminStatsGridProps) => {
  const cards: StatCard[] = [
    {
      key: "residents",
      icon: residentsIcon,
      value: stats.total_residents,
      label: "Total Residents",
      note: `+${stats.new_residents_this_month} this month`,
      tone: "blue",
      noteClass: "admin-stat-note-muted",
    },
    {
      key: "pending",
      icon: hourglassIcon,
      value: stats.pending,
      label: "Pending Requests",
      note: "Action needed",
      tone: "amber",
      noteClass: "admin-stat-note-warning",
    },
    {
      key: "approved",
      icon: acceptIcon,
      value: stats.approved,
      label: "Approved",
      note: "Awaiting processing",
      tone: "green",
    },
    {
      key: "processing",
      icon: clockIcon,
      value: stats.processing,
      label: "Processing",
      note: "In progress",
      tone: "purple",
      noteClass: "admin-stat-note-purple",
    },
    {
      key: "completed",
      icon: stampIcon,
      value: stats.completed,
      label: "Completed",
      note: "This month",
      tone: "teal",
    },
    {
      key: "rejected",
      icon: rejectIcon,
      value: stats.rejected,
      label: "Rejected",
      note: "This month",
      tone: "red",
      noteClass: "admin-stat-note-danger",
    },
  ];

  return (
    <div className="admin-stats-grid">
      {cards.map((card) => (
        <article key={card.key} className="admin-stat-card">
          <span className={`admin-stat-icon ${card.tone}`} aria-hidden="true">
            <img src={card.icon} alt="" />
          </span>

          <div className="admin-stat-body">
            <p className="admin-stat-value">{card.value}</p>
            <p className="admin-stat-label">{card.label}</p>
            <p className={`admin-stat-note ${card.noteClass ?? ""}`}>
              {card.note}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
};

export default AdminStatsGrid;
