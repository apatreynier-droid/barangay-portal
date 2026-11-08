import "../../../Styles/Resident/Components/ResidentTopBar.css";

import { Bell } from "lucide-react";
import { useLocation } from "react-router-dom";
import MobileLogoutButton from "../../Shared/MobileLogoutButton";
import ThemeToggle from "../../Shared/ThemeToggle";
import {
  LEGACY_RESIDENT_HOME_PATH,
  NOTIFICATIONS_PATH,
  POTHOLE_DETECTION_PATH,
  RESIDENT_HOME_PATH,
  RESIDENT_MY_REQUESTS_PATH,
  RESIDENT_REQUEST_DOCUMENT_PATH,
  RESIDENT_REQUEST_HISTORY_PATH,
} from "../../../Utils/Shared/routePaths";

type TopbarProps = {
  unreadCount?: number;
  onNotifications?: () => void;
  /** @deprecated Unused (replaced by the mobile logout button); kept for existing callers. */
  onMenuToggle?: () => void;
  /** Shows the logout button on phones. */
  onLogout?: () => void;
  /** Optional title override; defaults to the current route's page title. */
  title?: string;
  /** Optional one-line description shown under the title. */
  description?: string;
};

const RESIDENT_PAGE_TITLES: Record<string, string> = {
  [RESIDENT_HOME_PATH]: "Dashboard",
  [LEGACY_RESIDENT_HOME_PATH]: "Dashboard",
  [RESIDENT_MY_REQUESTS_PATH]: "My Requests",
  [RESIDENT_REQUEST_DOCUMENT_PATH]: "Request a Document",
  [RESIDENT_REQUEST_HISTORY_PATH]: "Request History",
  [NOTIFICATIONS_PATH]: "Notifications",
  [POTHOLE_DETECTION_PATH]: "Pothole Detection",
};

const resolveTitle = (pathname: string): string =>
  RESIDENT_PAGE_TITLES[pathname] ?? "Dashboard";

const Topbar = ({
  unreadCount = 0,
  onNotifications,
  onLogout,
  title,
  description,
}: TopbarProps) => {
  const location = useLocation();
  const resolvedTitle = title ?? resolveTitle(location.pathname);

  return (
    <header className="topbar">
      <div className="topbar-leading">
        <div>
          <p className="topbar-label">Resident Portal</p>
          <h1>{resolvedTitle}</h1>
          {description && <p className="topbar-description">{description}</p>}
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

        {onLogout && <MobileLogoutButton onLogout={onLogout} />}
      </div>
    </header>
  );
};

export default Topbar;
