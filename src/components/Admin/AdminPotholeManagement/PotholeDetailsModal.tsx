import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Download, Expand, MapPin, RefreshCw, X } from "lucide-react";
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
  formatPotholeConfidence,
  formatPotholeCoordinate,
  formatPotholeDateTime,
  formatPotholeDetection,
  formatPotholeFileSize,
  getAvailablePotholeActions,
  getOutsideBarangayWarning,
  getPotholeLocationSourceLabel,
  hasPotholeCoordinates,
  isLowPotholeAccuracy,
} from "../../../Utils/Admin/AdminPotholeManagementLogic";
import { usePotholePhoto } from "../../../Utils/Admin/potholePhotoCache";
import type {
  PotholeAction,
  PotholeHistoryEntry,
  PotholeNearbyReport,
  PotholePhotoKind,
  PotholeReport,
} from "../../../Types/Admin/AdminPotholeManagementType";

const ImagePreview = ({
  report,
  url,
  filename,
  onClose,
}: {
  report: PotholeReport;
  url: string;
  filename: string;
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
        <span className="pothole-lightbox-name" title={filename}>
          {filename}
        </span>
        <a
          className="pothole-button pothole-button--primary"
          href={url}
          download={filename}
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
  /** Possible duplicates close to this report; null while loading. */
  nearbyReports: PotholeNearbyReport[] | null;
  /** Administrators may verify/reject; Staff only record repair progress. */
  isAdministratorAccount: boolean;
  /** False while the confirmation dialog is open on top of this one. */
  isActive: boolean;
  isSavingRemark: boolean;
  /** True while a duplicate change or detection retry is being saved. */
  isSavingDetection: boolean;
  detectionError: string;
  onClose: () => void;
  onAction: (action: PotholeAction) => void;
  /** Resolves to true when the remark was saved. */
  onAddRemark: (text: string) => Promise<boolean>;
  onLocate: () => void;
  onRetryHistory: () => void;
  /** Null removes the duplicate link. */
  onSetDuplicate: (duplicateOfRecordId: number | null) => void;
  onRetryDetection: () => void;
};

const PotholeDetailsModal = ({
  report,
  history,
  historyError,
  nearbyReports,
  isAdministratorAccount,
  isActive,
  isSavingRemark,
  isSavingDetection,
  detectionError,
  onClose,
  onAction,
  onAddRemark,
  onLocate,
  onRetryHistory,
  onSetDuplicate,
  onRetryDetection,
}: PotholeDetailsModalProps) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [remark, setRemark] = useState("");
  const [remarkError, setRemarkError] = useState("");
  const { detection } = report;
  const [requestedKind, setRequestedKind] = useState<PotholePhotoKind>("annotated");
  // A report without detections has only its original photo.
  const photoKind: PotholePhotoKind = detection.hasAnnotatedPhoto
    ? requestedKind
    : "original";
  const photoFilename =
    photoKind === "annotated"
      ? `${report.id}-detections.jpg`
      : report.photo.originalFilename;
  const dialogRef = useRef<HTMLElement | null>(null);
  const { state: photoState, retry: retryPhoto } = usePotholePhoto(
    report.recordId,
    photoKind,
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
              <div className="pothole-section-heading">
                <h3 className="pothole-section-title">Resident's photo</h3>
                {detection.hasAnnotatedPhoto && (
                  <div
                    className="pothole-photo-toggle"
                    role="group"
                    aria-label="Which photo to show"
                  >
                    {(
                      [
                        ["annotated", "AI boxes"],
                        ["original", "Original"],
                      ] as const
                    ).map(([kind, label]) => (
                      <button
                        key={kind}
                        type="button"
                        className={photoKind === kind ? "is-active" : undefined}
                        aria-pressed={photoKind === kind}
                        onClick={() => setRequestedKind(kind)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {photoUrl ? (
                <button
                  type="button"
                  className="pothole-photo-button"
                  onClick={() => setIsPreviewOpen(true)}
                  aria-label={`Preview the photo of ${report.id} in a larger view`}
                >
                  <img
                    src={photoUrl}
                    alt={
                      photoKind === "annotated"
                        ? `Photo of report ${report.id} with the AI's detections marked`
                        : `Pothole photo sent with report ${report.id}`
                    }
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
                <span className="pothole-photo-filename" title={photoFilename}>
                  {photoFilename}
                </span>
                {photoKind === "original" && (
                  <span className="pothole-muted-text">
                    {formatPotholeFileSize(report.photo.fileSize)}
                  </span>
                )}
                {photoUrl ? (
                  <a
                    className="pothole-button"
                    href={photoUrl}
                    download={photoFilename}
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

            <section>
              <h3 className="pothole-section-title">AI detection (unverified)</h3>
              <p className="pothole-detection-headline">
                {formatPotholeDetection(report)}
              </p>
              {detection.status === "completed" ? (
                detection.items.length > 0 ? (
                  <ul className="pothole-confidence-list">
                    {detection.items.map((item) => (
                      <li key={item.number}>
                        <span>Pothole {item.number}</span>
                        <strong>{formatPotholeConfidence(item.confidence)}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="pothole-muted-text">
                    The model found nothing above its confidence threshold. It
                    can miss potholes, so please check the photo.
                  </p>
                )
              ) : (
                <p className="pothole-muted-text">
                  {detection.status === "failed"
                    ? "The model could not process this photo. No count was recorded."
                    : "No model was available when this report arrived. No count was recorded."}
                </p>
              )}
              {detection.threshold !== null && (
                <p className="pothole-muted-text">
                  Only detections of at least{" "}
                  {formatPotholeConfidence(detection.threshold)} confidence are
                  counted.
                </p>
              )}
              {detection.status !== "completed" && isAdministratorAccount && (
                <button
                  type="button"
                  className="pothole-button"
                  onClick={onRetryDetection}
                  disabled={isSavingDetection}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  {isSavingDetection ? "Running…" : "Run detection again"}
                </button>
              )}
              {detectionError && (
                <p className="pothole-field-error" role="alert">
                  {detectionError}
                </p>
              )}
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
                <div className="pothole-detail-list-wide">
                  <dt>Identified location (from coordinates)</dt>
                  <dd>{report.resolvedAddress ?? "Not available"}</dd>
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
                  <dd>
                    {getPotholeLocationSourceLabel(report)}
                    {report.outsideBarangay && (
                      <span className="pothole-outside-warning" role="note">
                        {getOutsideBarangayWarning(report)}
                      </span>
                    )}
                  </dd>
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
                <div>
                  <dt>Unique defects confirmed</dt>
                  <dd>
                    {report.duplicateOf
                      ? `None of its own (duplicate of ${report.duplicateOf.id})`
                      : (report.verifiedDefectCount ?? "Not verified yet")}
                  </dd>
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
              <h3 className="pothole-section-title">Possible duplicates</h3>

              {report.duplicateOf ? (
                <div className="pothole-duplicate-current">
                  <p className="pothole-muted-text">
                    Marked as another photo of the defect in{" "}
                    <strong>{report.duplicateOf.id}</strong>. It adds nothing to
                    the unique defect totals.
                  </p>
                  {isAdministratorAccount && (
                    <button
                      type="button"
                      className="pothole-button"
                      onClick={() => onSetDuplicate(null)}
                      disabled={isSavingDetection}
                    >
                      Remove duplicate link
                    </button>
                  )}
                </div>
              ) : nearbyReports === null ? (
                <p className="pothole-muted-text" aria-busy="true">
                  Looking for nearby reports…
                </p>
              ) : nearbyReports.length === 0 ? (
                <p className="pothole-muted-text">
                  {hasCoordinates
                    ? "No other reports close to this location."
                    : "This report has no coordinates to compare."}
                </p>
              ) : (
                <>
                  <p className="pothole-muted-text">
                    These reports are close by. Open each photo to decide; they
                    are never merged automatically.
                  </p>
                  <ul className="pothole-nearby-list">
                    {nearbyReports.map((nearby) => (
                      <li key={nearby.recordId}>
                        <div>
                          <strong>{nearby.id}</strong>
                          <span>
                            {Math.round(nearby.distanceM)} m away ·{" "}
                            {POTHOLE_STATUS_META[nearby.status].label} ·{" "}
                            {formatPotholeDateTime(nearby.reportedAt)}
                          </span>
                        </div>
                        {isAdministratorAccount && !nearby.isDuplicate && (
                          <button
                            type="button"
                            className="pothole-button"
                            onClick={() => onSetDuplicate(nearby.recordId)}
                            disabled={isSavingDetection}
                          >
                            Mark as duplicate of this
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
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
            filename={photoFilename}
            onClose={() => setIsPreviewOpen(false)}
          />
        </div>
      )}
    </div>
  );
};

export default PotholeDetailsModal;
