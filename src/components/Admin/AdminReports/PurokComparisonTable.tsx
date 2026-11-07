import type { AdminPurokAnalytics } from "../../../Types/Admin/AdminDashboardType";
import {
  formatCount,
  formatPercent,
} from "../../../Utils/Admin/AdminAnalyticsDisplay";

type PurokComparisonTableProps = {
  rows: AdminPurokAnalytics[];
  /** Pothole column is shown only when pothole reports are set up. */
  showPotholes: boolean;
};

/**
 * Side-by-side comparison of the seven Puroks: registered residents (current),
 * document requests and pothole reports in the selected period. Puroks with
 * no records show 0; the busiest Purok of each measure is highlighted.
 */
const PurokComparisonTable = ({ rows, showPotholes }: PurokComparisonTableProps) => {
  const standardized = rows.filter((row) => row.is_standardized);
  const topOf = (pick: (row: AdminPurokAnalytics) => number): string | null => {
    const max = Math.max(0, ...standardized.map(pick));
    return max > 0 ? standardized.find((row) => pick(row) === max)?.purok ?? null : null;
  };
  const topResidents = topOf((row) => row.residents);
  const topRequests = topOf((row) => row.requests);
  const topPotholes = topOf((row) => row.potholes ?? 0);

  const totals = rows.reduce(
    (sum, row) => ({
      residents: sum.residents + row.residents,
      requests: sum.requests + row.requests,
      potholes: sum.potholes + (row.potholes ?? 0),
    }),
    { residents: 0, requests: 0, potholes: 0 },
  );

  return (
    <section className="admin-panel reports-purok-comparison">
      <h3 className="admin-panel-title">Purok Comparison</h3>
      <p className="analytics-panel-scope">
        Residents are the current registered residents; requests
        {showPotholes ? " and pothole reports" : ""} are for the selected period.
      </p>

      <div className="reports-table-scroll">
        <table className="reports-mini-table reports-purok-table">
          <thead>
            <tr>
              <th scope="col">Purok</th>
              <th scope="col">Residents</th>
              <th scope="col">Share</th>
              <th scope="col">Requests</th>
              <th scope="col">Share</th>
              <th scope="col">Requests / resident</th>
              {showPotholes && <th scope="col">Pothole reports</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.purok}
                className={row.is_standardized ? undefined : "is-unspecified"}
              >
                <th scope="row">{row.purok}</th>
                <td className={row.purok === topResidents ? "is-top" : undefined}>
                  {formatCount(row.residents)}
                </td>
                <td>{formatPercent(row.resident_percentage)}</td>
                <td className={row.purok === topRequests ? "is-top" : undefined}>
                  {formatCount(row.requests)}
                </td>
                <td>{formatPercent(row.request_percentage)}</td>
                <td>
                  {row.requests_per_resident === null
                    ? "—"
                    : row.requests_per_resident.toFixed(2)}
                </td>
                {showPotholes && (
                  <td className={row.purok === topPotholes ? "is-top" : undefined}>
                    {formatCount(row.potholes ?? 0)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{formatCount(totals.residents)}</td>
              <td>{totals.residents ? "100%" : "0%"}</td>
              <td>{formatCount(totals.requests)}</td>
              <td>{totals.requests ? "100%" : "0%"}</td>
              <td>
                {totals.residents
                  ? (totals.requests / totals.residents).toFixed(2)
                  : "—"}
              </td>
              {showPotholes && <td>{formatCount(totals.potholes)}</td>}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="analytics-panel-scope reports-footnote">
        Highlighted values are the highest among the seven Puroks.
        {rows.some((row) => !row.is_standardized) &&
          " “Not specified” counts records without a Purok."}
      </p>
    </section>
  );
};

export default PurokComparisonTable;
