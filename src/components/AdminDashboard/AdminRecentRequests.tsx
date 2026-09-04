import type { AdminRecentRequest } from "../../Types/AdminDashboardType";
import {
  formatRelativeTime,
  getAdminStatusClass,
  getAdminStatusLabel,
} from "../../Utils/AdminDashboardLogic";

type AdminRecentRequestsProps = {
  requests: AdminRecentRequest[];
};

const AdminRecentRequests = ({ requests }: AdminRecentRequestsProps) => {
  return (
    <section className="admin-panel">
      <h3 className="admin-panel-title">Recent Requests</h3>

      {requests.length === 0 ? (
        <p className="admin-empty-note">No document requests yet.</p>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Resident</th>
                <th>Document</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {requests.map((request) => (
                <tr key={request.request_number}>
                  <td className="admin-request-id">{request.request_number}</td>
                  <td>{request.resident_name}</td>
                  <td>{request.document}</td>
                  <td>
                    <span
                      className={`admin-status-pill ${getAdminStatusClass(
                        request.status,
                      )}`}
                    >
                      {getAdminStatusLabel(request.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {requests.length > 0 && (
        <p className="admin-table-footnote">
          Latest update {formatRelativeTime(requests[0].submitted_at)}
        </p>
      )}
    </section>
  );
};

export default AdminRecentRequests;
