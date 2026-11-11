r"""End-to-end checks for resident pothole reports and Admin Pothole Management.

Runs against the backend on https://localhost:8000 (start it first with run_https.py) and the
configured MySQL database, after migration 012:

    cd backend
    .\.venv\Scripts\Activate.ps1
    python scripts\apply_pothole_reports_migration.py
    python scripts\test_pothole_reports.py

Covers: residents submit reports (device GPS, manual map pin, no location)
from different Puroks -> rows, coordinates and the original photo bytes are
stored -> the administrator lists, filters, opens and downloads them -> the
statistics and Purok summary are counted from the database -> status changes
follow the workflow and the role rules (Staff cannot verify/reject) -> the
resident sees the new status and reason -> residents never see other
residents' reports or the admin endpoints -> invalid submissions keep nothing
-> a brand-new backend process still serves the photo (persistence).

Everything this run creates (probe accounts, their reports, photo files,
notifications, activity logs) is removed at the end.
"""

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import time
import urllib.error
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
for path in (BACKEND_DIR, BACKEND_DIR / "scripts"):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import test_request_attachments as base  # noqa: E402  (shared HTTP/DB helpers)
from PIL import Image  # noqa: E402

from app.attachments import STORED_FILENAME_PATTERN  # noqa: E402
from app.config import settings  # noqa: E402
from app.database import create_connection  # noqa: E402
from app.potholes import pothole_photos_dir  # noqa: E402

check = base.check
http = base.http
request_json = base.request_json
db_query = base.db_query

RESIDENT_A_EMAIL = "pothole-probe-a@example.com"
RESIDENT_B_EMAIL = "pothole-probe-b@example.com"
STAFF_EMAIL = "pothole-probe-staff@example.com"
PROBE_EMAILS = (RESIDENT_A_EMAIL, RESIDENT_B_EMAIL, STAFF_EMAIL)
STAFF_PASSWORD = "ProbeStaff123!"
FRESH_PROCESS_PORT = 8012



def _real_jpeg_with_metadata() -> bytes:
    """A decodable JPEG with metadata: the stored copy must stay byte-identical."""
    exif = Image.Exif()
    exif[0x010F] = "probe-camera"
    output = io.BytesIO()
    Image.new("RGB", (64, 48), (120, 120, 120)).save(output, format="JPEG", exif=exif)
    return output.getvalue()


# The stored copy must be byte-for-byte identical (no re-encoding or stripping).
JPEG_WITH_EXIF = _real_jpeg_with_metadata()


def submit_report(
    token: str | None,
    fields: dict[str, str],
    photo: tuple[str, bytes, str] | None,
) -> tuple[int, Any]:
    """POST /api/pothole-reports as multipart/form-data."""
    boundary = uuid.uuid4().hex
    parts: list[bytes] = [
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'
            f"{value}\r\n"
        ).encode("utf-8")
        for name, value in fields.items()
    ]
    if photo is not None:
        filename, content, content_type = photo
        parts.append(
            (
                f"--{boundary}\r\nContent-Disposition: form-data; "
                f'name="photo"; filename="{filename}"\r\n'
                f"Content-Type: {content_type}\r\n\r\n"
            ).encode("utf-8")
            + content
            + b"\r\n"
        )
    parts.append(f"--{boundary}--\r\n".encode("utf-8"))

    status, _, raw = http(
        "/api/pothole-reports",
        method="POST",
        data=b"".join(parts),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        token=token,
    )
    try:
        return status, json.loads(raw) if raw else None
    except json.JSONDecodeError:
        return status, raw.decode("utf-8", "replace")


def stored_photos() -> set[str]:
    return {path.name for path in pothole_photos_dir().iterdir() if path.is_file()}


def report_count() -> int:
    return int(db_query("SELECT COUNT(*) AS v FROM pothole_reports")[0]["v"])


