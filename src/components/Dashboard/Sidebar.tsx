import wingsLogo from "../../assets/logo-256.png";
import ADashIcon from "../../assets/icons/ADash.png";
import requestIcon from "../../assets/icons/DR.png";
import notificationIcon from "../../assets/icons/notification-bell.png";
import potholeIcon from "../../assets/icons/pothole.png";
import SidebarUserFooter from "../SidebarUserFooter/SidebarUserFooter";

type SidebarProps = {
  firstName: string;
  lastName: string;
  role: string;
  activePage?:
    | "dashboard"
    | "my-requests"
    | "request-document"
    | "request-history"
    | "notifications"
    | "pothole-detection";
  onDashboard?: () => void;
  onMyRequests?: () => void;
  onRequestDocument?: () => void;
  onRequestHistory?: () => void;
  onNotifications?: () => void;
  onPotholeDetection?: () => void;
  onLogout: () => void;

  /** Mobile drawer state; ignored on desktop. */
  isOpen?: boolean;

  /** Closes the mobile drawer when a navigation item is chosen. */
  onNavigate?: () => void;
};

const NAV_ITEMS: {
  key: NonNullable<SidebarProps["activePage"]>;
  label: string;
  icon: string;
  handlerKey:
    | "onDashboard"
    | "onMyRequests"
    | "onNotifications"
    | "onPotholeDetection";
}[] = [
  { key: "dashboard", label: "Dashboard", icon: ADashIcon, handlerKey: "onDashboard" },
  { key: "my-requests", label: "My Requests", icon: requestIcon, handlerKey: "onMyRequests" },
  {
    key: "notifications",
    label: "Notifications",
    icon: notificationIcon,
    handlerKey: "onNotifications",
  },
  {
    key: "pothole-detection",
    label: "Pothole Detection",
    icon: potholeIcon,
    handlerKey: "onPotholeDetection",
  },
];

const Sidebar = ({
  firstName,
  lastName,
  role,
  activePage = "dashboard",
  onDashboard,
  onMyRequests,
  onNotifications,
  onPotholeDetection,
  onLogout,
  isOpen = false,
  onNavigate,
}: SidebarProps) => {
  const handlers = {
    onDashboard,
    onMyRequests,
    onNotifications,
    onPotholeDetection,
  };

  const closeThen = (action: () => void) => () => {
    onNavigate?.();
    action();
  };

  return (
    <aside className={`sidebar${isOpen ? " is-open" : ""}`}>
      <div className="sidebar-logo">
        <div className="sidebar-logo-circle">
          <img src={wingsLogo} alt="Barangay Logo" />
        </div>

        <div>
          <h2>Lagab-e Portal</h2>
          <span>Community Portal</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const handler = handlers[item.handlerKey];
          const isActive = activePage === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`nav-item nav-button ${isActive ? "active" : ""}`}
              onClick={handler ? closeThen(handler) : undefined}
              disabled={isActive || !handler}
            >
              <span className="nav-icon">
                <img src={item.icon} alt="" />
              </span>
              {item.label}
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
  );
};

export default Sidebar;
