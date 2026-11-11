import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ImageOff, LoaderCircle, Scan, X } from "lucide-react";
import { fetchMyPotholePhoto } from "../../../Utils/Shared/api";
import {
  STATUS_DISPLAY,
  describeReportLocation,
  formatReportDateTime,
} from "../../../Utils/Resident/potholeReportDisplay";
import type { PotholePhotoKind } from "../../../Types/Admin/AdminPotholeManagementType";
import type { ResidentPotholeReport } from "../../../Types/Resident/PotholeReportType";

type PhotoState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error" };

/** One of the resident's own photos, from the authenticated endpoint. */
const ReportPhoto = ({
  reportId,
  kind,
  caption,
  alt,
}: {
  reportId: number;
  kind: PotholePhotoKind;
  caption: string;
  alt: string;
}) => {
  const [state, setState] = useState<PhotoState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ status: "loading" });

    fetchMyPotholePhoto(reportId, kind)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: "ready", url: objectUrl });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [reportId, kind]);

  return (
    <figure className="pd-result-photo">
      {state.status === "ready" ? (
        <img src={state.url} alt={alt} />
      ) : (
        <div className="pd-result-photo-state" aria-busy={state.status === "loading"}>
          {state.status === "loading" ? (
            <LoaderCircle size={22} className="pd-spin" aria-hidden="true" />
          ) : (
            <>
              <ImageOff size={22} aria-hidden="true" />
              <span>The photo could not be loaded.</span>
            </>
          )}
        </div>
      )}
      <figcaption>{caption}</figcaption>
    </figure>
  );
};

const headlineFor = (report: ResidentPotholeReport): string => {
  if (report.detection_status !== "completed") {
    return "The AI check could not be completed";
  }
  if (report.detection_count === 0) {
    return "No potholes detected in this photo";
  }
  return report.detection_count === 1
    ? "1 possible pothole detected"
    : `${report.detection_count} possible potholes detected`;
};

const explanationFor = (report: ResidentPotholeReport): string => {
  if (report.detection_status !== "completed") {
    return "Your report and photo were still saved. Barangay staff will check the photo themselves.";
  }
  if (report.detection_count === 0) {
    return "The AI can miss potholes, especially in dark or blurry photos. Your report was still sent, and barangay staff will check it.";
  }
  return "This is an automatic estimate, not a confirmed result. Barangay staff will check your report.";
};

type PotholeDetectionResultProps = {
  report: ResidentPotholeReport;
  onClose: () => void;
};

const PotholeDetectionResult = ({
  report,
  onClose,
}: PotholeDetectionResultProps) => {
  const display = STATUS_DISPLAY[report.status];
  const hasCount = report.detection_status === "completed";
  const found = (report.detection_count ?? 0) > 0;
  const hasCoordinates = report.latitude !== null && report.longitude !== null;

  return (
    <section
      className="pd-card pd-result"
      aria-labelledby="pd-result-title"
      tabIndex={-1}
    >
      <div className="pd-result-head">
        <div>
          <p className="pd-result-eyebrow">{report.report_number}</p>
          <h2 id="pd-result-title">Detection result</h2>
        </div>
        <div className="pd-result-head-side">
          <span className={`pd-status ${display.tone}`}>{display.label}</span>
          <button
            type="button"
            className="pd-btn"
            onClick={onClose}
            aria-label="Close the detection result"
          >
            <X size={15} strokeWidth={2} aria-hidden="true" />
            Close
          </button>
        </div>
      </div>

      <div
        className={`pd-result-summary${
          !hasCount ? " is-warning" : found ? " is-found" : " is-clear"
        }`}
        role="status"
      >
        {!hasCount ? (
          <AlertTriangle size={24} strokeWidth={2} aria-hidden="true" />
        ) : found ? (
          <Scan size={24} strokeWidth={2} aria-hidden="true" />
        ) : (
          <CheckCircle2 size={24} strokeWidth={2} aria-hidden="true" />
        )}
        <div>
          <strong>{headlineFor(report)}</strong>
          <span>{explanationFor(report)}</span>
        </div>
      </div>

      <div className="pd-result-photos">
        {report.has_annotated_photo && (
          <ReportPhoto
            reportId={report.id}
            kind="annotated"
            caption="Detected potholes"
            alt={`Your road photo with ${report.detection_count ?? 0} detected potholes marked by numbered boxes`}
          />
        )}
        <ReportPhoto
          reportId={report.id}
          kind="original"
          caption="Your photo"
          alt="The road photo you uploaded"
        />
      </div>

      <div className="pd-result-grid">
        {found && (
          <div>
            <h3 className="pd-result-subtitle">Confidence for each detection</h3>
            <ul className="pd-confidence-list">
              {report.detections.map((detection) => {
                const percent = Math.round(detection.confidence * 100);
                return (
                  <li key={detection.number}>
                    <span className="pd-confidence-name">
                      Pothole {detection.number}
                    </span>
                    <span className="pd-confidence-bar" aria-hidden="true">
                      <span style={{ width: `${percent}%` }} />
                    </span>
                    <span className="pd-confidence-value">{percent}%</span>
                  </li>
                );
              })}
            </ul>
            <p className="pd-hint">
              Confidence is how sure the AI is, not the size or danger of the
              pothole.
            </p>
          </div>
        )}

        <div>
          <h3 className="pd-result-subtitle">Report details</h3>
          <dl className="pd-result-details">
            <div>
              <dt>Latitude</dt>
              <dd className={hasCoordinates ? "pd-mono" : undefined}>
                {report.latitude?.toFixed(6) ?? "Not captured"}
              </dd>
            </div>
            <div>
              <dt>Longitude</dt>
              <dd className={hasCoordinates ? "pd-mono" : undefined}>
                {report.longitude?.toFixed(6) ?? "Not captured"}
              </dd>
            </div>
            <div className="pd-result-wide">
              <dt>Location source</dt>
              <dd>{describeReportLocation(report)}</dd>
            </div>
            <div className="pd-result-wide">
              <dt>Identified location</dt>
              <dd>{report.resolved_address ?? "Not available"}</dd>
            </div>
            <div className="pd-result-wide">
              <dt>Your description</dt>
              <dd>{report.location_description}</dd>
            </div>
            <div>
              <dt>Purok</dt>
              <dd>{report.purok ?? "Not specified"}</dd>
            </div>
            <div>
              <dt>Verification status</dt>
              <dd>{display.label}</dd>
            </div>
            <div className="pd-result-wide">
              <dt>Submitted</dt>
              <dd>{formatReportDateTime(report.reported_at)}</dd>
            </div>
            {report.status_remark && (
              <div className="pd-result-wide">
                <dt>Barangay remark</dt>
                <dd>{report.status_remark}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </section>
  );
};

export default PotholeDetectionResult;
