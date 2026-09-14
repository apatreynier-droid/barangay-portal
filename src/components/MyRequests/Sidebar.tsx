import { useState } from "react";
import wingsLogo from "../../assets/logo-256.png";
import ADashIcon from "../../assets/icons/ADash.png";
import requestIcon from "../../assets/icons/DR.png";
import notificationIcon from "../../assets/icons/notification-bell.png";
import logoutIcon from "../../assets/icons/logout.png";
import LogoutConfirmation from "../LogoutConfirmation/LogoutConfirmation";

type SidebarProps = {
  onBackToDashboard: () => void;
  onMyRequests: () => void;
  /** Kept for backwards compatibility with pages that still pass it. */
  onRequestHistory?: () => void;
  onNotifications: () => void;
  /** Kept for backwards compatibility with pages that still pass it. */
  onRequestDocument?: () => void;
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
  onNotifications,
  onLogout,
  activePage = "my-requests",
}: SidebarProps) => {
  // Request history lives inside My Requests now, so both highlight the
  // same item. "request-document" is reached from the Dashboard banner and
  // Quick Actions, so no sidebar item is marked active for it.
  const isMyRequestsActive =
    activePage === "my-requests" || activePage === "request-history";
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
              <img src={ADashIcon} alt="" />
            </span>
            Dashboard
          </button>

          <button
            type="button"
            className={`nav-item nav-button ${
              isMyRequestsActive ? "active" : ""
            }`}
            onClick={onMyRequests}
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
