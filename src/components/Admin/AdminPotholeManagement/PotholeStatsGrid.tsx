import potholeIcon from "../../../assets/icons/pothole.png";
import hourglassIcon from "../../../assets/icons/hourglass.png";
import acceptIcon from "../../../assets/icons/accept.png";
import loadingIcon from "../../../assets/icons/loading.png";
import stampIcon from "../../../assets/icons/stamp.png";
import type { PotholeStats } from "../../../Types/Admin/AdminPotholeManagementType";

const PotholeStatsGrid = ({ stats }: { stats: PotholeStats }) => {
  const cards = [
    {
      key: "total",
      icon: potholeIcon,
      value: stats.total,
      label: "Total Pothole Reports",
      // Without this, the four cards below would not add up to the total.
      note: `Includes ${stats.rejected} rejected`,
      tone: "blue",
    },
    {
      key: "pending",
      icon: hourglassIcon,
      value: stats.pending,
      label: "Pending Reports",
      note: "Needs review",
      tone: "amber",
    },
    {
      key: "verified",
      icon: acceptIcon,
      value: stats.verified,
      label: "Verified Reports",
      note: "Awaiting repair",
      tone: "teal",
    },
    {
      key: "under-maintenance",
      icon: loadingIcon,
      value: stats.underMaintenance,
      label: "Under Maintenance",
      note: "Repair in progress",
      tone: "purple",
    },
    {
      key: "resolved",
      icon: stampIcon,
      value: stats.resolved,
      label: "Resolved Reports",
      note: "Repaired",
      tone: "green",
    },
  ];

  return (
    <div className="admin-stats-grid pothole-stats-grid">
      {cards.map((card) => (
        <article key={card.key} className="admin-stat-card">
          <span className={`admin-stat-icon ${card.tone}`} aria-hidden="true">
            <img src={card.icon} alt="" />
          </span>

          <div className="admin-stat-body">
            <p className="admin-stat-value">{card.value}</p>
            <p className="admin-stat-label">{card.label}</p>
            <p className="admin-stat-note">{card.note}</p>
          </div>
        </article>
      ))}
    </div>
  );
};

export default PotholeStatsGrid;
