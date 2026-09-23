import notificationIcon from "../../assets/icons/notification-bell.png";
import MobileMenuButton from "../Shared/MobileMenuButton";

type TopbarProps = {
  unreadCount: number;
  onNotifications: () => void;
  /** Opens the mobile drawer (rendered only below 769px via CSS). */
  onMenuToggle?: () => void;
};

const Topbar = ({ unreadCount, onNotifications, onMenuToggle }: TopbarProps) => {
  return (
    <header className="topbar">
      <div className="topbar-leading">
        {onMenuToggle && <MobileMenuButton onOpen={onMenuToggle} />}

        <div>
          <p className="topbar-label">Resident Portal</p>
          <h1>Dashboard</h1>
        </div>
      </div>

      <div className="profile">
        <button
          type="button"
          className="notification-button"
          onClick={onNotifications}
          aria-label="Notifications"
        >
          <img src={notificationIcon} alt="" className="notification-icon" />
          {unreadCount > 0 && (
            <span className="notification-dot">{unreadCount}</span>
          )}
        </button>
      </div>
    </header>
  );
};

export default Topbar;
