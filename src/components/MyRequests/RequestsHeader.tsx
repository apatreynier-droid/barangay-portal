type RequestsHeaderProps = {
  firstName: string;
};

const RequestsHeader = ({ firstName }: RequestsHeaderProps) => {
  return (
    <header className="requests-header">
      <div>
        <p className="page-label">Resident Portal</p>
        <h1>My Requests</h1>
        <p className="page-description">
          Track and manage your barangay document requests, {firstName}.
        </p>
      </div>
    </header>
  );
};

export default RequestsHeader;
