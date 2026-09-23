import { useState } from "react";
import Sidebar from "../../components/MyRequests/Sidebar";
import {
  ApiError,
  markAllNotificationsRead,
  markNotificationRead,
  type ApiNotification,
  type AuthUser,
} from "../../Utils/api";
import { RESIDENT_ROLE_LABEL } from "../../Utils/ResidentDisplay";
import { isAdminUser } from "../../Utils/routePaths";
import useResponsiveSidebar from "../../Utils/useResponsiveSidebar";
import MobileMenuButton from "../../components/Shared/MobileMenuButton";
import "../Dashboard/Dashboard.css";
import "./NotificationPage.css";

type NotificationPageProps = {
  user: AuthUser;
  notifications: ApiNotification[];
  onNotificationsChanged: () => Promise<void>;
  onSessionExpired: () => void;
  onBackToDashboard: () => void;
  onMyRequests: () => void;
  onRequestHistory: () => void;
  onRequestDocument: () => void;
  onLogout: () => void;
};

type NotificationKind = "ready" | "update" | "received";

const notificationIcons: Record<NotificationKind, string> = {
  ready: "✓",
  update: "!",
  received: "i",
};

const resolveKind = (notification: ApiNotification): NotificationKind => {
  const title = notification.title.toLowerCase();

  if (title.includes("ready") || title.includes("pickup")) {
    return "ready";
  }

  if (title.includes("received") || title.includes("submitted")) {
    return "received";
  }

  return "update";
};

const formatTimestamp = (value: string): string => {
  const date = new Date(value + "Z");

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

function NotificationPage({
  user,
  notifications,
  onNotificationsChanged,
  onSessionExpired,
  onBackToDashboard,
  onMyRequests,
  onRequestHistory,
  onRequestDocument,
  onLogout,
}: NotificationPageProps) {
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [actionError, setActionError] = useState("");

  const unreadCount = notifications.filter(
    (notification) => !notification.is_read,
  ).length;

  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  const handleMarkAllAsRead = async () => {
    setIsMarkingAll(true);
    setActionError("");

    try {
      await markAllNotificationsRead();
      await onNotificationsChanged();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }

      setActionError("Could not update your notifications. Please try again.");
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleMarkAsRead = async (id: number) => {
    setPendingId(id);
    setActionError("");

    try {
      await markNotificationRead(id);
      await onNotificationsChanged();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }

      setActionError("Could not update the notification. Please try again.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="notifications-layout">
      <Sidebar
        activePage="notifications"
        onBackToDashboard={onBackToDashboard}
        onMyRequests={onMyRequests}
        onRequestHistory={onRequestHistory}
        onNotifications={() => undefined}
        onRequestDocument={onRequestDocument}
        onLogout={onLogout}
        firstName={user.first_name}
        lastName={user.last_name}
        role={isAdminUser(user) ? "Brgy. Administrator" : RESIDENT_ROLE_LABEL}
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

      <main className="notifications-page">
        <header className="notifications-header">
          <div className="topbar-leading">
            {toggleDrawer && <MobileMenuButton onOpen={toggleDrawer} />}

            <div>
              <p className="page-label">Resident Portal</p>
              <h1>Notifications</h1>
              <p>Stay up to date with your document requests.</p>
            </div>
          </div>
          <button
            className="mark-read-button"
            type="button"
            onClick={() => void handleMarkAllAsRead()}
            disabled={unreadCount === 0 || isMarkingAll}
          >
            {isMarkingAll ? "Updating…" : "Mark all as read"}
          </button>
        </header>

        {actionError && (
          <div className="dashboard-error-banner" role="alert">
            <span>{actionError}</span>
          </div>
        )}

        <section
          className="notifications-card"
          aria-labelledby="notifications-title"
        >
          <div className="notifications-card-header">
            <div>
              <h2 id="notifications-title">Recent notifications</h2>
              <p>
                {unreadCount === 0
                  ? "You're all caught up"
                  : `${unreadCount} unread notification${
                      unreadCount === 1 ? "" : "s"
                    }`}
              </p>
            </div>
          </div>

          {notifications.length === 0 ? (
            <p className="notifications-empty-state">
              You have no notifications yet. Submit a document request to get
              started.
            </p>
          ) : (
            <ul className="notifications-list">
              {notifications.map((notification) => {
                const kind = resolveKind(notification);

                return (
                  <li
                    className={`notification-item ${
                      notification.is_read ? "" : "unread"
                    }`}
                    key={notification.id}
                  >
                    <span
                      className={`notification-type-icon ${kind}`}
                      aria-hidden="true"
                    >
                      {notificationIcons[kind]}
                    </span>
                    <div className="notification-content">
                      <div className="notification-title-row">
                        <h3>{notification.title}</h3>
                        <time>{formatTimestamp(notification.created_at)}</time>
                      </div>
                      <p>{notification.message}</p>
                    </div>
                    {!notification.is_read && (
                      <button
                        className="notification-read-button"
                        type="button"
                        onClick={() => void handleMarkAsRead(notification.id)}
                        disabled={pendingId === notification.id}
                      >
                        {pendingId === notification.id
                          ? "Saving…"
                          : "Mark as read"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

export default NotificationPage;
