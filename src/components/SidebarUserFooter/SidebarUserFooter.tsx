import { useState } from "react";
import { Power } from "lucide-react";
import LogoutConfirmation from "../LogoutConfirmation/LogoutConfirmation";
import "../../Styles/Shared/Components/SidebarUserFooter.css";

type SidebarUserFooterProps = {
  firstName: string;
  lastName: string;
  role: string;
  onLogout: () => void;
};

/**
 * Sidebar footer shared by the Admin and Resident sidebars: avatar initials,
 * name, role, and a logout button that opens the confirmation dialog.
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
          <Power size={18} strokeWidth={2} aria-hidden="true" />
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
