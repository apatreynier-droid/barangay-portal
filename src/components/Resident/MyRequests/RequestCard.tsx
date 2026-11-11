import { useState } from "react";
import {
  Check,
  CheckCheck,
  Clock,
  FileText,
  Loader,
  PackageCheck,
  Pencil,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { getStatusClass } from "../../../Utils/Resident/MyRequestLogic";
import type { Request } from "../../../Types/Resident/DashboardType";
import RequestDetailsModal from "./RequestDetailsModal";
import EditRequestModal from "./EditRequestModal";
import DeleteRequestModal from "./DeleteRequestModal";

type RequestCardProps = {
  request: Request;
  onRequestUpdated: (updated: Request) => void;
  onRequestDeleted: (requestId: string) => void;
};

const STATUS_ICONS: Partial<Record<Request["status"], LucideIcon>> = {
  Pending: Clock,
  Approved: Check,
  Processing: Loader,
  "Ready for Pickup": PackageCheck,
  Completed: CheckCheck,
  Rejected: X,
};

const STATUS_PROGRESS: Partial<Record<Request["status"], number>> = {
  Pending: 25,
  Approved: 42,
  Processing: 60,
  "Ready for Pickup": 85,
  Completed: 100,
  Rejected: 0,
};

const RequestCard = ({
  request,
  onRequestUpdated,
  onRequestDeleted,
}: RequestCardProps) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const canModify = request.status === "Pending";

  const StatusIcon = STATUS_ICONS[request.status];
  const progress = STATUS_PROGRESS[request.status];

  return (
    <>
      <article className="request-card">
        <div className="request-card-top">
          <div className="document-section">
            <div className="document-icon">
              <FileText size={22} strokeWidth={1.9} aria-hidden="true" />
            </div>

            <div>
              <h3>{request.document}</h3>
              <span className="request-id">{request.id}</span>
            </div>
          </div>

          <div className="request-card-meta">
            {canModify && (
              <div className="request-card-actions">
                <button
                  type="button"
                  className="request-edit-button"
                  onClick={() => setShowEdit(true)}
                >
                  <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  className="request-delete-button"
                  onClick={() => setShowDelete(true)}
                >
                  <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                  Delete
                </button>
              </div>
            )}

            <div className={`request-status ${getStatusClass(request.status)}`}>
              {StatusIcon && (
                <StatusIcon size={14} strokeWidth={2.2} aria-hidden="true" />
              )}
              {request.status}
            </div>
          </div>
        </div>

        <div className="request-card-details">
          <div className="detail-item">
            <span>Purpose</span>
            <strong>{request.purpose}</strong>
          </div>

          <div className="detail-item">
            <span>Submitted</span>
            <strong>{request.submittedDate}</strong>
          </div>

          <div className="detail-item">
            <span>Last Updated</span>
            <strong>{request.updatedDate}</strong>
          </div>

          {request.pickupDate && (
            <div className="detail-item">
              <span>Pickup Schedule</span>
              <strong>{request.pickupDate}</strong>
            </div>
          )}
        </div>

        <div className="request-card-footer">
          <div className="progress-section">
            <div className="progress-label">
              <span>Application Progress</span>

              <strong>{progress !== undefined ? `${progress}%` : ""}</strong>
            </div>

            <div className="progress-bar">
              <div
                className={`progress-fill ${getStatusClass(request.status)}`}
              ></div>
            </div>
          </div>

          <button
            type="button"
            className="view-button"
            onClick={() => setShowDetails(true)}
          >
            View Details
          </button>
        </div>
      </article>

      {showDetails && (
        <RequestDetailsModal
          request={request}
          onClose={() => setShowDetails(false)}
        />
      )}

      {showEdit && (
        <EditRequestModal
          request={request}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setShowEdit(false);
            onRequestUpdated(updated);
          }}
        />
      )}

      {showDelete && (
        <DeleteRequestModal
          request={request}
          onClose={() => setShowDelete(false)}
          onDeleted={() => {
            setShowDelete(false);
            onRequestDeleted(request.id);
          }}
        />
      )}
    </>
  );
};

export default RequestCard;
