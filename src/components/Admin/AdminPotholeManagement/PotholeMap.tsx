import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PotholeReport } from "../../../Types/Admin/AdminPotholeManagementType";
import {
  POTHOLE_STATUS_META,
  displayPurok,
  formatPotholeAccuracy,
  formatPotholeDateTime,
  hasPotholeCoordinates,
} from "../../../Utils/Admin/AdminPotholeManagementLogic";
import { loadPotholePhotoUrl } from "../../../Utils/Admin/potholePhotoCache";
import {
  LAGAB_CENTER,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
} from "../../../Utils/Shared/mapConfig";

const DEFAULT_ZOOM = 14;
/** Keeps a single marker (or a tight cluster) from zooming in too far. */
const MAX_FIT_ZOOM = 16;
const LOCATE_ZOOM = 17;

type PotholeMapProps = {
  reports: PotholeReport[];
  selectedReportId?: string | null;
  /** Called when a marker's popup opens. */
  onSelect?: (reportId: string) => void;
  /** Called when a marker's popup closes. */
  onDeselect?: (reportId: string) => void;
  /** When set, the popup shows a "View Details" button. */
  onViewDetails?: (reportId: string) => void;
  /** Smaller variant used inside the details panel. */
  compact?: boolean;
};

/** A marker plus what it currently shows, to skip updates that change nothing. */
type MarkerEntry = {
  marker: L.Marker;
  report: PotholeReport;
  isSelected: boolean;
};

const buildMarkerIcon = (report: PotholeReport, isSelected: boolean) =>
  L.divIcon({
    className: "pothole-pin-wrapper",
    html: `<span class="pothole-pin pothole-pin--${report.status}${
      isSelected ? " is-selected" : ""
    }"><span class="pothole-pin-shape"></span><span class="pothole-pin-glyph">${
      POTHOLE_STATUS_META[report.status].glyph
    }</span></span>`,
    iconSize: [28, 34],
    iconAnchor: [14, 34],
    popupAnchor: [0, -32],
  });

/**
 * Built with DOM nodes and textContent rather than an HTML string, so text a
 * resident typed can never be interpreted as markup. The photo is filled in by
 * showPopupPhoto() when the popup opens, so closed popups download nothing.
 */
const buildPopupContent = (
  report: PotholeReport,
  onViewDetails?: (reportId: string) => void,
): HTMLElement => {
  const root = document.createElement("div");
  root.className = "pothole-popup";

  const append = (tag: string, className: string, text = "") => {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    root.appendChild(element);
    return element;
  };

  const image = document.createElement("img");
  image.className = "pothole-popup-image is-loading";
  image.alt = `Photo of pothole report ${report.id}`;
  image.dataset.recordId = String(report.recordId);
  root.appendChild(image);

  append("strong", "pothole-popup-id", report.id);
  append(
    "span",
    `pothole-status pothole-status--${report.status}`,
    POTHOLE_STATUS_META[report.status].label,
  );
  append(
    "p",
    "pothole-popup-line",
    [report.road, displayPurok(report.purok)].filter(Boolean).join(", "),
  );
  append("p", "pothole-popup-line", `Reported by ${report.residentName}`);
  append("p", "pothole-popup-muted", formatPotholeDateTime(report.reportedAt));
  append(
    "p",
    "pothole-popup-muted",
    report.locationSource === "manual"
      ? "Location: manual map pin (not GPS)"
      : `GPS accuracy: ${formatPotholeAccuracy(report)}`,
  );

  if (onViewDetails) {
    const button = append(
      "button",
      "pothole-button pothole-button--primary pothole-popup-button",
      "View Details",
    ) as HTMLButtonElement;
    button.type = "button";
    button.addEventListener("click", () => onViewDetails(report.id));
  }

  return root;
};

/** Loads the photo into an open popup (once; the URL is cached per report). */
const showPopupPhoto = (marker: L.Marker) => {
  const image = marker
    .getPopup()
    ?.getElement()
    ?.querySelector<HTMLImageElement>("img.pothole-popup-image");
  const recordId = Number(image?.dataset.recordId);

  if (!image || image.getAttribute("src") || !recordId) {
    return;
  }

  loadPotholePhotoUrl(recordId)
    .then((url) => {
      image.src = url;
      image.classList.remove("is-loading");
    })
    .catch(() => {
      image.classList.remove("is-loading");
      image.classList.add("is-error");
      image.alt = "The photo could not be loaded.";
    });
};

