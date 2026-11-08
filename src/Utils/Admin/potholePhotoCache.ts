import { useEffect, useState } from "react";
import { fetchAdminPotholePhoto } from "../Shared/api";

/**
 * Object-URL cache for pothole photos on the Admin page. Photos come from an
 * authenticated endpoint as Blobs and never change, so one URL per report is
 * shared by the table, map popup, details panel and download button.
 * Call releasePotholePhotos() when the page closes.
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
