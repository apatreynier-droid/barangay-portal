"""End-to-end checks for automatic document-request status emails.

Run from the backend folder:

    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    python scripts\\test_request_status_email.py

The script creates disposable resident accounts and document requests, then
verifies that every status notification resolves to the request owner's
registered email (never a shared or hardcoded address), that duplicate status
updates do not send a second email, and that a failed send never rolls the
status back. All test rows are removed afterwards.
"""

from __future__ import annotations

import datetime as dt
import logging
import sys
import uuid
from pathlib import Path
from typing import Any

import mysql.connector

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import app.request_notifications as request_notifications  # noqa: E402
from app.database import create_connection
from app.email_templates import render_request_status_email
from app.email_service import EmailDeliveryError
from app.request_notifications import (
    DELIVERY_DUPLICATE,
    DELIVERY_FAILED,
    DELIVERY_SKIPPED,
    DELIVERY_SENT,
    NOTIFIABLE_STATUSES,
    load_request_owner,
    send_request_status_email,
)
from app.security import hash_password

logger = logging.getLogger(__name__)

TEST_DOMAIN = f"test-{uuid.uuid4().hex[:8]}.example"

READY_FOR_PICKUP_SUBJECT = "Your Barangay Document is Ready for Pickup"


def make_test_user(
    cursor: mysql.connector.cursor.MySQLCursor,
    *,
    email: str,
    first_name: str,
    last_name: str,
) -> dict[str, Any]:
    """Insert a resident account + profile. Returns ``{"id", "email"}``."""
    cursor.execute(
        "INSERT INTO users (email, password_hash, role) VALUES (%s, %s, 'resident')",
        (email, hash_password("TestPassword123!")),
    )
    user_id = int(cursor.lastrowid)
    cursor.execute(
        "INSERT INTO resident_profiles (user_id, first_name, last_name, purok) "
        "VALUES (%s, %s, %s, 'Purok Test')",
        (user_id, first_name, last_name),
    )
    return {"id": user_id, "email": email}


def make_test_request(
    cursor: mysql.connector.cursor.MySQLCursor,
    *,
    user_id: int,
    document_type_id: int,
) -> int:
    """Insert a Pending request for ``user_id`` and return its id."""
    cursor.execute(
        "INSERT INTO requests "
        "(request_number, user_id, document_type_id, purpose, status) "
        "VALUES (%s, %s, %s, %s, 'Pending')",
        (f"TEST-{uuid.uuid4().hex[:12].upper()}", user_id, document_type_id, "Test purpose"),
    )
    return int(cursor.lastrowid)


def get_document_type_id(cursor: mysql.connector.cursor.MySQLCursor) -> int:
    cursor.execute("SELECT id FROM document_types LIMIT 1")
    row = cursor.fetchone()
    assert row is not None, "document_types table is empty; cannot create test requests"
    return int(row["id"])


