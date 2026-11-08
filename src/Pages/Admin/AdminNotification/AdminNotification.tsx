import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bell,
  BellDot,
  BellOff,
  Check,
  CheckCheck,
  CheckCircle,
  CircleCheck,
  CircleX,
  Clock,
  Construction,
  FileText,
  FileX,
  Inbox,
  Info,
  ListFilter,
  LoaderCircle,
  PackageCheck,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import "../../../Styles/Admin/Pages/AdminDashboard.css";
import "../../../Styles/Admin/Pages/AdminNotification.css";
import type { ApiNotification, AuthUser } from "../../../Utils/Shared/api";
import {
  ApiError,
  fetchAdminDashboard,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../../Utils/Shared/api";
import { formatManilaDateTime } from "../../../Utils/Admin/AdminRegistrationsLogic";
import { getPortalProfileName } from "../../../Utils/Admin/AdminDisplay";
import {
  formatRelativeTime,
  toUtcTimestamp,
} from "../../../Utils/Admin/AdminDashboardLogic";
import AdminSidebar from "../../../components/Admin/AdminDashboard/AdminSidebar";
import AdminTopbar from "../../../components/Admin/AdminDashboard/AdminTopbar";
import useResponsiveSidebar from "../../../Utils/Shared/useResponsiveSidebar";

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
  onUserManagement: () => void;
  onLogout: () => void;
};

type NotificationFilter = "all" | "unread";

type NotificationKind =
  | "registration"
  | "request"
  | "approved"
  | "rejected"
  | "ready"
  | "completed"
  | "processing"
  | "removed"
  | "pothole"
  | "system"
  | "update";

/** Shared sizing so every Lucide icon on this page renders consistently. */
const ICON_STROKE = 2;
const KIND_ICON_SIZE = 18;
const ACTION_ICON_SIZE = 16;
const PILL_ICON_SIZE = 14;

const NOTIFICATION_KIND_META: Record<
  NotificationKind,
  { icon: LucideIcon; color: string; label: string }
> = {
  registration: { icon: UserPlus, color: "indigo", label: "New resident registration" },
  request: { icon: FileText, color: "blue", label: "Document request" },
  approved: { icon: CircleCheck, color: "emerald", label: "Approved" },
  rejected: { icon: CircleX, color: "red", label: "Rejected" },
  ready: { icon: PackageCheck, color: "teal", label: "Ready for pickup" },
  completed: { icon: CheckCircle, color: "green", label: "Completed" },
  processing: { icon: Clock, color: "amber", label: "Processing" },
  removed: { icon: FileX, color: "red", label: "Request removed" },
  pothole: { icon: Construction, color: "orange", label: "Pothole report" },
  system: { icon: Info, color: "slate", label: "System update" },
  update: { icon: Bell, color: "amber", label: "Update" },
};

/**
 * Maps a notification's title and notification_type to its display icon/color
 * (titles come from the backend, e.g. "Request status: Ready for Pickup").
 */
