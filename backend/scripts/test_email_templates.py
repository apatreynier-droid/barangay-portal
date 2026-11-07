r"""Offline checks for every email template (no database, no SMTP).

    cd backend
    .\.venv\Scripts\Activate.ps1
    python scripts\test_email_templates.py

Verifies for each email: subject, dynamic data in both parts, status colors,
working links, HTML escaping of untrusted values, Philippine-time dates,
Gmail-safe markup (no scripts, flexbox/grid/positioning, external images or
leftover placeholders) and a size well below Gmail's ~102 KB clipping limit.
For a visual review run ``scripts\preview_emails.py``.
"""

from __future__ import annotations

import datetime as dt
import re
import sys
from email import message_from_bytes, policy
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.email_templates import (  # noqa: E402
    EVENT_APPROVED,
    EVENT_REGISTERED,
    EVENT_REJECTED,
    STATUS_EMAIL_CONTENT,
    TONES,
    format_manila_datetime,
    render_password_reset_email,
    render_registration_email,
    render_request_status_email,
)
from app.email_service import build_message  # noqa: E402
from app.request_notifications import NOTIFIABLE_STATUSES  # noqa: E402

failures: list[str] = []

GMAIL_CLIP_BYTES = 102 * 1024
UNSAFE_MARKUP = re.compile(
    r"<script|display:\s*(?:flex|grid)|position:\s*(?:absolute|fixed)|@import|"
    # Images are allowed only as embedded cid: icons (never remote/data URLs).
    r'<link\b|<img\b(?![^>]*\bsrc="cid:)|javascript:|\{\{|\}\}',
    re.IGNORECASE,
)
HOSTILE = '<img src=x onerror="alert(1)">&"\''


def check(condition: bool, message: str) -> None:
    print(f"  [{'PASS' if condition else 'FAIL'}] {message}")
    if not condition:
        failures.append(message)


