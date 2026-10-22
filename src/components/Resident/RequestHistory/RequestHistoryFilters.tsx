import type { RequestHistoryFiltersState } from "../../../Types/Resident/RequestHistoryType";
import calendarIcon from "../../../assets/icons/calendar.png";
import { openNativeDatePicker } from "../../Shared/openNativeDatePicker";
import "../../../Styles/Shared/Components/DatePickerInput.css";

interface RequestHistoryFiltersProps {
  filters: RequestHistoryFiltersState;
  onChange: (filters: RequestHistoryFiltersState) => void;
}

function RequestHistoryFilters({
  filters,
  onChange,
}: RequestHistoryFiltersProps) {
  return (
    <div className="history-filter-bar">
      <input
        type="text"
        className="history-search-input"
        placeholder="Search by document type, purpose, or reference no."
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
      />

      <select
        className="history-status-select"
        value={filters.status}
        onChange={(e) =>
          onChange({
            ...filters,
            status: e.target.value as RequestHistoryFiltersState["status"],
          })
        }
      >
        <option value="all">All statuses</option>
        <option value="pending">Pending</option>
        <option value="processing">Processing</option>
        <option value="ready">Ready for pickup</option>
        <option value="completed">Completed</option>
        <option value="rejected">Rejected</option>
      </select>

      <div className="date-picker history-date-field">
        <div className="date-picker-control">
          <input
            type="date"
            className="date-picker-input history-date-input"
            value={filters.dateFrom}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
          />
          <button
            type="button"
            className="date-picker-toggle"
            aria-label="Open calendar"
            onClick={openNativeDatePicker}
          >
            <img
              src={calendarIcon}
              alt=""
              className="date-picker-toggle-icon"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
      <span className="history-date-separator">to</span>
      <div className="date-picker history-date-field">
        <div className="date-picker-control">
          <input
            type="date"
            className="date-picker-input history-date-input"
            value={filters.dateTo}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
          />
          <button
            type="button"
            className="date-picker-toggle"
            aria-label="Open calendar"
            onClick={openNativeDatePicker}
          >
            <img
              src={calendarIcon}
              alt=""
              className="date-picker-toggle-icon"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>
  );
}

export default RequestHistoryFilters;
