import "../../../Styles/Resident/Components/ResidentTopBar.css";

import { Bell } from "lucide-react";
import { useLocation } from "react-router-dom";
import MobileMenuButton from "../../Shared/MobileMenuButton";
import ThemeToggle from "../../Shared/ThemeToggle";
import {
  LEGACY_RESIDENT_HOME_PATH,
  NOTIFICATIONS_PATH,
  POTHOLE_DETECTION_PATH,
  RESIDENT_HOME_PATH,
  RESIDENT_MY_REQUESTS_PATH,
} from "../../../Utils/Shared/routePaths";

type TopbarProps = {
  unreadCount?: number;
  onNotifications?: () => void;
  /** Opens the mobile drawer (rendered only below 769px via CSS). */
  onMenuToggle?: () => void;
  /** Optional title override. When omitted, the title is derived from the
   *  current resident route so it always matches the active page. */
  title?: string;
};

const RESIDENT_PAGE_TITLES: Record<string, string> = {
  [RESIDENT_HOME_PATH]: "Dashboard",
  [LEGACY_RESIDENT_HOME_PATH]: "Dashboard",
  [RESIDENT_MY_REQUESTS_PATH]: "My Requests",
  [NOTIFICATIONS_PATH]: "Notifications",
  [POTHOLE_DETECTION_PATH]: "Pothole Detection",
};

const resolveTitle = (pathname: string): string =>
  RESIDENT_PAGE_TITLES[pathname] ?? "Dashboard";

const Topbar = ({
  unreadCount = 0,
  onNotifications,
  onMenuToggle,
  title,
}: TopbarProps) => {
  const location = useLocation();
  const resolvedTitle = title ?? resolveTitle(location.pathname);

  return (
    <header className="topbar">
      <div className="topbar-leading">
        {onMenuToggle && <MobileMenuButton onOpen={onMenuToggle} />}

        <div>
          <p className="topbar-label">Resident Portal</p>
          <h1>{resolvedTitle}</h1>
        </div>
      </div>

      <div className="profile">
        <ThemeToggle />

        {onNotifications && (
          <button
            type="button"
            className="notification-button"
            onClick={onNotifications}
            aria-label="Notifications"
          >
            <Bell
              className="notification-icon"
              size={20}
              strokeWidth={1.9}
              aria-hidden="true"
            />
            {unreadCount > 0 && (
              <span className="notification-dot">{unreadCount}</span>
            )}
          </button>
        )}
      </div>
    </header>
  );
};

export default Topbar;
