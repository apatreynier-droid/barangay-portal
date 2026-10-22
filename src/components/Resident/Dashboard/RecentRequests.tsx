import { FileText } from "lucide-react";
import { getStatusClass } from "../../../Utils/Resident/DashboardLogic";
import type { Request } from "../../../Types/Resident/DashboardType";

type RecentRequestsProps = {
  requests: Request[];
  onViewAll: () => void;
};

const RecentRequests = ({ requests, onViewAll }: RecentRequestsProps) => {
  return (
    <section className="content-card requests-card">
      <div className="card-header">
        <div>
          <h2>Recent Requests</h2>
          <p>Your latest document applications</p>
        </div>

        <button type="button" className="view-all" onClick={onViewAll}>
          View all
        </button>
      </div>

      <div className="requests-list">
        {requests.length === 0 ? (
          <p className="dashboard-empty-state">
            No document requests have been submitted yet.
          </p>
        ) : (
          requests.map((request) => (
            <div className="request-row" key={request.id}>
              <div className="document-icon">
                <FileText size={20} strokeWidth={1.9} aria-hidden="true" />
              </div>

              <div className="request-details">
                <h3>{request.document}</h3>
                <span>
                  {request.id} • {request.submittedDate}
                </span>
              </div>

              <span
                className={`request-status ${getStatusClass(request.status)}`}
              >
                {request.status}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

export default RecentRequests;
