import totalRequestIcon from "../../../assets/icons/files.png";
import pendingIcon from "../../../assets/icons/clock.png";
import processingIcon from "../../../assets/icons/loading.png";
import readyIcon from "../../../assets/check.png";
import type { Request } from "../../../Types/DashboardType";

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
          <img src={totalRequestIcon} alt="" />
        </div>
        <div>
          <span>Total Requests</span>
          <strong>{requests.length}</strong>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon orange">
          <img src={pendingIcon} alt="" />
        </div>
        <div>
          <span>Pending</span>
          <strong>{pending}</strong>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon purple">
          <img src={processingIcon} alt="" />
        </div>
        <div>
          <span>Processing</span>
          <strong>{processing}</strong>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon green">
          <img src={readyIcon} alt="" />
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
