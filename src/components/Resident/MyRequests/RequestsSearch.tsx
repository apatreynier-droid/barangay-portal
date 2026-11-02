import { Search, X } from "lucide-react";

type RequestsSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

const RequestsSearch = ({ value, onChange }: RequestsSearchProps) => {
  return (
    <div className="requests-search" role="search">
      <Search size={18} strokeWidth={1.9} aria-hidden="true" />

      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onChange("");
          }
        }}
        placeholder="Search by request no., document or purpose"
        aria-label="Search requests"
        autoComplete="off"
      />

      {value && (
        <button
          type="button"
          className="requests-search-clear"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

export default RequestsSearch;
