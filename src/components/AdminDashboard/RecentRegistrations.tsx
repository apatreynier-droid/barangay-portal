import type { AdminRecentRegistration } from "../../Types/AdminDashboardType";
import {
  formatShortDate,
  getAvatarClass,
  getInitials,
} from "../../Utils/AdminDashboardLogic";

type RecentRegistrationsProps = {
  registrations: AdminRecentRegistration[];
};

const RecentRegistrations = ({ registrations }: RecentRegistrationsProps) => {
  return (
    <section className="admin-panel">
      <h3 className="admin-panel-title">Recent Registrations</h3>

      {registrations.length === 0 ? (
        <p className="admin-empty-note">No residents registered yet.</p>
      ) : (
        <ul className="admin-registration-list">
          {registrations.map((registration) => (
            <li key={registration.resident_name + registration.created_at}>
              <span
                className={`admin-avatar ${getAvatarClass(
                  registration.resident_name,
                )}`}
                aria-hidden="true"
              >
                {getInitials(registration.resident_name)}
              </span>

              <div className="admin-registration-info">
                <strong>{registration.resident_name}</strong>
                <span>{formatShortDate(registration.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default RecentRegistrations;
