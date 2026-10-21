import type { AdminDocumentRequest } from "../../../Types/AdminDocumentRequestsType";
import {
  formatFee,
  formatSubmittedDateTime,
  getDocumentRequestStatusMeta,
} from "../../../Utils/AdminDocumentRequestsLogic";

type DocumentRequestsTableProps = {
  requests: AdminDocumentRequest[];
  onView: (request: AdminDocumentRequest) => void;
};

const DocumentRequestsTable = ({
  requests,
  onView,
}: DocumentRequestsTableProps) => {
  return (
    <div className="residents-card">
      <table className="residents-table">
        <thead>
          <tr>
            <th>Request ID</th>
            <th>Resident</th>
            <th>Document Type</th>
            <th>Submitted</th>
            <th>Status</th>
            <th>Fee</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {requests.length === 0 ? (
            <tr>
              <td colSpan={7} className="residents-empty">
                No document requests match your search or filters.
              </td>
            </tr>
          ) : (
            requests.map((request) => {
              const statusMeta = getDocumentRequestStatusMeta(request.status);

              return (
                <tr key={request.id}>
                  <td className="residents-code">{request.request_number}</td>
                  <td>{request.resident_name}</td>
                  <td>{request.document}</td>
                  <td className="docreq-submitted">
                    {formatSubmittedDateTime(request.submitted_at)}
                  </td>
                  <td>
                    <span className={`residents-status ${statusMeta.className}`}>
                      {statusMeta.label}
                    </span>
                  </td>
                  <td className="docreq-fee">{formatFee(request.fee)}</td>
                  <td>
                    <button
                      type="button"
                      className="residents-view-button"
                      onClick={() => onView(request)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default DocumentRequestsTable;
