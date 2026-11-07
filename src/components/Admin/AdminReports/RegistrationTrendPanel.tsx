import type { AdminRegistrationStats } from "../../../Types/Admin/AdminReportsType";
import { formatCount } from "../../../Utils/Admin/AdminAnalyticsDisplay";
import TrendBarChart from "./TrendBarChart";

type RegistrationTrendPanelProps = {
  stats: AdminRegistrationStats;
  intervalLabel: string;
};

/** Resident sign-ups per period, with their current review outcome. */
const RegistrationTrendPanel = ({
  stats,
  intervalLabel,
}: RegistrationTrendPanelProps) => {
  const counters = [
    { key: "total", label: "Sign-ups", value: stats.total },
    { key: "approved", label: "Approved", value: stats.approved },
    { key: "pending", label: "Pending", value: stats.pending },
    { key: "rejected", label: "Rejected", value: stats.rejected },
  ];

  return (
    <section className="admin-panel reports-panel">
      <h3 className="admin-panel-title">
        Resident Registrations ({intervalLabel})
      </h3>

      <dl className="analytics-resident-counters reports-counters-4">
        {counters.map((counter) => (
          <div
            key={counter.key}
            className={`analytics-counter${counter.key === "total" ? " is-registered" : ""}`}
          >
            <dt>{counter.label}</dt>
            <dd>{formatCount(counter.value)}</dd>
          </div>
        ))}
      </dl>

      {stats.total === 0 ? (
        <p className="reports-chart-empty">
          No resident registrations in this period.
        </p>
      ) : (
        <TrendBarChart
          ariaLabel="Resident registrations per period"
          valueLabel="Registrations"
          data={stats.trend.map((point) => ({
            label: point.label,
            value: point.registrations,
            period_start: point.period_start,
            period_end: point.period_end,
            details: [
              { label: "Approved", value: point.approved },
              { label: "Pending", value: point.pending },
              { label: "Rejected", value: point.rejected },
            ],
          }))}
        />
      )}
    </section>
  );
};

export default RegistrationTrendPanel;
