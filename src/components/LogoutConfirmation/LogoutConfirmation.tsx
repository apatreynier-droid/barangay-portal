import { createPortal } from "react-dom";
import "./LogoutConfirmation.css";

type LogoutConfirmationProps = {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Shared logout confirmation dialog used by the Admin and Resident sidebars
 * (via SidebarUserFooter).
 *
 * It is rendered through a portal into document.body so it is never trapped
 * inside a parent stacking context. Both sidebars are `position: fixed`
 * containers, which create their own stacking contexts; if this dialog were
 * mounted inside them, its z-index would only compete within the sidebar and
 * page content (e.g. the sticky top bar, z-index 10) would paint above it.
 * Portalling it to the end of <body> places it directly in the root stacking
 * context, so it always appears in front of the whole page.
 */

const LogoutConfirmation = ({
  isOpen,
  onCancel,
  onConfirm,
}: LogoutConfirmationProps) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="logout-confirmation-backdrop" role="presentation">
      <section
        className="logout-confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-confirmation-title"
      >
        <div className="logout-confirmation-icon" aria-hidden="true">
          ?
        </div>
        <h2 id="logout-confirmation-title">Log out?</h2>
        <p>Are you sure you want to log out of your account?</p>
        <div className="logout-confirmation-actions">
          <button type="button" className="logout-cancel-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="logout-confirm-button" onClick={onConfirm}>
            Log out
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
};

export default LogoutConfirmation;
