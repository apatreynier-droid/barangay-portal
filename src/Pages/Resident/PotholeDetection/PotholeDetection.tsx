import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Camera,
  Images,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import Sidebar from "../../../components/Resident/Dashboard/Sidebar";
import Topbar from "../../../components/Resident/Dashboard/Topbar";
import { RESIDENT_ROLE_LABEL } from "../../../Utils/Resident/ResidentDisplay";
import useResponsiveSidebar from "../../../Utils/Shared/useResponsiveSidebar";
import {
  RESIDENT_HOME_PATH,
  RESIDENT_MY_REQUESTS_PATH,
  RESIDENT_REQUEST_DOCUMENT_PATH,
  RESIDENT_REQUEST_HISTORY_PATH,
  NOTIFICATIONS_PATH,
  POTHOLE_DETECTION_PATH,
} from "../../../Utils/Shared/routePaths";
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

type ReportStatus = "review" | "repaired";

type PotholeReport = {
  id: string;
  title: string;
  note: string;
  date: string;
  status: ReportStatus;
};

const STATUS_LABEL: Record<ReportStatus, string> = {
  review: "Under review",
  repaired: "Repaired",
};

// Demo data only - replace with the real reports once the API is ready.
const DEMO_REPORTS: PotholeReport[] = [
  {
    id: "demo-1",
    title: "Road near the covered court",
    note: "Wide hole on the right lane.",
    date: "Oct 11",
    status: "review",
  },
  {
    id: "demo-2",
    title: "Corner of the market entrance",
    note: "Several small potholes.",
    date: "Sep 29",
    status: "repaired",
  },
];

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_MB = 10;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

const formatFileSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const formatToday = (): string =>
  new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

function PotholeDetection({ user, onLogout }: PotholeDetectionProps) {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [reports, setReports] = useState<PotholeReport[]>(DEMO_REPORTS);
  const [sentMessage, setSentMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Opens the phone's rear camera directly (ignored on desktop browsers).
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  // Release the preview's memory when leaving the page.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

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
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;

    setSelectedFile(file);
    setPreviewUrl(url);
    setFileError("");
    setSentMessage("");
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

  const canSend = selectedFile !== null && location.trim().length > 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) return;

    // Placeholder for the submission flow - nothing is sent to a server yet.
    // The report is only added to the local list so the page feels complete.
    const newReport: PotholeReport = {
      id: `local-${Date.now()}`,
      title: location.trim(),
      note: notes.trim() || "No notes added.",
      date: formatToday(),
      status: "review",
    };

    setReports((current) => [newReport, ...current]);
    handleRemoveFile();
    setLocation("");
    setNotes("");
    setSentMessage("Report sent. Barangay staff will review it.");
  };

  return (
    <div className="pd-page" data-version="3">
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

        <div className="pd-layout">
          {/* ---------- Report form ---------- */}
          <form className="pd-card pd-form" onSubmit={handleSubmit} noValidate>
            <div className="pd-card-head">
              <h2>Report a damaged road</h2>
              <p>
                Add a clear photo and where it is. Barangay staff will review
                it.
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
              <label className="pd-label" htmlFor="pd-location">
                Location
              </label>
              <input
                id="pd-location"
                type="text"
                className="pd-input"
                placeholder="Street, landmark or purok"
                value={location}
                onChange={(event) => {
                  setLocation(event.target.value);
                  setSentMessage("");
                }}
              />
            </div>

            <div className="pd-field">
              <label className="pd-label" htmlFor="pd-notes">
                Notes (optional)
              </label>
              <textarea
                id="pd-notes"
                className="pd-input pd-textarea"
                rows={3}
                placeholder="Size of the damage, which lane, how long it has been there"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <div className="pd-actions">
              <button type="submit" className="pd-submit" disabled={!canSend}>
                Send report
              </button>
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

            {reports.length === 0 ? (
              <p className="pd-empty">
                You have not sent any reports yet. Your reports will show up
                here.
              </p>
            ) : (
              <ul className="pd-report-list">
                {reports.map((report) => (
                  <li key={report.id} className="pd-report">
                    <span className="pd-report-icon" aria-hidden="true">
                      <AlertTriangle size={20} strokeWidth={1.8} />
                    </span>
                    <div className="pd-report-text">
                      <strong className="pd-report-title">
                        {report.title}
                      </strong>
                      <span className="pd-report-note">
                        {report.note} &middot; {report.date}
                      </span>
                    </div>
                    <span className={`pd-status is-${report.status}`}>
                      {STATUS_LABEL[report.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default PotholeDetection;
