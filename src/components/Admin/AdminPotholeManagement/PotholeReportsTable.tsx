import { ArrowDown, ArrowUp, ArrowUpDown, MapPin } from "lucide-react";
import PotholeStatusBadge from "./PotholeStatusBadge";
import {
  POTHOLE_PAGE_SIZE_OPTIONS,
  formatPotholeDate,
  getPageNumbers,
  hasPotholeCoordinates,
} from "../../../Utils/Admin/AdminPotholeManagementLogic";
import type {
  PotholeReport,
  PotholeSortKey,
  PotholeSortState,
} from "../../../Types/Admin/AdminPotholeManagementType";

const COLUMNS: { label: string; sortKey?: PotholeSortKey }[] = [
  { label: "Report ID", sortKey: "id" },
  { label: "Resident Name", sortKey: "residentName" },
  { label: "Pothole Image" },
  { label: "Purok", sortKey: "purok" },
  { label: "Road/Street Name", sortKey: "road" },
  { label: "Location", sortKey: "location" },
  { label: "Date Reported", sortKey: "reportedAt" },
  { label: "Status", sortKey: "status" },
  { label: "Actions" },
];

type PotholeReportsTableProps = {
  /** Only the reports of the current page. */
  reports: PotholeReport[];
  totalResults: number;
  page: number;
  pageSize: number;
  sort: PotholeSortState;
  selectedReportId: string | null;
  canClearFilters: boolean;
  onSort: (key: PotholeSortKey) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onViewDetails: (reportId: string) => void;
  onLocate: (reportId: string) => void;
  onClearFilters: () => void;
};

const PotholeReportsTable = ({
  reports,
  totalResults,
  page,
  pageSize,
  sort,
  selectedReportId,
  canClearFilters,
  onSort,
  onPageChange,
  onPageSizeChange,
  onViewDetails,
  onLocate,
  onClearFilters,
}: PotholeReportsTableProps) => {
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const firstShown = totalResults === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = Math.min(page * pageSize, totalResults);

  return (
    <section className="pothole-table-section" aria-label="Pothole reports">
      <div className="admin-logs-card pothole-table-card">
        <table className="admin-logs-table pothole-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => {
                const isSorted = column.sortKey === sort.key;
                const SortIcon = !isSorted
                  ? ArrowUpDown
                  : sort.direction === "asc"
                    ? ArrowUp
                    : ArrowDown;

                return (
                  <th
                    key={column.label}
                    scope="col"
                    aria-sort={
                      !column.sortKey
                        ? undefined
                        : !isSorted
                          ? "none"
                          : sort.direction === "asc"
                            ? "ascending"
                            : "descending"
                    }
                  >
                    {column.sortKey ? (
                      <button
                        type="button"
                        className={`pothole-sort-button${
                          isSorted ? " is-active" : ""
                        }`}
                        onClick={() => onSort(column.sortKey as PotholeSortKey)}
                      >
                        {column.label}
                        <SortIcon size={13} aria-hidden="true" />
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {reports.length === 0 ? (
              <tr className="pothole-table-empty-row">
                <td className="admin-logs-empty" colSpan={COLUMNS.length}>
                  <strong className="pothole-empty-title">
                    No pothole reports found
                  </strong>
                  <span className="pothole-empty-text">
                    {canClearFilters
                      ? "No reports match the selected filters."
                      : "Reports will appear here once they are available."}
                  </span>
                  {canClearFilters && (
                    <button
                      type="button"
                      className="pothole-button"
                      onClick={onClearFilters}
                    >
                      Clear filters
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              reports.map((report) => {
                const canLocate = hasPotholeCoordinates(report);

                return (
                  <tr
                    key={report.id}
                    className={
                      report.id === selectedReportId ? "is-selected" : undefined
                    }
                  >
                    <td data-label="Report ID" className="pothole-table-id">
                      {report.id}
                    </td>
                    <td data-label="Resident Name">{report.residentName}</td>
                    <td data-label="Pothole Image">
                      <button
                        type="button"
                        className="pothole-thumb-button"
                        onClick={() => onViewDetails(report.id)}
                        aria-label={`View details and photo of ${report.id}`}
                      >
                        <img
                          src={report.imageUrl}
                          alt=""
                          className="pothole-thumb"
                          loading="lazy"
                        />
                      </button>
                    </td>
                    <td data-label="Purok" className="pothole-table-nowrap">
                      {report.purok}
                    </td>
                    <td data-label="Road/Street Name">{report.road}</td>
                    <td data-label="Location">{report.location}</td>
                    <td data-label="Date Reported" className="pothole-table-nowrap">
                      {formatPotholeDate(report.reportedAt)}
                    </td>
                    <td data-label="Status">
                      <PotholeStatusBadge status={report.status} />
                    </td>
                    <td data-label="Actions">
                      <div className="pothole-table-actions">
                        <button
                          type="button"
                          className="residents-view-button"
                          onClick={() => onViewDetails(report.id)}
                          aria-label={`View details of ${report.id}`}
                        >
                          View Details
                        </button>
                        <button
                          type="button"
                          className="pothole-icon-button"
                          onClick={() => onLocate(report.id)}
                          disabled={!canLocate}
                          aria-label={
                            canLocate
                              ? `Show ${report.id} on the map`
                              : `${report.id} has no GPS coordinates`
                          }
                          title={
                            canLocate ? "Show on map" : "No GPS coordinates"
                          }
                        >
                          <MapPin size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <nav className="pothole-pagination" aria-label="Pothole reports pages">
        <span className="pothole-pagination-summary">
          {firstShown}–{lastShown} of {totalResults}
        </span>

        <label className="pothole-pagination-size">
          <span>Rows per page</span>
          <select
            className="admin-logs-select"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {POTHOLE_PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="pothole-pagination-pages">
          <button
            type="button"
            className="pothole-page-button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </button>

          {getPageNumbers(page, totalPages).map((pageNumber, index) =>
            pageNumber === null ? (
              <span
                key={`gap-${index}`}
                className="pothole-page-gap"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                key={pageNumber}
                type="button"
                className={`pothole-page-button${
                  pageNumber === page ? " is-active" : ""
                }`}
                onClick={() => onPageChange(pageNumber)}
                aria-label={`Page ${pageNumber}`}
                aria-current={pageNumber === page ? "page" : undefined}
              >
                {pageNumber}
              </button>
            ),
          )}

          <button
            type="button"
            className="pothole-page-button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      </nav>
    </section>
  );
};

export default PotholeReportsTable;
