import { getUniqueDocuments } from "../../Utils/AdminDocumentRequestsLogic";
import { REQUEST_STATUS_OPTIONS } from "../../Utils/AdminDocumentRequestsLogic";
import type { AdminDocumentRequest } from "../../Types/AdminDocumentRequestsType";

type DocumentRequestsToolbarProps = {
  requests: AdminDocumentRequest[];
  search: string;
  status: string;
  document: string;
  resultCount: number;
  totalCount: number;
  onSearchChange: (value: string) => void;
  onStatusChange: (status: string) => void;
  onDocumentChange: (document: string) => void;
};

const DocumentRequestsToolbar = ({
  requests,
  search,
  status,
  document,
  resultCount,
  totalCount,
  onSearchChange,
  onStatusChange,
  onDocumentChange,
}: DocumentRequestsToolbarProps) => {
  const documentOptions = getUniqueDocuments(requests);

  return (
    <div className="residents-toolbar">
      <input
        type="search"
        className="residents-search"
        placeholder="Search by name or request ID..."
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        aria-label="Search document requests"
      />

      <select
        className="residents-select"
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
        aria-label="Filter by status"
      >
        <option value="all">All</option>
        {REQUEST_STATUS_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <select
        className="residents-select"
        value={document}
        onChange={(event) => onDocumentChange(event.target.value)}
        aria-label="Filter by document type"
      >
        <option value="all">All</option>
        {documentOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <span className="residents-count">
        {resultCount} of {totalCount} requests
      </span>
    </div>
  );
};

export default DocumentRequestsToolbar;
