r"""End-to-end checks for resident registration approval and its emails.

    cd backend
    .\.venv\Scripts\python.exe scripts\test_registration_approval.py

Starts the real API in this process on its own port and runs it against the
real database. ``smtplib.SMTP`` is replaced by a fake, so the whole mail path
runs but no message ever leaves this computer and the Gmail account in
backend/.env is never contacted. Failure modes (bad credentials, unreachable
server) are simulated by that fake.

Every probe account, and the rows it caused, is removed afterwards.
"""

from __future__ import annotations

import json
import os
import smtplib
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

# Set before the app is imported. load_dotenv() never overrides these.
FAKE_SMTP_PASSWORD = "fake-app-password-must-never-leak"
os.environ.update(
    {
        "SMTP_HOST": "fake-smtp.invalid",
        "SMTP_PORT": "587",
        "SMTP_USERNAME": "portal-sender@fake-smtp.invalid",
        "SMTP_PASSWORD": FAKE_SMTP_PASSWORD,
        "SMTP_FROM_EMAIL": "portal-sender@fake-smtp.invalid",
        "SMTP_FROM": "",
        "FRONTEND_URL": "https://portal.example.test",
        "LOGIN_IP_MAX_REQUESTS": "100000",
        "PASSWORD_RESET_IP_MAX_REQUESTS": "100000",
        "REGISTRATION_IP_MAX_REQUESTS": "100000",
        # Retries are driven explicitly below, so runs are deterministic.
        "REGISTRATION_EMAIL_WORKER_INTERVAL_SECONDS": "0",
        "REGISTRATION_EMAIL_MAX_ATTEMPTS": "3",
    }
)

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import uvicorn  # noqa: E402

from app import email_service  # noqa: E402
from app.database import create_connection  # noqa: E402
from app.main import app  # noqa: E402
from app.registration_emails import process_due_registration_emails  # noqa: E402
from app.security import (  # noqa: E402
    create_access_token,
    hash_access_token,
    hash_password,
)

PORT = 8765
BASE_URL = f"http://127.0.0.1:{PORT}"
PROBE_DOMAIN = "reg-approval-probe.example.com"
PASSWORD = "ProbePassword123!"
ADMIN_EMAIL = f"admin@{PROBE_DOMAIN}"
STAFF_EMAIL = f"staff@{PROBE_DOMAIN}"

PENDING_MESSAGE = (
    "Your registration is currently awaiting Administrator approval. You will "
    "receive an email notification once your account has been approved."
)
REJECTED_MESSAGE = (
    "Your registration has been rejected. Please check your email for more "
    "information or contact the Barangay Administrator."
)

failures: list[str] = []


def check(condition: bool, message: str) -> None:
    print(f"  {'PASS' if condition else 'FAIL'}  {message}")
    if not condition:
        failures.append(message)


class FakeSMTP:
    """Stands in for ``smtplib.SMTP`` and records what would have been sent."""

    mode = "ok"
    sent: list[Any] = []
    lock = threading.Lock()

    def __init__(self, host: str, port: int, timeout: float | None = None) -> None:
        if FakeSMTP.mode == "unreachable":
            raise ConnectionRefusedError("mail server is down")

    def starttls(self) -> None:
        pass

    def login(self, username: str, password: str) -> None:
        if FakeSMTP.mode == "bad_credentials":
            raise smtplib.SMTPAuthenticationError(
                535, f"rejected {username} {password}".encode()
            )

    def send_message(self, message: Any) -> None:
        with FakeSMTP.lock:
            FakeSMTP.sent.append(message)

    def noop(self) -> None:
        pass

    def quit(self) -> None:
        pass

    def close(self) -> None:
        pass


def emails_to(address: str) -> list[Any]:
    with FakeSMTP.lock:
        return [message for message in FakeSMTP.sent if message["To"] == address]


def text_of(message: Any) -> str:
    return message.get_body(preferencelist=("plain",)).get_content()


def html_of(message: Any) -> str:
    return message.get_body(preferencelist=("html",)).get_content()


def wait_for_emails(address: str, count: int, seconds: float = 5.0) -> list[Any]:
    """The confirmation email is sent after the response, so allow it a moment."""
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        found = emails_to(address)
        if len(found) >= count:
            return found
        time.sleep(0.05)
    return emails_to(address)


