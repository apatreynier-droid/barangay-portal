import { useState } from "react";
import wingsLogo from "../../assets/logo-256.png";
import dashboardIcon from "../../assets/dashboard.png";
import requestIcon from "../../assets/copy.png";
import historyIcon from "../../assets/history.png";
import notificationIcon from "../../assets/notification.png";
import reqdocumentIcon from "../../assets/add.png";
import LogoutConfirmation from "../LogoutConfirmation/LogoutConfirmation";

type SidebarProps = {
  onMyRequests: () => void;
  onRequestDocument: () => void;
  onRequestHistory: () => void;
  onNotifications: () => void;
  onLogout: () => void;
};

const Sidebar = ({
  onMyRequests,
  onRequestDocument,
  onRequestHistory,
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
              <img src={dashboardIcon} alt="" />
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
            onClick={onRequestDocument}
          >
            <span className="nav-icon">
              <img src={reqdocumentIcon} alt="" />
            </span>
            Request Document
          </button>

          <button
            type="button"
            className="nav-item nav-button"
            onClick={onRequestHistory}
          >
            <span className="nav-icon">
              <img src={historyIcon} alt="" />
            </span>
            Request History
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
          <a href="#" className="nav-item">
            <span className="nav-icon" aria-hidden="true">
              &#9881;
            </span>
            Settings
          </a>

          <button
            type="button"
            className="nav-item nav-button logout"
            onClick={() => setIsLogoutConfirmationOpen(true)}
          >
            <span className="nav-icon" aria-hidden="true">
              &#8618;
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
