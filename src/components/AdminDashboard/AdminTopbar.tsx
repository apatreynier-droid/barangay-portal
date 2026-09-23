import MobileMenuButton from "../Shared/MobileMenuButton";

type AdminTopbarProps = {
  fullName: string;
  role: string;
  unreadCount: number;
  onNotifications: () => void;
  title?: string;
  subtitle?: string;
  /** Opens the mobile drawer (rendered only below 769px via CSS). */
  onMenuToggle?: () => void;
};

const AdminTopbar = ({
  fullName,
  role,
  unreadCount,
  onNotifications,
  title = "Dashboard",
  subtitle,
  onMenuToggle,
}: AdminTopbarProps) => {
  const heading =
    subtitle ?? `Welcome back, ${fullName}. Here's what's happening today.`;

  return (
    <header className="admin-topbar">
      <div className="admin-topbar-heading">
        {onMenuToggle && <MobileMenuButton onOpen={onMenuToggle} />}

        <div>
          <h1>{title}</h1>
          <p>{heading}</p>
        </div>
      </div>

      <div className="admin-topbar-actions">
        <button
          type="button"
          className="admin-bell-button"
          onClick={onNotifications}
          aria-label="Notifications"
        >
          🔔
          {unreadCount > 0 && (
            <span className="admin-bell-badge">{unreadCount}</span>
          )}
        </button>

        <div className="admin-topbar-profile">
          <span className="admin-topbar-avatar">
            {fullName
              .split(" ")
              .map((part) => part.charAt(0))
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>

          <div className="admin-topbar-user">
            <strong>{fullName}</strong>
            <span>{role}</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AdminTopbar;
