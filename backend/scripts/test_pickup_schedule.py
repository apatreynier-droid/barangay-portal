r"""End-to-end checks for the pickup schedule (date + time) and its emails.

Starts its own copy of the API in this process (plain HTTP on 127.0.0.1, a
private port) with email sending replaced by a recorder, so no real email is
sent, then uses the configured MySQL database (migration 014 applied):

    cd backend
    .\.venv\Scripts\Activate.ps1
    python scripts\test_pickup_schedule.py

Covers:
* "Mark as Ready for Pickup" with a date and time -> one Ready for Pickup
  email that already shows the schedule, plus the in-app notification;
* Ready for Pickup without a schedule -> email says "to be confirmed"; setting
  the schedule afterwards -> "Pickup Schedule Set" email with the date and
  time; changing it -> "Pickup Schedule Updated"; saving the same schedule
  again -> no email; going back to an earlier schedule -> a new email;
* the schedule is stored in MySQL and shown in the resident's list/details;
* a time without a date, an impossible time and a resident calling the admin
  endpoint are refused and change nothing.

Everything it creates is removed at the end.
"""

from __future__ import annotations

import os
import sys
import threading
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any

PORT = 8766
# Must be set before test_request_attachments is imported (it reads it once).
os.environ["API_BASE_URL"] = f"http://127.0.0.1:{PORT}"

BACKEND_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = Path(__file__).resolve().parent
for path in (BACKEND_DIR, SCRIPTS_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import uvicorn  # noqa: E402

import test_request_attachments as base  # noqa: E402  (shared HTTP/DB helpers)
from app import email_service  # noqa: E402
from app.email_templates import (  # noqa: E402
    SCHEDULE_SET,
    SCHEDULE_UPDATED,
    format_pickup_schedule,
    format_pickup_time,
    render_request_status_email,
)
from app.main import app  # noqa: E402

check = base.check
request_json = base.request_json
db_query = base.db_query


class EmailRecorder:
    """Stands in for ``email_service.send_email``: records instead of sending."""

    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []
        self.lock = threading.Lock()

    def __call__(self, **kwargs: Any) -> None:
        with self.lock:
            self.sent.append(dict(kwargs))

    def to(self, email: str) -> list[dict[str, Any]]:
        with self.lock:
            return [m for m in self.sent if m["to_email"] == email]


recorder = EmailRecorder()


def notifications_for(user_id: int, request_id: int) -> list[dict[str, Any]]:
    return db_query(
        """
        SELECT title, message FROM notifications
        WHERE user_id = %s AND related_request_id = %s ORDER BY id
        """,
        (user_id, request_id),
    )


def email_log_keys(request_id: int) -> list[str]:
    return [
        row["status"]
        for row in db_query(
            "SELECT status FROM request_status_emails WHERE request_id = %s ORDER BY id",
            (request_id,),
        )
    ]


def main() -> None:
    print("Pickup schedule checks")
    email_service.send_email = recorder  # type: ignore[assignment]
    log_watermark = base.table_watermark("activity_logs")
    notification_watermark = base.table_watermark("notifications")
    base.remove_probe_accounts()  # leftovers from an interrupted earlier run

    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="critical")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(0.05)

    try:
        run_checks()
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        base.remove_probe_accounts()
        base.remove_run_rows(log_watermark, notification_watermark)
        leftovers = db_query(
            "SELECT COUNT(*) AS v FROM users WHERE email = %s", (base.RESIDENT_A_EMAIL,)
        )[0]["v"]
        check(leftovers == 0, "cleanup removed the probe resident, requests and email log")

    print()
    if base.failures:
        print(f"{len(base.failures)} check(s) FAILED:")
        for failure in base.failures:
            print(f"  - {failure}")
        sys.exit(1)
    print("All pickup schedule checks passed.")


