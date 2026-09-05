import type { AdminResidentDetail } from "../../Types/AdminResidentsType";
import {
  formatRegisteredDate,
  getRequestStatusMeta,
} from "../../Utils/AdminResidentsLogic";

type ResidentRequestHistoryProps = {
  resident: AdminResidentDetail;
};

const ResidentRequestHistory = ({ resident }: ResidentRequestHistoryProps) => {
  return (
    <section className="residents-history-card">
      <h3>Request History ({resident.requests.length})</h3>

      {resident.requests.length === 0 ? (
        <p className="residents-history-empty">
          This resident has not submitted any document requests yet.
        </p>
      ) : (
        <table className="residents-history-table">
          <thead>
            <tr>
              <th>Request ID</th>
              <th>Document</th>
              <th>Submitted</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {resident.requests.map((request) => {
              const statusMeta = getRequestStatusMeta(request.status);

              return (
                <tr key={request.request_number}>
                  <td className="residents-history-code">
                    {request.request_number}
                  </td>
                  <td>{request.document}</td>
                  <td>{formatRegisteredDate(request.submitted_at)}</td>
                  <td>
                    <span className={`residents-status ${statusMeta.className}`}>
                      {statusMeta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
};

export default ResidentRequestHistory;
