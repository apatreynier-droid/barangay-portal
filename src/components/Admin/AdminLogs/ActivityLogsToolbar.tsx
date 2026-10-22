import { ACTIVITY_LOG_TYPE_OPTIONS } from "../../../Utils/Admin/AdminLogsLogic";

type ActivityLogsToolbarProps = {
  search: string;
  actionType: string;
  resultCount: number;
  onSearchChange: (value: string) => void;
  onActionTypeChange: (value: string) => void;
};

const ActivityLogsToolbar = ({
  search,
  actionType,
  resultCount,
  onSearchChange,
  onActionTypeChange,
}: ActivityLogsToolbarProps) => {
  return (
    <div className="admin-logs-toolbar">
      <input
        type="search"
        className="admin-logs-search"
        placeholder="Search by actor, action, or target..."
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        aria-label="Search activity logs"
      />

      <select
        className="admin-logs-select"
        value={actionType}
        onChange={(event) => onActionTypeChange(event.target.value)}
        aria-label="Filter by action type"
      >
        <option value="all">All</option>
        {ACTIVITY_LOG_TYPE_OPTIONS.map((typeOption) => (
          <option key={typeOption} value={typeOption}>
            {typeOption}
          </option>
        ))}
      </select>

      <span className="admin-logs-count">{resultCount} entries</span>
    </div>
  );
};

export default ActivityLogsToolbar;