def run_checks() -> None:
    check_formatting()

    print("\n2. Setup")
    status, admin = base.login(base.ADMIN_EMAIL, base.ADMIN_PASSWORD)
    check(status == 200, f"administrator signs in (got {status})")
    if status != 200:
        return
    admin_token = admin["access_token"]
    token = base.create_resident(admin_token, base.RESIDENT_A_EMAIL, "Pickupprobe")
    if not token:
        return
    user_id = db_query("SELECT id FROM users WHERE email = %s", (base.RESIDENT_A_EMAIL,))[0]["id"]
    status, types = request_json("/api/document-types", token=token)
    check(status == 200 and bool(types), f"document types load (got {status})")
    if status != 200 or not types:
        return

    def new_request(purpose: str) -> int | None:
        status, created = request_json(
            "/api/requests",
            method="POST",
            body={"document_type_id": types[0]["id"], "purpose": purpose},
            token=token,
        )
        check(status == 201, f"resident submits '{purpose}' (got {status})")
        if status != 201:
            return None
        check(created["pickup_time"] is None, "a new request has no pickup time")
        for step in ("Approved", "Processing"):
            status, _ = request_json(
                f"/api/admin/document-requests/{created['id']}",
                method="PATCH",
                body={"status": step},
                token=admin_token,
            )
            check(status == 200, f"administrator moves it to {step} (got {status})")
        return int(created["id"])

    first = new_request("Pickup probe: scheduled when marked ready")
    second = new_request("Pickup probe: scheduled later")
    if first is None or second is None:
        return

    check_refusals(admin_token, token, first)
    check_marked_ready_with_schedule(admin_token, token, user_id, first)
    check_schedule_set_later(admin_token, user_id, second)

    still_processing = new_request("Pickup probe: not ready yet")
    other_token = base.create_resident(admin_token, base.RESIDENT_B_EMAIL, "Otherprobe")
    if still_processing is None or not other_token:
        return
    check_resident_pickup_details(token, other_token, first, second, still_processing)


def check_formatting() -> None:
    print("\n1. Formatting")
    check(format_pickup_time(timedelta(hours=9, minutes=30)) == "9:30 AM", "09:30 -> 9:30 AM")
    check(format_pickup_time("14:05:00") == "2:05 PM", "14:05 -> 2:05 PM")
    check(format_pickup_time("00:15") == "12:15 AM", "00:15 -> 12:15 AM")
    check(format_pickup_time("12:00") == "12:00 PM", "12:00 -> 12:00 PM")
    check(format_pickup_time(None) == "" and format_pickup_time("bad") == "", "no/invalid time -> empty")
    check(
        format_pickup_schedule(date(2026, 11, 12), "09:30:00") == "November 12, 2026 at 9:30 AM",
        "date + time -> 'November 12, 2026 at 9:30 AM'",
    )
    check(format_pickup_schedule(date(2026, 11, 12)) == "November 12, 2026", "date only stays date only")
    check(format_pickup_schedule(None, "09:30") == "", "a time alone is not a schedule")

    common = dict(
        resident_name="Juan",
        recipient_email="juan@example.com",
        document_name="Barangay Clearance",
        request_number="REQ-1",
        status="Ready for Pickup",
        pickup_date=date(2026, 11, 12),
        pickup_time=timedelta(hours=9, minutes=30),
    )
    subject, text, html = render_request_status_email(**common)
    check(subject == "Your Barangay Document is Ready for Pickup", f"normal subject kept ({subject})")
    check(
        "November 12, 2026 at 9:30 AM" in text and "November 12, 2026 at 9:30 AM" in html,
        "Ready for Pickup email shows the date and time",
    )
    check("Pickup date &amp; time" in html and "Pickup date & time" in text, "label says 'Pickup date & time'")
    subject, text, html = render_request_status_email(**common, schedule_change=SCHEDULE_SET)
    check(
        subject == "Pickup Schedule Set: Your Barangay Document is Ready for Pickup",
        f"schedule-set subject ({subject})",
    )
    check("has set your pickup schedule" in text and "Pickup schedule set" in html, "schedule-set wording")
    subject, text, _ = render_request_status_email(**common, schedule_change=SCHEDULE_UPDATED)
    check(
        subject.startswith("Pickup Schedule Updated:") and "replaces the one in our earlier email" in text,
        "schedule-updated subject and wording",
    )
    subject, _, _ = render_request_status_email(
        **{**common, "pickup_date": None, "pickup_time": None}, schedule_change=SCHEDULE_SET
    )
    check(subject == "Your Barangay Document is Ready for Pickup", "no schedule -> plain Ready for Pickup email")


