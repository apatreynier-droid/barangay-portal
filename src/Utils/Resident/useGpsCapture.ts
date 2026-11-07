import { useCallback, useEffect, useRef, useState } from "react";

/** A fix this precise is good enough to stop waiting for a better one. */
export const GOOD_GPS_ACCURACY_M = 20;
/** Above this the resident is warned that the reading is imprecise. */
export const LOW_GPS_ACCURACY_M = 50;
/** After the first fix, keep refining for at most this long. */
const REFINE_WINDOW_MS = 12_000;
/** Give up when the device returns no fix at all within this time. */
const FIRST_FIX_TIMEOUT_MS = 25_000;

export type GpsReading = {
  latitude: number;
  longitude: number;
  /** Accuracy radius in metres, as reported by the device. */
  accuracy: number;
  /** ISO 8601 time of the fix. */
  capturedAt: string;
};

export type GpsErrorKind =
  | "unsupported"
  | "insecure"
  | "denied"
  | "unavailable"
  | "timeout";

export type GpsCaptureState =
  | { status: "idle" }
  | { status: "locating"; best: GpsReading | null }
  | { status: "captured"; reading: GpsReading }
  | { status: "error"; kind: GpsErrorKind; message: string };

const ERROR_MESSAGES: Record<GpsErrorKind, string> = {
  unsupported:
    "This browser cannot share its location. You can pin the spot on the map instead.",
  insecure:
    "Location only works when the portal is opened over a secure https:// connection. Ask the barangay for the secure address, or pin the spot on the map instead.",
  denied:
    "Location permission was denied. Allow location for this site in your browser settings and try again, or pin the spot on the map instead.",
  unavailable:
    "Your device could not find its location. Turn on Location/GPS, move to an open area and try again, or pin the spot on the map instead.",
  timeout:
    "Finding your location took too long. Try again outdoors, or pin the spot on the map instead.",
};

const toReading = (position: GeolocationPosition): GpsReading => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracy: position.coords.accuracy,
  capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
});

/**
 * Reads the device position with the browser Geolocation API.
 *
 * Phones often return a rough network-based fix first and a precise GPS fix a
 * few seconds later, so readings are watched briefly and the most accurate one
 * is kept. Nothing is ever invented: on failure the state says why, and the
 * caller offers the manual map pin instead.
 */
const useGpsCapture = () => {
  const [state, setState] = useState<GpsCaptureState>({ status: "idle" });
  const watchIdRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  useEffect(() => stopWatching, [stopWatching]);

  const capture = useCallback(() => {
    stopWatching();

    if (!("geolocation" in navigator)) {
      setState({ status: "error", kind: "unsupported", message: ERROR_MESSAGES.unsupported });
      return;
    }

    // Mobile browsers block geolocation on plain http:// (except localhost).
    if (!window.isSecureContext) {
      setState({ status: "error", kind: "insecure", message: ERROR_MESSAGES.insecure });
      return;
    }

    let best: GpsReading | null = null;

    const finish = () => {
      stopWatching();
      setState(
        best
          ? { status: "captured", reading: best }
          : { status: "error", kind: "timeout", message: ERROR_MESSAGES.timeout },
      );
    };

    const fail = (kind: GpsErrorKind) => {
      stopWatching();
      setState({ status: "error", kind, message: ERROR_MESSAGES[kind] });
    };

    setState({ status: "locating", best: null });

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const reading = toReading(position);
        const isFirstFix = best === null;

        if (!best || reading.accuracy < best.accuracy) {
          best = reading;
          setState({ status: "locating", best });
        }

        if (reading.accuracy <= GOOD_GPS_ACCURACY_M) {
          finish();
        } else if (isFirstFix) {
          timersRef.current.push(window.setTimeout(finish, REFINE_WINDOW_MS));
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          fail("denied");
        } else if (best) {
          // A later attempt failed, but an earlier fix is still valid.
          finish();
        } else if (error.code === error.TIMEOUT) {
          fail("timeout");
        } else {
          fail("unavailable");
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: FIRST_FIX_TIMEOUT_MS },
    );

    timersRef.current.push(
      window.setTimeout(() => {
        if (best === null) fail("timeout");
      }, FIRST_FIX_TIMEOUT_MS + 1000),
    );
  }, [stopWatching]);

  const reset = useCallback(() => {
    stopWatching();
    setState({ status: "idle" });
  }, [stopWatching]);

  return { state, capture, reset };
};

export default useGpsCapture;
