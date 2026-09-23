type MobileMenuButtonProps = {
  onOpen: () => void;
};

/**
 * Hamburger button that opens the mobile navigation drawer (Resident and
 * Admin sidebars share the same drawer behavior). Rendered by page headers
 * and top bars; the shared responsive stylesheet hides it above 768px, so it
 * never appears in the desktop layout.
 */
const MobileMenuButton = ({ onOpen }: MobileMenuButtonProps) => {
  return (
    <button
      type="button"
      className="sidebar-toggle"
      onClick={onOpen}
      aria-label="Open navigation menu"
      aria-expanded="false"
    >
      <span className="sidebar-toggle-bar" />
      <span className="sidebar-toggle-bar" />
      <span className="sidebar-toggle-bar" />
    </button>
  );
};

export default MobileMenuButton;
