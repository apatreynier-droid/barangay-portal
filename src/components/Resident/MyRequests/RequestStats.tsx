import totalRequestIcon from "../../../assets/icons/files.png";
import pendingIcon from "../../../assets/icons/clock.png";
import processingIcon from "../../../assets/icons/loading.png";
import readyIcon from "../../../assets/check.png";

type RequestStatsProps = {
  total: number;
  pending: number;
  processing: number;
  ready: number;
};

const RequestStats = ({
  total,
  pending,
  processing,
  ready,
}: RequestStatsProps) => {
  return (
    <section className="request-stats">
      <div className="request-stat-card">
        <div className="request-stat-icon blue">
          <img src={totalRequestIcon} alt="" />
        </div>

        <div>
          <span>Total Requests</span>
          <strong>{total}</strong>
        </div>
      </div>

      <div className="request-stat-card">
        <div className="request-stat-icon orange">
          <img src={pendingIcon} alt="" />
        </div>

        <div>
          <span>Pending</span>
          <strong>{pending}</strong>
        </div>
      </div>

      <div className="request-stat-card">
        <div className="request-stat-icon purple">
          <img src={processingIcon} alt="" />
        </div>

        <div>
          <span>Processing</span>
          <strong>{processing}</strong>
        </div>
      </div>

      <div className="request-stat-card">
        <div className="request-stat-icon green">
          <img src={readyIcon} alt="" />
        </div>

        <div>
          <span>Ready for Pickup</span>
          <strong>{ready}</strong>
        </div>
      </div>
    </section>
  );
};

export default RequestStats;
