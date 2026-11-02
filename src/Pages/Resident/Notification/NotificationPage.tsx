import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  CheckCheck,
  Inbox,
  PackageCheck,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import Sidebar from "../../../components/Resident/Dashboard/Sidebar";
import Topbar from "../../../components/Resident/Dashboard/Topbar";
import {
  ApiError,
  markAllNotificationsRead,
  markNotificationRead,
  type ApiNotification,
  type AuthUser,
} from "../../../Utils/Shared/api";
import { RESIDENT_ROLE_LABEL } from "../../../Utils/Resident/ResidentDisplay";
import {
  isAdminPortalUser,
  NOTIFICATIONS_PATH,
  POTHOLE_DETECTION_PATH,
} from "../../../Utils/Shared/routePaths";
import useResponsiveSidebar from "../../../Utils/Shared/useResponsiveSidebar";
import "../../../Styles/Resident/Pages/Dashboard.css";
import "../../../Styles/Resident/Pages/NotificationPage.css";

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
type NotificationFilter = "all" | "unread";

const notificationIcons: Record<NotificationKind, LucideIcon> = {
  ready: PackageCheck,
  update: RefreshCw,
  received: Inbox,
};

const FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
];

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

//: Timezone used for all resident-facing timestamp displays (Philippine Standard Time).
const PHILIPPINE_TIMEZONE = "Asia/Manila";

//: How often (ms) the relative-time labels are refreshed so "Just now" stays accurate.
const RELATIVE_TIME_REFRESH_MS = 60_000;

/**
 * Parse a backend timestamp as UTC and return a Date.
 *
 * The backend stores all timestamps in UTC (session time_zone = '+00:00').
 * MySQL returns TIMESTAMP columns as naive datetime strings (e.g.
 * "2026-11-02 15:35:00"); FastAPI serializes them as ISO strings without a
 * timezone marker (e.g. "2026-11-02T15:35:00"). We treat these as UTC by
 * appending "Z" so the browser interprets the instant correctly, then convert
 * to Asia/Manila only at display time.
 */
function parseUtcTimestamp(value: string): Date {
  const trimmed = value.trim();
  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return new Date(trimmed);
  }
  return new Date(trimmed + "Z");
}

/**
 * Format a backend UTC timestamp as a relative time string in Philippine time.
 *
 * Returns strings like "Just now", "5 minutes ago", "2 hours ago", "Yesterday".
 */
function formatRelativeTime(value: string, now: number): string {
  const eventDate = parseUtcTimestamp(value);
  if (Number.isNaN(eventDate.getTime())) return value;

  const seconds = Math.max(0, Math.floor((now - eventDate.getTime()) / 1000));

  if (seconds < 60) {
    return "Just now";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days === 1) {
    return "Yesterday";
  }
  if (days < 30) {
    return `${days} days ago`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }

  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/**
 * Format a backend UTC timestamp as a full date/time string in Philippine time,
 * e.g. "November 2, 2026 at 10:35 PM". Used for the time tooltip.
 */
function formatFullDateTime(value: string): string {
  const date = parseUtcTimestamp(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: PHILIPPINE_TIMEZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

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
  const navigate = useNavigate();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [actionError, setActionError] = useState("");
  const [filter, setFilter] = useState<NotificationFilter>("all");
  //: Ticks every minute so relative labels ("Just now", "5 minutes ago") stay
  //: accurate as time passes without the resident needing to refresh.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), RELATIVE_TIME_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const unreadCount = notifications.filter(
    (notification) => !notification.is_read,
  ).length;

  const visibleNotifications =
    filter === "unread"
      ? notifications.filter((notification) => !notification.is_read)
      : notifications;

  const filterCounts: Record<NotificationFilter, number> = {
    all: notifications.length,
    unread: unreadCount,
  };

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
        onDashboard={onBackToDashboard}
        onMyRequests={onMyRequests}
        onRequestHistory={onRequestHistory}
        onNotifications={() => navigate(NOTIFICATIONS_PATH)}
        onRequestDocument={onRequestDocument}
        onPotholeDetection={() => navigate(POTHOLE_DETECTION_PATH)}
        onLogout={onLogout}
        firstName={user.first_name}
        lastName={user.last_name}
        role={
          isAdminPortalUser(user) ? "Brgy. Administrator" : RESIDENT_ROLE_LABEL
        }
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
        <Topbar
          title="Notifications"
          description="Updates about your document requests."
          unreadCount={unreadCount}
          onNotifications={() => navigate(NOTIFICATIONS_PATH)}
          onMenuToggle={toggleDrawer}
        />

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
            <button
              className="mark-read-button"
              type="button"
              onClick={() => void handleMarkAllAsRead()}
              disabled={unreadCount === 0 || isMarkingAll}
            >
              <CheckCheck size={16} strokeWidth={2} aria-hidden="true" />
              {isMarkingAll ? "Updating…" : "Mark all as read"}
            </button>
          </div>

          <div
            className="notifications-tabs"
            role="tablist"
            aria-label="Notification filter"
          >
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={filter === item.key}
                className={`notifications-tab ${
                  filter === item.key ? "active" : ""
                }`}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
                <span className="notifications-tab-count">
                  {filterCounts[item.key]}
                </span>
              </button>
            ))}
          </div>

          {visibleNotifications.length === 0 ? (
            <p className="notifications-empty-state">
              {notifications.length === 0
                ? "You have no notifications yet. Submit a document request to get started."
                : "You have no unread notifications."}
            </p>
          ) : (
            <ul className="notifications-list">
              {visibleNotifications.map((notification) => {
                const kind = resolveKind(notification);
                const KindIcon = notificationIcons[kind];

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
                      <KindIcon size={20} strokeWidth={1.9} />
                    </span>
                    <div className="notification-content">
                      <div className="notification-title-row">
                        <h3>
                          {!notification.is_read && (
                            <span className="notification-unread-dot">
                              <span className="visually-hidden">Unread: </span>
                            </span>
                          )}
                          {notification.title}
                        </h3>
                        <time
                          className="notification-time"
                          dateTime={notification.created_at}
                          title={formatFullDateTime(notification.created_at)}
                        >
                          {formatRelativeTime(
                            notification.created_at,
                            now,
                          )}
                        </time>
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
                        <Check size={15} strokeWidth={2.2} aria-hidden="true" />
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
