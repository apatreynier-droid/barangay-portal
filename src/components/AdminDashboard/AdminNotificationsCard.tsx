import filesIcon from "../../assets/icons/files.png";
import type { AdminActivityEntry } from "../../Types/AdminDashboardType";
import type { ApiNotification } from "../../Utils/api";
import {
  formatRelativeTime,
  toUtcTimestamp,
} from "../../Utils/AdminDashboardLogic";

type AdminNotificationsCardProps = {
  /**
   * Live notifications from GET /api/notifications (title, message, read
   * state, timestamp). Preferred source when present.
   */
  notifications: ApiNotification[];
  /** Fallback activity rows from the dashboard payload. */
  activities: AdminActivityEntry[];
  /** Opens the existing Notifications page (list + mark-as-read actions). */
  onOpen: () => void;
};

/** Newest few notifications only; the full list lives on the Notifications page. */
const MAX_NOTIFICATIONS = 4;

/**
 * Dashboard notification card. Shows the real notification rows the app
 * already polls (name/document/request context comes from the backend
 * message, read state from is_read) with an action that opens the existing
 * Notifications page. Falls back to the dashboard's recent-activity feed
 * when the notification list is empty.
 */
const AdminNotificationsCard = ({
  notifications,
  activities,
  onOpen,
}: AdminNotificationsCardProps) => {
  const unreadCount = notifications.filter(
    (notification) => !notification.is_read,
  ).length;

  const visibleNotifications = notifications.slice(0, MAX_NOTIFICATIONS);
  const hasNotifications = visibleNotifications.length > 0;
  const hasActivities = activities.length > 0;

  return (
    <section className="admin-panel">
      <div className="admin-panel-header">
        <h3 className="admin-panel-title">
          Notifications
          {hasNotifications && unreadCount > 0 && (
            <span className="admin-panel-badge" aria-hidden="true">
              {unreadCount}
            </span>
          )}
        </h3>

        {(hasNotifications || hasActivities) && (
          <button
            type="button"
            className="admin-panel-link"
            onClick={onOpen}
          >
            View all
          </button>
        )}
      </div>

      {!hasNotifications && !hasActivities ? (
        <p className="admin-empty-note">No notifications yet.</p>
      ) : hasNotifications ? (
        <ul className="admin-activity-list admin-notif-feed-list">
          {visibleNotifications.map((notification) => {
            const isUnread = !notification.is_read;

            return (
              <li key={notification.id}>
                <button
                  type="button"
                  className="admin-notif-feed-item"
                  onClick={onOpen}
                  aria-label={`${notification.title}${
                    isUnread ? ", unread" : ""
                  }. Open notifications.`}
                >
                  <span className="admin-activity-icon" aria-hidden="true">
                    <img src={filesIcon} alt="" />
                  </span>

                  <span className="admin-activity-info">
                    <span className="admin-notif-feed-title">
                      <strong>{notification.title}</strong>
                      {isUnread && (
                        <span className="admin-unread-flag">Unread</span>
                      )}
                    </span>
                    <span className="admin-notif-feed-message">
                      {notification.message}
                    </span>
                    <span>
                      {formatRelativeTime(
                        toUtcTimestamp(notification.created_at),
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="admin-activity-list">
          {activities.map((activity) => (
            <li key={activity.title + activity.created_at}>
              <span className="admin-activity-icon" aria-hidden="true">
                <img src={filesIcon} alt="" />
              </span>

              <div className="admin-activity-info">
                <strong>{activity.title}</strong>
                <span>{formatRelativeTime(activity.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default AdminNotificationsCard;
