import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { Bell, ImagePlus, RefreshCw, Send, Trash2 } from "lucide-react";
import Sidebar from "../../../components/Resident/Dashboard/Sidebar";
import {
  ApiError,
  createDocumentRequest,
  fetchDocumentTypes,
  type DocumentTypeOption,
  type AuthUser,
} from "../../../Utils/Shared/api";
import { RESIDENT_ROLE_LABEL } from "../../../Utils/Resident/ResidentDisplay";
import {
  POTHOLE_DETECTION_PATH,
  RESIDENT_REQUEST_DOCUMENT_PATH,
} from "../../../Utils/Shared/routePaths";
import useResponsiveSidebar from "../../../Utils/Shared/useResponsiveSidebar";
import MobileMenuButton from "../../../components/Shared/MobileMenuButton";
import ThemeToggle from "../../../components/Shared/ThemeToggle";
import "../../../Styles/Resident/Components/ResidentTopBar.css";
import "../../../Styles/Resident/Pages/Dashboard.css";
import "../../../Styles/Resident/Pages/RequestDocumentPage.css";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_MB = 5;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

const formatFileSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

type RequestDocumentPageProps = {
  user: AuthUser;
  /** Optional: shows a count badge on the top bar bell when greater than 0. */
  unreadCount?: number;
  onBackToDashboard: () => void;
  onMyRequests: () => void;
  onRequestHistory: () => void;
  onNotifications: () => void;
  onRequestSubmitted: () => void;
  onSessionExpired: () => void;
  onLogout: () => void;
};

type RequestFormData = {
  documentTypeId: string;
  purpose: string;
};

type SelectedImage = {
  file: File;
  previewUrl: string;
};