def get_admin_user_id(cursor: mysql.connector.cursor.MySQLCursor) -> int:
    """Return an admin id for history rows, creating a test admin if needed."""
    cursor.execute("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
    row = cursor.fetchone()
    if row is not None:
        return int(row["id"])
    cursor.execute(
        "INSERT INTO users (email, password_hash, role) VALUES (%s, %s, 'admin')",
        (f"admin.{TEST_DOMAIN}", hash_password("TestPassword123!")),
    )
    return int(cursor.lastrowid)


def set_request_status(
    connection: mysql.connector.connection.MySQLConnection,
    cursor: mysql.connector.cursor.MySQLCursor,
    request_id: int,
    new_status: str,
    *,
    pickup_date: dt.date | None = None,
    remarks: str | None = None,
) -> None:
    """Mirror the admin endpoint's writes (status + history + notification)."""
    cursor.execute("SELECT user_id FROM requests WHERE id = %s", (request_id,))
    row = cursor.fetchone()
    assert row is not None, f"request #{request_id} disappeared"
    user_id = int(row["user_id"])
    admin_id = get_admin_user_id(cursor)
    cursor.execute(
        "UPDATE requests SET status = %s, "
        "completed_at = CASE WHEN %s = 'Completed' THEN NOW() ELSE completed_at END, "
        "pickup_date = COALESCE(%s, pickup_date), "
        "admin_remarks = COALESCE(%s, admin_remarks), last_updated = NOW() "
        "WHERE id = %s",
        (new_status, new_status, pickup_date, remarks, request_id),
    )
    cursor.execute(
        "INSERT INTO request_status_history "
        "(request_id, old_status, new_status, changed_by, remarks) "
        "VALUES (%s, %s, %s, %s, %s)",
        (request_id, new_status, new_status, admin_id, remarks),
    )
    cursor.execute(
        "INSERT INTO notifications "
        "(user_id, title, message, notification_type, related_request_id) "
        "VALUES (%s, %s, %s, 'request', %s)",
        (
            user_id,
            f"Request {new_status}",
            f"Your document request is now {new_status}.",
            request_id,
        ),
    )
    connection.commit()


def get_delivery_row(
    cursor: mysql.connector.cursor.MySQLCursor, request_id: int, status: str
) -> dict[str, Any] | None:
    cursor.execute(
        "SELECT * FROM request_status_emails WHERE request_id = %s AND status = %s",
        (request_id, status),
    )
    row = cursor.fetchone()
    return dict(row) if row else None


def count_delivery_rows(
    cursor: mysql.connector.cursor.MySQLCursor, request_id: int
) -> int:
    cursor.execute(
        "SELECT COUNT(*) AS c FROM request_status_emails WHERE request_id = %s",
        (request_id,),
    )
    return int(cursor.fetchone()["c"])


def get_request_status(
    cursor: mysql.connector.cursor.MySQLCursor, request_id: int
) -> str:
    cursor.execute("SELECT status FROM requests WHERE id = %s", (request_id,))
    row = cursor.fetchone()
    assert row is not None
    return str(row["status"])


def cleanup_test_data(connection: mysql.connector.connection.MySQLConnection) -> None:
    """Remove every row this script created (idempotent)."""
    cursor = connection.cursor()
    try:
        cursor.execute(
            "DELETE FROM notifications WHERE related_request_id IN "
            "(SELECT id FROM requests WHERE request_number LIKE 'TEST-%')"
        )
        cursor.execute(
            "DELETE FROM request_status_emails WHERE request_id IN "
            "(SELECT id FROM requests WHERE request_number LIKE 'TEST-%')"
        )
        cursor.execute(
            "DELETE FROM request_status_history WHERE request_id IN "
            "(SELECT id FROM requests WHERE request_number LIKE 'TEST-%')"
        )
        cursor.execute("DELETE FROM requests WHERE request_number LIKE 'TEST-%'")
        cursor.execute(
            "DELETE FROM resident_profiles WHERE user_id IN "
            "(SELECT id FROM users WHERE email LIKE %s)",
            (f"%{TEST_DOMAIN}",),
        )
        cursor.execute(
            "DELETE FROM users WHERE email LIKE %s", (f"%{TEST_DOMAIN}",)
        )
        connection.commit()
    finally:
        cursor.close()


def require_delivery_table(connection: mysql.connector.connection.MySQLConnection) -> None:
    cursor = connection.cursor()
    try:
        cursor.execute(
            "SELECT COUNT(*) FROM information_schema.TABLES "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s",
            ("request_status_emails",),
        )
        (count,) = cursor.fetchone()
    finally:
        cursor.close()
    assert count > 0, (
        "The request_status_emails table does not exist. Run: "
        "python scripts/apply_request_status_email_migration.py"
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_owner_lookup_resolves_each_request_to_its_own_resident() -> None:
    """Two residents' requests must resolve to two different, correct emails."""
    connection = create_connection()
    try:
        require_delivery_table(connection)
        cursor = connection.cursor(dictionary=True)
        try:
            alice = make_test_user(
                cursor, email=f"alice.{TEST_DOMAIN}", first_name="Alice", last_name="A"
            )
            bob = make_test_user(
                cursor, email=f"bob.{TEST_DOMAIN}", first_name="Bob", last_name="B"
            )
            dt_id = get_document_type_id(cursor)
            req_a = make_test_request(cursor, user_id=alice["id"], document_type_id=dt_id)
            req_b = make_test_request(cursor, user_id=bob["id"], document_type_id=dt_id)
            connection.commit()

            owner_a = load_request_owner(connection, req_a)
            owner_b = load_request_owner(connection, req_b)

            assert owner_a is not None and owner_b is not None
            assert owner_a["email"].strip().lower() == alice["email"]
            assert owner_b["email"].strip().lower() == bob["email"]
            assert owner_a["email"].strip().lower() != owner_b["email"].strip().lower(), (
                "Two residents' requests must never resolve to the same email."
            )
        finally:
            cursor.close()
    finally:
        cleanup_test_data(connection)
        connection.close()


def test_every_notifiable_status_is_sent_to_the_request_owner() -> None:
    """Approved/Processing/Ready for Pickup/Completed/Rejected route to the owner."""
    connection = create_connection()
    try:
        require_delivery_table(connection)
        cursor = connection.cursor(dictionary=True)
        try:
            resident = make_test_user(
                cursor, email=f"flow.{TEST_DOMAIN}", first_name="Flow", last_name="Test"
            )
            dt_id = get_document_type_id(cursor)
            request_id = make_test_request(cursor, user_id=resident["id"], document_type_id=dt_id)
            connection.commit()

            for new_status in NOTIFIABLE_STATUSES:
                set_request_status(connection, cursor, request_id, new_status)
                with _PatchedSending(EmailRecorder()) as recorder:
                    outcome = send_request_status_email(
                        connection, request_id=request_id, new_status=new_status
                    )
                assert outcome == DELIVERY_SENT, (
                    f"Expected '{new_status}' to send; got '{outcome}'."
                )
                assert len(recorder.sent) == 1, (
                    f"'{new_status}' should trigger exactly one email; "
                    f"got {len(recorder.sent)}."
                )
                sent = recorder.sent[0]
                assert sent["to_email"].strip().lower() == resident["email"], (
                    f"The '{new_status}' email must go to {resident['email']}."
                )
                row = get_delivery_row(cursor, request_id, new_status)
                assert row is not None
                assert row["delivery_status"] == DELIVERY_SENT
                assert str(row["recipient_email"]).strip().lower() == resident["email"], (
                    f"The '{new_status}' email must go to {resident['email']}."
                )
        finally:
            cursor.close()
    finally:
        cleanup_test_data(connection)
        connection.close()


class EmailRecorder:
    """Stands in for the real SMTP send so tests never depend on Gmail.

    Records every ``(to_email, status)`` the notification layer asks for. When
    ``error`` is set, raising it simulates an SMTP outage.
    """

    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []
        self.error: Exception | None = None

    def __call__(self, **kwargs: Any) -> None:
        if self.error is not None:
            raise self.error
        self.sent.append(dict(kwargs))


class _PatchedSending:
    """Temporarily replace the SMTP layer inside ``request_notifications``."""

    def __init__(self, recorder: EmailRecorder) -> None:
        self._recorder = recorder
        self._original_send: Any = None
        self._original_configured: Any = None

    def __enter__(self) -> EmailRecorder:
        self._original_send = request_notifications.send_document_status_email
        self._original_configured = request_notifications.is_email_configured
        request_notifications.send_document_status_email = self._recorder
        request_notifications.is_email_configured = lambda: True
        return self._recorder

    def __exit__(self, *exc: Any) -> None:
        request_notifications.send_document_status_email = self._original_send
        request_notifications.is_email_configured = self._original_configured


def test_duplicate_status_update_sends_only_once() -> None:
    """A repeated status update must not trigger a second email."""
    connection = create_connection()
    try:
        require_delivery_table(connection)
        cursor = connection.cursor(dictionary=True)
        try:
            resident = make_test_user(
                cursor, email=f"dedup.{TEST_DOMAIN}", first_name="Dedup", last_name="Test"
            )
            dt_id = get_document_type_id(cursor)
            request_id = make_test_request(cursor, user_id=resident["id"], document_type_id=dt_id)
            connection.commit()
            set_request_status(connection, cursor, request_id, "Approved")

            with _PatchedSending(EmailRecorder()) as recorder:
                first = send_request_status_email(
                    connection, request_id=request_id, new_status="Approved"
                )
                second = send_request_status_email(
                    connection, request_id=request_id, new_status="Approved"
                )

            assert first == DELIVERY_SENT
            assert second == DELIVERY_DUPLICATE, (
                "A duplicated status update must be suppressed, not re-sent."
            )
            assert len(recorder.sent) == 1, (
                f"Exactly one email should be sent; got {len(recorder.sent)}."
            )
            assert recorder.sent[0]["to_email"].strip().lower() == resident["email"]
            assert count_delivery_rows(cursor, request_id) == 1
        finally:
            cursor.close()
    finally:
        cleanup_test_data(connection)
        connection.close()


def test_failed_email_keeps_status_and_logs_the_failure() -> None:
    """An SMTP failure must not roll back the status and must be logged."""
    connection = create_connection()
    try:
        require_delivery_table(connection)
        cursor = connection.cursor(dictionary=True)
        try:
            resident = make_test_user(
                cursor, email=f"fail.{TEST_DOMAIN}", first_name="Fail", last_name="Test"
            )
            dt_id = get_document_type_id(cursor)
            request_id = make_test_request(cursor, user_id=resident["id"], document_type_id=dt_id)
            connection.commit()
            set_request_status(connection, cursor, request_id, "Processing")
            status_before = get_request_status(cursor, request_id)

            recorder = EmailRecorder()
            recorder.error = EmailDeliveryError("Simulated SMTP outage")
            with _PatchedSending(recorder):
                outcome = send_request_status_email(
                    connection, request_id=request_id, new_status="Processing"
                )

            assert outcome == DELIVERY_FAILED
            assert get_request_status(cursor, request_id) == status_before, (
                "A failed email must not undo the committed status change."
            )
            row = get_delivery_row(cursor, request_id, "Processing")
            assert row is not None
            assert row["delivery_status"] == DELIVERY_FAILED
            assert row["error_message"], "Failed sends must record an error message."
            assert "TestPassword" not in str(row["error_message"]), (
                "Stored errors must never contain sensitive data."
            )
        finally:
            cursor.close()
    finally:
        cleanup_test_data(connection)
        connection.close()


def test_non_notifiable_statuses_never_send_email() -> None:
    """'Pending' (and anything unlisted) must not produce an email or a log row."""
    connection = create_connection()
    try:
        require_delivery_table(connection)
        cursor = connection.cursor(dictionary=True)
        try:
            resident = make_test_user(
                cursor, email=f"skip.{TEST_DOMAIN}", first_name="Skip", last_name="Test"
            )
            dt_id = get_document_type_id(cursor)
            request_id = make_test_request(cursor, user_id=resident["id"], document_type_id=dt_id)
            connection.commit()

            with _PatchedSending(EmailRecorder()) as recorder:
                outcome = send_request_status_email(
                    connection, request_id=request_id, new_status="Pending"
                )

            assert outcome == DELIVERY_SKIPPED
            assert recorder.sent == []
            assert count_delivery_rows(cursor, request_id) == 0
        finally:
            cursor.close()
    finally:
        cleanup_test_data(connection)
        connection.close()


def test_ready_for_pickup_email_content() -> None:
    """The Ready for Pickup email carries the required content for the owner."""
    connection = create_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        try:
            resident = make_test_user(
                cursor, email=f"pickup.{TEST_DOMAIN}", first_name="Maria", last_name="Santos"
            )
            dt_id = get_document_type_id(cursor)
            cursor.execute(
                "SELECT document_name FROM document_types WHERE id = %s", (dt_id,)
            )
            document_name = str(cursor.fetchone()["document_name"])
            request_id = make_test_request(cursor, user_id=resident["id"], document_type_id=dt_id)
            connection.commit()
            set_request_status(
                connection,
                cursor,
                request_id,
                "Ready for Pickup",
                pickup_date=dt.date(2026, 9, 28),
                remarks="Please bring a valid ID.",
            )

            owner = load_request_owner(connection, request_id)
            assert owner is not None
            subject, body, _html = render_request_status_email(
                resident_name=str(owner["resident_name"] or "Resident"),
                recipient_email=str(owner["email"]),
                document_name=str(owner["document_name"] or "Barangay document"),
                request_number=str(owner["request_number"] or ""),
                status="Ready for Pickup",
                pickup_date=owner["pickup_date"],
                admin_remarks=owner["admin_remarks"],
            )

            assert subject == READY_FOR_PICKUP_SUBJECT, (
                f"Unexpected subject: {subject!r}"
            )
            assert "Maria" in body, "Email must address the resident by name."
            assert document_name in body, "Email must state the document type."
            assert "Ready for Pickup" in body, "Email must state the status."
            assert "Barangay Lagab Document Portal" in body, (
                "Email must carry the portal branding."
            )
            assert (
                "2026-09-28" in body or "September 28, 2026" in body
            ), "Email must include the pickup date when one is set."
            assert "valid ID" in body, "Email must include the admin remarks."
        finally:
            cursor.close()
    finally:
        cleanup_test_data(connection)
        connection.close()


def test_multi_resident_isolation() -> None:
    """Each of several residents gets exactly their own request's notification."""
    connection = create_connection()
    try:
        require_delivery_table(connection)
        cursor = connection.cursor(dictionary=True)
        try:
            residents = [
                make_test_user(
                    cursor,
                    email=f"isolated-{index}.{TEST_DOMAIN}",
                    first_name=f"Resident{index}",
                    last_name="Isolated",
                )
                for index in range(3)
            ]
            dt_id = get_document_type_id(cursor)
            request_ids = [
                make_test_request(cursor, user_id=r["id"], document_type_id=dt_id)
                for r in residents
            ]
            connection.commit()

            with _PatchedSending(EmailRecorder()) as recorder:
                for resident, request_id in zip(residents, request_ids):
                    set_request_status(connection, cursor, request_id, "Approved")
                    outcome = send_request_status_email(
                        connection, request_id=request_id, new_status="Approved"
                    )
                    assert outcome == DELIVERY_SENT

            assert len(recorder.sent) == len(residents), (
                "Each request must produce exactly one email."
            )
            for email, recorded in zip(
                [r["email"] for r in residents], recorder.sent
            ):
                assert recorded["to_email"].strip().lower() == email, (
                    f"Notification went to {recorded['to_email']!r} instead of {email!r}."
                )
        finally:
            cursor.close()
    finally:
        cleanup_test_data(connection)
        connection.close()


TESTS = [
    test_owner_lookup_resolves_each_request_to_its_own_resident,
    test_every_notifiable_status_is_sent_to_the_request_owner,
    test_duplicate_status_update_sends_only_once,
    test_failed_email_keeps_status_and_logs_the_failure,
    test_non_notifiable_statuses_never_send_email,
    test_ready_for_pickup_email_content,
    test_multi_resident_isolation,
]


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(message)s",
    )
    passed = 0
    failed = 0
    for test in TESTS:
        try:
            test()
        except AssertionError as error:
            failed += 1
            logger.error("FAILED %s: %s", test.__name__, error)
        except Exception:
            failed += 1
            logger.exception("ERROR  %s", test.__name__)
        else:
            passed += 1
            logger.info("PASSED %s", test.__name__)
    print(f"\nresults: {passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
