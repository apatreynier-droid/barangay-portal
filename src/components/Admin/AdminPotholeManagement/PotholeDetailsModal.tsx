import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Expand, X } from "lucide-react";
import PotholeMap from "./PotholeMap";
import PotholeStatusBadge from "./PotholeStatusBadge";
import useModalBehavior from "./useModalBehavior";
import {
  MAX_POTHOLE_REMARK_LENGTH,
  POTHOLE_ACTION_META,
  POTHOLE_STATUS_META,
  formatPotholeCoordinates,
  formatPotholeDateTime,
  getAvailablePotholeActions,
  hasPotholeCoordinates,
} from "../../../Utils/Admin/AdminPotholeManagementLogic";
import type {
  PotholeAction,
  PotholeReport,
} from "../../../Types/Admin/AdminPotholeManagementType";

const ImagePreview = ({
  report,
  onClose,
}: {
  report: PotholeReport;
  onClose: () => void;
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useModalBehavior(dialogRef, onClose);

  return (
    <div
      ref={dialogRef}
      className="pothole-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo of report ${report.id}`}
      tabIndex={-1}
      onClick={onClose}
    >
      <button
        type="button"
        className="pothole-lightbox-close"
        onClick={onClose}
        aria-label="Close photo preview"
      >
        <X size={22} aria-hidden="true" />
      </button>
      <img
        src={report.imageUrl}
        alt={report.imageAlt}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
};

type PotholeDetailsModalProps = {
  report: PotholeReport;
  isSampleData: boolean;
  /** False while the confirmation dialog is open on top of this one. */
  isActive: boolean;
  onClose: () => void;
  onAction: (action: PotholeAction) => void;
  onAddRemark: (text: string) => void;
};

const PotholeDetailsModal = ({
  report,
  isSampleData,
  isActive,
  onClose,
  onAction,
  onAddRemark,
}: PotholeDetailsModalProps) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [remark, setRemark] = useState("");
  const [remarkError, setRemarkError] = useState("");
  const dialogRef = useRef<HTMLElement | null>(null);
  useModalBehavior(dialogRef, onClose, isActive && !isPreviewOpen);

  const actions = getAvailablePotholeActions(report.status);

  const handleRemarkSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = remark.trim();

    if (!trimmed) {
      setRemarkError("Please type a remark first.");
      return;
    }

    onAddRemark(trimmed);
    setRemark("");
    setRemarkError("");
  };

  return (
    <div className="pothole-modal-backdrop" onClick={onClose} role="presentation">
      <section
        ref={dialogRef}
        className="pothole-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pothole-details-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="pothole-modal-header">
          <div>
            <p className="pothole-modal-label">Pothole Report</p>
            <h2 id="pothole-details-title">{report.id}</h2>
          </div>

          <div className="pothole-modal-header-side">
            <PotholeStatusBadge status={report.status} />
            <button
              type="button"
              className="pothole-icon-button"
              onClick={onClose}
              aria-label="Close report details"
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="pothole-modal-body">
          <div className="pothole-modal-column">
            <button
              type="button"
              className="pothole-photo-button"
              onClick={() => setIsPreviewOpen(true)}
              aria-label={`Preview the photo of ${report.id}`}
            >
              <img src={report.imageUrl} alt={report.imageAlt} />
              <span className="pothole-photo-hint">
                <Expand size={13} aria-hidden="true" />
                Preview
              </span>
            </button>

            <div>
              <h3 className="pothole-section-title">Location on the map</h3>
              {hasPotholeCoordinates(report) ? (
                <PotholeMap reports={[report]} compact />
              ) : (
                <p className="pothole-no-gps">
                  This report has no GPS coordinates, so it cannot be shown on
                  the map.
                </p>
              )}
            </div>
          </div>

          <div className="pothole-modal-column">
            <section>
              <h3 className="pothole-section-title">Resident</h3>
              <dl className="pothole-detail-list">
                <div>
                  <dt>Name</dt>
                  <dd>{report.residentName}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>{report.residentContact ?? "Not provided"}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{report.residentAddress ?? "Not provided"}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="pothole-section-title">Report</h3>
              <dl className="pothole-detail-list">
                <div>
                  <dt>Purok</dt>
                  <dd>{report.purok}</dd>
                </div>
                <div>
                  <dt>Road</dt>
                  <dd>{report.road}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{report.location}</dd>
                </div>
                <div>
                  <dt>GPS</dt>
                  <dd>{formatPotholeCoordinates(report)}</dd>
                </div>
                <div>
                  <dt>Reported</dt>
                  <dd>{formatPotholeDateTime(report.reportedAt)}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{POTHOLE_STATUS_META[report.status].label}</dd>
                </div>
                <div className="pothole-detail-list-wide">
                  <dt>Description</dt>
                  <dd>{report.description}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="pothole-section-title">Manage report</h3>
              {actions.length > 0 ? (
                <div className="pothole-modal-actions">
                  {actions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      className={`pothole-button ${
                        POTHOLE_ACTION_META[action].isDanger
                          ? "pothole-button--danger"
                          : "pothole-button--primary"
                      }`}
                      onClick={() => onAction(action)}
                    >
                      {POTHOLE_ACTION_META[action].label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="pothole-muted-text">
                  This report is closed ({POTHOLE_STATUS_META[report.status].label})
                  , so its status can no longer change.
                </p>
              )}
              {isSampleData && (
                <p className="pothole-sample-hint">
                  Sample data: changes here are not saved to the database.
                </p>
              )}
            </section>

            <section>
              <h3 className="pothole-section-title">Administrator remarks</h3>

              {report.remarks.length === 0 ? (
                <p className="pothole-muted-text">No remarks yet.</p>
              ) : (
                <ul className="pothole-remarks">
                  {report.remarks.map((entry) => (
                    <li key={entry.id}>
                      <p>{entry.text}</p>
                      <span>
                        {entry.author} · {formatPotholeDateTime(entry.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={handleRemarkSubmit} className="pothole-remark-form">
                <label htmlFor="pothole-remark-input">Add a remark</label>
                <textarea
                  id="pothole-remark-input"
                  className="pothole-textarea"
                  rows={3}
                  maxLength={MAX_POTHOLE_REMARK_LENGTH}
                  value={remark}
                  aria-invalid={remarkError ? true : undefined}
                  onChange={(event) => {
                    setRemark(event.target.value);
                    setRemarkError("");
                  }}
                />
                {remarkError && (
                  <p className="pothole-field-error" role="alert">
                    {remarkError}
                  </p>
                )}
                <button type="submit" className="pothole-button">
                  Add Remark
                </button>
              </form>
            </section>
          </div>
        </div>
      </section>

      {isPreviewOpen && (
        <div onClick={(event) => event.stopPropagation()}>
          <ImagePreview
            report={report}
            onClose={() => setIsPreviewOpen(false)}
          />
        </div>
      )}
    </div>
  );
};

export default PotholeDetailsModal;
