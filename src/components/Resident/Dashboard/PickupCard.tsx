import type { Request } from "../../../Types/DashboardType";

type PickupCardProps = {
  requests: Request[];
  onMyRequests: () => void;
};

const PickupCard = ({ requests, onMyRequests }: PickupCardProps) => {
  const readyRequest = requests.find(
    (request) => request.status === "Ready for Pickup",
  );

  if (!readyRequest) return null;

  return (
    <section className="pickup-card">
      <div className="pickup-icon">✓</div>

      <div className="pickup-content">
        <span className="pickup-label">READY FOR PICKUP</span>

        <h2>Your {readyRequest.document} is ready!</h2>

        <p>
          Request <strong>{readyRequest.id}</strong> has been approved and is
          ready for pickup at the Barangay Hall.
        </p>
      </div>

      <button className="secondary-button" type="button" onClick={onMyRequests}>
        View My Requests
      </button>
    </section>
  );
};

export default PickupCard;
