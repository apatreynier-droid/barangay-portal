import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Download, Expand, MapPin, X } from "lucide-react";
import PotholeMap from "./PotholeMap";
import PotholePhoto from "./PotholePhoto";
import PotholeStatusBadge from "./PotholeStatusBadge";
import useModalBehavior from "./useModalBehavior";
import {
  MAX_POTHOLE_REMARK_LENGTH,
  POTHOLE_ACTION_META,
  POTHOLE_STATUS_META,
  describePotholeHistoryEntry,
  displayPurok,
  displayRoad,
  formatPotholeAccuracy,
  formatPotholeCoordinate,
  formatPotholeDateTime,
  formatPotholeFileSize,
  getAvailablePotholeActions,
  getPotholeLocationSourceLabel,
  hasPotholeCoordinates,
  isLowPotholeAccuracy,
} from "../../../Utils/Admin/AdminPotholeManagementLogic";
import { usePotholePhoto } from "../../../Utils/Admin/potholePhotoCache";
import type {
  PotholeAction,
  PotholeHistoryEntry,
  PotholeReport,
} from "../../../Types/Admin/AdminPotholeManagementType";

const ImagePreview = ({
  report,
  url,
  onClose,
}: {
  report: PotholeReport;
  url: string;
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
      <div
        className="pothole-lightbox-toolbar"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="pothole-lightbox-name" title={report.photo.originalFilename}>
          {report.photo.originalFilename}
        </span>
        <a
          className="pothole-button pothole-button--primary"
          href={url}
          download={report.photo.originalFilename}
        >
          <Download size={15} aria-hidden="true" />
          Download Image
        </a>
        <button
          type="button"
          className="pothole-lightbox-close"
          onClick={onClose}
          aria-label="Close photo preview"
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <img
        src={url}
        alt={`Pothole photo sent with report ${report.id}`}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
};

type PotholeDetailsModalProps = {
  report: PotholeReport;
  /** Null while the history is loading. */
  history: PotholeHistoryEntry[] | null;
  historyError: string;
  /** Administrators may verify/reject; Staff only record repair progress. */
  isAdministratorAccount: boolean;
  /** False while the confirmation dialog is open on top of this one. */
  isActive: boolean;
  isSavingRemark: boolean;
  onClose: () => void;
  onAction: (action: PotholeAction) => void;
  /** Resolves to true when the remark was saved. */
  onAddRemark: (text: string) => Promise<boolean>;
  onLocate: () => void;
  onRetryHistory: () => void;
};

const PotholeDetailsModal = ({
  report,
  history,
  historyError,
  isAdministratorAccount,
  isActive,
  isSavingRemark,
  onClose,
  onAction,
  onAddRemark,
  onLocate,
  onRetryHistory,
}: PotholeDetailsModalProps) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [remark, setRemark] = useState("");
  const [remarkError, setRemarkError] = useState("");
  const dialogRef = useRef<HTMLElement | null>(null);
  const { state: photoState, retry: retryPhoto } = usePotholePhoto(
    report.recordId,
  );
  useModalBehavior(dialogRef, onClose, isActive && !isPreviewOpen);

  const actions = getAvailablePotholeActions(
    report.status,
    isAdministratorAccount,
  );
  const hasCoordinates = hasPotholeCoordinates(report);
  const photoUrl = photoState.status === "ready" ? photoState.url : null;

  const handleRemarkSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = remark.trim();

    if (!trimmed) {
      setRemarkError("Please type a remark first.");
      return;
    }

    if (await onAddRemark(trimmed)) {
      setRemark("");
      setRemarkError("");
    }
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
            <section>
              <h3 className="pothole-section-title">Resident's photo</h3>
              {photoUrl ? (
                <button
                  type="button"
                  className="pothole-photo-button"
                  onClick={() => setIsPreviewOpen(true)}
                  aria-label={`Preview the photo of ${report.id} in a larger view`}
                >
                  <img
                    src={photoUrl}
                    alt={`Pothole photo sent with report ${report.id}`}
                  />
                  <span className="pothole-photo-hint">
                    <Expand size={13} aria-hidden="true" />
                    View larger
                  </span>
                </button>
              ) : (
                <PotholePhoto
                  state={photoState}
                  alt=""
                  className="pothole-photo-frame"
                  onRetry={retryPhoto}
                />
              )}

              <div className="pothole-photo-meta">
                <span
                  className="pothole-photo-filename"
                  title={report.photo.originalFilename}
                >
                  {report.photo.originalFilename}
                </span>
                <span className="pothole-muted-text">
                  {formatPotholeFileSize(report.photo.fileSize)}
                </span>
                {photoUrl ? (
                  <a
                    className="pothole-button"
                    href={photoUrl}
                    download={report.photo.originalFilename}
                  >
                    <Download size={15} aria-hidden="true" />
                    Download Image
                  </a>
                ) : (
                  <button type="button" className="pothole-button" disabled>
                    <Download size={15} aria-hidden="true" />
                    Download Image
                  </button>
                )}
              </div>
            </section>

            <div>
              <div className="pothole-section-heading">
                <h3 className="pothole-section-title">Location on the map</h3>
                {hasCoordinates && (
                  <button
                    type="button"
                    className="pothole-button"
                    onClick={onLocate}
                  >
                    <MapPin size={15} aria-hidden="true" />
                    Locate on main map
                  </button>
                )}
              </div>
              {hasCoordinates ? (
                <PotholeMap reports={[report]} compact />
              ) : (
                <p className="pothole-no-gps">
                  No location was captured for this report (the resident's
                  device did not share GPS and no pin was placed), so it cannot
                  be shown on the map. Use the written location below.
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
                <div className="pothole-detail-list-wide">
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
                  <dd>{displayPurok(report.purok)}</dd>
                </div>
                <div>
                  <dt>Road/Street</dt>
                  <dd>{displayRoad(report.road)}</dd>
                </div>
                <div className="pothole-detail-list-wide">
                  <dt>Location (as described)</dt>
                  <dd>{report.location}</dd>
                </div>
                <div>
                  <dt>Latitude</dt>
                  <dd className="pothole-mono">
                    {formatPotholeCoordinate(report.latitude)}
                  </dd>
                </div>
                <div>
                  <dt>Longitude</dt>
                  <dd className="pothole-mono">
                    {formatPotholeCoordinate(report.longitude)}
                  </dd>
                </div>
                <div>
                  <dt>Location source</dt>
                  <dd>{getPotholeLocationSourceLabel(report)}</dd>
                </div>
                <div>
                  <dt>GPS accuracy</dt>
                  <dd>
                    {formatPotholeAccuracy(report)}
                    {isLowPotholeAccuracy(report) && (
                      <span className="pothole-accuracy-warning">
                        Low accuracy: the pothole may be some distance from
                        the marker.
                      </span>
                    )}
                  </dd>
                </div>
                {report.locationCapturedAt && (
                  <div>
                    <dt>GPS captured</dt>
                    <dd>{formatPotholeDateTime(report.locationCapturedAt)}</dd>
                  </div>
                )}
                <div>
                  <dt>Reported</dt>
                  <dd>{formatPotholeDateTime(report.reportedAt)}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{POTHOLE_STATUS_META[report.status].label}</dd>
                </div>
                <div className="pothole-detail-list-wide">
                  <dt>Resident's notes</dt>
                  <dd>{report.description ?? "No notes added."}</dd>
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
              ) : report.status === "resolved" || report.status === "rejected" ? (
                <p className="pothole-muted-text">
                  This report is closed ({POTHOLE_STATUS_META[report.status].label}),
                  so its status can no longer change.
                </p>
              ) : (
                <p className="pothole-muted-text">
                  The next step for this report (verifying or rejecting it) is
                  done by an administrator.
                </p>
              )}
            </section>

            <section>
              <h3 className="pothole-section-title">History and remarks</h3>

              {history === null ? (
                historyError ? (
                  <div className="pothole-inline-error" role="alert">
                    <span>{historyError}</span>
                    <button
                      type="button"
                      className="pothole-button"
                      onClick={onRetryHistory}
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <p className="pothole-muted-text" aria-busy="true">
                    Loading the history…
                  </p>
                )
              ) : (
                <ul className="pothole-remarks">
                  {history.map((entry) => (
                    <li key={entry.id}>
                      <p>{describePotholeHistoryEntry(entry)}</p>
                      <span>
                        {entry.author}
                        {entry.authorRole ? ` (${entry.authorRole})` : ""} ·{" "}
                        {formatPotholeDateTime(entry.createdAt)}
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
                <button
                  type="submit"
                  className="pothole-button"
                  disabled={isSavingRemark}
                >
                  {isSavingRemark ? "Saving…" : "Add Remark"}
                </button>
              </form>
            </section>
          </div>
        </div>
      </section>

      {isPreviewOpen && photoUrl && (
        <div onClick={(event) => event.stopPropagation()}>
          <ImagePreview
            report={report}
            url={photoUrl}
            onClose={() => setIsPreviewOpen(false)}
          />
        </div>
      )}
    </div>
  );
};

export default PotholeDetailsModal;
