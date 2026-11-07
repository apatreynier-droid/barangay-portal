import type { AdminProcessingTimeStats } from "../../../Types/Admin/AdminReportsType";
import {
  SERIES_COLOR,
  formatCount,
  formatDuration,
} from "../../../Utils/Admin/AdminAnalyticsDisplay";

type ProcessingTimePanelProps = {
  stats: AdminProcessingTimeStats;
};

/**
 * Request processing time of the requests completed in the period, measured
 * from real timestamps only (submission, status-history entries, completion).
 * Records whose timestamps are missing or out of order are excluded and
 * counted, never estimated.
 */
const ProcessingTimePanel = ({ stats }: ProcessingTimePanelProps) => {
  const { overall, stages, by_document_type: byType } = stats;
  const maxStage = Math.max(
    0.0001,
    ...stages.map((stage) => stage.average_hours ?? 0),
  );

  const tiles = [
    { key: "average", label: "Average", value: overall.average_hours },
    { key: "median", label: "Median", value: overall.median_hours },
    { key: "p90", label: "90% within", value: overall.p90_hours },
    { key: "max", label: "Slowest", value: overall.max_hours },
  ];

  return (
    <section className="admin-panel reports-panel">
      <div className="analytics-panel-heading">
        <h3 className="admin-panel-title">Processing Time</h3>
        <p className="analytics-panel-total">
          <strong>{formatCount(overall.count)}</strong> completed
        </p>
      </div>
      <p className="analytics-panel-scope">
        Submission to completion, for requests completed in this period
      </p>

      {overall.count === 0 ? (
        <p className="reports-chart-empty">
          No requests were completed in this period.
        </p>
      ) : (
        <>
          <dl className="reports-duration-tiles">
            {tiles.map((tile) => (
              <div key={tile.key}>
                <dt>{tile.label}</dt>
                <dd>{formatDuration(tile.value)}</dd>
              </div>
            ))}
          </dl>

          <h4 className="analytics-subtitle">Average time per stage</h4>
          <ul className="reports-stage-list">
            {stages.map((stage) => (
              <li key={stage.stage}>
                <span className="reports-stage-name">{stage.stage}</span>
                <span className="analytics-purok-bar" aria-hidden="true">
                  <span
                    style={{
                      width: `${((stage.average_hours ?? 0) / maxStage) * 100}%`,
                      background: SERIES_COLOR,
                    }}
                  />
                </span>
                <span
                  className="reports-stage-value"
                  title={`Median ${formatDuration(stage.median_hours)} · ${stage.count} measured`}
                >
                  {formatDuration(stage.average_hours)}
                </span>
              </li>
            ))}
          </ul>

          {byType.length > 0 && (
            <table className="reports-mini-table">
              <caption className="analytics-subtitle">By document type</caption>
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Completed</th>
                  <th scope="col">Average</th>
                  <th scope="col">Median</th>
                </tr>
              </thead>
              <tbody>
                {byType.map((row) => (
                  <tr key={row.document_name}>
                    <th scope="row">{row.document_name}</th>
                    <td>{formatCount(row.count)}</td>
                    <td>{formatDuration(row.average_hours)}</td>
                    <td>{formatDuration(row.median_hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {stats.excluded_records > 0 && (
        <p className="analytics-panel-scope reports-footnote">
          {stats.excluded_records} completed request
          {stats.excluded_records === 1 ? " was" : "s were"} excluded because
          their timestamps are missing or out of order.
        </p>
      )}
    </section>
  );
};

export default ProcessingTimePanel;
