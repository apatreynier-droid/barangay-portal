import {
  UNSPECIFIED_PUROK,
  type PotholeSummary,
} from "../../../Types/Admin/AdminPotholeManagementType";

type PotholePurokSummaryProps = {
  summary: PotholeSummary;
  /** The Purok filter currently applied ("all", a Purok, or "unspecified"). */
  activePurok: string;
  /** Clicking a Purok filters the map and table to it (again: clears it). */
  onSelectPurok: (purok: string) => void;
};

/** Reports per Purok, counted by the server over every report. */
const PotholePurokSummary = ({
  summary,
  activePurok,
  onSelectPurok,
}: PotholePurokSummaryProps) => {
  const rows = [
    ...summary.byPurok.map((entry) => ({
      key: entry.purok,
      label: entry.purok,
      count: entry.count,
    })),
    ...(summary.unspecifiedPurok > 0
      ? [
          {
            key: UNSPECIFIED_PUROK,
            label: "Not specified",
            count: summary.unspecifiedPurok,
          },
        ]
      : []),
  ];
  const highest = Math.max(1, ...rows.map((row) => row.count));

  return (
    <section
      className="admin-panel pothole-purok-panel"
      aria-labelledby="pothole-purok-title"
    >
      <div className="admin-panel-header">
        <h2 id="pothole-purok-title" className="admin-panel-title">
          Reports per Purok
        </h2>
        <span className="pothole-purok-hint">Select a Purok to filter</span>
      </div>

      <ul className="pothole-purok-list">
        {rows.map((row) => {
          const isActive = activePurok === row.key;

          return (
            <li key={row.key}>
              <button
                type="button"
                className={`pothole-purok-row${isActive ? " is-active" : ""}`}
                aria-pressed={isActive}
                onClick={() => onSelectPurok(isActive ? "all" : row.key)}
              >
                <span className="pothole-purok-name">{row.label}</span>
                <span className="pothole-purok-bar" aria-hidden="true">
                  <span
                    style={{ width: `${(row.count / highest) * 100}%` }}
                  />
                </span>
                <span className="pothole-purok-count">
                  {row.count}
                  <span className="pothole-visually-hidden">
                    {row.count === 1 ? " report" : " reports"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default PotholePurokSummary;