const resolveKind = (notification: ApiNotification): NotificationKind => {
  const title = notification.title.toLowerCase();
  const type = notification.notification_type;

  if (title.includes("pothole")) {
    return "pothole";
  }

  if (type === "registration") {
    if (title.includes("rejected")) return "rejected";
    if (title.includes("approved")) return "approved";
    return "registration";
  }

  if (title.includes("rejected")) {
    return "rejected";
  }

  if (title.includes("deleted") || title.includes("cancel")) {
    return "removed";
  }

  if (title.includes("ready") || title.includes("pickup")) {
    return "ready";
  }

  if (title.includes("completed")) {
    return "completed";
  }

  if (title.includes("approved")) {
    return "approved";
  }

  if (title.includes("processing")) {
    return "processing";
  }

  if (type === "system") {
    return "system";
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

function AdminNotification({
  user,
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
  onUserManagement,
  onLogout,
}: AdminNotificationProps) {
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [actionError, setActionError] = useState("");
  // Sidebar badges stay consistent with the other Admin pages.
  const [pendingRequests, setPendingRequests] = useState(0);
  const [pendingRegistrations, setPendingRegistrations] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchAdminDashboard()
      .then((data) => {
        if (!cancelled) {
          setPendingRequests(data.stats.pending);
          setPendingRegistrations(data.stats.pending_registrations);
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

  return (
    <div className="admin-dashboard">
      <AdminSidebar
        pendingRequests={pendingRequests}
        pendingApprovals={pendingRequests + pendingRegistrations}
        unreadNotifications={unreadNotifications}
        user={user}
        activeItem="notifications"
        onDashboard={onDashboard}
        onResidents={onResidents}
        onDocumentRequests={onDocumentRequests}
        onRequestHistory={onRequestHistory}
        onApprovals={onApprovals}
        onDocumentManagement={onDocumentManagement}
        onReports={onReports}
        onActivityLogs={onActivityLogs}
        onUserManagement={onUserManagement}
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
          fullName={getPortalProfileName(user)}
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
            <span className="admin-notifications-filter-label" title="Filter">
              <ListFilter
                size={ACTION_ICON_SIZE}
                strokeWidth={ICON_STROKE}
                aria-hidden="true"
              />
            </span>
            <button
              type="button"
              className={`admin-notification-filter-pill${
                filter === "all" ? " active" : ""
              }`}
              onClick={() => setFilter("all")}
              aria-pressed={filter === "all"}
            >
              <Inbox
                size={PILL_ICON_SIZE}
                strokeWidth={ICON_STROKE}
                aria-hidden="true"
              />
              All
            </button>
            <button
              type="button"
              className={`admin-notification-filter-pill${
                filter === "unread" ? " active" : ""
              }`}
              onClick={() => setFilter("unread")}
              aria-pressed={filter === "unread"}
            >
              <BellDot
                size={PILL_ICON_SIZE}
                strokeWidth={ICON_STROKE}
                aria-hidden="true"
              />
              Unread ({unreadNotifications})
            </button>
          </div>

          <button
            type="button"
            className="admin-notifications-mark-all"
            onClick={() => void handleMarkAllAsRead()}
            disabled={unreadNotifications === 0 || isMarkingAll}
          >
            {isMarkingAll ? (
              <LoaderCircle
                className="admin-notification-spin"
                size={ACTION_ICON_SIZE}
                strokeWidth={ICON_STROKE}
                aria-hidden="true"
              />
            ) : (
              <CheckCheck
                size={ACTION_ICON_SIZE}
                strokeWidth={ICON_STROKE}
                aria-hidden="true"
              />
            )}
            <span>{isMarkingAll ? "Updating…" : "Mark all as read"}</span>
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
            <span className="admin-notifications-empty-icon" aria-hidden="true">
              <BellOff size={22} strokeWidth={ICON_STROKE} />
            </span>
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
              const KindIcon = meta.icon;
              const isUnread = !notification.is_read;
              const isPending = pendingId === notification.id;

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
                    title={meta.label}
                    aria-hidden="true"
                  >
                    <KindIcon size={KIND_ICON_SIZE} strokeWidth={ICON_STROKE} />
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
                      title={formatManilaDateTime(notification.created_at)}
                    >
                      {formatRelativeTime(
                        toUtcTimestamp(notification.created_at),
                      )}
                    </time>
                    {notification.notification_type === "registration" && (
                      <button
                        type="button"
                        className="admin-notification-review"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (isUnread) {
                            void handleMarkAsRead(notification.id);
                          }
                          onApprovals();
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <span>Review registration</span>
                        <ArrowRight
                          size={PILL_ICON_SIZE}
                          strokeWidth={ICON_STROKE}
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </div>

                  {isUnread && (
                    <button
                      type="button"
                      className="admin-notification-action"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!isPending) {
                          void handleMarkAsRead(notification.id);
                        }
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      disabled={isPending}
                      aria-label="Mark as read"
                      title="Mark as read"
                    >
                      {isPending ? (
                        <LoaderCircle
                          className="admin-notification-spin"
                          size={ACTION_ICON_SIZE}
                          strokeWidth={ICON_STROKE}
                          aria-hidden="true"
                        />
                      ) : (
                        <Check
                          size={ACTION_ICON_SIZE}
                          strokeWidth={ICON_STROKE}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  )}
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

