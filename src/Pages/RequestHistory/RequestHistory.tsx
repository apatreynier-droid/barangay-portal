import { useMemo, useState } from "react";
import Sidebar from "../../components/MyRequests/Sidebar";
import type { Request } from "../../Types/DashboardType";
import { getStatusClass } from "../../Utils/DashboardLogic";
import { formatDate } from "../../Utils/RequestHistory";
import "../Dashboard/Dashboard.css";
import "./RequestHistory.css";

type RequestHistoryProps = {
  requests: Request[];
  isLoadingData: boolean;
  dataError: string;
  onRetry: () => void;
  onBackToDashboard: () => void;
  onMyRequests: () => void;
  onNotifications: () => void;
  onRequestDocument: () => void;
  onLogout: () => void;
};

type HistoryFilter = "All" | Request["status"];

const HISTORY_FILTERS: HistoryFilter[] = [
  "All",
  "Pending",
  "Approved",
  "Processing",
  "Ready for Pickup",
  "Completed",
  "Rejected",
];

function RequestHistory({
  requests,
  isLoadingData,
  dataError,
  onRetry,
  onBackToDashboard,
  onMyRequests,
  onNotifications,
  onRequestDocument,
  onLogout,
}: RequestHistoryProps) {
  const [filter, setFilter] = useState<HistoryFilter>("All");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredRequests = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return requests.filter((request) => {
      const matchesStatus = filter === "All" || request.status === filter;
      const matchesSearch =
        !search ||
        request.document.toLowerCase().includes(search) ||
        request.id.toLowerCase().includes(search) ||
        request.purpose.toLowerCase().includes(search);

      return matchesStatus && matchesSearch;
    });
  }, [filter, requests, searchTerm]);

  return (
    <div className="request-history-layout">
      <Sidebar
        activePage="request-history"
        onBackToDashboard={onBackToDashboard}
        onMyRequests={onMyRequests}
        onRequestHistory={() => undefined}
        onNotifications={onNotifications}
        onRequestDocument={onRequestDocument}
        onLogout={onLogout}
      />

      <main className="request-history-page">
        <header className="history-header">
          <div>
            <p className="page-label">Resident Portal</p>
            <h1>Request History</h1>
            <p>Review every document request and its latest status.</p>
          </div>
        </header>

        {dataError && (
          <div className="dashboard-error-banner" role="alert">
            <span>{dataError}</span>
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}

        <section className="history-card" aria-labelledby="history-table-title">
          <div className="history-card-header">
            <div>
              <h2 id="history-table-title">All requests</h2>
              <p>{filteredRequests.length} request(s) shown</p>
            </div>
            <div className="history-filter-bar">
              <div className="history-search-field">
                <svg
                  className="history-search-icon"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="history-search-input"
                  placeholder="Search by document, reference no., or purpose"
                  aria-label="Search requests"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <select
                className="history-status-select"
                aria-label="Filter by status"
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as HistoryFilter)
                }
              >
                {HISTORY_FILTERS.map((option) => (
                  <option key={option} value={option}>
                    {option === "All" ? "All statuses" : option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="history-table-wrapper">
            <table className="history-table">
              <thead>
                <tr>
                  <th scope="col">Reference No.</th>
                  <th scope="col">Document</th>
                  <th scope="col">Purpose</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Last updated</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => (
                  <tr key={request.id}>
                    <td className="history-reference">{request.id}</td>
                    <td>{request.document}</td>
                    <td>{request.purpose}</td>
                    <td>{formatDate(request.submittedDate)}</td>
                    <td>{formatDate(request.updatedDate)}</td>
                    <td>
                      <span
                        className={`request-status ${getStatusClass(request.status)}`}
                      >
                        {request.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isLoadingData && requests.length === 0 && (
            <p className="history-empty-state">Loading your requests…</p>
          )}

          {!isLoadingData && filteredRequests.length === 0 && (
            <p className="history-empty-state">
              No requests match the selected filters.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

export default RequestHistory;
