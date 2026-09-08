import { useCallback, useEffect, useState } from "react";
import type { AdminDocumentRequestDetail } from "../../Types/AdminDocumentRequestsType";
import { fetchAdminDocumentRequestDetail } from "../../Utils/api";
import {
  formatFee,
  formatSubmittedDateTime,
  getDocumentRequestStatusMeta,
} from "../../Utils/AdminDocumentRequestsLogic";
import AdminActionsPanel from "./AdminActionsPanel";

type RequestDetailsViewProps = {
  requestId: number;
  onBack: () => void;
  onChanged: () => void;
};

const RequestDetailsView = ({
  requestId,
  onBack,
  onChanged,
}: RequestDetailsViewProps) => {
  const [request, setRequest] = useState<AdminDocumentRequestDetail | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRequest = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      setRequest(await fetchAdminDocumentRequestDetail(requestId));
    } catch {
      setError("Could not load the request details. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void loadRequest();
  }, [loadRequest]);

  const handleUpdated = (updated: AdminDocumentRequestDetail) => {
    setRequest(updated);
    onChanged();
  };

  const statusMeta = request
    ? getDocumentRequestStatusMeta(request.status)
    : null;

  return (
    <div className="residents-details-view">
      <button type="button" className="residents-back-link" onClick={onBack}>
        ← Back to Requests
      </button>

      {error && (
        <div className="admin-error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void loadRequest()}>
            Retry
          </button>
        </div>
      )}

      {isLoading && !request ? (
        <p className="admin-loading-state">Loading the request details…</p>
      ) : (
        request &&
        statusMeta && (
          <div className="docreq-detail-grid">
            <section className="residents-info-card">
              <div className="docreq-details-header">
                <h3>Request Details</h3>
                <span className={`residents-status ${statusMeta.className}`}>
                  {statusMeta.label}
                </span>
              </div>

              <dl className="residents-info-grid">
                <div className="residents-info-item">
                  <dt>Request ID</dt>
                  <dd className="residents-code">
                    {request.request_number}
                  </dd>
                </div>
                <div className="residents-info-item">
                  <dt>Resident</dt>
                  <dd>{request.resident_name}</dd>
                </div>
                <div className="residents-info-item">
                  <dt>Document Type</dt>
                  <dd>{request.document}</dd>
                </div>
                <div className="residents-info-item">
                  <dt>Purpose</dt>
                  <dd>{request.purpose}</dd>
                </div>
                <div className="residents-info-item">
                  <dt>Fee</dt>
                  <dd>{formatFee(request.fee)}</dd>
                </div>
                <div className="residents-info-item">
                  <dt>Submitted</dt>
                  <dd>{formatSubmittedDateTime(request.submitted_at)}</dd>
                </div>
                <div className="residents-info-item">
                  <dt>Last Updated</dt>
                  <dd>{formatSubmittedDateTime(request.last_updated)}</dd>
                </div>
                <div className="residents-info-item">
                  <dt>Processed By</dt>
                  <dd>{request.processed_by ?? "—"}</dd>
                </div>
                <div className="residents-info-item">
                  <dt>Pickup Date</dt>
                  <dd>{request.pickup_date?.slice(0, 10) ?? "—"}</dd>
                </div>
              </dl>
            </section>

            <AdminActionsPanel
              key={request.id}
              request={request}
              onUpdated={handleUpdated}
            />
          </div>
        )
      )}
    </div>
  );
};

export default RequestDetailsView;
