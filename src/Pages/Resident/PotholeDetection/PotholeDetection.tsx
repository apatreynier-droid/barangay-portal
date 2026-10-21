import { useState, useRef } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../../components/Resident/Dashboard/Sidebar";
import { RESIDENT_ROLE_LABEL } from "../../../Utils/ResidentDisplay";
import useResponsiveSidebar from "../../../Utils/useResponsiveSidebar";
import MobileMenuButton from "../../../components/Shared/MobileMenuButton";
import {
  RESIDENT_HOME_PATH,
  RESIDENT_MY_REQUESTS_PATH,
  RESIDENT_REQUEST_DOCUMENT_PATH,
  RESIDENT_REQUEST_HISTORY_PATH,
  NOTIFICATIONS_PATH,
  POTHOLE_DETECTION_PATH,
} from "../../../Utils/routePaths";
import "../../../Styles/Resident/Pages/PotholeDetection.css";

type PotholeDetectionProps = {
  user: {
    first_name: string;
    last_name: string;
  };
  onBackToDashboard: () => void;
  onLogout: () => void;
};

const STEPS = [
  { id: 1, label: "Capture Defect Photo", status: "in-progress" },
  { id: 2, label: "Pothole Identification", status: "not-started" },
  { id: 3, label: "Geo-Location Submission", status: "not-started" },
] as const;

function PotholeDetection({ user, onLogout }: PotholeDetectionProps) {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) setSelectedFile(file);
  };

  const isImageFile = (file: File | null) => {
    if (!file) return false;
    return ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  };

  const isValidSize = (file: File | null) => {
    if (!file) return false;
    return file.size <= 10 * 1024 * 1024;
  };

  const canIdentify =
    selectedFile !== null &&
    isImageFile(selectedFile) &&
    isValidSize(selectedFile);

  return (
    <div className="pothole-detection">
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

      <main className="pothole-main">
        <header className="pothole-header">
          <div className="topbar-leading">
            {toggleDrawer && <MobileMenuButton onOpen={toggleDrawer} />}

            <div>
              <p className="page-label">Resident Portal</p>
              <h1>Pothole Detection</h1>
              <p>
                Report damaged roads in your community by providing a photo,
                reviewing the detection result, and submitting the location for
                administrative review.
              </p>
            </div>
          </div>
        </header>

        <nav className="step-indicator" aria-label="Pothole detection workflow">
          {STEPS.map((step) => (
            <div
              key={step.id}
              className={`step step-${step.id} ${step.status}`}
            >
              <div className="step-circle">{step.id}</div>
              <span className="step-label">{step.label}</span>
              {step.status === "in-progress" && (
                <span className="step-status">IN PROGRESS</span>
              )}
              {step.status === "not-started" && (
                <span className="step-status">NOT STARTED</span>
              )}
            </div>
          ))}
        </nav>

        <section className="pothole-card">
          <div className="card-header">
            <div className="card-icon">📷</div>
            <div>
              <h2>1. Capture Defect Photo</h2>
              <p>
                Provide a clear photo of the damaged road so the system can
                demonstrate pothole identification.
              </p>
            </div>
            <span className="step-badge">IN PROGRESS</span>
          </div>

          <div
            className="upload-area"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="upload-icon">&#x21bb;</div>
            <h3>Upload a road-damage photo</h3>
            <p>Drag and drop an image here, or browse your computer.</p>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/jpeg, image/png, image/webp"
              onChange={handleFileChange}
              className="file-input"
            />

            <button
              type="button"
              className="choose-image-button"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose Image
            </button>

            <p className="file-info">JPG, PNG, or WebP &bull; Maximum 10 MB</p>
          </div>

          {selectedFile && (
            <div className="file-preview">
              <p className="preview-label">Selected image</p>
              <img
                src={URL.createObjectURL(selectedFile)}
                alt="Preview"
                className="preview-image"
              />
              <button
                type="button"
                className="remove-file-button"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              >
                Remove
              </button>
            </div>
          )}

          <div className="card-actions">
            <button
              type="button"
              className="identify-button"
              disabled={!canIdentify}
              onClick={() => {
                // Placeholder for detection flow - no real detection implemented
              }}
            >
              Identify Pothole
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default PotholeDetection;
