import "../../../Styles/Resident/Pages/Dashboard.css";
import type { Request } from "../../../Types/Resident/DashboardType";
import type { ApiNotification, AuthUser } from "../../../Utils/Shared/api";
import Sidebar from "../../../components/Resident/Dashboard/Sidebar";
import Topbar from "../../../components/Resident/Dashboard/Topbar";
import WelcomeCard from "../../../components/Resident/Dashboard/WelcomeCard";
import StatsGrid from "../../../components/Resident/Dashboard/StatsGrid";
import RecentRequests from "../../../components/Resident/Dashboard/RecentRequests";
import QuickActions from "../../../components/Resident/Dashboard/QuickActions";
import { useNavigate } from "react-router-dom";
import { RESIDENT_ROLE_LABEL } from "../../../Utils/Resident/ResidentDisplay";
import useResponsiveSidebar from "../../../Utils/Shared/useResponsiveSidebar";
import {
  POTHOLE_DETECTION_PATH,
  RESIDENT_REQUEST_HISTORY_PATH,
} from "../../../Utils/Shared/routePaths";

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
  const navigate = useNavigate();
  const unreadCount = notifications.filter(
    (notification) => !notification.is_read,
  ).length;

  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  return (
    <div className="dashboard">
      <Sidebar
        firstName={user.first_name}
        lastName={user.last_name}
        role={RESIDENT_ROLE_LABEL}
        activePage="dashboard"
        onMyRequests={onMyRequests}
        onNotifications={onNotifications}
        onRequestDocument={onRequestDocument}
        onRequestHistory={() => navigate(RESIDENT_REQUEST_HISTORY_PATH)}
        onPotholeDetection={() => navigate(POTHOLE_DETECTION_PATH)}
        onLogout={onLogout}
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

      <main className="dashboard-main">
        <Topbar
          unreadCount={unreadCount}
          onNotifications={onNotifications}
          onMenuToggle={toggleDrawer}
        />

        <WelcomeCard
          requests={requests}
          onRequestDocument={() => onRequestDocument()}
          onMyRequests={onMyRequests}
        />

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
          </>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
