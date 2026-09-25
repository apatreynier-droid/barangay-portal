import filesIcon from "../../assets/icons/files.png";
import type { AdminActivityEntry } from "../../Types/AdminDashboardType";
import { formatRelativeTime } from "../../Utils/AdminDashboardLogic";

type AdminNotificationsCardProps = {
  activities: AdminActivityEntry[];
};

const AdminNotificationsCard = ({
  activities,
}: AdminNotificationsCardProps) => {
  return (
    <section className="admin-panel">
      <h3 className="admin-panel-title">
        Notifications
        {activities.length > 0 && (
          <span className="admin-panel-badge">{activities.length}</span>
        )}
      </h3>

      {activities.length === 0 ? (
        <p className="admin-empty-note">No recent activity yet.</p>
      ) : (
        <ul className="admin-activity-list">
          {activities.map((activity) => (
            <li key={activity.title + activity.created_at}>
              <span className="admin-activity-icon" aria-hidden="true">
                <img src={filesIcon} alt="" />
              </span>

              <div className="admin-activity-info">
                <strong>{activity.title}</strong>
                <span>{formatRelativeTime(activity.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default AdminNotificationsCard;
