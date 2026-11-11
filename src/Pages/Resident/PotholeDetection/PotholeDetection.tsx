import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Camera,
  Crosshair,
  Images,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import Sidebar from "../../../components/Resident/Dashboard/Sidebar";
import Topbar from "../../../components/Resident/Dashboard/Topbar";
import PotholeDetectionResult from "../../../components/Resident/PotholeDetection/PotholeDetectionResult";
import { RESIDENT_ROLE_LABEL } from "../../../Utils/Resident/ResidentDisplay";
import {
  STATUS_DISPLAY,
  describeReportDetection,
  describeReportLocation,
  formatReportDate,
} from "../../../Utils/Resident/potholeReportDisplay";
import useGpsCapture, {
  LOW_GPS_ACCURACY_M,
} from "../../../Utils/Resident/useGpsCapture";
import {
  fetchMyPotholeReports,
  submitPotholeReport,
} from "../../../Utils/Shared/api";
import { STANDARDIZED_PUROKS } from "../../../Utils/Shared/puroks";
import useResponsiveSidebar from "../../../Utils/Shared/useResponsiveSidebar";
import {
  RESIDENT_HOME_PATH,
  RESIDENT_MY_REQUESTS_PATH,
  RESIDENT_REQUEST_DOCUMENT_PATH,
  RESIDENT_REQUEST_HISTORY_PATH,
  NOTIFICATIONS_PATH,
  POTHOLE_DETECTION_PATH,
} from "../../../Utils/Shared/routePaths";
import type {
  CapturedLocation,
  ResidentPotholeReport,
} from "../../../Types/Resident/PotholeReportType";
import "../../../Styles/Resident/Components/ResidentTopBar.css";
import "../../../Styles/Resident/Pages/Dashboard.css";
import "../../../Styles/Resident/Pages/PotholeDetection.css";

type PotholeDetectionProps = {
  user: {
    first_name: string;
    last_name: string;
  };
  onBackToDashboard: () => void;
  onLogout: () => void;
};

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_MB = 10;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;
const MAX_LOCATION_LENGTH = 255;
const MAX_ROAD_LENGTH = 150;
const MAX_NOTES_LENGTH = 1000;

type LocationMode = "gps" | "manual";

// Leaflet is only downloaded when a map is actually shown.
const LocationPickerMap = lazy(
  () => import("../../../components/Resident/PotholeDetection/LocationPickerMap"),
);

const MapFallback = () => (
  <div className="pd-map pd-map-loading" aria-busy="true">
    Loading map…
  </div>
);

const formatFileSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const formatCoordinates = (latitude: number, longitude: number): string =>
  `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

function PotholeDetection({ user, onLogout }: PotholeDetectionProps) {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [location, setLocation] = useState("");
  const [purok, setPurok] = useState("");
  const [road, setRoad] = useState("");
  const [notes, setNotes] = useState("");
  const [locationMode, setLocationMode] = useState<LocationMode>("gps");
  const [manualPoint, setManualPoint] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [sentMessage, setSentMessage] = useState("");
  const [reports, setReports] = useState<ResidentPotholeReport[]>([]);
  const [reportsState, setReportsState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [reportsError, setReportsError] = useState("");
  /** The report whose detection result is open. */
  const [resultReportId, setResultReportId] = useState<number | null>(null);
  const resultAnchorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Opens the phone's rear camera directly (ignored on desktop browsers).
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();
  const gps = useGpsCapture();

  // Release the preview's memory when leaving the page.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const fetchReports = () => {
    fetchMyPotholeReports()
      .then((data) => {
        setReports(data);
        setReportsState("ready");
      })
      .catch((error: unknown) => {
        setReportsError(
          error instanceof Error && error.message
            ? error.message
            : "Could not load your reports.",
        );
        setReportsState("error");
      });
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const retryReports = () => {
    setReportsState("loading");
    fetchReports();
  };

  const clearPreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  const applyFile = (file: File | null | undefined) => {
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setFileError("Please choose a JPG, PNG or WebP image.");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setFileError(`The image must be ${MAX_IMAGE_MB} MB or smaller.`);
      return;
    }

    clearPreview();
    // Only a local preview; the original file itself is uploaded on submit.
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;

    setSelectedFile(file);
    setPreviewUrl(url);
    setFileError("");
    setSentMessage("");

    // The photo was just taken or chosen: ask for the position now. Refusing is
    // fine, since the resident can still pin the spot or describe it.
    if (locationMode === "gps" && gps.state.status === "idle") {
      gps.capture();
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    applyFile(event.target.files?.[0]);
    // Lets the same file be chosen again after removing it.
    event.target.value = "";
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    applyFile(event.dataTransfer.files?.[0]);
  };

  const handleRemoveFile = () => {
    clearPreview();
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileError("");
  };

  const switchToManual = () => {
    gps.reset();
    setLocationMode("manual");
    setSentMessage("");
  };

  const switchToGps = () => {
    setManualPoint(null);
    setLocationMode("gps");
    gps.capture();
  };

  const clearPosition = () => {
    gps.reset();
    setManualPoint(null);
    setLocationMode("gps");
  };

  // Only a position that was really captured (or explicitly pinned) is sent.
  const position: CapturedLocation | null =
    locationMode === "gps" && gps.state.status === "captured"
      ? {
          source: "gps",
          latitude: gps.state.reading.latitude,
          longitude: gps.state.reading.longitude,
          accuracy: gps.state.reading.accuracy,
          capturedAt: gps.state.reading.capturedAt,
        }
      : locationMode === "manual" && manualPoint
        ? { source: "manual", ...manualPoint }
        : null;

  const isLocating = locationMode === "gps" && gps.state.status === "locating";
  const canSend =
    selectedFile !== null &&
    location.trim().length > 0 &&
    !isLocating &&
    !isSubmitting;

  // Looked up on every render so the open result shows the latest status.
  const resultReport =
    reports.find((report) => report.id === resultReportId) ?? null;

  const openResult = (reportId: number) => {
    setResultReportId(reportId);
    // After the result has rendered above the form.
    window.requestAnimationFrame(() => {
      resultAnchorRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend || !selectedFile) return;

    setIsSubmitting(true);
    setSubmitError("");
    setSentMessage("");

    try {
      const created = await submitPotholeReport({
        photo: selectedFile,
        location: location.trim(),
        purok,
        road: road.trim(),
        notes: notes.trim(),
        position,
      });

      setReports((current) => [created, ...current]);
      setReportsState("ready");
      handleRemoveFile();
      setLocation("");
      setPurok("");
      setRoad("");
      setNotes("");
      clearPosition();
      setSentMessage(
        `Report ${created.report_number} sent. Barangay staff will review it.`,
      );
      openResult(created.id);
    } catch (error) {
      setSubmitError(
        error instanceof Error && error.message
          ? error.message
          : "Could not send your report. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderLocationCapture = () => {
    if (locationMode === "manual") {
      return (
        <div className="pd-geo">
          <div className="pd-geo-status is-manual">
            <MapPin size={18} strokeWidth={2} aria-hidden="true" />
            <div>
              <strong>Pin the spot on the map</strong>
              <span>
                Tap the map where the pothole is. A pinned location is marked
                as <em>manually selected</em>, not GPS.
              </span>
            </div>
          </div>

          <Suspense fallback={<MapFallback />}>
            <LocationPickerMap
              point={manualPoint}
              onPick={(latitude, longitude) => {
                setManualPoint({ latitude, longitude });
                setSentMessage("");
              }}
              label="Map: tap to pin where the pothole is"
            />
          </Suspense>

          {manualPoint && (
            <p className="pd-geo-coords">
              Pinned at{" "}
              <span className="pd-mono">
                {formatCoordinates(manualPoint.latitude, manualPoint.longitude)}
              </span>{" "}
              (manual pin, not GPS-verified)
            </p>
          )}

          <div className="pd-geo-actions">
            <button type="button" className="pd-btn" onClick={switchToGps}>
              <Crosshair size={15} strokeWidth={2} aria-hidden="true" />
              Use GPS instead
            </button>
            {manualPoint && (
              <button
                type="button"
                className="pd-btn pd-btn-danger"
                onClick={() => setManualPoint(null)}
              >
                <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                Remove pin
              </button>
            )}
          </div>
        </div>
      );
    }

    const { state } = gps;

    if (state.status === "locating") {
      return (
        <div className="pd-geo">
          <div className="pd-geo-status" role="status">
            <LoaderCircle
              size={18}
              strokeWidth={2}
              className="pd-spin"
              aria-hidden="true"
            />
            <div>
              <strong>Finding your location…</strong>
              <span>
                {state.best
                  ? `Improving accuracy (now ±${Math.round(state.best.accuracy)} m). Keep the phone still.`
                  : "Allow location access if your browser asks."}
              </span>
            </div>
          </div>
          <div className="pd-geo-actions">
            <button type="button" className="pd-btn" onClick={gps.reset}>
              Cancel
            </button>
          </div>
        </div>
      );
    }

    if (state.status === "captured") {
      const { reading } = state;
      const isLow = reading.accuracy > LOW_GPS_ACCURACY_M;

      return (
        <div className="pd-geo">
          <div className={`pd-geo-status ${isLow ? "is-warning" : "is-ok"}`}>
            <Crosshair size={18} strokeWidth={2} aria-hidden="true" />
            <div>
              <strong>GPS location captured</strong>
              <span>
                <span className="pd-mono">
                  {formatCoordinates(reading.latitude, reading.longitude)}
                </span>{" "}
                · accuracy ±{Math.round(reading.accuracy)} m
              </span>
              {isLow && (
                <span className="pd-geo-warning">
                  This reading is not very precise. Try again outdoors, or pin
                  the exact spot on the map.
                </span>
              )}
            </div>
          </div>

          <Suspense fallback={<MapFallback />}>
            <LocationPickerMap
              point={reading}
              accuracy={reading.accuracy}
              label="Map showing your captured GPS location"
            />
          </Suspense>

          <div className="pd-geo-actions">
            <button type="button" className="pd-btn" onClick={gps.capture}>
              <RefreshCw size={15} strokeWidth={2} aria-hidden="true" />
              Capture again
            </button>
            <button type="button" className="pd-btn" onClick={switchToManual}>
              <MapPin size={15} strokeWidth={2} aria-hidden="true" />
              Pin on map instead
            </button>
            <button
              type="button"
              className="pd-btn pd-btn-danger"
              onClick={gps.reset}
            >
              <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
              Remove
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="pd-geo">
        {state.status === "error" ? (
          <div className="pd-geo-status is-error" role="alert">
            <AlertTriangle size={18} strokeWidth={2} aria-hidden="true" />
            <div>
              <strong>Location not captured</strong>
              <span>{state.message}</span>
            </div>
          </div>
        ) : (
          <p className="pd-geo-hint">
            Stand next to the pothole and capture your GPS location so the
            barangay can find it on the map.
          </p>
        )}

        <div className="pd-geo-actions">
          <button
            type="button"
            className="pd-btn pd-btn-primary"
            onClick={gps.capture}
          >
            <Crosshair size={15} strokeWidth={2} aria-hidden="true" />
            {state.status === "error" ? "Try again" : "Capture my GPS location"}
          </button>
          <button type="button" className="pd-btn" onClick={switchToManual}>
            <MapPin size={15} strokeWidth={2} aria-hidden="true" />
            Pin on map instead
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="pd-page" data-version="4">
      <Sidebar
        firstName={user.first_name}
        lastName={user.last_name}
        role={RESIDENT_ROLE_LABEL}
        activePage="pothole-detection"
        onDashboard={() => navigate(RESIDENT_HOME_PATH)}
        onMyRequests={() => navigate(RESIDENT_MY_REQUESTS_PATH)}
        onRequestDocument={() => navigate(RESIDENT_REQUEST_DOCUMENT_PATH)}
        onRequestHistory={() => navigate(RESIDENT_REQUEST_HISTORY_PATH)}
        onNotifications={() => navigate(NOTIFICATIONS_PATH)}
        onPotholeDetection={() => navigate(POTHOLE_DETECTION_PATH)}
        onLogout={onLogout}
        isOpen={isDrawerOpen}
        onNavigate={closeDrawer}
      />

      {isDrawerOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={closeDrawer}
        />
      )}

      <main className="pd-main">
        <Topbar
          unreadCount={0}
          onNotifications={() => navigate(NOTIFICATIONS_PATH)}
          onMenuToggle={toggleDrawer}
          onLogout={onLogout}
        />

        <div ref={resultAnchorRef} className="pd-result-anchor">
          {resultReport && (
            <PotholeDetectionResult
              report={resultReport}
              onClose={() => setResultReportId(null)}
            />
          )}
        </div>

        <div className="pd-layout">
          {/* ---------- Report form ---------- */}
          <form className="pd-card pd-form" onSubmit={handleSubmit} noValidate>
            <div className="pd-card-head">
              <h2>Report a damaged road</h2>
              <p>
                Add a clear photo and where it is. The AI will look for
                potholes, then barangay staff will review your report.
              </p>
            </div>

            <div className="pd-field">
              <span className="pd-label" id="pd-photo-label">
                Photo
              </span>

              <input
                type="file"
                id="pd-photo"
                ref={fileInputRef}
                accept={ACCEPTED_IMAGE_TYPES.join(",")}
                onChange={handleFileChange}
                className="pd-file-input"
                aria-labelledby="pd-photo-label"
                tabIndex={selectedFile ? -1 : 0}
              />

              <input
                type="file"
                id="pd-camera"
                ref={cameraInputRef}
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="pd-file-input"
                tabIndex={-1}
                aria-hidden="true"
              />

              {selectedFile && previewUrl ? (
                <div className="pd-preview">
                  <div className="pd-preview-frame">
                    <img
                      src={previewUrl}
                      alt="Preview of the selected road photo"
                      className="pd-preview-img"
                    />
                  </div>

                  <div className="pd-preview-meta">
                    <div className="pd-preview-info">
                      <span className="pd-preview-name">
                        {selectedFile.name}
                      </span>
                      <span className="pd-preview-size">
                        {formatFileSize(selectedFile.size)}
                      </span>
                    </div>

                    <div className="pd-preview-actions">
                      <button
                        type="button"
                        className="pd-btn photo-touch-only"
                        onClick={() => cameraInputRef.current?.click()}
                      >
                        <Camera size={15} strokeWidth={2} aria-hidden="true" />
                        Retake
                      </button>
                      <button
                        type="button"
                        className="pd-btn"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <RefreshCw
                          size={15}
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                        Replace
                      </button>
                      <button
                        type="button"
                        className="pd-btn pd-btn-danger"
                        onClick={handleRemoveFile}
                      >
                        <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <label
                    htmlFor="pd-photo"
                    className={`pd-drop${isDragging ? " is-dragging" : ""}${
                      fileError ? " has-error" : ""
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                  >
                    <Upload size={26} strokeWidth={1.8} aria-hidden="true" />
                    <strong className="pd-drop-title">
                      Drop a photo here or tap to browse
                    </strong>
                    <span className="pd-drop-hint">
                      JPG, PNG or WebP, up to {MAX_IMAGE_MB} MB
                    </span>
                  </label>

                  {/* Phones and tablets: take the photo on the spot. */}
                  <div className="photo-source">
                    <button
                      type="button"
                      className="photo-source-btn is-primary"
                      onClick={() => cameraInputRef.current?.click()}
                    >
                      <Camera size={18} strokeWidth={2} aria-hidden="true" />
                      Take a photo
                    </button>
                    <button
                      type="button"
                      className="photo-source-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Images size={18} strokeWidth={2} aria-hidden="true" />
                      Gallery
                    </button>
                  </div>
                </>
              )}

              {fileError && (
                <p className="pd-error" role="alert">
                  {fileError}
                </p>
              )}
            </div>

            <div className="pd-field">
              <span className="pd-label">Map location</span>
              {renderLocationCapture()}
            </div>

            <div className="pd-field">
              <label className="pd-label" htmlFor="pd-location">
                Where is it?
              </label>
              <input
                id="pd-location"
                type="text"
                className="pd-input"
                placeholder="Landmark or description, e.g. in front of the covered court"
                maxLength={MAX_LOCATION_LENGTH}
                value={location}
                onChange={(event) => {
                  setLocation(event.target.value);
                  setSentMessage("");
                }}
              />
            </div>

            <div className="pd-field-row">
              <div className="pd-field">
                <label className="pd-label" htmlFor="pd-purok">
                  Purok (optional)
                </label>
                <select
                  id="pd-purok"
                  className="pd-input"
                  value={purok}
                  onChange={(event) => setPurok(event.target.value)}
                >
                  <option value="">Select Purok</option>
                  {STANDARDIZED_PUROKS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pd-field">
                <label className="pd-label" htmlFor="pd-road">
                  Road or street (optional)
                </label>
                <input
                  id="pd-road"
                  type="text"
                  className="pd-input"
                  placeholder="e.g. Barangay Road"
                  maxLength={MAX_ROAD_LENGTH}
                  value={road}
                  onChange={(event) => setRoad(event.target.value)}
                />
              </div>
            </div>

            <div className="pd-field">
              <label className="pd-label" htmlFor="pd-notes">
                Notes (optional)
              </label>
              <textarea
                id="pd-notes"
                className="pd-input pd-textarea"
                rows={3}
                maxLength={MAX_NOTES_LENGTH}
                placeholder="Size of the damage, which lane, how long it has been there"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <div className="pd-actions">
              <button type="submit" className="pd-submit" disabled={!canSend}>
                {isSubmitting
                  ? "Checking the photo…"
                  : isLocating
                    ? "Waiting for location…"
                    : "Send report"}
              </button>
              {selectedFile && location.trim() && !position && !isLocating && (
                <p className="pd-hint">
                  No map location captured: the report will be sent with your
                  written description only.
                </p>
              )}
              {submitError && (
                <p className="pd-error" role="alert">
                  {submitError}
                </p>
              )}
              {sentMessage && (
                <p className="pd-success" role="status">
                  {sentMessage}
                </p>
              )}
            </div>
          </form>

          {/* ---------- My reports ---------- */}
          <section
            className="pd-card pd-reports"
            aria-labelledby="pd-reports-title"
          >
            <div className="pd-card-head">
              <h2 id="pd-reports-title">My reports</h2>
              <p>Status of what you sent</p>
            </div>

            {reportsState === "loading" ? (
              <p className="pd-empty" aria-busy="true">
                Loading your reports…
              </p>
            ) : reportsState === "error" ? (
              <div className="pd-empty" role="alert">
                <p className="pd-error">{reportsError}</p>
                <button type="button" className="pd-btn" onClick={retryReports}>
                  <RefreshCw size={15} strokeWidth={2} aria-hidden="true" />
                  Try again
                </button>
              </div>
            ) : reports.length === 0 ? (
              <p className="pd-empty">
                You have not sent any reports yet. Your reports will show up
                here.
              </p>
            ) : (
              <ul className="pd-report-list">
                {reports.map((report) => {
                  const display = STATUS_DISPLAY[report.status];
                  const place = [
                    report.location_description,
                    report.road_name,
                    report.purok,
                  ]
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <li key={report.id} className="pd-report">
                      <span className="pd-report-icon" aria-hidden="true">
                        <AlertTriangle size={20} strokeWidth={1.8} />
                      </span>
                      <div className="pd-report-text">
                        <strong className="pd-report-title">{place}</strong>
                        <span className="pd-report-detection">
                          {describeReportDetection(report)}
                        </span>
                        <span className="pd-report-note">
                          {report.report_number} &middot;{" "}
                          {formatReportDate(report.reported_at)} &middot;{" "}
                          {describeReportLocation(report)}
                        </span>
                        {report.status_remark && (
                          <span className="pd-report-note">
                            Barangay remark: {report.status_remark}
                          </span>
                        )}
                      </div>
                      <div className="pd-report-side">
                        <span className={`pd-status ${display.tone}`}>
                          {display.label}
                        </span>
                        <button
                          type="button"
                          className="pd-btn"
                          onClick={() => openResult(report.id)}
                          aria-label={`View the detection result of ${report.report_number}`}
                        >
                          View result
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default PotholeDetection;
