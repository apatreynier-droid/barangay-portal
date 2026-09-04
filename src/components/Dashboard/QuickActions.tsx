type QuickActionsProps = {
  onSelectDocument: (document: string) => void;
};

const QuickActions = ({ onSelectDocument }: QuickActionsProps) => {
  return (
    <section className="content-card">
      <div className="card-header">
        <div>
          <h2>Quick Actions</h2>
          <p>Common resident services</p>
        </div>
      </div>

      <div className="quick-actions">
        <button
          type="button"
          className="quick-action"
          onClick={() => onSelectDocument("Barangay Clearance")}
        >
          <span>📄</span>
          <div>
            <strong>Barangay Clearance</strong>
            <small>Request clearance</small>
          </div>
        </button>

        <button
          type="button"
          className="quick-action"
          onClick={() => onSelectDocument("Certificate of Residency")}
        >
          <span>🏠</span>
          <div>
            <strong>Certificate of Residency</strong>
            <small>Request certificate</small>
          </div>
        </button>

        <button
          type="button"
          className="quick-action"
          onClick={() => onSelectDocument("Barangay Permit")}
        >
          <span>📋</span>
          <div>
            <strong>Barangay Permit</strong>
            <small>Apply for a permit</small>
          </div>
        </button>
      </div>
    </section>
  );
};

export default QuickActions;
