import { useEffect, useMemo, useState } from "react";
import "../AdminDashboard/AdminDashboard.css";
import "./AdminNotification.css";
import type { ApiNotification, AuthUser } from "../../Utils/api";
import {
  ApiError,
  fetchAdminDocumentRequests,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../Utils/api";
import { getPendingApprovals } from "../../Utils/AdminApprovalsLogic";
import { ADMIN_DISPLAY_NAME } from "../../Utils/AdminDisplay";
import { formatRelativeTime } from "../../Utils/AdminDashboardLogic";
import AdminSidebar from "../../components/AdminDashboard/AdminSidebar";
import AdminTopbar from "../../components/AdminDashboard/AdminTopbar";
import useResponsiveSidebar from "../../Utils/useResponsiveSidebar";

type AdminNotificationProps = {
  user: AuthUser;
  /** Live notifications loaded by App from GET /api/notifications. */
  notifications: ApiNotification[];
  unreadNotifications: number;
  onNotificationsChanged: () => Promise<void>;
  onSessionExpired: () => void;
  onDashboard: () => void;
  onResidents: () => void;
  onDocumentRequests: () => void;
  onRequestHistory: () => void;
  onApprovals: () => void;
  onDocumentManagement: () => void;
  onReports: () => void;
  onActivityLogs: () => void;
  onLogout: () => void;
};

type NotificationFilter = "all" | "unread";

type NotificationKind = "request" | "ready" | "rejected" | "system" | "update";

const NOTIFICATION_KIND_META: Record<
  NotificationKind,
  { icon: string; color: string }
> = {
  request: { icon: "📄", color: "blue" },
  ready: { icon: "✓", color: "green" },
  rejected: { icon: "✕", color: "red" },
  system: { icon: "⚙️", color: "slate" },
  update: { icon: "🔔", color: "amber" },
};

/**
 * Maps a stored notification (title + notification_type from the
 * notifications table) to its display icon/color. Mirrors the keyword
 * matching used by the resident NotificationPage.
 */
const resolveKind = (notification: ApiNotification): NotificationKind => {
  if (notification.notification_type === "system") {
    return "system";
  }

  const title = notification.title.toLowerCase();

  if (title.includes("rejected")) {
    return "rejected";
  }

  if (title.includes("ready") || title.includes("completed")) {
    return "ready";
  }

  if (
    title.includes("received") ||
    title.includes("submitted") ||
    title.includes("pending") ||
    title.includes("request")
  ) {
    return "request";
  }

  return "update";
};

/** MySQL timestamps arrive without a timezone marker; treat them as UTC. */
const toUtcTimestamp = (value: string): string => {
  const trimmed = value.trim();

  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return value;
  }

  return `${trimmed}Z`;
};

function AdminNotification({
  notifications,
  unreadNotifications,
  onNotificationsChanged,
  onSessionExpired,
  onDashboard,
  onResidents,
  onDocumentRequests,
  onApprovals,
  onRequestHistory,
  onDocumentManagement,
  onReports,
  onActivityLogs,
  onLogout,
}: AdminNotificationProps) {
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [actionError, setActionError] = useState("");
  // Sidebar badges stay consistent with the other Admin pages.
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchAdminDocumentRequests()
      .then((requests) => {
        if (!cancelled) {
          setPendingRequests(getPendingApprovals(requests).length);
        }
      })
      .catch(() => {
        // Badges are optional here; notifications still load from App state.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  const visibleNotifications = useMemo(
    () =>
      filter === "unread"
        ? notifications.filter((notification) => !notification.is_read)
        : notifications,
    [filter, notifications],
  );

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

      setActionError("Could not update the notifications. Please try again.");
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

  const roleLabel = "Brgy. Administrator";

  return (
    <div className="admin-dashboard">
      <AdminSidebar
        pendingRequests={pendingRequests}
        pendingApprovals={pendingRequests}
        unreadNotifications={unreadNotifications}
        firstName={ADMIN_DISPLAY_NAME}
        lastName=""
        role={roleLabel}
        activeItem="notifications"
        onDashboard={onDashboard}
        onResidents={onResidents}
        onDocumentRequests={onDocumentRequests}
        onRequestHistory={onRequestHistory}
        onApprovals={onApprovals}
        onDocumentManagement={onDocumentManagement}
        onReports={onReports}
        onActivityLogs={onActivityLogs}
        onNotifications={() => undefined}
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

      <main className="admin-main">
        <AdminTopbar
          fullName={ADMIN_DISPLAY_NAME}
          onMenuToggle={toggleDrawer}
          title="Notifications"
          subtitle="Alerts and system notifications."
        />

        <div className="admin-notifications-toolbar">
          <div
            className="admin-notifications-filters"
            role="group"
            aria-label="Filter notifications"
          >
            <button
              type="button"
              className={`admin-notification-filter-pill${
                filter === "all" ? " active" : ""
              }`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={`admin-notification-filter-pill${
                filter === "unread" ? " active" : ""
              }`}
              onClick={() => setFilter("unread")}
            >
              Unread ({unreadNotifications})
            </button>
          </div>

          <button
            type="button"
            className="admin-notifications-mark-all"
            onClick={() => void handleMarkAllAsRead()}
            disabled={unreadNotifications === 0 || isMarkingAll}
          >
            {isMarkingAll ? "Updating…" : "Mark all as read"}
          </button>
        </div>

        {actionError && (
          <div className="admin-error-banner" role="alert">
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => void onNotificationsChanged()}
            >
              Retry
            </button>
          </div>
        )}

        {visibleNotifications.length === 0 ? (
          <div className="admin-notifications-empty">
            <p>
              {filter === "unread"
                ? "You have no unread notifications."
                : "You have no notifications yet."}
            </p>
            <span>
              {filter === "unread"
                ? "New requests and status updates will appear here."
                : "Resident requests and system updates will appear here."}
            </span>
          </div>
        ) : (
          <ul className="admin-notifications-list">
            {visibleNotifications.map((notification) => {
              const kind = resolveKind(notification);
              const meta = NOTIFICATION_KIND_META[kind];
              const isUnread = !notification.is_read;

              return (
                <li
                  className={`admin-notification-item${
                    isUnread ? " unread" : ""
                  }`}
                  key={notification.id}
                  onClick={
                    isUnread && pendingId !== notification.id
                      ? () => void handleMarkAsRead(notification.id)
                      : undefined
                  }
                  onKeyDown={
                    isUnread && pendingId !== notification.id
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void handleMarkAsRead(notification.id);
                          }
                        }
                      : undefined
                  }
                  role={isUnread ? "button" : undefined}
                  tabIndex={isUnread ? 0 : undefined}
                  aria-label={
                    isUnread ? "Mark this notification as read" : undefined
                  }
                  title={isUnread ? "Mark as read" : undefined}
                >
                  <span
                    className={`admin-notification-icon ${meta.color}`}
                    aria-hidden="true"
                  >
                    {meta.icon}
                  </span>

                  <div className="admin-notification-body">
                    <div className="admin-notification-title-row">
                      <h3>{notification.title}</h3>
                      {isUnread && (
                        <span
                          className="admin-notification-dot"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <p>{notification.message}</p>
                    <time
                      className="admin-notification-time"
                      dateTime={notification.created_at}
                    >
                      {formatRelativeTime(
                        toUtcTimestamp(notification.created_at),
                      )}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

export default AdminNotification;

