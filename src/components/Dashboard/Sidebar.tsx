import wingsLogo from "../../assets/logo-256.png";
import ADashIcon from "../../assets/icons/ADash.png";
import requestIcon from "../../assets/icons/DR.png";
import notificationIcon from "../../assets/icons/notification-bell.png";
import SidebarUserFooter from "../SidebarUserFooter/SidebarUserFooter";

type SidebarProps = {
  firstName: string;
  lastName: string;
  role: string;
  onMyRequests: () => void;
  onNotifications: () => void;
  onLogout: () => void;
  /** Mobile drawer state (see useResponsiveSidebar); ignored on desktop. */
  isOpen?: boolean;
  /** Closes the mobile drawer when a nav item is chosen. */
  onNavigate?: () => void;
};

const Sidebar = ({
  firstName,
  lastName,
  role,
  onMyRequests,
  onNotifications,
  onLogout,
  isOpen = false,
  onNavigate,
}: SidebarProps) => {
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
          <button type="button" className="nav-item nav-button active" disabled>
            <span className="nav-icon">
              <img src={ADashIcon} alt="" />
            </span>
            Dashboard
          </button>

          <button
            type="button"
            className="nav-item nav-button"
            onClick={closeThen(onMyRequests)}
          >
            <span className="nav-icon">
              <img src={requestIcon} alt="" />
            </span>
            My Requests
          </button>

          <button
            type="button"
            className="nav-item nav-button"
            onClick={closeThen(onNotifications)}
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