def common_checks(label: str, subject: str, text: str, html: str) -> None:
    check(bool(subject.strip()), f"{label}: has a subject")
    check(len(text.strip()) > 200, f"{label}: has a readable plain-text part")
    check("<" not in text.replace("<-", ""), f"{label}: plain text has no HTML tags")
    check(not UNSAFE_MARKUP.search(html), f"{label}: HTML uses only Gmail-safe markup")
    check(len(html.encode("utf-8")) < GMAIL_CLIP_BYTES // 4, f"{label}: HTML is small (< 25 KB)")
    check("Barangay Administration" in html and "Barangay Administration" in text,
          f"{label}: carries the Barangay Administration signature")
    check('role="presentation"' in html and "max-width:600px" in html,
          f"{label}: uses the fluid table layout")


EVENT_UTC = dt.datetime(2026, 11, 7, 16, 30)  # 12:30 AM next day in Manila


def main() -> None:
    print("Email template checks")

    # ----------------------------------------------------------- time zone
    print("\n Philippine time")
    check(
        format_manila_datetime(EVENT_UTC) == "November 8, 2026 at 12:30 AM (PHT)",
        "naive UTC datetimes are converted to Asia/Manila (crosses midnight)",
    )
    check(
        format_manila_datetime("2026-11-07T04:05:00Z") == "November 7, 2026 at 12:05 PM (PHT)",
        "ISO strings with Z are converted to Asia/Manila",
    )
    check(format_manila_datetime("not a date") == "", "unreadable values are left out")

    # ---------------------------------------------------- request statuses
    print("\n Document request emails")
    for status in NOTIFIABLE_STATUSES:
        check(status in STATUS_EMAIL_CONTENT, f"'{status}' has a designed template")

    expected_tone = {
        "Pending": "info",
        "Approved": "success",
        "Processing": "warning",
        "Ready for Pickup": "success",
        "Completed": "success",
        "Rejected": "danger",
    }
    for status, tone in expected_tone.items():
        subject, text, html = render_request_status_email(
            resident_name="Juan Dela Cruz",
            recipient_email="juan@example.com",
            document_name="Certificate of Indigency",
            request_number="REQ-2026-000321",
            status=status,
            pickup_date=dt.date(2026, 11, 20) if status == "Ready for Pickup" else None,
            admin_remarks="Bring your old cedula." if status != "Approved" else None,
            event_time=EVENT_UTC,
            portal_url="http://localhost:5173/myRequests",
        )
        label = f"[{status}]"
        common_checks(label, subject, text, html)
        for value in ("Juan Dela Cruz", "Certificate of Indigency", "REQ-2026-000321",
                      "November 8, 2026 at 12:30 AM (PHT)"):
            check(value in text and value in html, f"{label}: shows '{value}' in both parts")
        check(TONES[tone]["fg"] in html, f"{label}: uses the {tone} color {TONES[tone]['fg']}")
        if status == "Completed":
            check("myRequests" not in html and "View My Request" not in html
                  and 'class="email-btn"' not in html and "<a " not in html,
                  f"{label}: the 'View My Requests' button, link and container are removed")
            check("myRequests" not in text and "http" not in text,
                  f"{label}: the plain text has no portal link either")
            for icon in ("circle-check", "file-check", "calendar-days", "building-2"):
                check(f'src="cid:icon-{icon}@barangay-portal"' in html,
                      f"{label}: shows the Lucide {icon} icon")
            check("<svg" not in html, f"{label}: no inline SVG (Gmail strips it)")
            check("Completed on" in text and "Completion date" in html
                  and "This request is closed" in html,
                  f"{label}: shows the completion date and a prominent Completed status")
        else:
            check('href="http://localhost:5173/myRequests"' in html,
                  f"{label}: 'View My Requests' links to the portal")
            check("cid:" not in html, f"{label}: unchanged design (no icon images)")
        if status != "Approved":
            check("Bring your old cedula." in text and "Bring your old cedula." in html,
                  f"{label}: shows the Barangay office remarks")
        if status == "Ready for Pickup":
            check("November 20, 2026" in text and "November 20, 2026" in html,
                  f"{label}: prominently shows the pickup date")
            check("Pickup instructions".upper() in text and "authorization letter" in html,
                  f"{label}: lists the pickup instructions")

    _, text, html = render_request_status_email(
        resident_name="Juan", recipient_email="j@example.com", document_name="Clearance",
        request_number="REQ-1", status="Ready for Pickup",
    )
    check("To be confirmed" in html and "pickup date has not been set" in text,
          "[Ready for Pickup] without a date says it will be confirmed")

    _, text, html = render_request_status_email(
        resident_name=HOSTILE, recipient_email=f"x{HOSTILE}@example.com",
        document_name=HOSTILE, request_number=HOSTILE, status="Rejected",
        admin_remarks=f"line one\n{HOSTILE}",
    )
    check("<img src=x" not in html and "&lt;img src=x" in html,
          "[Rejected] hostile names, numbers and remarks are HTML-escaped")
    check("line one<br />" in html, "[Rejected] remark line breaks are kept")

    # --------------------------------------------------------- registration
    print("\n Registration emails")
    registration_tone = {
        EVENT_REGISTERED: ("warning", "Pending Approval"),
        EVENT_APPROVED: ("success", "Active"),
        EVENT_REJECTED: ("danger", "Rejected"),
    }
    for event, (tone, pill) in registration_tone.items():
        subject, text, html = render_registration_email(
            event=event,
            login_url="https://portal.example.test/login",
            rejection_reason="Blurry ID photo.",
            resident_name="Ana Reyes",
            recipient_email="ana@example.com",
            event_time=EVENT_UTC,
        )
        label = f"[registration {event}]"
        common_checks(label, subject, text, html)
        for value in ("Ana Reyes", "ana@example.com", "November 8, 2026 at 12:30 AM (PHT)"):
            check(value in text and value in html, f"{label}: shows '{value}'")
        check(TONES[tone]["fg"] in html and pill in html,
              f"{label}: shows the '{pill}' status in {tone} color")

        if event == EVENT_REGISTERED:
            check("pending approval" in text, f"{label}: says approval is pending")
            check(
                "has been approved" not in text.replace(
                    "once your registration has been approved or rejected", ""
                ),
                f"{label}: does not imply the account is approved",
            )
        if event == EVENT_APPROVED:
            check("ACTIVE" in text, f"{label}: says the account is ACTIVE")
            check('href="https://portal.example.test/login"' in html
                  and "Login to Your Account" in html,
                  f"{label}: has a working 'Login to Your Account' button")
            check("https://portal.example.test/login" in text, f"{label}: text has the login URL")
        if event == EVENT_REJECTED:
            check("Blurry ID photo." in text and "Blurry ID photo." in html,
                  f"{label}: shows the administrator's reason")
            check("register again using this same email address" in text,
                  f"{label}: explains the resident can register again")
            check("contact the Barangay" in text, f"{label}: includes contact instructions")

    _, text, html = render_registration_email(event=EVENT_REJECTED, rejection_reason=HOSTILE)
    check("<img src=x" not in html and "&lt;img src=x" in html,
          "[registration rejected] the reason cannot inject HTML")
    check("Dear Resident" in text, "[registration] falls back to 'Resident' without a name")

    # -------------------------------------------------------- password reset
    print("\n Password reset email")
    url = "http://localhost:5173/reset-password?token=abc&x=1"
    subject, text, html = render_password_reset_email(
        reset_url=url, expires_in_minutes=15, recipient_email="ana@example.com"
    )
    common_checks("[password reset]", subject, text, html)
    check('href="http://localhost:5173/reset-password?token=abc&amp;x=1"' in html,
          "[password reset] button link is correctly escaped")
    check(url in text and "15 minutes" in text, "[password reset] text has the link and expiry")

    # ------------------------------------------------- MIME / SMTP message
    print("\n SMTP message structure")
    _, text, html = render_request_status_email(
        resident_name="Juan", recipient_email="juan@example.com",
        document_name="Barangay Clearance", request_number="REQ-2026-000001",
        status="Completed", event_time=EVENT_UTC,
        portal_url="http://localhost:5173/myRequests",
    )
    message = build_message(to_email="juan@example.com", subject="s", text_body=text,
                            html_body=html)
    parsed = message_from_bytes(message.as_bytes(), policy=policy.default)
    images = [part for part in parsed.walk() if part.get_content_type() == "image/png"]
    cids = {part["Content-ID"].strip("<>") for part in images}
    referenced = set(re.findall(r'src="cid:([^"]+)"', html))
    check(parsed.get_content_type() == "multipart/alternative",
          "Completed: message is multipart/alternative (text + HTML)")
    check(any(p.get_content_type() == "multipart/related" for p in parsed.walk()),
          "Completed: HTML and its icons are grouped as multipart/related")
    check(cids == referenced and len(images) == 4,
          "Completed: every referenced Lucide icon is attached exactly once")
    check(all(p.get_content().startswith(b"\x89PNG") for p in images)
          and all(p.get_content_disposition() == "inline" for p in images),
          "Completed: icons are inline PNG parts")
    check(parsed.get_body(preferencelist=("plain",)).get_content().strip() == text.strip(),
          "Completed: the plain-text part is intact")

    _, text, html = render_request_status_email(
        resident_name="Juan", recipient_email="juan@example.com", document_name="X",
        request_number="REQ-1", status="Approved",
    )
    plain_message = build_message(to_email="juan@example.com", subject="s",
                                  text_body=text, html_body=html)
    check(not any(p.get_content_maintype() == "image" for p in plain_message.walk())
          and not any(p.get_content_type() == "multipart/related"
                      for p in plain_message.walk()),
          "Other emails: built exactly as before (no attachments added)")

    print()
    if failures:
        print(f"{len(failures)} check(s) FAILED:")
        for failure in failures:
            print(f"  - {failure}")
        sys.exit(1)
    print("All email template checks passed.")


if __name__ == "__main__":
    main()