def request_json(
    path: str,
    *,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    token: str | None = None,
) -> tuple[int, Any]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(
        f"{BASE_URL}{path}", data=data, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return response.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8")
        try:
            return error.code, json.loads(raw)
        except json.JSONDecodeError:
            return error.code, raw


def login(email: str, password: str = PASSWORD) -> tuple[int, Any]:
    return request_json(
        "/api/auth/login",
        method="POST",
        body={"email": email, "password": password},
    )


def register(local_part: str, **extra: Any) -> tuple[str, int, Any]:
    email = extra.pop("email", f"{local_part}@{PROBE_DOMAIN}")
    status, body = request_json(
        "/api/auth/register",
        method="POST",
        body={
            "first_name": "Probe",
            "last_name": local_part.title(),
            "email": email,
            "password": PASSWORD,
            "phone": "09171234567",
            "address": "1 Probe Street",
            "purok": "Purok - 1",
            **extra,
        },
    )
    return email, status, body


def resident_id_of(body: dict[str, Any]) -> int:
    return int(body["reference_number"].split("-")[1])


def db_row(query: str, *params: Any) -> dict[str, Any] | None:
    connection = create_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(query, params)
        row = cursor.fetchone()
        cursor.close()
        return row
    finally:
        connection.close()


def db_write(query: str, *params: Any) -> None:
    connection = create_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(query, params)
        cursor.close()
        connection.commit()
    finally:
        connection.close()


def account(email: str) -> dict[str, Any]:
    row = db_row(
        """
        SELECT id, role, account_status, reviewed_by, reviewed_at, rejection_reason
        FROM users WHERE email = %s
        """,
        email,
    )
    assert row is not None, email
    return row


def outbox(email: str, event: str) -> dict[str, Any] | None:
    return db_row(
        """
        SELECT registration_emails.*
        FROM registration_emails
        JOIN users ON users.id = registration_emails.user_id
        WHERE users.email = %s AND registration_emails.event_type = %s
        """,
        email,
        event,
    )


def session_count(email: str) -> int:
    row = db_row(
        """
        SELECT COUNT(*) AS total
        FROM auth_sessions
        JOIN users ON users.id = auth_sessions.user_id
        WHERE users.email = %s
        """,
        email,
    )
    return int(row["total"]) if row else 0


def forge_session(email: str) -> str:
    """Plant a valid session row, as if one had been issued before a status change."""
    token = create_access_token()
    db_write(
        """
        INSERT INTO auth_sessions (user_id, token_hash, expires_at)
        SELECT id, %s, UTC_TIMESTAMP() + INTERVAL 1 DAY FROM users WHERE email = %s
        """,
        hash_access_token(token),
        email,
    )
    return token


def create_portal_account(email: str, role: str) -> None:
    connection = create_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO users (email, password_hash, role, account_status)
            VALUES (%s, %s, %s, 'active')
            """,
            (email, hash_password(PASSWORD), role),
        )
        cursor.execute(
            """
            INSERT INTO resident_profiles (user_id, first_name, last_name)
            VALUES (%s, 'Probe', %s)
            """,
            (cursor.lastrowid, role.title()),
        )
        cursor.close()
        connection.commit()
    finally:
        connection.close()


def run_due_emails() -> int:
    connection = create_connection()
    try:
        return process_due_registration_emails(connection)
    finally:
        connection.close()


def make_due(email: str, event: str) -> None:
    db_write(
        """
        UPDATE registration_emails
        JOIN users ON users.id = registration_emails.user_id
        SET next_attempt_at = UTC_TIMESTAMP() - INTERVAL 1 SECOND
        WHERE users.email = %s AND registration_emails.event_type = %s
        """,
        email,
        event,
    )


def pending_count(admin_token: str) -> int:
    _, dashboard = request_json("/api/admin/dashboard", token=admin_token)
    return dashboard["stats"]["pending_registrations"]


def test_new_registration(admin_token: str, staff_token: str) -> None:
    print("\nTest case 1: new resident registration")
    before = pending_count(admin_token)
    email, status, body = register("newcomer")
    check(status == 201, f"registration is accepted (got {status})")
    check("access_token" not in body, "the response carries no access token")
    check(body["account_status"] == "pending", "the response reports pending")

    row = account(email)
    check(row["account_status"] == "pending", "the database status is pending")
    check(row["role"] == "resident", "the database role is resident")
    profile = db_row(
        """
        SELECT resident_profiles.purok
        FROM resident_profiles
        JOIN users ON users.id = resident_profiles.user_id
        WHERE users.email = %s
        """,
        email,
    )
    check(profile is not None and profile["purok"] == "Purok - 1", "the profile is saved")
    check(session_count(email) == 0, "no session was created")
    check(pending_count(admin_token) == before + 1, "the pending count went up by one")

    emails = wait_for_emails(email, 1)
    check(len(emails) == 1, f"one confirmation email was sent ({len(emails)})")
    if emails:
        check(
            emails[0]["Subject"]
            == "Barangay Portal - Registration Successfully Received",
            "the confirmation email has the agreed subject",
        )
        check("pending approval" in text_of(emails[0]), "it says approval is pending")
        check(
            "has been approved" not in text_of(emails[0]).replace(
                "once your registration has been approved or rejected", ""
            ),
            "it does not imply the account is approved",
        )

    status, login_body = login(email)
    check(status == 403, f"sign-in is refused (got {status})")
    check(
        isinstance(login_body, dict) and login_body.get("detail") == PENDING_MESSAGE,
        "sign-in shows the pending message",
    )
    check(session_count(email) == 0, "the refused sign-in created no session")

    status, wrong = login(email, "WrongPassword999!")
    check(
        status == 401 and "awaiting" not in json.dumps(wrong),
        "a wrong password learns nothing about the account status",
    )

    status, feed = request_json("/api/notifications", token=admin_token)
    matches = [
        item
        for item in (feed if status == 200 else [])
        if item["notification_type"] == "registration" and email in item["message"]
    ]
    check(len(matches) == 1, f"the administrator was notified once ({len(matches)})")
    if matches:
        check("Probe Newcomer" in matches[0]["message"], "it names the resident")
        check(" at " in matches[0]["message"], "it states the registration time")

    _, staff_feed = request_json("/api/notifications", token=staff_token)
    check(
        not any(email in item["message"] for item in staff_feed),
        "Staff, who cannot review, is not notified",
    )

    status, registrations = request_json(
        "/api/admin/registrations", token=admin_token
    )
    entry = next(
        (item for item in registrations if item["email"] == email), None
    ) if status == 200 else None
    check(entry is not None, "the registration appears on the Approvals API")
    if entry:
        check(entry["status"] == "pending", "listed as pending")
        check(entry["purok"] == "Purok - 1", "listed with the Purok")
        check(entry["contact_number"] == "09171234567", "listed with the contact number")
        check(entry["address"] == "1 Probe Street", "listed with the address")
        check(bool(entry["registered_at"]), "listed with the registration time")
        check(entry["email_status"] == "sent", "listed with the email state")
        check("password" not in json.dumps(entry).lower(), "no password data is exposed")

    _, residents = request_json("/api/admin/residents", token=admin_token)
    check(
        not any(item["email"] == email for item in residents),
        "pending accounts stay out of the Residents page",
    )

    _, duplicate, _ = register("newcomer")
    check(duplicate == 409, f"the same email cannot register twice (got {duplicate})")
    time.sleep(0.3)
    check(len(emails_to(email)) == 1, "the repeat attempt sent no second email")

    _, invalid, _ = register("not-an-email", email="not-an-email")
    check(invalid == 422, f"an undeliverable address is refused (got {invalid})")


def test_approval(admin_token: str) -> None:
    print("\nTest case 2: administrator approval")
    email, _, body = register("approved")
    resident_id = resident_id_of(body)
    wait_for_emails(email, 1)
    before = pending_count(admin_token)

    status, result = request_json(
        f"/api/admin/registrations/{resident_id}/approve",
        method="POST",
        token=admin_token,
    )
    check(status == 200, f"the administrator approves (got {status})")
    check(result["email_delivery"] == "sent", "the response reports the email was sent")
    check(result["registration"]["status"] == "active", "the response shows active")
    check(bool(result["registration"]["reviewed_at"]), "the response has the review time")

    row = account(email)
    admin = account(ADMIN_EMAIL)
    check(row["account_status"] == "active", "the database status is active")
    check(row["reviewed_by"] == admin["id"], "the approving administrator is saved")
    check(row["reviewed_at"] is not None, "the approval time is saved")
    check(pending_count(admin_token) == before - 1, "the pending count went down by one")

    emails = emails_to(email)
    check(len(emails) == 2, f"confirmation plus approval email ({len(emails)})")
    approval = emails[-1]
    check(
        approval["Subject"] == "Your Barangay Portal Account Has Been Approved!",
        "the approval email has the agreed subject",
    )
    check(
        "https://portal.example.test/login" in text_of(approval),
        "it contains the portal login URL from FRONTEND_URL",
    )
    check("ACTIVE" in text_of(approval), "it says the account is active")
    check(PASSWORD not in approval.as_string(), "it contains no password")

    status, auth = login(email)
    check(status == 200, f"the resident can now sign in (got {status})")
    token = auth["access_token"]
    status, _ = request_json("/api/requests", token=token)
    check(status == 200, "the resident can use the Resident API")

    status, document_types = request_json("/api/document-types", token=token)
    if document_types:
        status, created = request_json(
            "/api/requests",
            method="POST",
            token=token,
            body={
                "document_type_id": document_types[0]["id"],
                "purpose": "Registration approval regression check",
            },
        )
        check(status == 201, f"the document request flow still works (got {status})")

    status, feed = request_json("/api/notifications", token=token)
    approved = [item for item in feed if item["title"] == "Registration approved"]
    check(len(approved) == 1, "the resident has one approval notification")

    status, residents = request_json("/api/admin/residents", token=admin_token)
    check(
        any(item["email"] == email for item in residents),
        "approved residents appear on the Residents page",
    )

    status, repeat = request_json(
        f"/api/admin/registrations/{resident_id}/approve",
        method="POST",
        token=admin_token,
    )
    check(status == 409, f"approving again is refused (got {status})")
    status, _ = request_json(
        f"/api/admin/registrations/{resident_id}/reject",
        method="POST",
        token=admin_token,
        body={"reason": "Too late"},
    )
    check(status == 409, f"rejecting an approved account is refused (got {status})")
    check(account(email)["account_status"] == "active", "the account stays active")
    check(len(emails_to(email)) == 2, "repeating the action sent no further email")

    log = db_row(
        """
        SELECT action FROM activity_logs
        WHERE target = %s AND action_type = 'Approve'
        ORDER BY id DESC LIMIT 1
        """,
        f"RES-{resident_id:03d}",
    )
    check(log is not None, "the approval is in the Activity Logs")


def test_rejection(admin_token: str) -> None:
    print("\nTest case 3: administrator rejection")
    email, _, body = register("rejected")
    resident_id = resident_id_of(body)
    wait_for_emails(email, 1)
    reason = "The address <b>could not</b> be verified & the ID was blurry."

    for blank in ("", "    "):
        status, _ = request_json(
            f"/api/admin/registrations/{resident_id}/reject",
            method="POST",
            token=admin_token,
            body={"reason": blank},
        )
        check(status == 422, f"a blank reason is refused (got {status})")
    check(account(email)["account_status"] == "pending", "the account is still pending")

    before = pending_count(admin_token)
    status, result = request_json(
        f"/api/admin/registrations/{resident_id}/reject",
        method="POST",
        token=admin_token,
        body={"reason": f"  {reason}  "},
    )
    check(status == 200, f"the administrator rejects (got {status})")
    check(result["email_delivery"] == "sent", "the response reports the email was sent")

    row = account(email)
    check(row["account_status"] == "rejected", "the database status is rejected")
    check(row["rejection_reason"] == reason, "the exact reason is saved")
    check(pending_count(admin_token) == before - 1, "the pending count went down by one")

    emails = emails_to(email)
    check(len(emails) == 2, f"confirmation plus rejection email ({len(emails)})")
    rejection = emails[-1]
    check(
        rejection["Subject"] == "Barangay Portal - Registration Status Update",
        "the rejection email has the agreed subject",
    )
    check(reason in text_of(rejection), "it contains the administrator's reason")
    html = html_of(rejection)
    check("<b>could not</b>" not in html, "the reason cannot inject HTML")
    check("&lt;b&gt;could not&lt;/b&gt;" in html, "the reason is shown escaped")

    status, login_body = login(email)
    check(status == 403, f"sign-in is refused (got {status})")
    check(
        isinstance(login_body, dict) and login_body.get("detail") == REJECTED_MESSAGE,
        "sign-in shows the rejected message",
    )
    check(session_count(email) == 0, "no session was created")

    notification = db_row(
        """
        SELECT notifications.message
        FROM notifications
        JOIN users ON users.id = notifications.user_id
        WHERE users.email = %s AND notifications.title = 'Registration rejected'
        """,
        email,
    )
    check(
        notification is not None and reason in notification["message"],
        "the resident's notification has the reason",
    )

    status, _ = request_json(
        f"/api/admin/registrations/{resident_id}/approve",
        method="POST",
        token=admin_token,
    )
    check(status == 409, f"a rejected account cannot be approved later (got {status})")

    status, registrations = request_json(
        "/api/admin/registrations", token=admin_token
    )
    entry = next(item for item in registrations if item["email"] == email)
    check(entry["status"] == "rejected", "listed as rejected, not pending")
    check(entry["rejection_reason"] == reason, "listed with the reason")


def test_registering_again(admin_token: str, staff_token: str) -> None:
    print("\nA rejected resident registers again")
    email, _, body = register("second-chance", address="Old Address")
    resident_id = resident_id_of(body)
    wait_for_emails(email, 1)
    first_reason = "The address could not be verified."
    request_json(
        f"/api/admin/registrations/{resident_id}/reject",
        method="POST",
        token=admin_token,
        body={"reason": first_reason},
    )
    rejection = emails_to(email)[-1]
    check(
        "register again using this same email address" in text_of(rejection),
        "the rejection email says the resident can register again",
    )
    before_row = db_row(
        "SELECT id, created_at FROM users WHERE email = %s", email
    )
    before_count = pending_count(admin_token)
    time.sleep(1.1)

    new_password = "BrandNewPassword456!"
    again_email, status, again = register(
        "second-chance",
        address="Corrected Address",
        password=new_password,
        purok="Purok - 3",
        account_status="active",
    )
    check(status == 201, f"the same email can register again (got {status})")
    check("access_token" not in again, "it carries no access token")
    check(again["reference_number"] == body["reference_number"], "the resident code stays")

    row = account(email)
    check(row["id"] == before_row["id"], "the same account is reused")
    check(row["account_status"] == "pending", "the account is pending again")
    check(row["rejection_reason"] == first_reason, "the previous reason stays for the reviewer")
    check(pending_count(admin_token) == before_count + 1, "the pending count went up by one")
    profile = db_row(
        """
        SELECT users.created_at, resident_profiles.address, resident_profiles.purok
        FROM users
        JOIN resident_profiles ON resident_profiles.user_id = users.id
        WHERE users.email = %s
        """,
        email,
    )
    check(profile["address"] == "Corrected Address", "the corrected address is saved")
    check(profile["purok"] == "Purok - 3", "the corrected Purok is saved")
    check(profile["created_at"] > before_row["created_at"], "the registration time is the new one")

    emails = wait_for_emails(email, 3)
    check(len(emails) == 3, f"a new confirmation email was sent ({len(emails)})")
    check(
        emails[-1]["Subject"]
        == "Barangay Portal - Registration Successfully Received",
        "the third email is the confirmation",
    )

    status, _ = login(email, PASSWORD)
    check(status == 401, f"the old password stopped working (got {status})")
    status, login_body = login(email, new_password)
    check(
        status == 403 and login_body["detail"] == PENDING_MESSAGE,
        "the new password shows the pending message",
    )
    check(session_count(email) == 0, "no session was created")

    _, feed = request_json("/api/notifications", token=admin_token)
    notices = [item for item in feed if email in item["message"]]
    check(len(notices) == 2, f"the administrator was notified again ({len(notices)})")
    check(
        any("registered again" in item["message"] for item in notices),
        "the new notification says it is a repeat application",
    )

    _, registrations = request_json("/api/admin/registrations", token=admin_token)
    entry = next(item for item in registrations if item["email"] == email)
    check(entry["status"] == "pending", "listed as pending")
    check(entry["rejection_reason"] == first_reason, "listed with the previous reason")
    check(entry["email_status"] == "sent", "listed with the new email state")
    status, _ = request_json(
        f"/api/admin/residents/{resident_id}/status",
        method="PATCH",
        token=admin_token,
        body={"account_status": "active"},
    )
    check(status == 409, f"it still cannot skip the review (got {status})")

    status, _ = request_json(
        f"/api/admin/registrations/{resident_id}/reject",
        method="POST",
        token=admin_token,
        body={"reason": "The ID has expired."},
    )
    check(status == 200, "it can be rejected a second time")
    check(account(email)["rejection_reason"] == "The ID has expired.", "the new reason replaces the old")
    emails = emails_to(email)
    check(len(emails) == 4, f"a second rejection email was sent ({len(emails)})")
    check("The ID has expired." in text_of(emails[-1]), "it has the new reason")

    time.sleep(1.1)
    third_password = "ThirdPassword789!"
    _, status, _ = register("second-chance", password=third_password)
    check(status == 201, "a third application is accepted")
    wait_for_emails(email, 5)
    status, result = request_json(
        f"/api/admin/registrations/{resident_id}/approve",
        method="POST",
        token=admin_token,
    )
    check(status == 200 and result["email_delivery"] == "sent", "it can now be approved")
    row = account(email)
    check(row["account_status"] == "active", "the account is active")
    check(row["rejection_reason"] is None, "approval clears the old reason")
    emails = emails_to(email)
    check(len(emails) == 6, f"six emails in total, each once ({len(emails)})")
    check(
        emails[-1]["Subject"] == "Your Barangay Portal Account Has Been Approved!",
        "the last email is the approval",
    )
    status, auth = login(email, third_password)
    check(status == 200, f"the resident can sign in (got {status})")
    _, feed = request_json("/api/notifications", token=auth["access_token"])
    titles = [item["title"] for item in feed]
    check(titles.count("Registration approved") == 1, "the resident has the approval notification")
    check(titles.count("Registration rejected") == 2, "both rejections stay in the history")

    print("  -- only a rejected account can register again")
    _, status, _ = register("second-chance", password="TakeoverAttempt1!")
    check(status == 409, f"an active account cannot be replaced (got {status})")
    check(login(email, third_password)[0] == 200, "its password did not change")

    pending_email, _, _ = register("still-pending")
    wait_for_emails(pending_email, 1)
    _, status, _ = register("still-pending", password="TakeoverAttempt1!")
    check(status == 409, f"a pending account cannot be replaced (got {status})")

    request_json(
        f"/api/admin/residents/{resident_id}/status",
        method="PATCH",
        token=admin_token,
        body={"account_status": "inactive"},
    )
    _, status, _ = register("second-chance", password="TakeoverAttempt1!")
    check(status == 409, f"a deactivated account cannot be replaced (got {status})")
    check(account(email)["account_status"] == "inactive", "it stays deactivated")

    _, status, _ = register("staff", password="TakeoverAttempt1!")
    check(status == 409, f"a staff account cannot be replaced (got {status})")
    check(login(STAFF_EMAIL)[0] == 200, "the staff password did not change")

    print("  -- simultaneous repeat applications")
    race_email, _, race_body = register("race-again")
    wait_for_emails(race_email, 1)
    request_json(
        f"/api/admin/registrations/{resident_id_of(race_body)}/reject",
        method="POST",
        token=admin_token,
        body={"reason": "Race test"},
    )

    def attempt(_: int) -> int:
        return register("race-again")[1]

    with ThreadPoolExecutor(max_workers=6) as pool:
        statuses = list(pool.map(attempt, range(6)))
    check(statuses.count(201) == 1, f"exactly one was accepted ({statuses})")
    check(statuses.count(409) == 5, "the other five were refused")
    emails = wait_for_emails(race_email, 3)
    time.sleep(0.3)
    check(len(emails_to(race_email)) == 3, "only one new confirmation email was sent")


def test_security(admin_token: str, staff_token: str) -> None:
    print("\nTest case 4: security")
    email, _, body = register("target")
    resident_id = resident_id_of(body)
    wait_for_emails(email, 1)

    other_email, _, other_body = register("resident-actor")
    wait_for_emails(other_email, 1)
    request_json(
        f"/api/admin/registrations/{resident_id_of(other_body)}/approve",
        method="POST",
        token=admin_token,
    )
    _, auth = login(other_email)
    resident_token = auth["access_token"]

    approve = f"/api/admin/registrations/{resident_id}/approve"
    reject = f"/api/admin/registrations/{resident_id}/reject"
    retry = f"/api/admin/registrations/{resident_id}/email/retry"
    denied = (
        ("a resident", resident_token, 403),
        ("a staff account", staff_token, 403),
        ("an anonymous caller", None, 401),
    )
    for name, token, expected in denied:
        status, _ = request_json(approve, method="POST", token=token)
        check(status == expected, f"{name} cannot approve (got {status})")
        status, _ = request_json(
            reject, method="POST", token=token, body={"reason": "No"}
        )
        check(status == expected, f"{name} cannot reject (got {status})")
        status, _ = request_json(retry, method="POST", token=token)
        check(status == expected, f"{name} cannot retry emails (got {status})")
        status, _ = request_json("/api/admin/registrations", token=token)
        check(status == expected, f"{name} cannot list registrations (got {status})")
    check(account(email)["account_status"] == "pending", "the target stayed pending")

    status, _ = request_json(
        f"/api/admin/residents/{resident_id}/status",
        method="PATCH",
        token=resident_token,
        body={"account_status": "active"},
    )
    check(status == 403, f"a resident cannot set an account status (got {status})")
    status, _ = request_json(
        f"/api/admin/residents/{resident_id}/status",
        method="PATCH",
        token=admin_token,
        body={"account_status": "active"},
    )
    check(status == 409, f"the status endpoint cannot skip the review (got {status})")
    check(account(email)["account_status"] == "pending", "the target is still pending")

    sneaky, status, sneaky_body = register(
        "sneaky", account_status="active", role="admin"
    )
    row = account(sneaky)
    check(status == 201, "extra registration fields are ignored, not honoured")
    check(row["account_status"] == "pending", "a client cannot pick its own status")
    check(row["role"] == "resident", "a client cannot pick its own role")
    wait_for_emails(sneaky, 1)

    # A planted session row must still be refused because of the account status.
    pending_token = forge_session(email)
    for path in ("/api/requests", "/api/notifications", "/api/dashboard-summary"):
        status, _ = request_json(path, token=pending_token)
        check(status == 401, f"a pending session cannot read {path} (got {status})")

    rejected_email, _, rejected_body = register("forged-rejected")
    wait_for_emails(rejected_email, 1)
    request_json(
        f"/api/admin/registrations/{resident_id_of(rejected_body)}/reject",
        method="POST",
        token=admin_token,
        body={"reason": "Security test"},
    )
    rejected_token = forge_session(rejected_email)
    status, _ = request_json("/api/requests", token=rejected_token)
    check(status == 401, f"a rejected session cannot read /api/requests (got {status})")
    status, _ = request_json(
        f"/api/admin/residents/{resident_id_of(rejected_body)}/status",
        method="PATCH",
        token=admin_token,
        body={"account_status": "active"},
    )
    check(status == 409, f"a rejected account cannot be reactivated (got {status})")

    status, _ = request_json(
        f"/api/admin/residents/{resident_id_of(other_body)}/status",
        method="PATCH",
        token=admin_token,
        body={"account_status": "inactive"},
    )
    check(status == 200, "an administrator can still deactivate an approved resident")
    status, body = login(other_email)
    check(
        status == 403 and "deactivated" in body["detail"],
        "a deactivated account gets its own sign-in message",
    )
    status, _ = request_json("/api/requests", token=resident_token)
    check(status == 401, "the deactivated resident's session stopped working")

    status, _ = request_json(
        "/api/auth/forgot-password", method="POST", body={"email": email}
    )
    token_row = db_row(
        """
        SELECT COUNT(*) AS total
        FROM password_reset_tokens
        JOIN users ON users.id = password_reset_tokens.user_id
        WHERE users.email = %s
        """,
        email,
    )
    check(
        status == 202 and token_row["total"] == 0,
        "a pending account cannot get a password-reset link",
    )

    status, _ = request_json(
        "/api/admin/registrations/99999999/approve",
        method="POST",
        token=admin_token,
    )
    check(status == 404, f"an unknown registration answers 404 (got {status})")

    staff_profile = db_row(
        """
        SELECT resident_profiles.id
        FROM resident_profiles
        JOIN users ON users.id = resident_profiles.user_id
        WHERE users.email = %s
        """,
        STAFF_EMAIL,
    )
    status, _ = request_json(
        f"/api/admin/registrations/{staff_profile['id']}/approve",
        method="POST",
        token=admin_token,
    )
    check(status == 404, f"a staff account is not a registration (got {status})")


def test_concurrency(admin_token: str) -> None:
    print("\nDuplicate protection under concurrency")
    email, _, body = register("racer")
    resident_id = resident_id_of(body)
    wait_for_emails(email, 1)

    def attempt(_: int) -> int:
        status, _body = request_json(
            f"/api/admin/registrations/{resident_id}/approve",
            method="POST",
            token=admin_token,
        )
        return status

    with ThreadPoolExecutor(max_workers=8) as pool:
        statuses = list(pool.map(attempt, range(8)))
    check(statuses.count(200) == 1, f"exactly one approval succeeded ({statuses})")
    check(statuses.count(409) == 7, "the other seven were refused")
    time.sleep(0.2)
    check(len(emails_to(email)) == 2, "only one approval email was sent")
    row = db_row(
        """
        SELECT COUNT(*) AS total
        FROM notifications
        JOIN users ON users.id = notifications.user_id
        WHERE users.email = %s AND notifications.title = 'Registration approved'
        """,
        email,
    )
    check(row["total"] == 1, "only one approval notification was created")


def test_smtp_reliability(admin_token: str) -> None:
    print("\nTest case 5: SMTP reliability")

    # ------------------------------------------------- incorrect credentials
    FakeSMTP.mode = "bad_credentials"
    email, status, body = register("badcreds")
    resident_id = resident_id_of(body)
    check(status == 201, f"registration succeeds with bad credentials (got {status})")
    check(account(email)["account_status"] == "pending", "the registration is saved")
    time.sleep(0.5)
    check(emails_to(email) == [], "nothing was delivered")
    row = outbox(email, "registered")
    check(row["delivery_status"] == "failed", "the failure is recorded")
    check(row["attempts"] == 1, "one attempt is counted")
    check(row["next_attempt_at"] is not None, "an automatic retry is scheduled")
    check(FAKE_SMTP_PASSWORD not in (row["last_error"] or ""), "no password is stored")

    # --------------------------------------- server down during an approval
    FakeSMTP.mode = "unreachable"
    status, result = request_json(
        f"/api/admin/registrations/{resident_id}/approve",
        method="POST",
        token=admin_token,
    )
    check(status == 200, f"approval succeeds with the mail server down (got {status})")
    check(result["email_delivery"] == "failed", "the response reports the failure")
    check(result["registration"]["email_status"] == "failed", "the row shows failed")
    check(account(email)["account_status"] == "active", "the approval is saved")
    check(FAKE_SMTP_PASSWORD not in json.dumps(result), "the response has no secrets")
    check("smtp" not in result["message"].lower(), "the message has no technical detail")
    login_status, _ = login(email)
    check(login_status == 200, "the resident can sign in despite the failed email")

    # The pending-state confirmation is now outdated and must not go out.
    FakeSMTP.mode = "ok"
    make_due(email, "registered")
    run_due_emails()
    check(
        outbox(email, "registered")["delivery_status"] == "skipped",
        "an outdated confirmation is dropped, not sent late",
    )
    check(emails_to(email) == [], "no outdated email went out")

    # -------------------------------------------------- admin retry
    FakeSMTP.mode = "unreachable"
    status, result = request_json(
        f"/api/admin/registrations/{resident_id}/email/retry",
        method="POST",
        token=admin_token,
    )
    check(
        status == 200 and result["email_delivery"] == "failed",
        "a retry during the outage reports failure",
    )
    FakeSMTP.mode = "ok"
    status, result = request_json(
        f"/api/admin/registrations/{resident_id}/email/retry",
        method="POST",
        token=admin_token,
    )
    check(
        status == 200 and result["email_delivery"] == "sent",
        "a retry after recovery delivers the email",
    )
    check(result["registration"]["email_status"] == "sent", "the row shows sent")
    check(len(emails_to(email)) == 1, "exactly one approval email was delivered")
    status, _ = request_json(
        f"/api/admin/registrations/{resident_id}/email/retry",
        method="POST",
        token=admin_token,
    )
    check(status == 409, f"a delivered email cannot be resent (got {status})")
    make_due(email, "approved")
    run_due_emails()
    check(len(emails_to(email)) == 1, "the retry worker does not resend it either")

    # ------------------------------------------------ automatic retry worker
    FakeSMTP.mode = "unreachable"
    worker_email, _, worker_body = register("worker")
    worker_id = resident_id_of(worker_body)
    time.sleep(0.5)
    check(outbox(worker_email, "registered")["delivery_status"] == "failed", "queued")
    check(run_due_emails() == 0, "the worker waits for the scheduled retry time")

    FakeSMTP.mode = "ok"
    make_due(worker_email, "registered")
    check(run_due_emails() >= 1, "the worker picks up a due email")
    row = outbox(worker_email, "registered")
    check(row["delivery_status"] == "sent", "the worker delivered it")
    check(row["attempts"] == 2, "both attempts are counted")
    check(row["recipient_email"] == worker_email, "the correct recipient is recorded")
    run_due_emails()
    check(len(emails_to(worker_email)) == 1, "a second pass does not send it again")

    # ------------------------------------------ automatic attempts run out
    FakeSMTP.mode = "unreachable"
    limit_email, _, limit_body = register("limit")
    limit_id = resident_id_of(limit_body)
    time.sleep(0.5)
    for _ in range(2):
        make_due(limit_email, "registered")
        run_due_emails()
    row = outbox(limit_email, "registered")
    check(row["attempts"] == 3, "the configured attempts were used")
    check(row["next_attempt_at"] is None, "no further automatic retry is scheduled")
    check(run_due_emails() == 0, "the worker leaves it alone")
    FakeSMTP.mode = "ok"
    status, result = request_json(
        f"/api/admin/registrations/{limit_id}/email/retry",
        method="POST",
        token=admin_token,
    )
    check(
        status == 200 and result["email_delivery"] == "sent",
        "an administrator can still retry it",
    )

    # --------------------------------- crashed sender and later status change
    crash_email, _, crash_body = register("crash")
    wait_for_emails(crash_email, 1)
    db_write(
        """
        UPDATE registration_emails
        JOIN users ON users.id = registration_emails.user_id
        SET delivery_status = 'sending', sent_at = NULL,
            claimed_at = UTC_TIMESTAMP() - INTERVAL 1 HOUR
        WHERE users.email = %s
        """,
        crash_email,
    )
    check(run_due_emails() >= 1, "an email stuck by a crash is reclaimed")
    check(outbox(crash_email, "registered")["delivery_status"] == "sent", "and delivered")

    FakeSMTP.mode = "unreachable"
    status, _ = request_json(
        f"/api/admin/registrations/{worker_id}/approve",
        method="POST",
        token=admin_token,
    )
    check(status == 200, "the second resident is approved during an outage")
    FakeSMTP.mode = "ok"
    request_json(
        f"/api/admin/residents/{worker_id}/status",
        method="PATCH",
        token=admin_token,
        body={"account_status": "inactive"},
    )
    make_due(worker_email, "approved")
    run_due_emails()
    check(
        outbox(worker_email, "approved")["delivery_status"] == "skipped",
        "a deactivated resident is not told the account is active",
    )
    check(len(emails_to(worker_email)) == 1, "only the confirmation ever reached them")


def cleanup(notification_watermark: int, activity_watermark: int) -> None:
    connection = create_connection()
    try:
        cursor = connection.cursor()
        like = f"%{PROBE_DOMAIN}%"
        # Administrators are told about probe activity by name as well.
        cursor.execute(
            """
            DELETE FROM notifications
            WHERE id > %s AND (message LIKE %s OR message LIKE '%%Probe %%')
            """,
            (notification_watermark, like),
        )
        cursor.execute(
            """
            DELETE activity_logs
            FROM activity_logs
            JOIN users ON users.id = activity_logs.user_id
            WHERE activity_logs.id > %s AND users.email LIKE %s
            """,
            (activity_watermark, like),
        )
        cursor.execute("DELETE FROM users WHERE email LIKE %s", (like,))
        connection.commit()
        cursor.close()
    finally:
        connection.close()


def watermark(table: str) -> int:
    row = db_row(f"SELECT COALESCE(MAX(id), 0) AS top FROM {table}")
    return int(row["top"]) if row else 0


def main() -> None:
    email_service.smtplib.SMTP = FakeSMTP  # type: ignore[misc]

    cleanup(watermark("notifications"), watermark("activity_logs"))
    notification_mark = watermark("notifications")
    activity_mark = watermark("activity_logs")

    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="critical")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(0.05)

    try:
        create_portal_account(ADMIN_EMAIL, "admin")
        create_portal_account(STAFF_EMAIL, "staff")
        _, admin_auth = login(ADMIN_EMAIL)
        _, staff_auth = login(STAFF_EMAIL)
        admin_token = admin_auth["access_token"]
        staff_token = staff_auth["access_token"]

        test_new_registration(admin_token, staff_token)
        test_approval(admin_token)
        test_rejection(admin_token)
        test_registering_again(admin_token, staff_token)
        test_security(admin_token, staff_token)
        test_concurrency(admin_token)
        test_smtp_reliability(admin_token)
    finally:
        server.should_exit = True
        thread.join(timeout=5)
        cleanup(notification_mark, activity_mark)

    left = db_row(
        "SELECT COUNT(*) AS total FROM users WHERE email LIKE %s",
        f"%{PROBE_DOMAIN}%",
    )
    check(left is not None and left["total"] == 0, "every probe account was removed")

    print()
    if failures:
        print(f"{len(failures)} check(s) FAILED:")
        for failure in failures:
            print(f"  - {failure}")
        sys.exit(1)
    print("All registration approval checks passed.")


if __name__ == "__main__":
    main()
