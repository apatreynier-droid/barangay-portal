import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  LAGAB_CENTER,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
} from "../../../Utils/Shared/mapConfig";

const DEFAULT_ZOOM = 15;
const POINT_ZOOM = 18;

type LocationPickerMapProps = {
  /** The point to show, or null for none yet. */
  point: { latitude: number; longitude: number } | null;
  /** GPS accuracy radius in metres, drawn as a circle around the point. */
  accuracy?: number | null;
  /** When set, tapping the map places (or moves) the pin there. */
  onPick?: (latitude: number, longitude: number) => void;
  label: string;
};

/**
 * Small Leaflet map for the resident's report: shows the captured GPS point
 * (with its accuracy circle) or lets the resident tap to pin the spot.
 */
const LocationPickerMap = ({
  point,
  accuracy = null,
  onPick,
  label,
}: LocationPickerMapProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const onPickRef = useRef(onPick);

  useEffect(() => {
    onPickRef.current = onPick;
  });

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      center: LAGAB_CENTER,
      zoom: DEFAULT_ZOOM,
      scrollWheelZoom: false,
    });
    map.attributionControl.setPrefix(false);
    L.tileLayer(OSM_TILE_URL, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(
      map,
    );
    map.on("click", (event: L.LeafletMouseEvent) => {
      onPickRef.current?.(event.latlng.lat, event.latlng.lng);
    });

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  const latitude = point?.latitude ?? null;
  const longitude = point?.longitude ?? null;

  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) {
      return;
    }

    layers.clearLayers();
    if (latitude === null || longitude === null) {
      return;
    }

    const center = L.latLng(latitude, longitude);
    if (accuracy !== null && accuracy > 0) {
      L.circle(center, {
        radius: accuracy,
        color: "#1f6b4a",
        weight: 1,
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(layers);
    }
    L.circleMarker(center, {
      radius: 9,
      color: "#ffffff",
      weight: 3,
      fillColor: "#1f6b4a",
      fillOpacity: 1,
      interactive: false,
    }).addTo(layers);

    map.setView(center, Math.max(map.getZoom(), POINT_ZOOM));
  }, [latitude, longitude, accuracy]);

  return (
    <div
      ref={containerRef}
      className={`pd-map${onPick ? " is-picking" : ""}`}
      role="application"
      aria-label={label}
    />
  );
};

export default LocationPickerMap;
