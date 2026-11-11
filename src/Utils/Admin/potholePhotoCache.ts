import { useEffect, useState } from "react";
import { fetchAdminPotholePhoto } from "../Shared/api";
import type { PotholePhotoKind } from "../../Types/Admin/AdminPotholeManagementType";

/**
 * Object-URL cache for pothole photos on the Admin page. Photos come from an
 * authenticated endpoint as Blobs and never change, so one URL per report and
 * kind (original or annotated) is shared by the table, map popup, details panel
 * and download button. Call releasePotholePhotos() when the page closes.
 */
const photoUrls = new Map<string, Promise<string>>();

export const loadPotholePhotoUrl = (
  recordId: number,
  kind: PotholePhotoKind = "original",
): Promise<string> => {
  const key = `${recordId}:${kind}`;
  const cached = photoUrls.get(key);
  if (cached) {
    return cached;
  }

  const pending = fetchAdminPotholePhoto(recordId, kind).then((blob) =>
    URL.createObjectURL(blob),
  );
  photoUrls.set(key, pending);
  // A failed download must be retryable, so it is not kept in the cache.
  pending.catch(() => {
    if (photoUrls.get(key) === pending) {
      photoUrls.delete(key);
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
export const usePotholePhoto = (
  recordId: number,
  kind: PotholePhotoKind = "original",
) => {
  const [state, setState] = useState<PotholePhotoState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    loadPotholePhotoUrl(recordId, kind)
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
  }, [recordId, kind, attempt]);

  return { state, retry: () => setAttempt((value) => value + 1) };
};
