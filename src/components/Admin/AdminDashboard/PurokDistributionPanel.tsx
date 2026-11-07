import type {
  AdminPurokAnalytics,
  AdminResidentSummary,
} from "../../../Types/Admin/AdminDashboardType";
import {
  SERIES_COLOR,
  UNSPECIFIED_COLOR,
  formatCount,
  formatPercent,
} from "../../../Utils/Admin/AdminAnalyticsDisplay";

type PurokDistributionPanelProps = {
  summary: AdminResidentSummary;
  puroks: AdminPurokAnalytics[];
};

/**
 * Resident overview (accounts by status) and the resident distribution over
 * the seven standardized Puroks. Every Purok is listed, with 0 when it has
 * no registered residents; residents without a Purok appear as
 * "Not specified" so the shares add up to the real total.
 */
const PurokDistributionPanel = ({
  summary,
  puroks,
}: PurokDistributionPanelProps) => {
  const maxResidents = Math.max(1, ...puroks.map((row) => row.residents));

  const counters = [
    { key: "registered", label: "Registered", value: summary.total_registered },
    { key: "active", label: "Active", value: summary.active },
    { key: "pending", label: "Pending", value: summary.pending },
    { key: "rejected", label: "Rejected", value: summary.rejected },
    { key: "deactivated", label: "Deactivated", value: summary.deactivated },
  ];

  return (
    <section className="admin-panel analytics-purok-panel">
      <h3 className="admin-panel-title">Residents Overview</h3>

      <dl className="analytics-resident-counters">
        {counters.map((counter) => (
          <div key={counter.key} className={`analytics-counter is-${counter.key}`}>
            <dt>{counter.label}</dt>
            <dd>{formatCount(counter.value)}</dd>
          </div>
        ))}
      </dl>

      <div className="analytics-purok-header">
        <h4 className="analytics-subtitle">Distribution by Purok</h4>
        <span className="analytics-purok-columns" aria-hidden="true">
          <span>Residents</span>
          <span>Requests</span>
        </span>
      </div>

      {summary.total_registered === 0 ? (
        <p className="admin-empty-note">No registered residents yet.</p>
      ) : (
        <ul className="analytics-purok-list">
          {puroks.map((row) => (
            <li
              key={row.purok}
              className={row.is_standardized ? undefined : "is-unspecified"}
            >
              <span className="analytics-purok-name">{row.purok}</span>
              <span className="analytics-purok-bar" aria-hidden="true">
                <span
                  style={{
                    width: `${(row.residents / maxResidents) * 100}%`,
                    background: row.is_standardized
                      ? SERIES_COLOR
                      : UNSPECIFIED_COLOR,
                  }}
                />
              </span>
              <span
                className="analytics-purok-value"
                title={`${row.residents} of ${summary.total_registered} registered residents`}
              >
                {formatCount(row.residents)}
                <small>{formatPercent(row.resident_percentage)}</small>
              </span>
              <span
                className="analytics-purok-value"
                title={`${row.requests} document requests from residents of ${row.purok}`}
              >
                {formatCount(row.requests)}
                <small>{formatPercent(row.request_percentage)}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default PurokDistributionPanel;
