import type { PotholeStatus } from "../../../Types/Admin/AdminPotholeManagementType";
import { POTHOLE_STATUS_META } from "../../../Utils/Admin/AdminPotholeManagementLogic";

const PotholeStatusBadge = ({ status }: { status: PotholeStatus }) => (
  <span className={`pothole-status pothole-status--${status}`}>
    {POTHOLE_STATUS_META[status].label}
  </span>
);

export default PotholeStatusBadge;
