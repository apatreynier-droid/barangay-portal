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

type AdminNavSection = {
  label: string;
  items: AdminNavItem[];
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
  onActivityLogs?: () => void;
  onNotifications: () => void;
  onLogout: () => void;
  /** Mobile drawer state (see useResponsiveSidebar); ignored on desktop. */
  isOpen?: boolean;
  /** Closes the mobile drawer when a nav item is chosen. */
  onNavigate?: () => void;
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
  onActivityLogs,
  onNotifications,
  onLogout,
  isOpen = false,
  onNavigate,
}: AdminSidebarProps) => {
  // Grouped into related sections with subtle labels; items, routes, badges
  // and handlers are unchanged.
  const navSections: AdminNavSection[] = [
    {
      label: "Main",
      items: [
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
      ],
    },
    {
      label: "Reporting & System",
      items: [
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
        {
          key: "announcements",
          label: "Announcements",
          icon: announcementsIcon,
        },
        {
          key: "user-management",
          label: "User Management",
          icon: userManagementIcon,
        },
        {
          key: "activity-logs",
          label: "Activity Logs",
          icon: activityLogsIcon,
          onClick: onActivityLogs,
        },
      ],
    },
  ];

  const closeThen = (action: () => void) => () => {
    onNavigate?.();
    action();
  };

  return (
    <>
      <aside className={`admin-sidebar${isOpen ? " is-open" : ""}`}>
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
          {navSections.map((section) => (
            <div className="admin-nav-section" key={section.label}>
              <p className="admin-nav-section-label">{section.label}</p>

              {section.items.map((item) => {
                const className = `admin-nav-item${
                  item.key === activeItem ? " active" : ""
                }`;
                // On mobile the drawer should close before navigating.
                const handleClick =
                  item.onClick !== undefined
                    ? closeThen(item.onClick)
                    : undefined;

                if (handleClick) {
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={className}
                      onClick={handleClick}
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
            </div>
          ))}
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
