import type {
  AdminPeriodComparison,
  AdminReportsSummary,
} from "../../../Types/Admin/AdminReportsType";
import { formatChange } from "../../../Utils/Admin/AdminAnalyticsDisplay";

type StatCard = {
  key: string;
  value: string;
  label: string;
  note: string;
  tone: string;
};

type ReportsStatsGridProps = {
  summary: AdminReportsSummary;
  /** Null for "All time" (there is no previous period to compare with). */
  comparison: AdminPeriodComparison | null;
};

const ReportsStatsGrid = ({ summary, comparison }: ReportsStatsGridProps) => {
  const requestChange = comparison?.metrics.find((metric) => metric.key === "requests");

  const cards: StatCard[] = [
    {
      key: "residents",
      value: String(summary.total_residents),
      label: "Registered Residents",
      note: `${summary.active_residents} active · ${summary.new_registrations} new sign-ups in period`,
      tone: "blue",
    },
    {
      key: "requests",
      value: String(summary.total_requests),
      label: "Requests in Period",
      note: requestChange
        ? `${formatChange(requestChange.change, requestChange.change_percentage)} vs previous period`
        : `${summary.open_requests} still open`,
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
