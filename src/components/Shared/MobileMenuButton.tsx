import menuIcon from "../../assets/icons/menu.png";

type MobileMenuButtonProps = {
  onOpen: () => void;
};

/**
 * Hamburger button that opens the mobile navigation drawer. Hidden above
 * 768px by the shared responsive stylesheet.
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
      <img src={menuIcon} alt="" className="sidebar-toggle-icon" />
    </button>
  );
};

export default MobileMenuButton;
