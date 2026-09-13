import clearanceIcon from "../../assets/icons/DR.png";
import residencyIcon from "../../assets/icons/house.png";
import permitIcon from "../../assets/icons/permit.png";

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
          <span>
            <img src={clearanceIcon} alt="" />
          </span>
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
          <span>
            <img src={residencyIcon} alt="" />
          </span>
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
          <span>
            <img src={permitIcon} alt="" />
          </span>
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