const PotholeMap = ({
  reports,
  selectedReportId = null,
  onSelect,
  onDeselect,
  onViewDetails,
  compact = false,
}: PotholeMapProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef(new Map<string, MarkerEntry>());
  const hasFittedRef = useRef(false);
  const [tilesFailed, setTilesFailed] = useState(false);

  // Marker listeners outlive individual renders, so they read the latest
  // callbacks from a ref.
  const handlersRef = useRef({ onSelect, onDeselect, onViewDetails });
  useEffect(() => {
    handlersRef.current = { onSelect, onDeselect, onViewDetails };
  });

  const mappedReports = useMemo(
    () => reports.filter(hasPotholeCoordinates),
    [reports],
  );
  // Sorted so re-sorting the table does not count as a new set of markers.
  const mappedIdsKey = useMemo(
    () =>
      mappedReports
        .map((report) => report.id)
        .sort()
        .join("|"),
    [mappedReports],
  );

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      center: LAGAB_CENTER,
      zoom: DEFAULT_ZOOM,
      // Keep the page scrolling normally until the map is deliberately used.
      scrollWheelZoom: false,
      // Removing a map mid-zoom makes Leaflet's animation timer throw, and the
      // details panel (with its map) can be closed at any moment.
      zoomAnimation: !compact,
    });
    map.attributionControl.setPrefix(false);
    map.on("focus", () => map.scrollWheelZoom.enable());
    map.on("blur", () => map.scrollWheelZoom.disable());

    L.tileLayer(OSM_TILE_URL, {
      maxZoom: 19,
      attribution: OSM_ATTRIBUTION,
    })
      .on("tileerror", () => setTilesFailed(true))
      .on("tileload", () => setTilesFailed(false))
      .addTo(map);

    // Leaflet caches its size: keep it correct when the layout changes (window
    // resize, device rotation, sidebar rail breakpoint).
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    mapRef.current = map;
    const markers = markersRef.current;

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markers.clear();
      hasFittedRef.current = false;
    };
  }, [compact]);

  // Add, update and remove markers in place, so a status change recolours its
  // marker without closing an open popup or moving the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const markers = markersRef.current;
    const nextIds = new Set(mappedReports.map((report) => report.id));

    markers.forEach((entry, id) => {
      if (!nextIds.has(id)) {
        entry.marker.remove();
        markers.delete(id);
      }
    });

    const buildPopup = (report: PotholeReport) =>
      buildPopupContent(
        report,
        handlersRef.current.onViewDetails &&
          ((id) => handlersRef.current.onViewDetails?.(id)),
      );

    mappedReports.forEach((report) => {
      const isSelected = report.id === selectedReportId;
      const title = `${report.id}: ${POTHOLE_STATUS_META[report.status].label}`;
      const existing = markers.get(report.id);

      if (existing) {
        const isNewData = existing.report !== report;

        if (isNewData || existing.isSelected !== isSelected) {
          existing.marker.setIcon(buildMarkerIcon(report, isSelected));
          // Leaflet only applies the title option to a new element.
          existing.marker.getElement()?.setAttribute("title", title);
        }

        // Only on new data: updating an open popup cancels the pan Leaflet is
        // doing to fit it in view, which would leave it cut off.
        if (isNewData) {
          existing.marker.setPopupContent(buildPopup(report));
          if (existing.marker.isPopupOpen()) {
            showPopupPhoto(existing.marker);
          }
        }

        existing.report = report;
        existing.isSelected = isSelected;
        return;
      }

      const marker = L.marker([report.latitude, report.longitude], {
        icon: buildMarkerIcon(report, isSelected),
        title,
        riseOnHover: true,
      })
        .bindPopup(buildPopup(report), { minWidth: 210, maxWidth: 240 })
        .on("popupopen", () => {
          showPopupPhoto(marker);
          handlersRef.current.onSelect?.(report.id);
        })
        .on("popupclose", () => handlersRef.current.onDeselect?.(report.id))
        .addTo(map);

      markers.set(report.id, { marker, report, isSelected });
    });
  }, [mappedReports, selectedReportId]);

  // Re-frame the map only when the set of markers changes (i.e. the filters),
  // never for a status change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const points = Array.from(markersRef.current.values()).map((entry) =>
      entry.marker.getLatLng(),
    );

    if (points.length === 0) {
      map.setView(LAGAB_CENTER, DEFAULT_ZOOM);
    } else {
      map.fitBounds(L.latLngBounds(points), {
        padding: [30, 30],
        maxZoom: MAX_FIT_ZOOM,
        // The first framing happens on load, with nothing to animate from.
        animate: hasFittedRef.current,
      });
    }

    hasFittedRef.current = true;
  }, [mappedIdsKey]);

  // A selection from outside the map (the table's "Locate" button) moves to the
  // marker. A marker that was clicked already has its popup open: leave it be.
  useEffect(() => {
    const map = mapRef.current;
    const marker = selectedReportId
      ? markersRef.current.get(selectedReportId)?.marker
      : undefined;

    if (!map || !marker || marker.isPopupOpen()) {
      return undefined;
    }

    // Open after the move: a popup opened mid-zoom cannot pan itself into view.
    const openPopup = () => marker.openPopup();
    map.once("moveend", openPopup);
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), LOCATE_ZOOM));

    return () => {
      map.off("moveend", openPopup);
    };
  }, [selectedReportId]);

  return (
    <div className={`pothole-map${compact ? " pothole-map--compact" : ""}`}>
      <div
        ref={containerRef}
        className="pothole-map-canvas"
        aria-label={
          compact ? "Pothole location map" : "Map of pothole report locations"
        }
      />

      {tilesFailed && (
        <p className="pothole-map-message pothole-map-message--top" role="status">
          Map background could not load. Check the internet connection.
        </p>
      )}

      {mappedReports.length === 0 && (
        <p className="pothole-map-message">
          {reports.length === 0
            ? "No pothole reports to show on the map."
            : "None of these reports has a captured map location."}
        </p>
      )}
    </div>
  );
};

export default PotholeMap;
