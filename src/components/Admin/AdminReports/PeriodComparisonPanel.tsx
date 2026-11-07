import type {
  AdminCompletionStats,
  AdminPeriodComparison,
} from "../../../Types/Admin/AdminReportsType";
import {
  changeTone,
  formatChange,
  formatCount,
  formatIsoRange,
  formatPercent,
} from "../../../Utils/Admin/AdminAnalyticsDisplay";

type PeriodComparisonPanelProps = {
  comparison: AdminPeriodComparison | null;
  completion: AdminCompletionStats;
};

/**
 * Request completion statistics for the period plus a comparison with the
 * previous period of the same length (not shown for "All time").
 */
const PeriodComparisonPanel = ({
  comparison,
  completion,
}: PeriodComparisonPanelProps) => {
  const outcomes = [
    {
      key: "completed",
      label: "Completed",
      value: completion.completed,
      share: completion.completion_rate,
    },
    {
      key: "rejected",
      label: "Rejected",
      value: completion.rejected,
      share: completion.rejection_rate,
    },
    {
      key: "open",
      label: "Still open",
      value: completion.open_requests,
      share: completion.open_rate,
    },
  ];

  return (
    <section className="admin-panel reports-panel">
      <h3 className="admin-panel-title">Request Completion</h3>
      <p className="analytics-panel-scope">
        Outcome of the {formatCount(completion.total_requests)} request
        {completion.total_requests === 1 ? "" : "s"} submitted in this period
      </p>

      <dl className="analytics-resident-counters reports-counters-3">
        {outcomes.map((outcome) => (
          <div key={outcome.key} className="analytics-counter">
            <dt>{outcome.label}</dt>
            <dd>
              {formatCount(outcome.value)}{" "}
              <small>{formatPercent(outcome.share)}</small>
            </dd>
          </div>
        ))}
      </dl>

      <p className="reports-inline-facts">
        During this period <strong>{formatCount(completion.completed_in_period)}</strong>{" "}
        request{completion.completed_in_period === 1 ? " was" : "s were"} completed
        and <strong>{formatCount(completion.rejected_in_period)}</strong> rejected
        (including requests submitted earlier).
      </p>

      <h4 className="analytics-subtitle">Compared with previous period</h4>
      {comparison === null ? (
        <p className="reports-chart-empty">
          Select a date range to compare it with the previous period.
        </p>
      ) : (
        <>
          <p className="analytics-panel-scope">
            {formatIsoRange(comparison.previous_from, comparison.previous_to)}
          </p>
          <table className="reports-mini-table">
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">This period</th>
                <th scope="col">Previous</th>
                <th scope="col">Change</th>
              </tr>
            </thead>
            <tbody>
              {comparison.metrics.map((metric) => (
                <tr key={metric.key}>
                  <th scope="row">{metric.label}</th>
                  <td>{formatCount(metric.current)}</td>
                  <td>{formatCount(metric.previous)}</td>
                  <td className={`reports-change ${changeTone(metric.change)}`}>
                    {formatChange(metric.change, metric.change_percentage)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
};

export default PeriodComparisonPanel;
