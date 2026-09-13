import { useState } from "react";
import wingsLogo from "../../assets/logo-256.png";
import dashboardIcon from "../../assets/dashboard.png";
import requestIcon from "../../assets/copy.png";
import historyIcon from "../../assets/history.png";
import notificationIcon from "../../assets/notification.png";
import reqdocumentIcon from "../../assets/add.png";
import LogoutConfirmation from "../LogoutConfirmation/LogoutConfirmation";

type SidebarProps = {
  onBackToDashboard: () => void;
  onMyRequests: () => void;
  onRequestHistory: () => void;
  onNotifications: () => void;
  onRequestDocument: () => void;
  onLogout: () => void;
  activePage?:
    | "my-requests"
    | "request-history"
    | "notifications"
    | "request-document";
};

const Sidebar = ({
  onBackToDashboard,
  onMyRequests,
  onRequestHistory,
  onNotifications,
  onRequestDocument,
  onLogout,
  activePage = "my-requests",
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
          <button
            type="button"
            className="nav-item nav-button"
            onClick={onBackToDashboard}
          >
            <span className="nav-icon">
              <img src={dashboardIcon} alt="" />
            </span>
            Dashboard
          </button>

          <button
            type="button"
            className={`nav-item nav-button ${
              activePage === "my-requests" ? "active" : ""
            }`}
            onClick={onMyRequests}
            disabled={activePage === "my-requests"}
          >
            <span className="nav-icon">
              <img src={requestIcon} alt="" />
            </span>
            My Requests
          </button>

          <button
            type="button"
            className={`nav-item nav-button ${
              activePage === "request-document" ? "active" : ""
            }`}
            onClick={onRequestDocument}
            disabled={activePage === "request-document"}
          >
            <span className="nav-icon">
              <img src={reqdocumentIcon} alt="" />
            </span>
            Request Document
          </button>

          <button
            type="button"
            className={`nav-item nav-button ${
              activePage === "request-history" ? "active" : ""
            }`}
            onClick={onRequestHistory}
            disabled={activePage === "request-history"}
          >
            <span className="nav-icon">
              <img src={historyIcon} alt="" />
            </span>
            Request History
          </button>

          <button
            type="button"
            className={`nav-item nav-button ${
              activePage === "notifications" ? "active" : ""
            }`}
            onClick={onNotifications}
            disabled={activePage === "notifications"}
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
