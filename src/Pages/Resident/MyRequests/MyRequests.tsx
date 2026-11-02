import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../../Styles/Resident/Pages/Dashboard.css";
import "../../../Styles/Resident/Pages/MyRequests.css";
import type {
  Request,
  RequestStatus,
} from "../../../Types/Resident/DashboardType";
import type { AuthUser } from "../../../Utils/Shared/api";
import Sidebar from "../../../components/Resident/Dashboard/Sidebar";
import RequestsHeader from "../../../components/Resident/MyRequests/RequestsHeader";
import RequestStats from "../../../components/Resident/MyRequests/RequestStats";
import RequestsToolbar from "../../../components/Resident/MyRequests/RequestsToolbar";
import RequestsTabs from "../../../components/Resident/MyRequests/RequestsTabs";
import RequestsSearch from "../../../components/Resident/MyRequests/RequestsSearch";
import RequestsList from "../../../components/Resident/MyRequests/RequestsList";
import { RESIDENT_ROLE_LABEL } from "../../../Utils/Resident/ResidentDisplay";
import {
  readRequestsTab,
  selectRequestsTab,
  subscribeRequestsTab,
  type RequestsTab,
} from "../../../Utils/Resident/requestsTab";
import { POTHOLE_DETECTION_PATH } from "../../../Utils/Shared/routePaths";
import useResponsiveSidebar from "../../../Utils/Shared/useResponsiveSidebar";

// Requests still moving through the barangay office.
const ACTIVE_STATUSES: RequestStatus[] = [
  "Pending",
  "Approved",
  "Processing",
  "Ready for Pickup",
];

// Requests that have reached their final status and now serve as records.
const HISTORY_STATUSES: RequestStatus[] = ["Completed", "Rejected"];

interface MyRequestsProps {
  user: AuthUser;
  requests: Request[];
  isLoadingData: boolean;
  dataError: string;
  /** Optional: shows a count badge on the top bar bell when greater than 0. */
  unreadCount?: number;
  onRetry: () => void;
  onBackToDashboard: () => void;
  onMyRequests: () => void;
  onRequestHistory: () => void;
  onNotifications: () => void;
  onRequestDocument: () => void;
  onLogout: () => void;
}

const MyRequests = ({
  user,
  requests,
  isLoadingData,
  dataError,
  unreadCount = 0,
  onRetry,
  onBackToDashboard,
  onMyRequests,
  onRequestHistory,
  onNotifications,
  onRequestDocument,
  onLogout,
}: MyRequestsProps) => {
  const navigate = useNavigate();
  // Local mirror of the requests so edits and deletes are reflected
  // immediately while staying in sync with future prop refreshes.
  const [localRequests, setLocalRequests] = useState<Request[]>(requests);
  // The selected filter is shared with the sidebar dropdown.
  const [activeTab, setActiveTab] = useState<RequestsTab>(readRequestsTab);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setLocalRequests(requests);
  }, [requests]);

  useEffect(() => subscribeRequestsTab(setActiveTab), []);

  const activeRequests = localRequests.filter((request) =>
    ACTIVE_STATUSES.includes(request.status),
  );

  const historyRequests = localRequests.filter((request) =>
    HISTORY_STATUSES.includes(request.status),
  );

  const readyForPickupRequests = localRequests.filter(
    (request) => request.status === "Ready for Pickup",
  );

  const tabRequests =
    activeTab === "active"
      ? activeRequests
      : activeTab === "history"
        ? historyRequests
        : activeTab === "ready"
          ? readyForPickupRequests
          : localRequests;

  // Search runs on top of the selected tab. The tab counts stay unfiltered.
  const trimmedQuery = searchQuery.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();

  const matchesSearch = (request: Request) =>
    normalizedQuery === "" ||
    [
      request.id,
      request.document,
      request.purpose,
      request.status,
      request.submittedDate,
    ].some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(normalizedQuery),
    );

  const visibleRequests = tabRequests.filter(matchesSearch);

  const emptyStateMessage = trimmedQuery
    ? `No requests match "${trimmedQuery}".`
    : activeTab === "active"
      ? "You have no active requests right now."
      : activeTab === "history"
        ? "No completed or rejected requests yet."
        : activeTab === "ready"
          ? "No requests are ready for pickup right now."
          : "You have not submitted any document requests yet.";

  const handleRequestUpdated = (updated: Request) => {
    setLocalRequests((previous) =>
      previous.map((request) =>
        request.id === updated.id ? updated : request,
      ),
    );
  };

  const handleRequestDeleted = (requestId: string) => {
    setLocalRequests((previous) =>
      previous.filter((request) => request.id !== requestId),
    );
  };

  const totalRequests = localRequests.length;

  const pendingRequests = localRequests.filter(
    (request) => request.status === "Pending",
  ).length;

  const processingRequests = localRequests.filter(
    (request) => request.status === "Processing",
  ).length;

  const readyRequests = readyForPickupRequests.length;

  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  return (
    <div className="my-requests-page">
      <Sidebar
        activePage="my-requests"
        onDashboard={onBackToDashboard}
        onMyRequests={onMyRequests}
        onRequestHistory={onRequestHistory}
        onNotifications={onNotifications}
        onRequestDocument={onRequestDocument}
        onPotholeDetection={() => navigate(POTHOLE_DETECTION_PATH)}
        onLogout={onLogout}
        firstName={user.first_name}
        lastName={user.last_name}
        role={RESIDENT_ROLE_LABEL}
        isOpen={isDrawerOpen}
        onNavigate={closeDrawer}
      />

      {isDrawerOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={closeDrawer}
        />
      )}

      <main className="requests-main">
        <RequestsHeader
          firstName={user.first_name}
          onMenuToggle={toggleDrawer}
          onNotifications={onNotifications}
          unreadCount={unreadCount}
        />

        {dataError && (
          <div className="dashboard-error-banner" role="alert">
            <span>{dataError}</span>
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}

        <RequestStats
          total={totalRequests}
          pending={pendingRequests}
          processing={processingRequests}
          ready={readyRequests}
        />

        <RequestsToolbar onNewRequest={onRequestDocument} />

        <div className="requests-filters">
          <RequestsTabs
            activeTab={activeTab}
            onTabChange={selectRequestsTab}
            allCount={totalRequests}
            activeCount={activeRequests.length}
            historyCount={historyRequests.length}
            readyCount={readyRequests}
          />

          <RequestsSearch value={searchQuery} onChange={setSearchQuery} />
        </div>

        {isLoadingData && localRequests.length === 0 ? (
          <p className="requests-empty-state">Loading your requests…</p>
        ) : (
          <RequestsList
            requests={visibleRequests}
            onRequestUpdated={handleRequestUpdated}
            onRequestDeleted={handleRequestDeleted}
            emptyMessage={emptyStateMessage}
          />
        )}
      </main>
    </div>
  );
};

export default MyRequests;
