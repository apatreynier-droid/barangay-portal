import { getUniquePuroks } from "../../../Utils/AdminResidentsLogic";
import type { AdminResident } from "../../../Types/AdminResidentsType";

type ResidentsToolbarProps = {
  residents: AdminResident[];
  search: string;
  purok: string;
  status: string;
  resultCount: number;
  totalCount: number;
  onSearchChange: (value: string) => void;
  onPurokChange: (purok: string) => void;
  onStatusChange: (status: string) => void;
};

const ResidentsToolbar = ({
  residents,
  search,
  purok,
  status,
  resultCount,
  totalCount,
  onSearchChange,
  onPurokChange,
  onStatusChange,
}: ResidentsToolbarProps) => {
  const purokOptions = getUniquePuroks(residents);

  return (
    <div className="residents-toolbar">
      <input
        type="search"
        className="residents-search"
        placeholder="Search by name or resident ID..."
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        aria-label="Search residents"
      />

      <select
        className="residents-select"
        value={purok}
        onChange={(event) => onPurokChange(event.target.value)}
        aria-label="Filter by purok"
      >
        <option value="all">All</option>
        {purokOptions.map((purokOption) => (
          <option key={purokOption} value={purokOption}>
            {purokOption}
          </option>
        ))}
      </select>

      <select
        className="residents-select"
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
        aria-label="Filter by status"
      >
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="suspended">Suspended</option>
      </select>

      <span className="residents-count">
        {resultCount} of {totalCount} residents
      </span>
    </div>
  );
};

export default ResidentsToolbar;
