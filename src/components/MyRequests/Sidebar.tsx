import wingsLogo from "../../assets/logo-256.png";
import ADashIcon from "../../assets/icons/ADash.png";
import requestIcon from "../../assets/icons/DR.png";
import notificationIcon from "../../assets/icons/notification-bell.png";
import SidebarUserFooter from "../SidebarUserFooter/SidebarUserFooter";

type SidebarProps = {
  onBackToDashboard: () => void;
  onMyRequests: () => void;
  /** Kept for backwards compatibility with pages that still pass it. */
  onRequestHistory?: () => void;
  onNotifications: () => void;
  /** Kept for backwards compatibility with pages that still pass it. */
  onRequestDocument?: () => void;
  onLogout: () => void;
  firstName: string;
  lastName: string;
  role: string;
  activePage?:
    | "my-requests"
    | "request-history"
    | "notifications"
    | "request-document";
  /** Mobile drawer state (see useResponsiveSidebar); ignored on desktop. */
  isOpen?: boolean;
  /** Closes the mobile drawer when a nav item is chosen. */
  onNavigate?: () => void;
};

const Sidebar = ({
  onBackToDashboard,
  onMyRequests,
  onNotifications,
  onLogout,
  firstName,
  lastName,
  role,
  activePage = "my-requests",
  isOpen = false,
  onNavigate,
}: SidebarProps) => {
  // Request history lives inside My Requests now, so both highlight the
  // same item. "request-document" is reached from the Dashboard banner and
  // Quick Actions, so no sidebar item is marked active for it.
  const isMyRequestsActive =
    activePage === "my-requests" || activePage === "request-history";

  const closeThen = (action: () => void) => () => {
    onNavigate?.();
    action();
  };

  return (
    <>
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
          <button
            type="button"
            className="nav-item nav-button"
            onClick={closeThen(onBackToDashboard)}
          >
            <span className="nav-icon">
              <img src={ADashIcon} alt="" />
            </span>
            Dashboard
          </button>

          <button
            type="button"
            className={`nav-item nav-button ${
              isMyRequestsActive ? "active" : ""
            }`}
            onClick={closeThen(onMyRequests)}
            disabled={isMyRequestsActive}
          >
            <span className="nav-icon">
              <img src={requestIcon} alt="" />
            </span>
            My Requests
          </button>

          <button
            type="button"
            className={`nav-item nav-button ${
              activePage === "notifications" ? "active" : ""
            }`}
            onClick={closeThen(onNotifications)}
            disabled={activePage === "notifications"}
          >
            <span className="nav-icon">
              <img src={notificationIcon} alt="" />
            </span>
            Notifications
          </button>
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

export default Sidebar;
