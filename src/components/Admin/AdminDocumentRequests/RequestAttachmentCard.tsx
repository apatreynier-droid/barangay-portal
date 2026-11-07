import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  FileImage,
  ImageOff,
  LoaderCircle,
  Maximize2,
  RefreshCw,
  X,
} from "lucide-react";
import type { AdminRequestAttachment } from "../../../Types/Admin/AdminDocumentRequestsType";
import { fetchAdminRequestAttachment } from "../../../Utils/Shared/api";
import { formatSubmittedDateTime } from "../../../Utils/Admin/AdminDocumentRequestsLogic";
import useModalBehavior from "../AdminPotholeManagement/useModalBehavior";

type RequestAttachmentCardProps = {
  requestId: number;
  attachment: AdminRequestAttachment | null | undefined;
};

type LoadState = "loading" | "ready" | "error";

const ICON_STROKE = 2;

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatImageType = (contentType: string): string =>
  contentType.replace(/^image\//, "").replace("jpeg", "jpg").toUpperCase();

type DownloadLinkProps = {
  objectUrl: string | null;
  filename: string;
  className: string;
};

/** Saves the original bytes (already fetched as a Blob) under the resident's filename. */
const DownloadLink = ({ objectUrl, filename, className }: DownloadLinkProps) =>
  objectUrl ? (
    <a className={className} href={objectUrl} download={filename}>
      <Download size={16} strokeWidth={ICON_STROKE} aria-hidden="true" />
      <span>Download</span>
    </a>
  ) : (
    <button type="button" className={className} disabled>
      <Download size={16} strokeWidth={ICON_STROKE} aria-hidden="true" />
      <span>Download</span>
    </button>
  );

type AttachmentLightboxProps = {
  objectUrl: string;
  attachment: AdminRequestAttachment;
  onClose: () => void;
};

const AttachmentLightbox = ({
  objectUrl,
  attachment,
  onClose,
}: AttachmentLightboxProps) => {
  const dialogRef = useRef<HTMLElement | null>(null);
  useModalBehavior(dialogRef, onClose);

  // Keep the page behind the lightbox from scrolling while it is open.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return createPortal(
    <div
      className="docreq-lightbox-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <section
        ref={dialogRef}
        className="docreq-lightbox"
        role="dialog"
        aria-modal="true"
        aria-labelledby="docreq-lightbox-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="docreq-lightbox-header">
          <h2 id="docreq-lightbox-title" title={attachment.original_filename}>
            <FileImage size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
            <span>{attachment.original_filename}</span>
          </h2>
          <div className="docreq-lightbox-actions">
            <DownloadLink
              objectUrl={objectUrl}
              filename={attachment.original_filename}
              className="docreq-attachment-button primary"
            />
            <button
              type="button"
              className="docreq-lightbox-close"
              onClick={onClose}
              aria-label="Close preview"
            >
              <X size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="docreq-lightbox-body">
          <img
            src={objectUrl}
            alt={`Resident attachment: ${attachment.original_filename}`}
          />
        </div>
      </section>
    </div>,
    document.body,
  );
};

/**
 * "Resident Attachment" section of the admin request details. The image is
 * loaded from the authenticated attachment endpoint for exactly this
 * request ID; the object URL only lives while the card is shown.
 */
const RequestAttachmentCard = ({
  requestId,
  attachment,
}: RequestAttachmentCardProps) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const attachmentId = attachment?.id ?? null;

  useEffect(() => {
    if (attachmentId === null) {
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;

    setLoadState("loading");
    setError("");
    setObjectUrl(null);

    fetchAdminRequestAttachment(requestId)
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
        setLoadState("ready");
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error && loadError.message
            ? loadError.message
            : "Could not load the attachment.",
        );
        setLoadState("error");
      });

    // A different request (or unmount) discards any in-flight response and
    // frees the previous image, so one request never shows another's file.
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [requestId, attachmentId, reloadKey]);

  return (
    <section className="residents-info-card docreq-attachment-card">
      <div className="docreq-details-header">
        <h3 className="docreq-attachment-title">
          <FileImage size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
          Resident Attachment
        </h3>
      </div>

      {!attachment ? (
        <div className="docreq-attachment-empty">
          <span className="docreq-attachment-empty-icon" aria-hidden="true">
            <ImageOff size={22} strokeWidth={ICON_STROKE} />
          </span>
          <p>No attachment available.</p>
          <span>This request was submitted without an image.</span>
        </div>
      ) : (
        <div className="docreq-attachment-content">
          {loadState === "ready" && objectUrl ? (
            <button
              type="button"
              className="docreq-attachment-thumb"
              onClick={() => setIsPreviewOpen(true)}
              aria-label={`View ${attachment.original_filename} in a larger preview`}
            >
              <img
                src={objectUrl}
                alt={`Resident attachment: ${attachment.original_filename}`}
              />
              <span className="docreq-attachment-thumb-overlay" aria-hidden="true">
                <Maximize2 size={16} strokeWidth={ICON_STROKE} />
                View larger
              </span>
            </button>
          ) : loadState === "error" ? (
            <div className="docreq-attachment-thumb is-placeholder" role="alert">
              <ImageOff size={22} strokeWidth={ICON_STROKE} aria-hidden="true" />
              <span>{error}</span>
              <button
                type="button"
                className="docreq-attachment-button"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                <RefreshCw size={14} strokeWidth={ICON_STROKE} aria-hidden="true" />
                <span>Retry</span>
              </button>
            </div>
          ) : (
            <div className="docreq-attachment-thumb is-placeholder" aria-busy="true">
              <LoaderCircle
                className="docreq-attachment-spin"
                size={22}
                strokeWidth={ICON_STROKE}
                aria-hidden="true"
              />
              <span>Loading the attachment…</span>
            </div>
          )}

          <dl className="docreq-attachment-meta">
            <div>
              <dt>File name</dt>
              <dd title={attachment.original_filename}>
                {attachment.original_filename}
              </dd>
            </div>
            <div>
              <dt>Type · Size</dt>
              <dd>
                {formatImageType(attachment.content_type)} ·{" "}
                {formatFileSize(attachment.file_size)}
              </dd>
            </div>
            <div>
              <dt>Uploaded</dt>
              <dd>{formatSubmittedDateTime(attachment.uploaded_at)}</dd>
            </div>
          </dl>

          <div className="docreq-attachment-actions">
            <button
              type="button"
              className="docreq-attachment-button"
              onClick={() => setIsPreviewOpen(true)}
              disabled={loadState !== "ready"}
            >
              <Maximize2 size={16} strokeWidth={ICON_STROKE} aria-hidden="true" />
              <span>View larger</span>
            </button>
            <DownloadLink
              objectUrl={loadState === "ready" ? objectUrl : null}
              filename={attachment.original_filename}
              className="docreq-attachment-button primary"
            />
          </div>
        </div>
      )}

      {isPreviewOpen && attachment && objectUrl && (
        <AttachmentLightbox
          objectUrl={objectUrl}
          attachment={attachment}
          onClose={() => setIsPreviewOpen(false)}
        />
      )}
    </section>
  );
};

export default RequestAttachmentCard;
