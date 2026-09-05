import { useState } from "react";
import LogoutConfirmation from "../LogoutConfirmation/LogoutConfirmation";

type AdminNavItem = {
  key: string;
  label: string;
  icon: string;
  badge?: number;
  onClick?: () => void;
};

type AdminSidebarProps = {
  pendingRequests: number;
  pendingApprovals: number;
  unreadNotifications: number;
  firstName: string;
  lastName: string;
  role: string;
  activeItem?: string;
  onDashboard?: () => void;
  onResidents?: () => void;
  onNotifications: () => void;
  onLogout: () => void;
};

const AdminSidebar = ({
  pendingRequests,
  pendingApprovals,
  unreadNotifications,
  firstName,
  lastName,
  role,
  activeItem = "dashboard",
  onDashboard,
  onResidents,
  onNotifications,
  onLogout,
}: AdminSidebarProps) => {
  const [isLogoutConfirmationOpen, setIsLogoutConfirmationOpen] =
    useState(false);

  const navItems: AdminNavItem[] = [
    { key: "dashboard", label: "Dashboard", icon: "▦", onClick: onDashboard },
    { key: "residents", label: "Residents", icon: "👥", onClick: onResidents },
    {
      key: "document-requests",
      label: "Document Requests",
      icon: "📄",
      badge: pendingRequests,
    },
    { key: "request-history", label: "Request History", icon: "🕘" },
    {
      key: "approvals",
      label: "Approvals",
      icon: "✅",
      badge: pendingApprovals,
    },
    { key: "document-management", label: "Document Management", icon: "🗂️" },
    { key: "reports", label: "Reports", icon: "📊" },
    {
      key: "notifications",
      label: "Notifications",
      icon: "🔔",
      badge: unreadNotifications,
      onClick: onNotifications,
    },
    { key: "announcements", label: "Announcements", icon: "📢" },
    { key: "user-management", label: "User Management", icon: "👤" },
    { key: "activity-logs", label: "Activity Logs", icon: "📋" },
  ];

  return (
    <>
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <div className="admin-logo-circle">BL</div>

          <div className="admin-logo-text">
            <h2>Barangay Lagab</h2>
            <span>Admin Portal</span>
          </div>

          <span className="admin-collapse-arrow" aria-hidden="true">
            ▸
          </span>
        </div>

        <nav className="admin-nav">
          {navItems.map((item) => {
            const className = `admin-nav-item${
              item.key === activeItem ? " active" : ""
            }`;

            if (item.onClick) {
              return (
                <button
                  key={item.key}
                  type="button"
                  className={className}
                  onClick={item.onClick}
                >
                  <span className="admin-nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="admin-nav-label">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="admin-nav-badge">{item.badge}</span>
                  )}
                </button>
              );
            }

            return (
              <button
                key={item.key}
                type="button"
                className={className}
                disabled
                title="Coming soon"
              >
                <span className="admin-nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="admin-nav-label">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="admin-nav-badge">{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <span className="admin-sidebar-avatar">
            {getInitialsSafe(firstName, lastName)}
          </span>

          <div className="admin-sidebar-user">
            <strong>
              {firstName} {lastName}
            </strong>
            <span>{role}</span>
          </div>

          <button
            type="button"
            className="admin-sidebar-logout"
            onClick={() => setIsLogoutConfirmationOpen(true)}
            aria-label="Logout"
            title="Logout"
          >
            ⏻
          </button>
        </div>
      </aside>

      <LogoutConfirmation
        isOpen={isLogoutConfirmationOpen}
        onCancel={() => setIsLogoutConfirmationOpen(false)}
        onConfirm={onLogout}
      />
    </>
  );
};

const getInitialsSafe = (firstName: string, lastName: string): string => {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);

  return `${first}${last}`.toUpperCase() || "?";
};

export default AdminSidebar;