function RequestDocumentPage({
  user,
  unreadCount = 0,
  onBackToDashboard,
  onMyRequests,
  onRequestHistory,
  onNotifications,
  onRequestSubmitted,
  onSessionExpired,
  onLogout,
}: RequestDocumentPageProps) {
  const navigate = useNavigate();
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [isLoadingTypes, setIsLoadingTypes] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<RequestFormData>({
    documentTypeId: "",
    purpose: "",
  });
  const [formError, setFormError] = useState("");

  // Required image attachment.
  const [attachment, setAttachment] = useState<SelectedImage | null>(null);
  const [attachmentError, setAttachmentError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  useEffect(() => {
    let cancelled = false;

    const loadDocumentTypes = async () => {
      try {
        const types = await fetchDocumentTypes();

        if (cancelled) return;

        setDocumentTypes(types);
        setFormData((current) => ({
          ...current,
          documentTypeId: current.documentTypeId || String(types[0]?.id ?? ""),
        }));
      } catch (error) {
        if (cancelled) return;

        if (error instanceof ApiError && error.status === 401) {
          onSessionExpired();
          return;
        }

        setFormError(
          error instanceof ApiError
            ? error.message
            : "Could not load document types.",
        );
      } finally {
        if (!cancelled) {
          setIsLoadingTypes(false);
        }
      }
    };

    void loadDocumentTypes();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Release the preview's memory when leaving the page.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const handleChange = (
    event: ChangeEvent<HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
    setFormError("");
  };

  const applyFile = (file: File | undefined) => {
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setAttachmentError("Please attach a JPG, PNG or WebP image.");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setAttachmentError(`The image must be ${MAX_IMAGE_MB} MB or smaller.`);
      return;
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const previewUrl = URL.createObjectURL(file);
    previewUrlRef.current = previewUrl;

    setAttachment({ file, previewUrl });
    setAttachmentError("");
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    applyFile(event.target.files?.[0]);
    // Lets the same file be chosen again after removing it.
    event.target.value = "";
  };

  const handleRemoveAttachment = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    setAttachment(null);
    setAttachmentError("");
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (!isSubmitting) setIsDragging(true);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (!isSubmitting) applyFile(event.dataTransfer.files?.[0]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const documentTypeId = Number(formData.documentTypeId);

    if (!documentTypeId) {
      setFormError("Please choose a document type.");
      return;
    }

    if (!formData.purpose.trim()) {
      setFormError("Please tell us why you need this document.");
      return;
    }

    if (!attachment) {
      setAttachmentError("Please attach an image before submitting.");
      return;
    }

    setIsSubmitting(true);
    setFormError("");

    try {
      await createDocumentRequest(documentTypeId, formData.purpose.trim());
      onRequestSubmitted();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }

      setFormError(
        error instanceof ApiError
          ? error.message
          : "Could not submit your request. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="request-document-layout">
      <Sidebar
        activePage="request-document"
        onDashboard={onBackToDashboard}
        onMyRequests={onMyRequests}
        onRequestHistory={onRequestHistory}
        onNotifications={onNotifications}
        onRequestDocument={() => navigate(RESIDENT_REQUEST_DOCUMENT_PATH)}
        onPotholeDetection={() => navigate(POTHOLE_DETECTION_PATH)}
        onLogout={onLogout}
        firstName={user.first_name}
        lastName={user.last_name}
        role={RESIDENT_ROLE_LABEL}
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

      <main className="request-document-page">
        <header className="topbar">
          <div className="topbar-leading">
            {toggleDrawer && <MobileMenuButton onOpen={toggleDrawer} />}

            <div>
              <p className="topbar-label">Resident Portal</p>
              <h1>Request a Document</h1>
              <p className="topbar-description">
                Submit a document request for review by the Barangay Hall.
              </p>
            </div>
          </div>

          <div className="profile">
            <ThemeToggle />

            <button
              type="button"
              className="notification-button"
              onClick={onNotifications}
              aria-label="Notifications"
            >
              <Bell
                className="notification-icon"
                size={20}
                strokeWidth={1.9}
                aria-hidden="true"
              />
              {unreadCount > 0 && (
                <span className="notification-dot">{unreadCount}</span>
              )}
            </button>
          </div>
        </header>

        <section
          className="request-document-card"
          aria-labelledby="document-form-title"
        >
          <div className="request-document-card-header">
            <h2 id="document-form-title">Request details</h2>
            <p>Fields marked with an asterisk are required.</p>
          </div>

          <form className="request-document-form" onSubmit={handleSubmit}>
            <div className="request-document-field">
              <label htmlFor="documentTypeId">Document type *</label>
              <select
                id="documentTypeId"
                name="documentTypeId"
                value={formData.documentTypeId}
                onChange={handleChange}
                disabled={isLoadingTypes || isSubmitting}
              >
                {isLoadingTypes ? (
                  <option>Loading document types…</option>
                ) : documentTypes.length === 0 ? (
                  <option value="">No document types available</option>
                ) : (
                  documentTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.document_name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="request-document-field">
              <label htmlFor="purpose">Purpose of request *</label>
              <textarea
                id="purpose"
                name="purpose"
                value={formData.purpose}
                onChange={handleChange}
                placeholder="Enter the reason for your request"
                rows={5}
                disabled={isSubmitting}
              />
            </div>

            <div className="request-document-field">
              <label htmlFor="attachment">Attach an image *</label>

              <input
                ref={fileInputRef}
                id="attachment"
                type="file"
                className="request-document-file-input"
                accept={ACCEPTED_IMAGE_TYPES.join(",")}
                onChange={handleFileInputChange}
                disabled={isSubmitting}
                tabIndex={attachment ? -1 : 0}
                aria-describedby="attachment-hint"
              />

              {attachment ? (
                <div className="request-document-preview">
                  <img
                    src={attachment.previewUrl}
                    alt="Preview of the attached image"
                  />

                  <div className="request-document-preview-info">
                    <span className="request-document-preview-name">
                      {attachment.file.name}
                    </span>
                    <span className="request-document-preview-size">
                      {formatFileSize(attachment.file.size)}
                    </span>
                  </div>

                  <div className="request-document-preview-actions">
                    <button
                      type="button"
                      className="request-document-file-button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSubmitting}
                    >
                      <RefreshCw size={15} strokeWidth={2} aria-hidden="true" />
                      Replace
                    </button>
                    <button
                      type="button"
                      className="request-document-file-button danger"
                      onClick={handleRemoveAttachment}
                      disabled={isSubmitting}
                    >
                      <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor="attachment"
                  className={`request-document-dropzone${
                    isDragging ? " is-dragging" : ""
                  }${attachmentError ? " has-error" : ""}`}
                  onDragOver={handleDragOver}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  <span className="request-document-dropzone-icon">
                    <ImagePlus size={24} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <strong>Drop an image here or click to browse</strong>
                  <span>JPG, PNG or WebP, up to {MAX_IMAGE_MB} MB</span>
                </label>
              )}

              <p id="attachment-hint" className="request-document-hint">
                Attach a clear photo of your valid ID or proof of address so the
                Barangay Hall can verify your request.
              </p>

              {attachmentError && (
                <p className="request-document-error" role="alert">
                  {attachmentError}
                </p>
              )}
            </div>

            {formError && (
              <p className="request-document-error" role="alert">
                {formError}
              </p>
            )}

            <div className="request-document-actions">
              <button
                type="button"
                className="request-document-cancel"
                onClick={onBackToDashboard}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="request-document-submit"
                disabled={isSubmitting || isLoadingTypes}
              >
                <Send size={16} strokeWidth={2} aria-hidden="true" />
                {isSubmitting ? "Submitting…" : "Submit request"}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

export default RequestDocumentPage;
