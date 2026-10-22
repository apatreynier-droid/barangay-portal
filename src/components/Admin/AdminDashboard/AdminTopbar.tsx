import "../../../Styles/Admin/Components/AdminTopBar.css";

import MobileMenuButton from "../../Shared/MobileMenuButton";
import notificationIcon from "../../../assets/icons/notification-bell.png";
import { getInitials } from "../../../Utils/Admin/AdminDashboardLogic";

type AdminTopbarProps = {
  fullName: string;
  title?: string;
  subtitle?: string;
  /** Opens the mobile drawer (rendered only below 769px via CSS). */
  onMenuToggle?: () => void;
  /** Unread count for the bell badge; omit to hide the bell (no handler). */
  unreadNotifications?: number;
  /** Opens the existing Notifications page. */
  onNotifications?: () => void;
};

const AdminTopbar = ({
  fullName,
  title = "Dashboard",
  subtitle,
  onMenuToggle,
  unreadNotifications,
  onNotifications,
}: AdminTopbarProps) => {
  const firstName = fullName.split(/\s+/)[0] ?? fullName;

  return (
    <header className="admin-topbar">
      <div className="admin-topbar-heading">
        {onMenuToggle && <MobileMenuButton onOpen={onMenuToggle} />}

        <div>
          <h1>{title}</h1>

          {subtitle !== undefined ? (
            <p>{subtitle}</p>
          ) : (
            <>
              {/* Phones keep the greeting to a single compact line. */}
              <p className="admin-welcome admin-welcome--short">
                Welcome back, {firstName}.
              </p>
              <p className="admin-welcome admin-welcome--long">
                Welcome back, {fullName}. Here's what's happening today.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="admin-topbar-actions">
        {onNotifications && (
          <button
            type="button"
            className="admin-notif-button"
            onClick={onNotifications}
            aria-label={
              unreadNotifications
                ? `Notifications, ${unreadNotifications} unread`
                : "Notifications"
            }
          >
            <img src={notificationIcon} alt="" className="admin-notif-icon" />
            {!!unreadNotifications && unreadNotifications > 0 && (
              <span className="admin-notif-badge" aria-hidden="true">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </button>
        )}

        <span
          className="admin-topbar-avatar"
          title={fullName}
          aria-hidden="true"
        >
          {getInitials(fullName)}
        </span>
      </div>
    </header>
  );
};

export default AdminTopbar;