def check_refusals(admin_token: str, token: str, request_id: int) -> None:
    print("\n3. Invalid input is refused")
    path = f"/api/admin/document-requests/{request_id}"
    sent_before = len(recorder.sent)
    status, body = request_json(path, method="PATCH", body={"pickup_time": "09:30"}, token=admin_token)
    check(status == 422, f"a time without any pickup date -> 422 (got {status}: {body})")
    status, _ = request_json(
        path, method="PATCH", body={"pickup_date": "2026-11-12", "pickup_time": "25:00"}, token=admin_token
    )
    check(status == 422, f"an impossible time (25:00) -> 422 (got {status})")
    status, _ = request_json(
        path,
        method="PATCH",
        body={"status": "Ready for Pickup", "pickup_date": "2026-11-12", "pickup_time": "09:30"},
        token=token,
    )
    check(status == 403, f"a resident cannot mark ready or set the schedule (got {status})")
    row = db_query("SELECT status, pickup_date, pickup_time FROM requests WHERE id = %s", (request_id,))[0]
    check(
        row == {"status": "Processing", "pickup_date": None, "pickup_time": None},
        "refused calls changed nothing",
    )
    check(len(recorder.sent) == sent_before, "refused calls sent no email")


def check_marked_ready_with_schedule(admin_token: str, token: str, user_id: int, request_id: int) -> None:
    print("\n4. 'Mark as Ready for Pickup' with a date and time")
    before = len(recorder.to(base.RESIDENT_A_EMAIL))
    status, detail = request_json(
        f"/api/admin/document-requests/{request_id}",
        method="PATCH",
        body={"status": "Ready for Pickup", "pickup_date": "2026-11-12", "pickup_time": "09:30"},
        token=admin_token,
    )
    check(status == 200, f"marked Ready for Pickup with a schedule (got {status})")
    if status != 200:
        return
    check(
        detail["status"] == "Ready for Pickup"
        and detail["pickup_date"] == "2026-11-12"
        and detail["pickup_time"] == "09:30:00",
        "status and schedule saved together",
    )
    row = db_query("SELECT pickup_date, pickup_time FROM requests WHERE id = %s", (request_id,))[0]
    check(
        row["pickup_date"] == date(2026, 11, 12) and row["pickup_time"] == timedelta(hours=9, minutes=30),
        "MySQL stores 2026-11-12 09:30",
    )

    emails = recorder.to(base.RESIDENT_A_EMAIL)[before:]
    check(len(emails) == 1, f"exactly one email is sent (got {len(emails)})")
    if emails:
        email = emails[0]
        check(email["subject"] == "Your Barangay Document is Ready for Pickup", f"subject: {email['subject']}")
        check(
            "November 12, 2026 at 9:30 AM" in email["text_body"]
            and "November 12, 2026 at 9:30 AM" in (email["html_body"] or ""),
            "the Ready for Pickup email shows November 12, 2026 at 9:30 AM",
        )
        check("To be confirmed" not in (email["html_body"] or ""), "it does not say 'to be confirmed'")
    check(email_log_keys(request_id)[-1:] == ["Ready for Pickup"], "logged once as 'Ready for Pickup'")

    ready = [
        n for n in notifications_for(user_id, request_id)
        if n["title"] == "Your Document Is Ready for Pickup!"
    ]
    check(
        len(ready) == 1
        and "has been processed and is now ready for pickup" in ready[0]["message"]
        and "Pickup: November 12, 2026 at 9:30 AM." in ready[0]["message"],
        f"'Your Document Is Ready for Pickup!' notification includes the schedule "
        f"({ready[0]['message'] if ready else 'none'})",
    )
    check(
        not any(n["title"].startswith("Pickup schedule") for n in notifications_for(user_id, request_id)),
        "no second 'Pickup schedule' notification for the same action",
    )

    status, mine = request_json("/api/requests", token=token)
    listed = next((r for r in mine if r["id"] == request_id), {}) if status == 200 else {}
    check(
        listed.get("pickup_date") == "2026-11-12" and listed.get("pickup_time") == "09:30:00",
        "resident's request list shows the date and time",
    )
    status, mine_detail = request_json(f"/api/requests/{request_id}", token=token)
    check(status == 200 and mine_detail["pickup_time"] == "09:30:00", "resident's request details show the time")


