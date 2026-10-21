import type { AdminResident } from "../../../Types/AdminResidentsType";
import {
  formatRegisteredDate,
  getAvatarClass,
  getResidentInitials,
  getResidentStatusMeta,
} from "../../../Utils/AdminResidentsLogic";

type ResidentsTableProps = {
  residents: AdminResident[];
  onView: (resident: AdminResident) => void;
};

const ResidentsTable = ({ residents, onView }: ResidentsTableProps) => {
  return (
    <div className="residents-card">
      <table className="residents-table">
        <thead>
          <tr>
            <th>Resident</th>
            <th>ID</th>
            <th>Purok</th>
            <th>Contact</th>
            <th>Status</th>
            <th>Registered</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {residents.length === 0 ? (
            <tr>
              <td colSpan={7} className="residents-empty">
                No residents match your search or filters.
              </td>
            </tr>
          ) : (
            residents.map((resident, index) => {
              const statusMeta = getResidentStatusMeta(resident.status);

              return (
                <tr key={resident.id}>
                  <td>
                    <div className="residents-resident-cell">
                      <span className={getAvatarClass(index)}>
                        {getResidentInitials(resident.name)}
                      </span>
                      <div className="residents-resident-info">
                        <strong>{resident.name}</strong>
                        <span>{resident.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="residents-code">{resident.resident_code}</td>
                  <td>{resident.purok ?? "—"}</td>
                  <td>{resident.contact_number ?? "—"}</td>
                  <td>
                    <span className={`residents-status ${statusMeta.className}`}>
                      {statusMeta.label}
                    </span>
                  </td>
                  <td>{formatRegisteredDate(resident.registered_at)}</td>
                  <td>
                    <button
                      type="button"
                      className="residents-view-button"
                      onClick={() => onView(resident)}
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

export default ResidentsTable;
