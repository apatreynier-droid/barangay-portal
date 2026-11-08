import "../../../Styles/Resident/Components/ResidentTopBar.css";

import { Bell } from "lucide-react";
import MobileLogoutButton from "../../Shared/MobileLogoutButton";
import ThemeToggle from "../../Shared/ThemeToggle";

type RequestsHeaderProps = {
  firstName: string;
  /** @deprecated Unused (replaced by the mobile logout button); kept for existing callers. */
  onMenuToggle?: () => void;
  /** Shows the logout button on phones. */
  onLogout?: () => void;
  /** When provided, the bell button is shown. */
  onNotifications?: () => void;
  /** Shows a count badge on the bell when greater than zero. */
  unreadCount?: number;
};

const RequestsHeader = ({
  firstName,
  onLogout,
  onNotifications,
  unreadCount = 0,
}: RequestsHeaderProps) => {
  return (
    <header className="topbar">
      <div className="topbar-leading">
        <div>
          <p className="topbar-label">Resident Portal</p>
          <h1>My Requests</h1>
          <p className="topbar-description">
            Track and manage your barangay document requests, {firstName}.
          </p>
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

export default RequestsHeader;