def check_schedule_set_later(admin_token: str, user_id: int, request_id: int) -> None:
    print("\n5. Schedule set after the request is already Ready for Pickup")
    path = f"/api/admin/document-requests/{request_id}"

    def patch(body: dict[str, Any]) -> tuple[int, Any, list[dict[str, Any]]]:
        before = len(recorder.to(base.RESIDENT_A_EMAIL))
        status, detail = request_json(path, method="PATCH", body=body, token=admin_token)
        return status, detail, recorder.to(base.RESIDENT_A_EMAIL)[before:]

    status, _, emails = patch({"status": "Ready for Pickup"})
    check(status == 200 and len(emails) == 1, f"marked ready without a schedule: one email (got {status}, {len(emails)})")
    if emails:
        check("To be confirmed" in (emails[0]["html_body"] or ""), "that email says the date is to be confirmed")

    status, detail, emails = patch({"pickup_date": "2026-11-12", "pickup_time": "09:30"})
    check(status == 200 and detail["pickup_time"] == "09:30:00", f"schedule saved (got {status})")
    check(len(emails) == 1, f"saving the schedule sends one email (got {len(emails)})")
    if emails:
        check(
            emails[0]["subject"] == "Pickup Schedule Set: Your Barangay Document is Ready for Pickup",
            f"subject: {emails[0]['subject']}",
        )
        check(
            "November 12, 2026 at 9:30 AM" in emails[0]["text_body"]
            and "Ready for Pickup" in (emails[0]["html_body"] or ""),
            "it shows Ready for Pickup and November 12, 2026 at 9:30 AM",
        )
    notes = [n for n in notifications_for(user_id, request_id) if n["title"].startswith("Pickup schedule")]
    check(
        len(notes) == 1 and notes[0]["title"] == "Pickup schedule set"
        and "November 12, 2026 at 9:30 AM" in notes[0]["message"],
        "in-app 'Pickup schedule set' notification",
    )

    status, detail, emails = patch({"pickup_time": "14:05:45"})
    check(
        status == 200 and detail["pickup_date"] == "2026-11-12" and detail["pickup_time"] == "14:05:00",
        "only the time changes (seconds dropped)",
    )
    check(
        len(emails) == 1
        and emails[0]["subject"].startswith("Pickup Schedule Updated:")
        and "November 12, 2026 at 2:05 PM" in emails[0]["text_body"],
        "'Pickup Schedule Updated' email with 2:05 PM",
    )

    status, _, emails = patch({"pickup_date": "2026-11-12", "pickup_time": "14:05"})
    check(status == 200 and emails == [], "saving the same schedule again sends no email")

    status, _, emails = patch({"pickup_time": "09:30"})
    check(
        status == 200 and len(emails) == 1 and "9:30 AM" in emails[0]["text_body"],
        "going back to the earlier time is emailed again",
    )
    keys = email_log_keys(request_id)
    check(
        keys[-3:] == [
            "Pickup schedule #1 2026-11-12 9:30AM",
            "Pickup schedule #2 2026-11-12 2:05PM",
            "Pickup schedule #3 2026-11-12 9:30AM",
        ],
        f"each schedule email is logged once ({keys})",
    )
    sent_rows = db_query(
        "SELECT COUNT(*) AS v FROM request_status_emails WHERE request_id = %s AND delivery_status = 'sent'",
        (request_id,),
    )[0]["v"]
    check(sent_rows == len(keys), "every logged email is recorded as sent")


