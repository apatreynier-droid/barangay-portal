import type { AdminResidentDetail } from "../../Types/AdminResidentsType";
import {
  getResidentInitials,
  getResidentStatusMeta,
} from "../../Utils/AdminResidentsLogic";

type ResidentProfileCardProps = {
  resident: AdminResidentDetail;
  onEdit: () => void;
  onToggleStatus: () => void;
};

const ResidentProfileCard = ({
  resident,
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
    </aside>
  );
};

export default ResidentProfileCard;
