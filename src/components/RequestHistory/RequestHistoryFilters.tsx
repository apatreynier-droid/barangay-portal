import type { RequestHistoryFiltersState } from "../../Types/RequestHistoryType";

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

      <input
        type="date"
        className="history-date-input"
        value={filters.dateFrom}
        onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
      />
      <span className="history-date-separator">to</span>
      <input
        type="date"
        className="history-date-input"
        value={filters.dateTo}
        onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
      />
    </div>
  );
}

export default RequestHistoryFilters;
