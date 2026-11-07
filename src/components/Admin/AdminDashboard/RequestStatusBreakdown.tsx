import { useState } from "react";
import type { ReactNode } from "react";
import type { AdminStatusCount } from "../../../Types/Admin/AdminDashboardType";
import {
  REQUEST_STATUS_COLORS,
  formatCount,
  formatPercent,
} from "../../../Utils/Admin/AdminAnalyticsDisplay";

type RequestStatusBreakdownProps = {
  /** Every status with its count and share (from the backend analytics). */
  items: AdminStatusCount[];
  title?: string;
  /** Short scope note under the title, e.g. "All requests" or the period. */
  scope?: string;
  /** Optional extra content under the list (e.g. the yearly trend). */
  children?: ReactNode;
};

/**
 * Request status breakdown: one stacked bar (share of each status) plus a
 * labelled list with the exact count and percentage of every status. The
 * list is the readable view; the bar is the at-a-glance view. Hovering or
 * focusing a segment highlights its row.
 */
const RequestStatusBreakdown = ({
  items,
  title = "Requests by Status",
  scope,
  children,
}: RequestStatusBreakdownProps) => {
  const [active, setActive] = useState<string | null>(null);
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="admin-panel analytics-status-panel">
      <div className="analytics-panel-heading">
        <h3 className="admin-panel-title">{title}</h3>
        <p className="analytics-panel-total">
          <strong>{formatCount(total)}</strong> total
        </p>
      </div>
      {scope && <p className="analytics-panel-scope">{scope}</p>}

      {total === 0 ? (
        <p className="admin-empty-note">No document requests in this period.</p>
      ) : (
        <>
          <div
            className="analytics-stacked-bar"
            role="img"
            aria-label={items
              .map((item) => `${item.status}: ${item.count}`)
              .join(", ")}
          >
            {items
              .filter((item) => item.count > 0)
              .map((item) => (
                <span
                  key={item.status}
                  className={`analytics-stacked-segment${
                    active === item.status ? " is-active" : ""
                  }`}
                  style={{
                    flexGrow: item.count,
                    background: REQUEST_STATUS_COLORS[item.status] ?? "#94a3b8",
                  }}
                  title={`${item.status}: ${item.count} (${formatPercent(item.percentage)})`}
                  onMouseEnter={() => setActive(item.status)}
                  onMouseLeave={() => setActive(null)}
                />
              ))}
          </div>

          <ul className="analytics-status-list">
            {items.map((item) => (
              <li
                key={item.status}
                className={active === item.status ? "is-active" : undefined}
                onMouseEnter={() => setActive(item.status)}
                onMouseLeave={() => setActive(null)}
              >
                <span
                  className="admin-legend-dot"
                  style={{
                    background: REQUEST_STATUS_COLORS[item.status] ?? "#94a3b8",
                  }}
                  aria-hidden="true"
                />
                <span className="analytics-status-name">{item.status}</span>
                <span className="analytics-status-count">
                  {formatCount(item.count)}
                </span>
                <span className="analytics-status-share">
                  {formatPercent(item.percentage)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {children}
    </section>
  );
};

export default RequestStatusBreakdown;
