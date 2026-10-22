import { ChevronRight, ClipboardList, FileText, MapPin } from "lucide-react";

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
            <FileText size={20} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <div>
            <strong>Barangay Clearance</strong>
            <small>Request clearance</small>
          </div>
          <ChevronRight
            className="quick-action-go"
            size={18}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          className="quick-action"
          onClick={() => onSelectDocument("Certificate of Residency")}
        >
          <span>
            <MapPin size={20} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <div>
            <strong>Certificate of Residency</strong>
            <small>Request certificate</small>
          </div>
          <ChevronRight
            className="quick-action-go"
            size={18}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          className="quick-action"
          onClick={() => onSelectDocument("Barangay Permit")}
        >
          <span>
            <ClipboardList size={20} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <div>
            <strong>Barangay Permit</strong>
            <small>Apply for a permit</small>
          </div>
          <ChevronRight
            className="quick-action-go"
            size={18}
            aria-hidden="true"
          />
        </button>
      </div>
    </section>
  );
};

export default QuickActions;
