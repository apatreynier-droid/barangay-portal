import { useState } from "react";
import LogoutConfirmation from "../LogoutConfirmation/LogoutConfirmation";
import "./SidebarUserFooter.css";

type SidebarUserFooterProps = {
  firstName: string;
  lastName: string;
  role: string;
  onLogout: () => void;
};

/**
 * Shared sidebar footer shown at the bottom of the sidebar: the user's
 * avatar (initials), name, role, and a power-icon logout button that opens
 * the shared logout confirmation dialog.
 *
 * Used by both the Admin Sidebar and the Resident Sidebar so the logout
 * section looks and behaves identically across portals.
 */
const SidebarUserFooter = ({
  firstName,
  lastName,
  role,
  onLogout,
}: SidebarUserFooterProps) => {
  const [isLogoutConfirmationOpen, setIsLogoutConfirmationOpen] =
    useState(false);

  return (
    <>
      <div className="sidebar-user-footer">
        <span className="sidebar-user-avatar">
          {getInitialsSafe(firstName, lastName)}
        </span>

        <div className="sidebar-user-info">
          <strong>
            {firstName} {lastName}
          </strong>
          <span>{role}</span>
        </div>

        <button
          type="button"
          className="sidebar-user-logout"
          onClick={() => setIsLogoutConfirmationOpen(true)}
          aria-label="Logout"
          title="Logout"
        >
          ⏻
        </button>
      </div>

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

export default SidebarUserFooter;