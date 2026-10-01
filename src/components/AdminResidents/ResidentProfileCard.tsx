import type { AdminResidentDetail } from "../../Types/AdminResidentsType";
import {
  getResidentInitials,
  getResidentStatusMeta,
} from "../../Utils/AdminResidentsLogic";

type ResidentProfileCardProps = {
  resident: AdminResidentDetail;
  /**
   * True for administrator accounts. Editing resident records and
   * deactivating accounts are administrator actions; Staff only view the
   * profile. The backend returns HTTP 403 for those calls anyway.
   */
  canManage: boolean;
  onEdit: () => void;
  onToggleStatus: () => void;
};

const ResidentProfileCard = ({
  resident,
  canManage,
  onEdit,
  onToggleStatus,
}: ResidentProfileCardProps) => {
  const statusMeta = getResidentStatusMeta(resident.status);
  const isActive = resident.status === "active";

  return (
    <aside className="residents-profile-card">
      <span className="residents-profile-avatar">
        {getResidentInitials(resident.name)}
      </span>

      <h2>{resident.name}</h2>
      <span className="residents-profile-code">{resident.resident_code}</span>
      <span className={`residents-status ${statusMeta.className}`}>
        {statusMeta.label}
      </span>

      {canManage && (
        <>
          <button
            type="button"
            className="residents-edit-button"
            onClick={onEdit}
          >
            Edit Information
          </button>

          <button
            type="button"
            className="residents-deactivate-button"
            onClick={onToggleStatus}
          >
            {isActive ? "Deactivate Account" : "Activate Account"}
          </button>
        </>
      )}
    </aside>
  );
};

export default ResidentProfileCard;
