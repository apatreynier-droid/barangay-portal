import "./Dashboard.css";
import type { Request } from "../../Types/DashboardType";
import type { ApiNotification, AuthUser } from "../../Utils/api";
import Sidebar from "../../components/Dashboard/Sidebar";
import Topbar from "../../components/Dashboard/Topbar";
import WelcomeCard from "../../components/Dashboard/WelcomeCard";
import StatsGrid from "../../components/Dashboard/StatsGrid";
import RecentRequests from "../../components/Dashboard/RecentRequests";
import QuickActions from "../../components/Dashboard/QuickActions";
import PickupCard from "../../components/Dashboard/PickupCard";
import { RESIDENT_ROLE_LABEL } from "../../Utils/ResidentDisplay";

type DashboardProps = {
  user: AuthUser;
  requests: Request[];
  notifications: ApiNotification[];
  isLoadingData: boolean;
  dataError: string;
  onRetry: () => void;
  onMyRequests: () => void;
  onNotifications: () => void;
  onRequestDocument: (document?: string) => void;
  onLogout: () => void;
};

const Dashboard = ({
  user,
  requests,
  notifications,
  isLoadingData,
  dataError,
  onRetry,
  onMyRequests,
  onNotifications,
  onRequestDocument,
  onLogout,
}: DashboardProps) => {
  const unreadCount = notifications.filter(
    (notification) => !notification.is_read,
  ).length;

  return (
    <div className="dashboard">
      <Sidebar
        firstName={user.first_name}
        lastName={user.last_name}
        role={RESIDENT_ROLE_LABEL}
        onMyRequests={onMyRequests}
        onNotifications={onNotifications}
        onLogout={onLogout}
      />

      <main className="dashboard-main">
        <Topbar unreadCount={unreadCount} onNotifications={onNotifications} />

        <WelcomeCard onRequestDocument={() => onRequestDocument()} />

        {dataError && (
          <div className="dashboard-error-banner" role="alert">
            <span>{dataError}</span>
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}

        {isLoadingData && requests.length === 0 ? (
          <p className="dashboard-empty-state">Loading your dashboard…</p>
        ) : (
          <>
            <StatsGrid requests={requests} />

            <div className="dashboard-grid">
              <RecentRequests requests={requests} onViewAll={onMyRequests} />
              <QuickActions onSelectDocument={onRequestDocument} />
            </div>

            <PickupCard requests={requests} onMyRequests={onMyRequests} />
          </>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
