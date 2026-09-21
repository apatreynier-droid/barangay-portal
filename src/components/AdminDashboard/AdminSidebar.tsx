import SidebarUserFooter from "../SidebarUserFooter/SidebarUserFooter";
import dashboardIcon from "../../assets/icons/ADash.png";
import residentsIcon from "../../assets/icons/Residents.png";
import documentRequestsIcon from "../../assets/icons/DR.png";
import requestHistoryIcon from "../../assets/icons/RH.png";
import approvalsIcon from "../../assets/icons/AP.png";
import documentManagementIcon from "../../assets/icons/Dm.png";
import reportsIcon from "../../assets/icons/Reports.png";
import notificationsIcon from "../../assets/icons/notification-bell.png";
import announcementsIcon from "../../assets/icons/announcement.png";
import userManagementIcon from "../../assets/icons/UM.png";
import activityLogsIcon from "../../assets/icons/Logs.png";

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
  onDocumentRequests?: () => void;
  onRequestHistory?: () => void;
  onApprovals?: () => void;
  onDocumentManagement?: () => void;
  onReports?: () => void;
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
  onDocumentRequests,
  onRequestHistory,
  onApprovals,
  onDocumentManagement,
  onReports,
  onNotifications,
  onLogout,
}: AdminSidebarProps) => {
  const navItems: AdminNavItem[] = [
    {
      key: "dashboard",
      label: "Dashboard",
      icon: dashboardIcon,
      onClick: onDashboard,
    },
    {
      key: "residents",
      label: "Residents",
      icon: residentsIcon,
      onClick: onResidents,
    },
    {
      key: "document-requests",
      label: "Document Requests",
      icon: documentRequestsIcon,
      badge: pendingRequests,
      onClick: onDocumentRequests,
    },
    {
      key: "request-history",
      label: "Request History",
      icon: requestHistoryIcon,
      onClick: onRequestHistory,
    },
    {
      key: "approvals",
      label: "Approvals",
      icon: approvalsIcon,
      badge: pendingApprovals,
      onClick: onApprovals,
    },
    {
      key: "document-management",
      label: "Document Management",
      icon: documentManagementIcon,
      onClick: onDocumentManagement,
    },
    {
      key: "reports",
      label: "Reports",
      icon: reportsIcon,
      onClick: onReports,
    },
    {
      key: "notifications",
      label: "Notifications",
      icon: notificationsIcon,
      badge: unreadNotifications,
      onClick: onNotifications,
    },
    { key: "announcements", label: "Announcements", icon: announcementsIcon },
    { key: "user-management", label: "User Management", icon: userManagementIcon },
    { key: "activity-logs", label: "Activity Logs", icon: activityLogsIcon },
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
                    <img src={item.icon} alt="" />
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
                  <img src={item.icon} alt="" />
                </span>
                <span className="admin-nav-label">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="admin-nav-badge">{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        <SidebarUserFooter
          firstName={firstName}
          lastName={lastName}
          role={role}
          onLogout={onLogout}
        />
      </aside>
    </>
  );
};

export default AdminSidebar;
