import RequestCard from "./RequestCard";
import type { Request } from "../../../Types/DashboardType";

type RequestsListProps = {
  requests: Request[];
  onRequestUpdated: (updated: Request) => void;
  onRequestDeleted: (requestId: string) => void;
  emptyMessage?: string;
};

const RequestsList = ({
  requests,
  onRequestUpdated,
  onRequestDeleted,
  emptyMessage = "You have not submitted any document requests yet.",
}: RequestsListProps) => {
  return (
    <section className="requests-container">
      {requests.length === 0 ? (
        <p className="requests-empty-state">{emptyMessage}</p>
      ) : (
        requests.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            onRequestUpdated={onRequestUpdated}
            onRequestDeleted={onRequestDeleted}
          />
        ))
      )}
    </section>
  );
};

export default RequestsList;
