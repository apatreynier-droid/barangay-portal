import type { AdminPotholeAnalytics } from "../../../Types/Admin/AdminReportsType";
import {
  SERIES_COLOR,
  UNSPECIFIED_COLOR,
  formatCount,
  formatPercent,
} from "../../../Utils/Admin/AdminAnalyticsDisplay";
import TrendBarChart from "./TrendBarChart";

type PotholeAnalyticsPanelProps = {
  stats: AdminPotholeAnalytics;
  intervalLabel: string;
};

/**
 * Statistics of the pothole reports residents submitted in the period:
 * totals, status split, resolved vs unresolved, reports per road and the
 * reporting trend. (Reports per Purok are in the Purok comparison table.)
 * Statistical analysis only - no detection or classification.
 */
const PotholeAnalyticsPanel = ({ stats, intervalLabel }: PotholeAnalyticsPanelProps) => {
  if (!stats.available) {
    return (
      <section className="admin-panel reports-pothole-panel">
        <h3 className="admin-panel-title">Pothole Reports</h3>
        <p className="reports-chart-empty">
          Pothole reports are not set up on the server yet.
        </p>
      </section>
    );
  }

  const maxRoad = Math.max(1, ...stats.by_road.map((row) => row.count));
  const counters = [
    { key: "total", label: "Total reports", value: formatCount(stats.total) },
    { key: "resolved", label: "Resolved", value: formatCount(stats.resolved) },
    { key: "unresolved", label: "Unresolved", value: formatCount(stats.unresolved) },
    { key: "rejected", label: "Rejected", value: formatCount(stats.rejected) },
    { key: "rate", label: "Resolution rate", value: formatPercent(stats.resolution_rate) },
  ];

  return (
    <section className="admin-panel reports-pothole-panel">
      <h3 className="admin-panel-title">Pothole Reports</h3>

      {stats.total === 0 ? (
        <p className="reports-chart-empty">
          No pothole reports were submitted in this period.
        </p>
      ) : (
        <>
          <dl className="analytics-resident-counters">
            {counters.map((counter) => (
              <div
                key={counter.key}
                className={`analytics-counter${counter.key === "total" ? " is-registered" : ""}`}
              >
                <dt>{counter.label}</dt>
                <dd>{counter.value}</dd>
              </div>
            ))}
          </dl>
          <p className="analytics-panel-scope">
            Resolution rate = resolved ÷ (resolved + unresolved). Rejected
            reports are not counted as either.
          </p>

          <div className="reports-pothole-grid">
            <div>
              <h4 className="analytics-subtitle">By status</h4>
              <ul className="analytics-status-list reports-single-column">
                {stats.by_status.map((row) => (
                  <li key={row.status}>
                    <span className="analytics-status-name">{row.label}</span>
                    <span className="analytics-status-count">
                      {formatCount(row.count)}
                    </span>
                    <span className="analytics-status-share">
                      {formatPercent(row.percentage)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="analytics-subtitle">Most reported roads</h4>
              <ul className="reports-stage-list">
                {stats.by_road.map((row) => (
                  <li key={row.road_name}>
                    <span className="reports-stage-name">{row.road_name}</span>
                    <span className="analytics-purok-bar" aria-hidden="true">
                      <span
                        style={{
                          width: `${(row.count / maxRoad) * 100}%`,
                          background:
                            row.road_name === "Not specified"
                              ? UNSPECIFIED_COLOR
                              : SERIES_COLOR,
                        }}
                      />
                    </span>
                    <span className="reports-stage-value">
                      {formatCount(row.count)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <h4 className="analytics-subtitle reports-section-gap">
            Reports submitted ({intervalLabel})
          </h4>
          <TrendBarChart
            ariaLabel="Pothole reports per period"
            valueLabel="Reports"
            data={stats.trend.map((point) => ({
              label: point.label,
              value: point.reported,
              period_start: point.period_start,
              period_end: point.period_end,
              details: [{ label: "Resolved now", value: point.resolved }],
            }))}
          />
        </>
      )}
    </section>
  );
};

export default PotholeAnalyticsPanel;