def check_resident_pickup_details(
    token: str, other_token: str, first: int, second: int, still_processing: int
) -> None:
    """What the Resident Portal's "View My Request" button and the
    "Document Pickup Details" modal rely on."""
    print("\n6. Resident notification -> 'View My Request' -> pickup details")
    status, notes = request_json("/api/notifications", token=token)
    check(status == 200, f"resident loads notifications (got {status})")
    if status != 200:
        return
    ready = [
        n for n in notes
        if n["related_request_id"] == first and n["title"] == "Your Document Is Ready for Pickup!"
    ]
    check(
        len(ready) == 1 and ready[0]["notification_type"] == "request" and not ready[0]["is_read"],
        "the Ready for Pickup notification carries its request ID (button target), unread",
    )
    schedule_notes = [
        n for n in notes
        if n["related_request_id"] == second and n["title"].startswith("Pickup schedule")
    ]
    check(len(schedule_notes) >= 1, "schedule notices also point to their request")
    other_types = [
        n for n in notes
        if n["title"] == "Request received" and n["related_request_id"] == still_processing
    ]
    check(len(other_types) == 1, "unrelated notifications keep their own title (no button)")

    status, detail = request_json(f"/api/requests/{first}", token=token)
    check(status == 200, f"resident opens the request details (got {status})")
    if status != 200:
        return
    check(detail["request_number"].startswith("REQ-") and bool(detail["document"]), "request ID and document type")
    check(detail["resident_name"] == "Attachment Pickupprobe", f"resident name from the profile ({detail['resident_name']})")
    check(bool(detail["submitted_at"]) and detail["status"] == "Ready for Pickup", "submission date and current status")
    check(
        detail["pickup_date"] == "2026-11-12" and detail["pickup_time"] == "09:30:00",
        "the actual saved pickup date and time",
    )
    from app.email_templates import PICKUP_INSTRUCTIONS, PICKUP_LOCATION

    check(
        detail["pickup_location"] == PICKUP_LOCATION
        and detail["pickup_instructions"] == list(PICKUP_INSTRUCTIONS)
        and len(PICKUP_INSTRUCTIONS) > 0,
        f"pickup location and instructions are the same as in the email ({detail['pickup_location']})",
    )
    reached = [entry["new_status"] for entry in detail["history"]]
    check(
        all(status in reached for status in ("Approved", "Processing", "Ready for Pickup"))
        and all(entry["changed_at"] for entry in detail["history"]),
        f"history has the Approved / Processing / Ready for Pickup dates ({reached})",
    )

    status, latest = request_json(f"/api/requests/{second}", token=token)
    check(
        status == 200 and latest["pickup_date"] == "2026-11-12" and latest["pickup_time"] == "09:30:00",
        "an updated schedule is what the details return (latest save: 09:30)",
    )

    status, not_ready = request_json(f"/api/requests/{still_processing}", token=token)
    check(
        status == 200
        and not_ready["pickup_location"] is None
        and not_ready["pickup_instructions"] == []
        and not_ready["pickup_date"] is None,
        "a request that is not ready has no pickup location, instructions or schedule",
    )

    status, _ = request_json(f"/api/requests/{first}", token=other_token)
    check(status == 404, f"another resident cannot open this request (got {status})")
    status, _ = request_json(f"/api/requests/{first}")
    check(status == 401, f"opening it without signing in is refused (got {status})")

    status, notes_after = request_json("/api/notifications", token=token)
    still_unread = [n for n in notes_after if ready and n["id"] == ready[0]["id"]]
    check(
        status == 200 and len(still_unread) == 1 and not still_unread[0]["is_read"],
        "opening the details does not mark the notification as read",
    )


if __name__ == "__main__":
    main()
