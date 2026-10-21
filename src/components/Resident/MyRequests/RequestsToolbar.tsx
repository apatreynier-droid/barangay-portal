type RequestsToolbarProps = {
  onNewRequest: () => void;
};

const RequestsToolbar = ({ onNewRequest }: RequestsToolbarProps) => {
  return (
    <section className="requests-toolbar">
      <div>
        <h2>All Requests</h2>
        <p>View the current status of your applications.</p>
      </div>

      <button
        type="button"
        className="new-request-button"
        onClick={onNewRequest}
      >
        + New Request
      </button>
    </section>
  );
};

export default RequestsToolbar;
