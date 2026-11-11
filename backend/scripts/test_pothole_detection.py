r"""End-to-end checks for AI pothole detection, with the real model and photos.

Runs against the backend on https://localhost:8000 (start it first with run_https.py) and needs
migration 013, the installed model and the prepared dataset:

    cd backend
    .\.venv\Scripts\python.exe ml_training\prepare_dataset.py --zip <Potholes.zip>
    .\.venv\Scripts\python.exe run_https.py
    .\.venv\Scripts\python.exe scripts\test_pothole_detection.py

The backend looks up place names for the probe coordinates unless backend/.env
has an empty ``REVERSE_GEOCODE_URL=``. (Setting it to "" in PowerShell does not
work: that deletes the variable, so the default service is used.)

Each result is compared with a separate, direct run of the model on the same
photo, so a hardcoded or sample answer could not pass. Covers: photos with
several potholes, one pothole, none, a blurry photo, invalid uploads, no GPS,
GPS metadata in the photo, access control, the private model file, a backend
with no usable model, duplicates and the separate AI and verified totals.

Everything this run creates (probe accounts, reports, photos, notifications,
activity logs) is removed at the end.
"""

from __future__ import annotations

import io
import os
import subprocess
import sys
import time
import urllib.error
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
for path in (BACKEND_DIR, BACKEND_DIR / "scripts"):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import test_pothole_reports as reports  # noqa: E402  (shared probe helpers)
from PIL import Image, ImageFilter  # noqa: E402

from app.config import settings  # noqa: E402
from app.ml import detector as detector_module  # noqa: E402
from app.ml.detector import DetectionFailed, decode_photo  # noqa: E402
from app.potholes import pothole_photos_dir, run_detection  # noqa: E402

base = reports.base
check = base.check
http = base.http
request_json = base.request_json
db_query = base.db_query
submit_report = reports.submit_report

DATASET_TEST_DIR = BACKEND_DIR / "ml_training" / "datasets" / "potholes_v1"
NO_MODEL_PORT = 8015
LATITUDE, LONGITUDE = 7.6703125, 126.0638456


def photos_with_boxes(minimum: int, maximum: int) -> list[Path]:
    """Test-split photos (never used in training) by their labelled box count."""
    found = []
    for image in sorted((DATASET_TEST_DIR / "images" / "test").iterdir()):
        label = DATASET_TEST_DIR / "labels" / "test" / f"{image.stem}.txt"
        boxes = sum(1 for line in label.read_text(encoding="utf-8").splitlines() if line.strip())
        if minimum <= boxes <= maximum:
            found.append(image)
    return found


def direct_prediction(model, data: bytes, threshold: float) -> list[float]:
    """Confidences from the model itself, not going through the portal."""
    import numpy as np

    image = decode_photo(data)
    result = model.predict(
        source=np.asarray(image)[:, :, ::-1], imgsz=640, conf=threshold, max_det=100,
        device="cpu", verbose=False,
    )[0]
    return sorted((round(float(value), 4) for value in result.boxes.conf.tolist()), reverse=True)


def jpeg_with_gps(source: bytes, latitude: tuple, longitude: tuple) -> bytes:
    """A real road photo carrying GPS metadata, as a phone camera would save it."""
    image = decode_photo(source)
    exif = Image.Exif()
    gps = exif.get_ifd(0x8825)
    gps[1], gps[2], gps[3], gps[4] = "N", latitude, "E", longitude
    output = io.BytesIO()
    image.save(output, format="JPEG", exif=exif, quality=90)
    return output.getvalue()


def blur(source: bytes) -> bytes:
    output = io.BytesIO()
    decode_photo(source).filter(ImageFilter.GaussianBlur(14)).save(output, format="JPEG", quality=85)
    return output.getvalue()


def submit_photo(token: str, data: bytes, name: str, **fields: str):
    return submit_report(
        token,
        {"location_description": f"Probe: {name}", **fields},
        (name, data, "image/jpeg"),
    )


def gps_fields(latitude: float = LATITUDE, longitude: float = LONGITUDE) -> dict[str, str]:
    return {
        "latitude": str(latitude),
        "longitude": str(longitude),
        "gps_accuracy_m": "8",
        "location_source": "gps",
    }


