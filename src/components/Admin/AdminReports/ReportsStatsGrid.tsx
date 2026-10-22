import type { AdminReportsSummary } from "../../../Types/Admin/AdminReportsType";

type StatCard = {
  key: string;
  value: string;
  label: string;
  note: string;
  tone: string;
};

type ReportsStatsGridProps = {
  summary: AdminReportsSummary;
};

const ReportsStatsGrid = ({ summary }: ReportsStatsGridProps) => {
  const cards: StatCard[] = [
    {
      key: "residents",
      value: String(summary.total_residents),
      label: "Total Residents",
      note: `${summary.active_residents} active`,
      tone: "blue",
    },
    {
      key: "requests",
      value: String(summary.total_requests),
      label: "Total Requests",
      note: "All time",
      tone: "purple",
    },
    {
      key: "completion",
      value: `${Math.round(summary.completion_rate)}%`,
      label: "Completion Rate",
      note: `${summary.completed} completed`,
      tone: "green",
    },
    {
      key: "rejection",
      value: `${Math.round(summary.rejection_rate)}%`,
      label: "Rejection Rate",
      note: `${summary.rejected} rejected`,
      tone: "red",
    },
  ];

  return (
    <div className="reports-stats-grid">
      {cards.map((card) => (
        <article key={card.key} className="reports-stat-card">
          <p className={`reports-stat-value reports-stat-${card.tone}`}>
            {card.value}
          </p>
          <p className="reports-stat-label">{card.label}</p>
          <p className="reports-stat-note">{card.note}</p>
        </article>
      ))}
    </div>
  );
};

export default ReportsStatsGrid;
