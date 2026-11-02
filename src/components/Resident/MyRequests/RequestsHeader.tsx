import "../../../Styles/Resident/Components/ResidentTopBar.css";

import { Bell } from "lucide-react";
import MobileMenuButton from "../../Shared/MobileMenuButton";
import ThemeToggle from "../../Shared/ThemeToggle";

type RequestsHeaderProps = {
  firstName: string;
  /** Opens the mobile drawer (rendered only below 769px via CSS). */
  onMenuToggle?: () => void;
  /** When provided, the bell button is shown. */
  onNotifications?: () => void;
  /** Shows a count badge on the bell when greater than zero. */
  unreadCount?: number;
};

const RequestsHeader = ({
  firstName,
  onMenuToggle,
  onNotifications,
  unreadCount = 0,
}: RequestsHeaderProps) => {
  return (
    <header className="topbar">
      <div className="topbar-leading">
        {onMenuToggle && <MobileMenuButton onOpen={onMenuToggle} />}

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
      </div>
    </header>
  );
};

export default RequestsHeader;
