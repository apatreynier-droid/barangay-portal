import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../../Styles/Resident/Pages/Dashboard.css";
import "../../../Styles/Resident/Pages/MyRequests.css";
import type { Request, RequestStatus } from "../../../Types/Resident/DashboardType";
import type { ApiNotification, AuthUser } from "../../../Utils/Shared/api";
import Sidebar from "../../../components/Resident/Dashboard/Sidebar";
import Topbar from "../../../components/Resident/Dashboard/Topbar";
import RequestStats from "../../../components/Resident/MyRequests/RequestStats";
import RequestsToolbar from "../../../components/Resident/MyRequests/RequestsToolbar";
import RequestsTabs, {
  type RequestsTab,
} from "../../../components/Resident/MyRequests/RequestsTabs";
import RequestsList from "../../../components/Resident/MyRequests/RequestsList";
import { RESIDENT_ROLE_LABEL } from "../../../Utils/Resident/ResidentDisplay";
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
  notifications?: ApiNotification[];
  isLoadingData: boolean;
  dataError: string;
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
  notifications = [],
  isLoadingData,
  dataError,
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
  const [activeTab, setActiveTab] = useState<RequestsTab>("all");

  useEffect(() => {
    setLocalRequests(requests);
  }, [requests]);

  const activeRequests = localRequests.filter((request) =>
    ACTIVE_STATUSES.includes(request.status),
  );

  const historyRequests = localRequests.filter((request) =>
    HISTORY_STATUSES.includes(request.status),
  );

  const visibleRequests =
    activeTab === "active"
      ? activeRequests
      : activeTab === "history"
        ? historyRequests
        : localRequests;

  const emptyStateMessage =
    activeTab === "active"
      ? "You have no active requests right now."
      : activeTab === "history"
        ? "No completed or rejected requests yet."
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

  const unreadCount = notifications.filter(
    (notification) => !notification.is_read,
  ).length;

  const pendingRequests = localRequests.filter(
    (request) => request.status === "Pending",
  ).length;

  const processingRequests = localRequests.filter(
    (request) => request.status === "Processing",
  ).length;

  const readyRequests = localRequests.filter(
    (request) => request.status === "Ready for Pickup",
  ).length;

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
        <Topbar
          unreadCount={unreadCount}
          onNotifications={onNotifications}
          onMenuToggle={toggleDrawer}
        />

        <p className="page-description">
          Track and manage your barangay document requests, {user.first_name}.
        </p>

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

        <RequestsTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          allCount={totalRequests}
          activeCount={activeRequests.length}
          historyCount={historyRequests.length}
        />

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
