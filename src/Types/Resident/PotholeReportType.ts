import type {
  ApiPotholeDetection,
  PotholeDetectionStatus,
  PotholeLocationSource,
  PotholeStatus,
} from "../Admin/AdminPotholeManagementType";

/** A resident's own report (GET/POST /api/pothole-reports). */
export type ResidentPotholeReport = {
  id: number;
  report_number: string;
  purok: string | null;
  road_name: string | null;
  location_description: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  gps_accuracy_m: number | null;
  location_source: PotholeLocationSource | null;
  location_captured_at: string | null;
  /** Reverse-geocoded place name, when a lookup succeeded. */
  resolved_address: string | null;
  status: PotholeStatus;
  /** Remark of the latest status change (e.g. the reason for a rejection). */
  status_remark: string | null;
  reported_at: string;
  updated_at: string;
  detection_status: PotholeDetectionStatus;
  /** The model's real count; null unless the detection completed. */
  detection_count: number | null;
  detection_threshold: number | null;
  detections: ApiPotholeDetection[];
  has_annotated_photo: boolean;
};

/** A position the resident confirmed, ready to be sent with the report. */
export type CapturedLocation =
  | {
      source: "gps";
      latitude: number;
      longitude: number;
      /** Accuracy radius in metres reported by the device. */
      accuracy: number | null;
      /** ISO 8601 time of the GPS fix. */
      capturedAt: string;
    }
  | {
      source: "manual";
      latitude: number;
      longitude: number;
    };

export type NewPotholeReport = {
  photo: File;
  location: string;
  purok: string;
  road: string;
  notes: string;
  position: CapturedLocation | null;
};
