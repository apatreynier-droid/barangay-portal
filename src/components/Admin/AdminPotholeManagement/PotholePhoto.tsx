import { ImageOff, LoaderCircle, RefreshCw } from "lucide-react";
import type { PotholePhotoState } from "../../../Utils/Admin/potholePhotoCache";

type PotholePhotoProps = {
  state: PotholePhotoState;
  alt: string;
  className?: string;
  /** Shows a Retry button in the error state. */
  onRetry?: () => void;
  /** Small variant (table thumbnail): icons only, no text. */
  compact?: boolean;
};

/** The resident's photo, with loading and error placeholders of the same size. */
const PotholePhoto = ({
  state,
  alt,
  className = "",
  onRetry,
  compact = false,
}: PotholePhotoProps) => {
  if (state.status === "ready") {
    return <img src={state.url} alt={alt} className={className} />;
  }

  const placeholderClass = `pothole-photo-placeholder${
    compact ? " is-compact" : ""
  } ${className}`;

  if (state.status === "loading") {
    return (
      <span className={placeholderClass} aria-busy="true">
        <LoaderCircle
          className="pothole-photo-spin"
          size={compact ? 16 : 22}
          aria-hidden="true"
        />
        {compact ? (
          <span className="pothole-visually-hidden">Loading photo</span>
        ) : (
          <span>Loading photo…</span>
        )}
      </span>
    );
  }

  return (
    <span className={`${placeholderClass} is-error`} role="alert">
      <ImageOff size={compact ? 16 : 22} aria-hidden="true" />
      {compact ? (
        <span className="pothole-visually-hidden">{state.message}</span>
      ) : (
        <span>{state.message}</span>
      )}
      {onRetry && !compact && (
        <button type="button" className="pothole-button" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" />
          Retry
        </button>
      )}
    </span>
  );
};

export default PotholePhoto;
