import { useEffect, useState } from "react";
import "../Dashboard/Dashboard.css";
import "./MyRequests.css";
import type { Request } from "../../Types/DashboardType";
import type { AuthUser } from "../../Utils/api";
import Sidebar from "../../components/MyRequests/Sidebar";
import RequestsHeader from "../../components/MyRequests/RequestsHeader";
import RequestStats from "../../components/MyRequests/RequestStats";
import RequestsToolbar from "../../components/MyRequests/RequestsToolbar";
import RequestsList from "../../components/MyRequests/RequestsList";

interface MyRequestsProps {
  user: AuthUser;
  requests: Request[];
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
  // Local mirror of the requests so edits and deletes are reflected
  // immediately while staying in sync with future prop refreshes.
  const [localRequests, setLocalRequests] = useState<Request[]>(requests);

  useEffect(() => {
    setLocalRequests(requests);
  }, [requests]);

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

  const readyRequests = localRequests.filter(
    (request) => request.status === "Ready for Pickup",
  ).length;

  return (
    <div className="my-requests-page">
      <Sidebar
        onBackToDashboard={onBackToDashboard}
        onMyRequests={onMyRequests}
        onRequestHistory={onRequestHistory}
        onNotifications={onNotifications}
        onRequestDocument={onRequestDocument}
        onLogout={onLogout}
      />

      <main className="requests-main">
        <RequestsHeader firstName={user.first_name} />

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

        {isLoadingData && localRequests.length === 0 ? (
          <p className="requests-empty-state">Loading your requests…</p>
        ) : (
          <RequestsList
            requests={localRequests}
            onRequestUpdated={handleRequestUpdated}
            onRequestDeleted={handleRequestDeleted}
          />
        )}
      </main>
    </div>
  );
};

export default MyRequests;
