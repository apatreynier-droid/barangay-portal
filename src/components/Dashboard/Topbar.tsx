type TopbarProps = {
  unreadCount: number;
  onNotifications: () => void;
};

const Topbar = ({ unreadCount, onNotifications }: TopbarProps) => {
  return (
    <header className="topbar">
      <div>
        <p className="topbar-label">Resident Portal</p>
        <h1>Dashboard</h1>
      </div>

      <div className="profile">
        <button
          type="button"
          className="notification-button"
          onClick={onNotifications}
          aria-label="Notifications"
        >
          🔔
          {unreadCount > 0 && (
            <span className="notification-dot">{unreadCount}</span>
          )}
        </button>
      </div>
    </header>
  );
};

export default Topbar;
