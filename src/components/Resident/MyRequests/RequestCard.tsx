import { useState } from "react";
import { getStatusClass, getStatusIcon } from "../../../Utils/Resident/MyRequestLogic";
import type { Request } from "../../../Types/Resident/DashboardType";
import RequestDetailsModal from "./RequestDetailsModal";
import EditRequestModal from "./EditRequestModal";
import DeleteRequestModal from "./DeleteRequestModal";
import filesIcon from "../../../assets/icons/files.png";

type RequestCardProps = {
  request: Request;
  onRequestUpdated: (updated: Request) => void;
  onRequestDeleted: (requestId: string) => void;
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

  return (
    <>
      <article className="request-card">
        <div className="request-card-top">
          <div className="document-section">
            <div className="document-icon">
              <img src={filesIcon} alt="" />
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
                  Edit
                </button>
                <button
                  type="button"
                  className="request-delete-button"
                  onClick={() => setShowDelete(true)}
                >
                  Delete
                </button>
              </div>
            )}

            <div className={`request-status ${getStatusClass(request.status)}`}>
              <span>{getStatusIcon(request.status)}</span>
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
              <span>Pickup Date</span>
              <strong>{request.pickupDate}</strong>
            </div>
          )}
        </div>

        <div className="request-card-footer">
          <div className="progress-section">
            <div className="progress-label">
              <span>Application Progress</span>

              <strong>
                {request.status === "Pending" && "25%"}
                {request.status === "Processing" && "60%"}
                {request.status === "Ready for Pickup" && "85%"}
                {request.status === "Completed" && "100%"}
                {request.status === "Rejected" && "0%"}
              </strong>
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
