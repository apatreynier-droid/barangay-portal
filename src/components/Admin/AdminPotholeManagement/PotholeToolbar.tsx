import DatePickerInput from "../../Shared/DatePickerInput";
import { STANDARDIZED_PUROKS } from "../../../Utils/Shared/puroks";
import {
  POTHOLE_STATUSES,
  POTHOLE_STATUS_META,
  hasActivePotholeFilters,
} from "../../../Utils/Admin/AdminPotholeManagementLogic";
import {
  UNSPECIFIED_PUROK,
  type PotholeFilters,
  type PotholeStatus,
} from "../../../Types/Admin/AdminPotholeManagementType";

type PotholeToolbarProps = {
  filters: PotholeFilters;
  resultCount: number;
  totalCount: number;
  onChange: (changes: Partial<PotholeFilters>) => void;
  onClear: () => void;
};

const PotholeToolbar = ({
  filters,
  resultCount,
  totalCount,
  onChange,
  onClear,
}: PotholeToolbarProps) => {
  const isDateRangeInverted =
    filters.dateFrom !== "" &&
    filters.dateTo !== "" &&
    filters.dateFrom > filters.dateTo;

  return (
    <section className="pothole-toolbar" aria-label="Filter pothole reports">
      <label className="pothole-field pothole-field--search">
        <span>Search</span>
        <input
          type="search"
          className="admin-logs-search"
          placeholder="Report ID, resident, Purok, road or location..."
          value={filters.search}
          onChange={(event) => onChange({ search: event.target.value })}
        />
      </label>

      <label className="pothole-field">
        <span>Purok</span>
        <select
          className="admin-logs-select"
          value={filters.purok}
          onChange={(event) => onChange({ purok: event.target.value })}
        >
          <option value="all">All Puroks</option>
          {STANDARDIZED_PUROKS.map((purok) => (
            <option key={purok} value={purok}>
              {purok}
            </option>
          ))}
          <option value={UNSPECIFIED_PUROK}>Not specified</option>
        </select>
      </label>

      <label className="pothole-field">
        <span>Status</span>
        <select
          className="admin-logs-select"
          value={filters.status}
          onChange={(event) =>
            onChange({ status: event.target.value as PotholeStatus | "all" })
          }
        >
          <option value="all">All Statuses</option>
          {POTHOLE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {POTHOLE_STATUS_META[status].label}
            </option>
          ))}
        </select>
      </label>

      <div className="pothole-field pothole-field--date">
        <span aria-hidden="true">Reported from</span>
        <DatePickerInput
          value={filters.dateFrom}
          onChange={(dateFrom) => onChange({ dateFrom })}
          ariaLabel="Reported from date"
        />
      </div>

      <div className="pothole-field pothole-field--date">
        <span aria-hidden="true">Reported to</span>
        <DatePickerInput
          value={filters.dateTo}
          onChange={(dateTo) => onChange({ dateTo })}
          ariaLabel="Reported to date"
        />
      </div>

      <div className="pothole-toolbar-footer">
        <span className="admin-logs-count" role="status">
          Showing {resultCount} of {totalCount} reports in the map and table
        </span>

        {isDateRangeInverted && (
          <span className="pothole-toolbar-warning" role="alert">
            The "from" date is after the "to" date.
          </span>
        )}

        <button
          type="button"
          className="pothole-button"
          onClick={onClear}
          disabled={!hasActivePotholeFilters(filters)}
        >
          Clear filters
        </button>
      </div>
    </section>
  );
};

export default PotholeToolbar;
