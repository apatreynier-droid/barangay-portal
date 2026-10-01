import type { AdminActivityLog } from "../../Types/AdminLogsType";
import {
  formatLogActorName,
  formatLogActorRole,
  formatLogTimestamp,
  getActivityLogTypeMeta,
} from "../../Utils/AdminLogsLogic";

type ActivityLogsTableProps = {
  logs: AdminActivityLog[];
};

const ActivityLogsTable = ({ logs }: ActivityLogsTableProps) => {
  return (
    <div className="admin-logs-card">
      <table className="admin-logs-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Type</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>IP Address</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr>
              <td className="admin-logs-empty" colSpan={6}>
                No activity logs found.
              </td>
            </tr>
          ) : (
            logs.map((log) => {
              const typeMeta = getActivityLogTypeMeta(log.action_type);
              const actorName = formatLogActorName(log.actor_name);
              const actorRole = formatLogActorRole(log.actor_role);

              return (
                <tr key={log.id}>
                  <td className="admin-logs-timestamp">
                    {formatLogTimestamp(log.created_at)}
                  </td>
                  <td>
                    <span className={`admin-logs-type ${typeMeta.className}`}>
                      <span className="admin-logs-type-icon" aria-hidden="true">
                        {typeMeta.icon}
                      </span>
                      {typeMeta.label}
                    </span>
                  </td>
                  <td>
                    <div className="admin-logs-actor">
                      <strong>{actorName}</strong>
                      {/* Skip the badge when it repeats the displayed name
                          (e.g. Actor: "Administrator"). */}
                      {actorRole !== actorName && <span>{actorRole}</span>}
                    </div>
                  </td>
                  <td>{log.action}</td>
                  <td className="admin-logs-target">{log.target}</td>
                  <td className="admin-logs-ip">{log.ip_address ?? "—"}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ActivityLogsTable;