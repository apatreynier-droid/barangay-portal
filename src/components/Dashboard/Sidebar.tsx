import { useState } from "react";
import wingsLogo from "../../assets/logo-256.png";
import ADashIcon from "../../assets/icons/ADash.png";
import requestIcon from "../../assets/icons/DR.png";
import notificationIcon from "../../assets/icons/notification-bell.png";
import logoutIcon from "../../assets/icons/logout.png";
import LogoutConfirmation from "../LogoutConfirmation/LogoutConfirmation";

type SidebarProps = {
  onMyRequests: () => void;
  onNotifications: () => void;
  onLogout: () => void;
};

const Sidebar = ({
  onMyRequests,
  onNotifications,
  onLogout,
}: SidebarProps) => {
  const [isLogoutConfirmationOpen, setIsLogoutConfirmationOpen] =
    useState(false);

  return (
    <>
      <aside className="sidebar">
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
            onClick={onMyRequests}
          >
            <span className="nav-icon">
              <img src={requestIcon} alt="" />
            </span>
            My Requests
          </button>

          <button
            type="button"
            className="nav-item nav-button"
            onClick={onNotifications}
          >
            <span className="nav-icon">
              <img src={notificationIcon} alt="" />
            </span>
            Notifications
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button
            type="button"
            className="nav-item nav-button logout"
            onClick={() => setIsLogoutConfirmationOpen(true)}
          >
            <span className="nav-icon">
              <img src={logoutIcon} alt="" />
            </span>
            Logout
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

export default Sidebar;
