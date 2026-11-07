import { useState } from "react";
import { createPortal } from "react-dom";
import { LogOut } from "lucide-react";
import LogoutConfirmation from "../LogoutConfirmation/LogoutConfirmation";

type MobileLogoutButtonProps = {
  onLogout: () => void;
};

/**
 * Logout button for the top bar on phones (hidden on desktop via CSS).
 * Opens the same LogoutConfirmation dialog as the sidebar footer.
 */
const MobileLogoutButton = ({ onLogout }: MobileLogoutButtonProps) => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="mobile-logout-button"
        onClick={() => setIsConfirmOpen(true)}
        aria-label="Logout"
        title="Logout"
      >
        <LogOut size={20} strokeWidth={1.9} aria-hidden="true" />
      </button>

      {/* Portal to <body>: the sticky top bar uses backdrop-filter, which
          would otherwise trap the fixed-position dialog inside the bar. */}
      {createPortal(
        <LogoutConfirmation
          isOpen={isConfirmOpen}
          onCancel={() => setIsConfirmOpen(false)}
          onConfirm={onLogout}
        />,
        document.body,
      )}
    </>
  );
};

export default MobileLogoutButton;
