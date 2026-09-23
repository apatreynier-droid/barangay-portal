import MobileMenuButton from "../Shared/MobileMenuButton";

type RequestsHeaderProps = {
  firstName: string;
  /** Opens the mobile drawer (rendered only below 769px via CSS). */
  onMenuToggle?: () => void;
};

const RequestsHeader = ({ firstName, onMenuToggle }: RequestsHeaderProps) => {
  return (
    <header className="requests-header">
      <div className="topbar-leading">
        {onMenuToggle && <MobileMenuButton onOpen={onMenuToggle} />}

        <div>
          <p className="page-label">Resident Portal</p>
          <h1>My Requests</h1>
          <p className="page-description">
            Track and manage your barangay document requests, {firstName}.
          </p>
        </div>
      </div>
    </header>
  );
};

export default RequestsHeader;