def remove_probe_accounts() -> None:
    """Delete probe photo files first (rows only cascade), then the accounts."""
    placeholders = ", ".join(["%s"] * len(PROBE_EMAILS))
    rows = db_query(
        f"""
        SELECT pothole_reports.photo_stored_filename AS stored_name,
               pothole_reports.annotated_stored_filename AS annotated_name
        FROM pothole_reports
        JOIN users ON users.id = pothole_reports.user_id
        WHERE users.email IN ({placeholders})
        """,
        PROBE_EMAILS,
    )
    for row in rows:
        for name in (row["stored_name"], row["annotated_name"]):
            if name and STORED_FILENAME_PATTERN.fullmatch(name):
                (pothole_photos_dir() / name).unlink(missing_ok=True)

    connection = create_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(f"DELETE FROM users WHERE email IN ({placeholders})", PROBE_EMAILS)
        connection.commit()
        cursor.close()
    finally:
        connection.close()


def create_staff(admin_token: str) -> str | None:
    status, _ = request_json(
        "/api/admin/staff",
        method="POST",
        token=admin_token,
        body={
            "first_name": "Pothole",
            "last_name": "Staffprobe",
            "email": STAFF_EMAIL,
            "password": STAFF_PASSWORD,
            "role": "staff",
            "account_status": "active",
        },
    )
    check(status == 201, f"administrator creates a probe staff account (got {status})")
    status, auth = base.login(STAFF_EMAIL, STAFF_PASSWORD)
    check(status == 200, f"probe staff signs in (got {status})")
    return auth["access_token"] if status == 200 else None


