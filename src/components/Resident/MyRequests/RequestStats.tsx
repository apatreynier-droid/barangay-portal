import { Check, Clock, FileText, Loader } from "lucide-react";

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
          <FileText size={22} strokeWidth={1.9} aria-hidden="true" />
        </div>

        <div>
          <span>Total Requests</span>
          <strong>{total}</strong>
        </div>
      </div>

      <div className="request-stat-card">
        <div className="request-stat-icon orange">
          <Clock size={22} strokeWidth={1.9} aria-hidden="true" />
        </div>

        <div>
          <span>Pending</span>
          <strong>{pending}</strong>
        </div>
      </div>

      <div className="request-stat-card">
        <div className="request-stat-icon purple">
          <Loader size={22} strokeWidth={1.9} aria-hidden="true" />
        </div>

        <div>
          <span>Processing</span>
          <strong>{processing}</strong>
        </div>
      </div>

      <div className="request-stat-card">
        <div className="request-stat-icon green">
          <Check size={22} strokeWidth={2.2} aria-hidden="true" />
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
