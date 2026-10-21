import type { RequestHistoryItem } from "../../../Types/RequestHistoryType";
import { formatDate, getStatusMeta } from "../../../Utils/RequestHistory";
import filesIcon from "../../../assets/icons/files.png";

interface RequestHistoryRowProps {
  item: RequestHistoryItem;
  onView: (item: RequestHistoryItem) => void;
}

function RequestHistoryRow({ item, onView }: RequestHistoryRowProps) {
  const statusMeta = getStatusMeta(item.status);

  return (
    <div className="request-row history-row">
      <div className="document-icon">
        <img src={filesIcon} alt="" />
      </div>

      <div className="request-details">
        <h3>{item.documentType}</h3>
        <span>
          {item.referenceNo} &middot; {item.purpose}
        </span>
      </div>

      <div className="history-dates">
        <span className="history-date-label">Requested</span>
        <strong>{formatDate(item.dateRequested)}</strong>
      </div>

      <span className={`request-status ${statusMeta.className}`}>
        {statusMeta.label}
      </span>

      <button
        type="button"
        className="history-view-button"
        onClick={() => onView(item)}
      >
        View
      </button>
    </div>
  );
}

export default RequestHistoryRow;
