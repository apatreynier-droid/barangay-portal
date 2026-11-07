import DatePickerInput from "../../Shared/DatePickerInput";
import type {
  AdminReportsQuery,
  ReportGranularity,
} from "../../../Types/Admin/AdminReportsType";
import {
  REPORT_GRANULARITIES,
  REPORT_PRESETS,
  isGranularityAllowed,
  isRangeInverted,
  type ReportPreset,
} from "../../../Utils/Admin/AdminReportsLogic";

type ReportsFilterBarProps = {
  preset: ReportPreset;
  query: AdminReportsQuery;
  /** Description of the range the shown data was computed for. */
  appliedRange: string | null;
  isLoading: boolean;
  onPresetChange: (preset: ReportPreset) => void;
  onQueryChange: (changes: Partial<AdminReportsQuery>) => void;
};

/**
 * Date-range and interval filters for the Reports page. Every change reloads
 * the analytics from the backend; dates are Philippine calendar days.
 */
const ReportsFilterBar = ({
  preset,
  query,
  appliedRange,
  isLoading,
  onPresetChange,
  onQueryChange,
}: ReportsFilterBarProps) => {
  const inverted = isRangeInverted(query);

  return (
    <section
      className="admin-panel reports-filter-bar"
      aria-label="Report period"
      aria-busy={isLoading}
    >
      <div className="reports-filter-fields">
        <label className="reports-filter-field">
          <span>Period</span>
          <select
            className="admin-logs-select"
            value={preset}
            onChange={(event) =>
              onPresetChange(event.target.value as ReportPreset)
            }
          >
            {REPORT_PRESETS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="reports-filter-field reports-filter-field--date">
          <span aria-hidden="true">From</span>
          <DatePickerInput
            value={query.dateFrom}
            onChange={(dateFrom) => onQueryChange({ dateFrom })}
            ariaLabel="Report start date"
            placeholder="Earliest record"
          />
        </div>

        <div className="reports-filter-field reports-filter-field--date">
          <span aria-hidden="true">To</span>
          <DatePickerInput
            value={query.dateTo}
            onChange={(dateTo) => onQueryChange({ dateTo })}
            ariaLabel="Report end date"
            placeholder="Today"
          />
        </div>

        <div className="reports-filter-field">
          <span id="reports-interval-label">Interval</span>
          <div
            className="reports-interval-group"
            role="group"
            aria-labelledby="reports-interval-label"
          >
            {REPORT_GRANULARITIES.map((option) => {
              const allowed = isGranularityAllowed(option.key, query);
              const active = query.granularity === option.key;

              return (
                <button
                  key={option.key}
                  type="button"
                  className={`reports-interval-button${active ? " is-active" : ""}`}
                  aria-pressed={active}
                  disabled={!allowed}
                  title={
                    allowed
                      ? undefined
                      : "Too many periods for this range - choose a shorter range"
                  }
                  onClick={() =>
                    onQueryChange({ granularity: option.key as ReportGranularity })
                  }
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="reports-filter-footer" role="status">
        {inverted ? (
          <span className="reports-filter-warning">
            The start date is after the end date. Adjust the range to update
            the report.
          </span>
        ) : (
          <span>
            {isLoading
              ? "Updating the report…"
              : appliedRange
                ? `Showing ${appliedRange}`
                : ""}
          </span>
        )}
        <span className="reports-filter-timezone">
          All dates in Philippine time (Asia/Manila)
        </span>
      </div>
    </section>
  );
};

export default ReportsFilterBar;
