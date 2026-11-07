import { useEffect, useState } from "react";
import { fetchAdminPotholePhoto } from "../Shared/api";

/**
 * Display cache for the residents' pothole photos on the Admin page.
 *
 * The photos are stored permanently on the server and only served through an
 * authenticated endpoint, so the browser downloads each one as a Blob and
 * shows it through an object URL. A report's photo never changes, so one
 * object URL per report is shared by the table thumbnail, the map popup, the
 * details panel and the download button. The page calls
 * releasePotholePhotos() when it closes to free that memory.
 */
const photoUrls = new Map<number, Promise<string>>();

export const loadPotholePhotoUrl = (recordId: number): Promise<string> => {
  const cached = photoUrls.get(recordId);
  if (cached) {
    return cached;
  }

  const pending = fetchAdminPotholePhoto(recordId).then((blob) =>
    URL.createObjectURL(blob),
  );
  photoUrls.set(recordId, pending);
  // A failed download must be retryable, so it is not kept in the cache.
  pending.catch(() => {
    if (photoUrls.get(recordId) === pending) {
      photoUrls.delete(recordId);
    }
  });

  return pending;
};

export const releasePotholePhotos = (): void => {
  photoUrls.forEach((pending) => {
    pending.then(URL.revokeObjectURL, () => undefined);
  });
  photoUrls.clear();
};

export type PotholePhotoState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

/** The object URL of a report's photo, loaded on first use. */
export const usePotholePhoto = (recordId: number) => {
  const [state, setState] = useState<PotholePhotoState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    loadPotholePhotoUrl(recordId)
      .then((url) => {
        if (!cancelled) setState({ status: "ready", url });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error && error.message
                ? error.message
                : "Could not load the photo.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [recordId, attempt]);

  return { state, retry: () => setAttempt((value) => value + 1) };
};