def run_checks() -> None:
    from ultralytics import YOLO

    status, admin = base.login(base.ADMIN_EMAIL, base.ADMIN_PASSWORD)
    check(status == 200, f"administrator signs in (got {status})")
    if status != 200:
        return
    admin_token = admin["access_token"]
    token_a = base.create_resident(admin_token, reports.RESIDENT_A_EMAIL, "Potholea")
    token_b = base.create_resident(admin_token, reports.RESIDENT_B_EMAIL, "Potholeb")
    staff_token = reports.create_staff(admin_token)
    if not (token_a and token_b and staff_token):
        return

    model = YOLO(str(settings.pothole_model_path), task="detect")
    status, summary_before = request_json("/api/admin/pothole-reports/summary", token=admin_token)

    # ---------------------------------------------------------- real detections
    print("\n1. Real detections on photos the model never trained on")
    many = photos_with_boxes(3, 6)[0]
    single = photos_with_boxes(1, 1)[0]
    clean = photos_with_boxes(0, 0)[0]
    many_bytes, single_bytes, clean_bytes = many.read_bytes(), single.read_bytes(), clean.read_bytes()

    status, many_report = submit_photo(token_a, many_bytes, many.name, purok="Purok - 7", **gps_fields())
    check(status == 201, f"photo with several potholes accepted (got {status}: {many_report})")
    if status != 201:
        return
    check(many_report["detection_status"] == "completed", "detection completed")
    threshold = many_report["detection_threshold"]
    check(threshold is not None and 0 < threshold < 1, f"threshold is recorded ({threshold})")
    check(many_report["status"] == "pending", "an AI detection does not verify the report")

    results = [("several potholes", many_bytes, many_report)]
    status, single_report = submit_photo(token_a, single_bytes, single.name, purok="Purok - 7")
    check(status == 201, f"photo with one pothole accepted (got {status})")
    results.append(("one pothole", single_bytes, single_report))
    status, clean_report = submit_photo(token_a, clean_bytes, clean.name)
    check(status == 201, f"undamaged road photo accepted (got {status})")
    results.append(("no potholes", clean_bytes, clean_report))
    blurry_bytes = blur(many_bytes)
    status, blurry_report = submit_photo(token_a, blurry_bytes, "blurry.jpg")
    check(status == 201, f"blurry photo is handled without an error (got {status})")
    results.append(("blurry", blurry_bytes, blurry_report))

    for label, data, report in results:
        expected = direct_prediction(model, data, threshold)
        got = sorted((item["confidence"] for item in report["detections"]), reverse=True)
        check(
            report["detection_count"] == len(expected),
            f"{label}: count {report['detection_count']} matches a direct model run ({len(expected)})",
        )
        check(
            len(got) == len(expected) and all(abs(a - b) < 0.001 for a, b in zip(got, expected)),
            f"{label}: confidence scores match a direct model run {got}",
        )
    print(f"  (labelled boxes vs counted: several={many.name} -> {many_report['detection_count']}, "
          f"one={single.name} -> {single_report['detection_count']}, "
          f"clean={clean.name} -> {clean_report['detection_count']}, "
          f"blurry -> {blurry_report['detection_count']})")
    check(
        many_report["detection_count"] >= 2,
        f"a photo with several potholes gets several detections ({many_report['detection_count']})",
    )
    check(clean_report["detection_count"] == 0, "an undamaged road photo gets no detections")
    check(not clean_report["has_annotated_photo"], "no detections means no annotated photo")

    # --------------------------------------------------------------- storage
    print("\n2. Saved in MySQL and on disk")
    row = db_query("SELECT * FROM pothole_reports WHERE id = %s", (many_report["id"],))[0]
    rows = db_query(
        "SELECT * FROM pothole_detections WHERE report_id = %s ORDER BY detection_number",
        (many_report["id"],),
    )
    check(len(rows) == row["detection_count"] == many_report["detection_count"],
          "one pothole_detections row per detection")
    check(all(r["x_max"] > r["x_min"] and r["y_max"] > r["y_min"] for r in rows),
          "every detection has a real bounding box")
    check(float(row["latitude"]) == LATITUDE and float(row["longitude"]) == LONGITUDE,
          "the device's exact coordinates are stored")
    check(float(row["gps_accuracy_m"]) == 8.0 and row["purok"] == "Purok - 7",
          "GPS accuracy and Purok are stored")
    original_path = pothole_photos_dir() / row["photo_stored_filename"]
    check(original_path.read_bytes() == many_bytes, "the original photo is stored byte for byte")
    annotated_path = pothole_photos_dir() / row["annotated_stored_filename"]
    check(annotated_path.is_file(), "the annotated photo is stored separately")
    with Image.open(annotated_path) as annotated, Image.open(io.BytesIO(many_bytes)) as source:
        check(annotated.format == "JPEG" and not annotated.getexif(),
              "the annotated copy is a JPEG without metadata")
        check(annotated.size[0] / annotated.size[1] - source.size[0] / source.size[1] < 0.02,
              "the annotated copy keeps the photo's proportions")
    check(row["verified_defect_count"] is None, "the AI count is not stored as a verified count")

    # ------------------------------------------------------------- bad uploads
    print("\n3. Invalid uploads and missing location")
    files_mid, count_mid = reports.stored_photos(), reports.report_count()
    for label, content, name, kind, expected in (
        ("truncated JPEG", many_bytes[:600], "cut.jpg", "image/jpeg", 422),
        ("JPEG signature with junk", b"\xff\xd8\xff\xe0" + b"junk" * 500, "junk.jpg", "image/jpeg", 422),
        ("text file named .jpg", b"not an image at all", "note.jpg", "image/jpeg", 415),
    ):
        status, _ = submit_report(token_a, {"location_description": "x"}, (name, content, kind))
        check(status == expected, f"{label} -> {expected} (got {status})")
    check(reports.stored_photos() == files_mid and reports.report_count() == count_mid,
          "rejected uploads left no files or rows")
    check(single_report["latitude"] is None and single_report["location_source"] is None,
          "without GPS no coordinates are invented")
    check(single_report["purok"] == "Purok - 7", "the Purok chosen instead of GPS is kept")

    print("\n4. GPS metadata inside a photo")
    tagged = jpeg_with_gps(single_bytes, (7, 40, 13.0), (126, 3, 50.0))
    status, tagged_report = submit_photo(token_b, tagged, "camera.jpg")
    check(status == 201 and tagged_report["location_source"] == "photo",
          f"coordinates are read from the photo's metadata ({tagged_report.get('location_source')})")
    check(abs(tagged_report["latitude"] - 7.6702778) < 0.0001
          and abs(tagged_report["longitude"] - 126.0638889) < 0.0001,
          "metadata coordinates are converted correctly")
    status, device_report = submit_photo(token_b, tagged, "camera2.jpg", **gps_fields(7.7, 126.1))
    check(status == 201 and device_report["location_source"] == "gps" and device_report["latitude"] == 7.7,
          "the device's GPS takes priority over the photo's metadata")
    no_gps = jpeg_with_gps(single_bytes, (0, 0, 0), (0, 0, 0))
    status, zero_report = submit_photo(token_b, no_gps, "nofix.jpg")
    check(status == 201 and zero_report["latitude"] is None,
          "0,0 metadata (camera had no fix) is not treated as a location")
    # Coordinates in Kerala, India: a real photo taken far from the barangay.
    elsewhere = jpeg_with_gps(single_bytes, (10, 13, 54.0), (76, 24, 31.0))
    status, far_photo_report = submit_photo(token_b, elsewhere, "elsewhere.jpg", purok="Purok - 2")
    check(status == 201 and far_photo_report["latitude"] is None and far_photo_report["location_source"] is None,
          "metadata placing the photo far from the barangay is ignored")
    status, far_device_report = submit_photo(token_b, elsewhere, "elsewhere2.jpg", **gps_fields(LATITUDE, LONGITUDE))
    check(status == 201 and far_device_report["location_source"] == "gps",
          "the device's GPS is still used when the photo's metadata is far away")

    # ---------------------------------------------------------- access control
    print("\n5. Access control")
    own = f"/api/pothole-reports/{many_report['id']}"
    admin_path = f"/api/admin/pothole-reports/{many_report['id']}"
    status, _, body = http(f"{own}/photo", token=token_a)
    check(status == 200 and body == many_bytes, "a resident gets their own original photo")
    status, _, body = http(f"{own}/annotated-photo", token=token_a)
    check(status == 200 and body == annotated_path.read_bytes(), "a resident gets their own annotated photo")
    for path in (f"{own}/photo", f"{own}/annotated-photo"):
        status, _, _ = http(path, token=token_b)
        check(status == 404, f"another resident gets 404 on {path} (got {status})")
        status, _, _ = http(path)
        check(status == 401, f"anonymous gets 401 on {path} (got {status})")
    status, _, _ = http(f"{admin_path}/annotated-photo", token=token_a)
    check(status == 403, f"a resident cannot use the admin photo route (got {status})")
    status, headers, body = http(f"{admin_path}/annotated-photo", token=admin_token)
    check(status == 200 and headers.get("content-type") == "image/jpeg" and body,
          "an administrator gets the annotated photo")
    status, _, _ = http(f"/api/admin/pothole-reports/{clean_report['id']}/annotated-photo", token=admin_token)
    check(status == 404, f"a report with no detections has no annotated photo (got {status})")

    print("\n6. The model file stays private")
    for path in ("/app/ml/weights/best.pt", "/ml/weights/best.pt", "/best.pt", "/static/best.pt", "/uploads/best.pt"):
        status, _, _ = http(path)
        check(status == 404, f"{path} is not served (got {status})")
    project = BACKEND_DIR.parent
    public = [p for folder in ("public", "dist", "src") for p in (project / folder).rglob("*.pt")]
    check(not public, f"no model file in the frontend folders ({public})")

    # --------------------------------------------------------- admin workflow
    print("\n7. Admin list, duplicates and separate totals")
    status, listed = request_json("/api/admin/pothole-reports", token=admin_token)
    entry = next(item for item in listed if item["id"] == many_report["id"])
    check(entry["detection_count"] == many_report["detection_count"] and entry["detections"],
          "the admin list includes the count and each confidence")
    check(entry["latitude"] == LATITUDE, "the admin list has the coordinates for the map")

    status, second = submit_photo(token_b, many_bytes, "same-pothole.jpg", purok="Purok - 7", **gps_fields(LATITUDE + 0.00005, LONGITUDE))
    check(status == 201, f"a second photo of the same place is accepted (got {status})")
    status, far = submit_photo(token_b, many_bytes, "far.jpg", purok="Purok - 3", **gps_fields(LATITUDE + 0.01, LONGITUDE))
    check(status == 201, f"a photo from elsewhere is accepted (got {status})")
    status, detail = request_json(f"/api/admin/pothole-reports/{second['id']}", token=admin_token)
    nearby = {item["id"]: item for item in detail["nearby_reports"]}
    check(many_report["id"] in nearby and nearby[many_report["id"]]["distance_m"] < 10,
          f"the close report is suggested as a possible duplicate ({list(nearby)})")
    check(far["id"] not in nearby, "a report 1 km away is not suggested")
    check(detail["duplicate_of_report_id"] is None, "nothing is merged automatically")

    duplicate_path = f"/api/admin/pothole-reports/{second['id']}/duplicate"
    status, _ = request_json(duplicate_path, method="PUT", token=staff_token, body={"duplicate_of_report_id": many_report["id"]})
    check(status == 403, f"staff cannot mark duplicates (got {status})")
    status, _ = request_json(duplicate_path, method="PUT", token=admin_token, body={"duplicate_of_report_id": second["id"]})
    check(status == 422, f"a report cannot duplicate itself (got {status})")
    status, marked = request_json(duplicate_path, method="PUT", token=admin_token, body={"duplicate_of_report_id": many_report["id"]})
    check(status == 200 and marked["duplicate_of_report_number"] == many_report["report_number"],
          f"an administrator marks the duplicate (got {status})")
    status, _ = request_json(f"/api/admin/pothole-reports/{far['id']}/duplicate", method="PUT", token=admin_token, body={"duplicate_of_report_id": second["id"]})
    check(status == 409, f"duplicates never form chains (got {status})")

    status_path = f"/api/admin/pothole-reports/{many_report['id']}/status"
    status, _ = request_json(status_path, method="PATCH", token=admin_token, body={"status": "verified", "verified_defect_count": 0})
    check(status == 422, f"a confirmed count below 1 is refused (got {status})")
    status, verified = request_json(status_path, method="PATCH", token=admin_token, body={"status": "verified", "verified_defect_count": 2})
    check(status == 200 and verified["verified_defect_count"] == 2,
          f"the administrator's own count is saved (got {status})")
    check(verified["detection_count"] == many_report["detection_count"],
          "verifying does not change what the AI recorded")
    status, verified_duplicate = request_json(
        f"/api/admin/pothole-reports/{second['id']}/status", method="PATCH", token=admin_token,
        body={"status": "verified", "verified_defect_count": 5},
    )
    check(status == 200 and verified_duplicate["verified_defect_count"] is None,
          "a verified duplicate confirms no new defect")

    status, summary = request_json("/api/admin/pothole-reports/summary", token=admin_token)
    added_ai = sum(
        (report["detection_count"] or 0)
        for report in (many_report, single_report, clean_report, blurry_report, tagged_report,
                       device_report, zero_report, far_photo_report, far_device_report, second, far)
    )
    check(summary["total_detected_potholes"] == summary_before["total_detected_potholes"] + added_ai,
          f"AI total counts every photo, duplicates included (+{added_ai})")
    check(summary["verified_unique_defects"] == summary_before["verified_unique_defects"] + 2,
          "verified total counts the unique defects only (+2, not +7)")
    purok7 = next(item for item in summary["by_purok"] if item["purok"] == "Purok - 7")
    check(purok7["verified_defects"] >= 2 and purok7["detected_potholes"] >= many_report["detection_count"],
          "the per-Purok totals are filled in")
    check("Purok - 7" in summary["top_puroks"] or summary["top_purok_detected"] > purok7["detected_potholes"],
          f"the Purok with the most detections is reported ({summary['top_puroks']})")

    status, _ = request_json(f"/api/admin/pothole-reports/{many_report['id']}/detection", method="POST", token=admin_token)
    check(status == 409, f"a completed detection is never replaced (got {status})")

    # ----------------------------------------------------------- no usable model
    print("\n8. When the model is unavailable or fails, nothing is made up")
    original_detect = detector_module.detector.detect

    def failing_detect(_image):
        raise DetectionFailed("simulated failure")

    detector_module.detector.detect = failing_detect
    try:
        check(run_detection(decode_photo(single_bytes)) == ("failed", None),
              "a processing failure gives no result, only the status 'failed'")
    finally:
        detector_module.detector.detect = original_detect

    process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(NO_MODEL_PORT), "--log-level", "warning"],
        cwd=BACKEND_DIR,
        env={
            **os.environ,
            "POTHOLE_MODEL_PATH": str(BACKEND_DIR / "no-such-model.pt"),
            "REGISTRATION_EMAIL_WORKER_INTERVAL_SECONDS": "0",
            "REVERSE_GEOCODE_URL": "",
        },
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    no_model_url = f"http://127.0.0.1:{NO_MODEL_PORT}"
    try:
        for _ in range(120):
            try:
                if http("/api/health", base_url=no_model_url)[0] == 200:
                    break
            except (urllib.error.URLError, OSError):
                pass
            time.sleep(0.5)

        original_http = reports.http
        reports.http = lambda path, **kwargs: original_http(path, base_url=no_model_url, **kwargs)
        try:
            status, unrun = submit_photo(token_a, single_bytes, "no-model.jpg")
        finally:
            reports.http = original_http
    finally:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()

    check(status == 201, f"the report is still saved without a model (got {status})")
    if status == 201:
        check(unrun["detection_status"] == "not_run" and unrun["detection_count"] is None,
              "without a model there is no count, not a zero")
        check(not unrun["detections"] and not unrun["has_annotated_photo"], "and no fabricated detections")
        retry = f"/api/admin/pothole-reports/{unrun['id']}/detection"
        status, _ = request_json(retry, method="POST", token=staff_token)
        check(status == 403, f"staff cannot re-run detection (got {status})")
        status, retried = request_json(retry, method="POST", token=admin_token)
        check(status == 200 and retried["detection_status"] == "completed",
              f"an administrator re-runs it once a model is available (got {status})")
        check(retried["detection_count"] == single_report["detection_count"],
              "the re-run gives the same real result as the first photo")


def main() -> None:
    print("Pothole detection checks")
    log_watermark = base.table_watermark("activity_logs")
    notification_watermark = base.table_watermark("notifications")
    reports.remove_probe_accounts()
    files_before = reports.stored_photos()
    reports_before = reports.report_count()

    try:
        run_checks()
    finally:
        reports.remove_probe_accounts()
        base.remove_run_rows(log_watermark, notification_watermark)
        check(reports.stored_photos() == files_before, "cleanup left no probe photos on disk")
        check(reports.report_count() == reports_before, "cleanup left no probe reports in MySQL")

    print()
    if base.failures:
        print(f"{len(base.failures)} check(s) FAILED:")
        for failure in base.failures:
            print(f"  - {failure}")
        sys.exit(1)
    print("All pothole detection checks passed.")


if __name__ == "__main__":
    main()
