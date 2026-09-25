import MobileMenuButton from "../Shared/MobileMenuButton";

type AdminTopbarProps = {
  fullName: string;
  title?: string;
  subtitle?: string;
  /** Opens the mobile drawer (rendered only below 769px via CSS). */
  onMenuToggle?: () => void;
};

const AdminTopbar = ({
  fullName,
  title = "Dashboard",
  subtitle,
  onMenuToggle,
}: AdminTopbarProps) => {
  const heading =
    subtitle ?? `Welcome back, ${fullName}. Here's what's happening today.`;

  return (
    <header className="admin-topbar">
      <div className="admin-topbar-heading">
        {onMenuToggle && <MobileMenuButton onOpen={onMenuToggle} />}

        <div>
          <h1>{title}</h1>
          <p>{heading}</p>
        </div>
      </div>
    </header>
  );
};

export default AdminTopbar;
