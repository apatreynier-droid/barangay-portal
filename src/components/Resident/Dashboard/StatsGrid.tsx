import { Check, Clock, FileText, Loader } from "lucide-react";
import type { Request } from "../../../Types/Resident/DashboardType";

type StatsGridProps = {
  requests: Request[];
};

const StatsGrid = ({ requests }: StatsGridProps) => {
  const pending = requests.filter(
    (request) => request.status === "Pending",
  ).length;
  const processing = requests.filter(
    (request) => request.status === "Processing",
  ).length;
  const readyForPickup = requests.filter(
    (request) => request.status === "Ready for Pickup",
  ).length;

  return (
    <section className="stats-grid">
      <div className="stat-card">
        <div className="stat-icon blue">
          <FileText size={22} strokeWidth={1.9} aria-hidden="true" />
        </div>
        <div>
          <span>Total Requests</span>
          <strong>{requests.length}</strong>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon orange">
          <Clock size={22} strokeWidth={1.9} aria-hidden="true" />
        </div>
        <div>
          <span>Pending</span>
          <strong>{pending}</strong>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon purple">
          <Loader size={22} strokeWidth={1.9} aria-hidden="true" />
        </div>
        <div>
          <span>Processing</span>
          <strong>{processing}</strong>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon green">
          <Check size={22} strokeWidth={2.2} aria-hidden="true" />
        </div>
        <div>
          <span>Ready for Pickup</span>
          <strong>{readyForPickup}</strong>
        </div>
      </div>
    </section>
  );
};

export default StatsGrid;