def fetch_photo_from_fresh_process(admin_token: str, report_id: int) -> tuple[int, bytes]:
    """Start a brand-new backend process and fetch the photo from it."""
    process = subprocess.Popen(
        [
            sys.executable, "-m", "uvicorn", "app.main:app",
            "--port", str(FRESH_PROCESS_PORT), "--log-level", "warning",
        ],
        cwd=BACKEND_DIR,
        env={**os.environ, "REGISTRATION_EMAIL_WORKER_INTERVAL_SECONDS": "0"},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    base_url = f"http://127.0.0.1:{FRESH_PROCESS_PORT}"
    try:
        for _ in range(60):
            try:
                status, _, _ = http("/api/health", base_url=base_url)
                if status == 200:
                    break
            except urllib.error.URLError:
                pass
            time.sleep(0.5)
        status, _, body = http(
            f"/api/admin/pothole-reports/{report_id}/photo",
            token=admin_token,
            base_url=base_url,
        )
        return status, body
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()


# ----------------------------------------------------------------------- main


def main() -> None:
    print("Pothole report checks")
    log_watermark = base.table_watermark("activity_logs")
    notification_watermark = base.table_watermark("notifications")
    remove_probe_accounts()  # leftovers from an interrupted earlier run
    files_before = stored_photos()
    reports_before = report_count()

    try:
        run_checks()
    finally:
        remove_probe_accounts()
        base.remove_run_rows(log_watermark, notification_watermark)
        check(stored_photos() == files_before, "cleanup left no probe photos on disk")
        check(report_count() == reports_before, "cleanup left no probe reports in MySQL")

    print()
    if base.failures:
        print(f"{len(base.failures)} check(s) FAILED:")
        for failure in base.failures:
            print(f"  - {failure}")
        sys.exit(1)
    print("All pothole report checks passed.")


def run_checks() -> None:
    status, admin = base.login(base.ADMIN_EMAIL, base.ADMIN_PASSWORD)
    check(status == 200, f"administrator signs in (got {status})")
    if status != 200:
        return
    admin_token = admin["access_token"]

    token_a = base.create_resident(admin_token, RESIDENT_A_EMAIL, "Potholea")
    token_b = base.create_resident(admin_token, RESIDENT_B_EMAIL, "Potholeb")
    staff_token = create_staff(admin_token)
    if not (token_a and token_b and staff_token):
        return

    status, summary_before = request_json(
        "/api/admin/pothole-reports/summary", token=admin_token
    )
    check(status == 200, f"summary loads before the run (got {status})")

    # ------------------------------------------------------------ submissions
    print("\n1. Residents submit reports")
    png = base.make_png()
    captured_at = (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat()
    status, gps_report = submit_report(
        token_a,
        {
            "location_description": "In front of the covered court",
            "purok": "Purok - 2",
            "road_name": "Covered Court Road",
            "notes": "Deep hole on the right lane.\nGets worse when it rains.",
            "latitude": "7.6703125",
            "longitude": "126.0638456",
            "gps_accuracy_m": "8.4",
            "location_source": "gps",
            "location_captured_at": captured_at,
        },
        ("road photo.png", png, "image/png"),
    )
    check(status == 201, f"GPS report is accepted (got {status}: {gps_report})")
    if status != 201:
        return
    check(gps_report["report_number"].startswith("PH-"), "report gets a PH- number")
    check(gps_report["status"] == "pending", "new report is pending")
    check(gps_report["location_source"] == "gps", "report is marked as GPS")

    status, manual_report = submit_report(
        token_a,
        {
            "location_description": "Corner near the market entrance",
            "purok": "Purok - 5",
            "latitude": "7.6722",
            "longitude": "126.0662",
            "gps_accuracy_m": "5",  # must be ignored for a manual pin
            "location_source": "manual",
        },
        ("IMG_0042.JPG", JPEG_WITH_EXIF, "image/jpeg"),
    )
    check(status == 201, f"manual-pin report is accepted (got {status})")
    check(
        manual_report["location_source"] == "manual"
        and manual_report["gps_accuracy_m"] is None,
        "manual pin is stored as manual, without a GPS accuracy",
    )

    status, no_location_report = submit_report(
        token_b,
        {"location_description": "Somewhere along the national highway"},
        ("highway.png", png, "image/png"),
    )
    check(status == 201, f"report without coordinates is accepted (got {status})")
    check(
        no_location_report["latitude"] is None
        and no_location_report["location_source"] is None,
        "a report without GPS is never given coordinates",
    )

    # ------------------------------------------------------- stored in MySQL
    print("\n2. Stored in MySQL and on disk")
    row = db_query(
        "SELECT * FROM pothole_reports WHERE id = %s", (gps_report["id"],)
    )[0]
    check(
        float(row["latitude"]) == 7.6703125 and float(row["longitude"]) == 126.0638456,
        f"exact coordinates are stored ({row['latitude']}, {row['longitude']})",
    )
    check(float(row["gps_accuracy_m"]) == 8.4, "GPS accuracy is stored")
    check(row["location_captured_at"] is not None, "GPS capture time is stored")
    check(row["purok"] == "Purok - 2" and row["road_name"] == "Covered Court Road",
          "Purok and road are stored")
    user_a = db_query("SELECT id FROM users WHERE email = %s", (RESIDENT_A_EMAIL,))[0]["id"]
    check(row["user_id"] == user_a, "report is linked to the submitting resident")
    check(row["photo_original_filename"] == "road photo.png", "original filename kept")
    photo_path = pothole_photos_dir() / row["photo_stored_filename"]
    check(photo_path.is_file(), "photo file exists in persistent storage")
    check(photo_path.read_bytes() == png, "stored photo is byte-identical to the upload")
    manual_row = db_query(
        "SELECT photo_stored_filename FROM pothole_reports WHERE id = %s",
        (manual_report["id"],),
    )[0]
    check(
        (pothole_photos_dir() / manual_row["photo_stored_filename"]).read_bytes()
        == JPEG_WITH_EXIF,
        "JPEG with metadata is stored unchanged (the original is never re-encoded)",
    )

    # ----------------------------------------------------------- validation
    print("\n3. Invalid submissions keep nothing")
    files_mid = stored_photos()
    count_mid = report_count()
    cases = [
        ("missing photo", {"location_description": "x"}, None, 422),
        ("text file as photo", {"location_description": "x"}, ("a.png", b"hello", "image/png"), 415),
        ("latitude without longitude", {"location_description": "x", "latitude": "7.6", "location_source": "gps"}, ("a.png", png, "image/png"), 422),
        ("coordinates without source", {"location_description": "x", "latitude": "7.6", "longitude": "126.0"}, ("a.png", png, "image/png"), 422),
        ("latitude out of range", {"location_description": "x", "latitude": "97", "longitude": "126.0", "location_source": "gps"}, ("a.png", png, "image/png"), 422),
        ("0,0 null island", {"location_description": "x", "latitude": "0", "longitude": "0", "location_source": "gps"}, ("a.png", png, "image/png"), 422),
        ("unknown Purok", {"location_description": "x", "purok": "Purok - 9"}, ("a.png", png, "image/png"), 422),
        ("blank location", {"location_description": "   "}, ("a.png", png, "image/png"), 422),
        ("photo over 10 MB", {"location_description": "x"}, ("big.png", b"\x89PNG\r\n\x1a\n" + b"\0" * (10 * 1024 * 1024), "image/png"), 413),
    ]
    for label, fields, photo, expected in cases:
        status, _ = submit_report(token_a, fields, photo)
        check(status == expected, f"{label} -> {expected} (got {status})")
    check(stored_photos() == files_mid, "rejected submissions left no photo files")
    check(report_count() == count_mid, "rejected submissions left no rows")

    # --------------------------------------------------------------- access
    print("\n4. Access control")
    status, _ = submit_report(
        admin_token, {"location_description": "x"}, ("a.png", png, "image/png")
    )
    check(status == 403, f"an admin account cannot file resident reports (got {status})")
    status, mine_b = request_json("/api/pothole-reports", token=token_b)
    check(
        status == 200 and [r["id"] for r in mine_b] == [no_location_report["id"]],
        "resident B only sees their own report",
    )
    for path in (
        "/api/admin/pothole-reports",
        "/api/admin/pothole-reports/summary",
        f"/api/admin/pothole-reports/{gps_report['id']}",
        f"/api/admin/pothole-reports/{gps_report['id']}/photo",
    ):
        status, _ = request_json(path, token=token_b)
        check(status == 403, f"resident gets 403 on {path} (got {status})")
    status, _ = request_json("/api/admin/pothole-reports")
    check(status == 401, f"anonymous request gets 401 (got {status})")

    # ------------------------------------------------------------ admin list
    print("\n5. Admin list, filters and details")
    probe_ids = {gps_report["id"], manual_report["id"], no_location_report["id"]}
    status, listed = request_json("/api/admin/pothole-reports", token=admin_token)
    check(status == 200, f"admin list loads (got {status})")
    by_id = {entry["id"]: entry for entry in listed}
    check(probe_ids <= by_id.keys(), "all new reports appear automatically")
    listed_gps = by_id[gps_report["id"]]
    check(listed_gps["resident_name"] == "Attachment Potholea", "resident name is shown")
    check(
        listed_gps["latitude"] == 7.6703125 and listed_gps["gps_accuracy_m"] == 8.4,
        "admin sees the exact GPS coordinates and accuracy",
    )
    check(listed_gps["photo"]["original_filename"] == "road photo.png", "photo metadata listed")

    def ids_for(query: str) -> set[int]:
        status, data = request_json(f"/api/admin/pothole-reports?{query}", token=admin_token)
        check(status == 200, f"filter {query} loads (got {status})")
        return {entry["id"] for entry in data} & probe_ids if status == 200 else set()

    check(ids_for("purok=Purok%20-%202") == {gps_report["id"]}, "filter by Purok")
    check(ids_for("purok=unspecified") == {no_location_report["id"]}, "filter: no Purok")
    check(ids_for("search=Potholeb") == {no_location_report["id"]}, "search by resident name")
    check(ids_for("search=covered%20court") == {gps_report["id"]}, "search by road/location")
    check(ids_for("status=pending") == probe_ids, "filter by status")
    today = datetime.now(timezone(timedelta(hours=8))).date()
    check(ids_for(f"date_from={today}&date_to={today}") == probe_ids, "filter by date (today)")
    check(ids_for(f"date_to={today - timedelta(days=1)}") == set(), "filter by date (yesterday)")

    status, detail = request_json(
        f"/api/admin/pothole-reports/{gps_report['id']}", token=admin_token
    )
    check(status == 200, f"report details load (got {status})")
    check(
        len(detail["history"]) == 1 and detail["history"][0]["new_status"] == "pending",
        "history starts with the submission",
    )
    check(detail["notes"].endswith("Gets worse when it rains."), "notes are kept")

    status, headers, body = http(
        f"/api/admin/pothole-reports/{gps_report['id']}/photo", token=admin_token
    )
    check(status == 200 and body == png, "admin receives the exact photo")
    check(headers.get("content-type") == "image/png", "photo content type")
    status, headers, _ = http(
        f"/api/admin/pothole-reports/{gps_report['id']}/photo?download=true",
        token=admin_token,
    )
    check(
        status == 200
        and headers.get("content-disposition", "").startswith("attachment;")
        and "road%20photo.png" in headers.get("content-disposition", ""),
        "download keeps the original filename",
    )

    # -------------------------------------------------------------- summary
    print("\n6. Statistics from the database")
    status, summary = request_json("/api/admin/pothole-reports/summary", token=admin_token)
    counts, before = summary["status_counts"], summary_before["status_counts"]
    check(counts["total"] == before["total"] + 3, "total counts the new reports")
    check(counts["pending"] == before["pending"] + 3, "pending counts the new reports")
    purok = {entry["purok"]: entry["count"] for entry in summary["by_purok"]}
    purok_before = {entry["purok"]: entry["count"] for entry in summary_before["by_purok"]}
    check(
        list(purok) == [f"Purok - {n}" for n in range(1, 8)],
        "summary lists exactly Purok - 1 to Purok - 7",
    )
    check(purok["Purok - 2"] == purok_before["Purok - 2"] + 1, "Purok - 2 count")
    check(purok["Purok - 5"] == purok_before["Purok - 5"] + 1, "Purok - 5 count")
    check(
        summary["unspecified_purok"] == summary_before["unspecified_purok"] + 1,
        "reports without a Purok are counted separately",
    )
    check(
        summary["with_coordinates"] == summary_before["with_coordinates"] + 2,
        "only reports with real coordinates are mappable",
    )

    # ------------------------------------------------------- status workflow
    print("\n7. Status changes")
    status_path = f"/api/admin/pothole-reports/{gps_report['id']}/status"
    status, _ = request_json(status_path, method="PATCH", token=admin_token, body={"status": "resolved"})
    check(status == 409, f"pending -> resolved is refused (got {status})")
    status, _ = request_json(status_path, method="PATCH", token=staff_token, body={"status": "verified"})
    check(status == 403, f"staff cannot verify (got {status})")
    status, _ = request_json(status_path, method="PATCH", token=token_a, body={"status": "verified"})
    check(status == 403, f"resident cannot change a status (got {status})")
    status, updated = request_json(
        status_path, method="PATCH", token=admin_token,
        body={"status": "verified", "remark": "Inspected on site."},
    )
    check(status == 200 and updated["status"] == "verified", f"admin verifies (got {status})")
    status, updated = request_json(
        status_path, method="PATCH", token=staff_token, body={"status": "under_maintenance"}
    )
    check(
        status == 200 and updated["status"] == "under_maintenance",
        f"staff marks under maintenance (got {status})",
    )
    status, updated = request_json(
        status_path, method="PATCH", token=staff_token, body={"status": "resolved"}
    )
    check(status == 200 and updated["status"] == "resolved", f"staff resolves (got {status})")
    check(
        [entry["new_status"] for entry in updated["history"]]
        == ["pending", "verified", "under_maintenance", "resolved"],
        "every status change is in the history",
    )

    reject_path = f"/api/admin/pothole-reports/{manual_report['id']}/status"
    status, _ = request_json(reject_path, method="PATCH", token=admin_token, body={"status": "rejected"})
    check(status == 422, f"rejecting needs a reason (got {status})")
    status, _ = request_json(
        reject_path, method="PATCH", token=admin_token,
        body={"status": "rejected", "remark": "Duplicate of an earlier report."},
    )
    check(status == 200, f"admin rejects with a reason (got {status})")

    status, remarked = request_json(
        f"/api/admin/pothole-reports/{no_location_report['id']}/remarks",
        method="POST", token=staff_token, body={"remark": "Need the exact spot."},
    )
    check(
        status == 201 and remarked["history"][-1]["remark"] == "Need the exact spot."
        and remarked["history"][-1]["changed_by_role"] == "staff",
        f"staff adds a remark (got {status})",
    )

    status, summary_after = request_json("/api/admin/pothole-reports/summary", token=admin_token)
    after = summary_after["status_counts"]
    check(after["pending"] == before["pending"] + 1, "statistics: pending updated")
    check(after["resolved"] == before["resolved"] + 1, "statistics: resolved updated")
    check(after["rejected"] == before["rejected"] + 1, "statistics: rejected updated")
    check(after["total"] == before["total"] + 3, "statistics: total unchanged by status")

    status, mine_a = request_json("/api/pothole-reports", token=token_a)
    mine = {entry["id"]: entry for entry in mine_a}
    check(mine[gps_report["id"]]["status"] == "resolved", "resident sees the resolved status")
    check(
        mine[manual_report["id"]]["status_remark"] == "Duplicate of an earlier report.",
        "resident sees why the report was rejected",
    )
    notes = db_query(
        """
        SELECT notifications.title FROM notifications
        JOIN users ON users.id = notifications.user_id
        WHERE users.email = %s
        """,
        (RESIDENT_A_EMAIL,),
    )
    check(
        sum(1 for n in notes if n["title"] == "Pothole report update") == 4,
        "resident is notified of each status change",
    )
    admin_notes = db_query(
        "SELECT COUNT(*) AS v FROM notifications WHERE title = 'New pothole report' "
        "AND message LIKE %s",
        (f"%{gps_report['report_number']}%",),
    )[0]["v"]
    check(admin_notes >= 1, "administrators are notified of a new report")

    # ----------------------------------------------------------- persistence
    print("\n8. Persistence across a backend restart")
    status, body = fetch_photo_from_fresh_process(admin_token, gps_report["id"])
    check(status == 200 and body == png, f"a fresh backend process serves the photo (got {status})")

    # ------------------------------------------------- outside the barangay
    # Last, so the reports created here cannot change the counts checked above.
    print("\n9. Locations outside the barangay are flagged for reviewers")
    radius_m = settings.barangay_radius_km * 1000
    status, listed = request_json("/api/admin/pothole-reports", token=admin_token)
    by_id = {entry["id"]: entry for entry in listed} if status == 200 else {}
    for label, report in (("GPS", gps_report), ("manual-pin", manual_report)):
        entry = by_id.get(report["id"], {})
        check(
            entry.get("outside_barangay") is False
            and 0 <= (entry.get("distance_from_barangay_m") or -1) < radius_m,
            f"{label} report inside the barangay is not flagged "
            f"({entry.get('distance_from_barangay_m')} m)",
        )
    entry = by_id.get(no_location_report["id"], {})
    check(
        entry.get("outside_barangay") is False
        and entry.get("distance_from_barangay_m", 0) is None,
        "a report without coordinates is not flagged and has no distance",
    )

    # Davao City, ~83 km away: a resident's device GPS is saved as sent,
    # but reviewers are warned. The same applies to a map pin.
    outside_reports = []
    for source in ("gps", "manual"):
        status, outside = submit_report(
            token_b,
            {
                "location_description": f"Probe outside the barangay ({source})",
                "latitude": "7.0731",
                "longitude": "125.6128",
                "location_source": source,
            },
            ("far.png", png, "image/png"),
        )
        check(status == 201, f"{source} report outside the barangay is still accepted (got {status})")
        if status == 201:
            outside_reports.append(outside)
    for outside in outside_reports:
        status, detail = request_json(
            f"/api/admin/pothole-reports/{outside['id']}", token=admin_token
        )
        check(
            status == 200
            and detail["outside_barangay"] is True
            and detail["distance_from_barangay_m"] > 80_000,
            f"{outside['location_source']} report ~83 km away is flagged outside the "
            f"barangay in the admin details (got {status}, "
            f"{detail.get('distance_from_barangay_m') if status == 200 else None} m)",
        )
        status, mine = request_json("/api/pothole-reports", token=token_b)
        resident_view = next((r for r in mine if r["id"] == outside["id"]), {})
        check(
            "outside_barangay" not in resident_view,
            "the flag is shown to reviewers only, not in the resident's own list",
        )


if __name__ == "__main__":
    main()
