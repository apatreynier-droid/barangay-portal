import { ChevronRight, FileText, PackageCheck } from "lucide-react";
import { getSessionUser } from "../../../Utils/Shared/api";
import type { Request } from "../../../Types/Resident/DashboardType";

type WelcomeCardProps = {
  requests: Request[];
  onRequestDocument: () => void;
  onMyRequests: () => void;
};

const WelcomeCard = ({
  requests,
  onRequestDocument,
  onMyRequests,
}: WelcomeCardProps) => {
  const user = getSessionUser();
  const greeting = (() => {
    const hour = new Date().getHours();

    if (hour < 12) return "Good morning!";
    if (hour < 18) return "Good afternoon!";
    return "Good evening!";
  })();

  const readyRequests = requests.filter(
    (request) => request.status === "Ready for Pickup",
  );
  const readyRequest = readyRequests[0];

  return (
    <section className="welcome-card">
      <div className="welcome-main">
        <p className="welcome-small">{greeting}</p>

        <h2>Welcome back, {user?.first_name ?? "Resident"}!</h2>

        <p className="welcome-text">
          Manage your barangay document requests quickly and conveniently from
          your dashboard.
        </p>

        <button
          type="button"
          className="primary-button"
          onClick={onRequestDocument}
        >
          + Request a Document
        </button>
      </div>

      {readyRequest ? (
        <div className="welcome-pickup">
          <div className="welcome-pickup-label">
            <PackageCheck size={16} strokeWidth={2} aria-hidden="true" />
            Ready for pickup
            {readyRequests.length > 1 ? ` · ${readyRequests.length}` : ""}
          </div>

          <h3>{readyRequest.document}</h3>
          <span className="welcome-pickup-id">{readyRequest.id}</span>

          <p>
            Your request has been approved and is ready for pickup at the
            Barangay Hall.
          </p>

          <button
            type="button"
            className="welcome-pickup-link"
            onClick={onMyRequests}
          >
            View my requests
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="welcome-icon" aria-hidden="true">
          <FileText size={52} strokeWidth={1.6} />
        </div>
      )}
    </section>
  );
};

export default WelcomeCard;
