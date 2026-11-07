"""Outbox for the three resident registration emails.

A registration, approval or rejection commits one ``registration_emails`` row
in the same transaction as the account change. Sending happens afterwards, so
a mail problem can never undo the account change, and the row stays behind as
the record of what still has to be delivered:

    status change + outbox row -> COMMIT -> send now -> sent / failed
                                                          |
                     background worker or admin retry <---+

Guarantees relied on by the endpoints in ``app/main.py``:

* One email per event: ``UNIQUE (user_id, event_type)`` means a repeated event
  cannot queue a second message. A rejected resident who applies again starts
  a new application, so :func:`reset_registration_emails` clears the old rows.
* One sender per attempt: :func:`deliver_registration_email` claims the row with
  a single conditional ``UPDATE``, so a request and the worker cannot both send
  it. A row left in ``sending`` by a crashed process is reclaimed after
  ``STALE_CLAIM_SECONDS``.
* No outdated news: the account status is re-read before sending, so a retried
  "approved" email is dropped if the account has since been deactivated.
* :func:`deliver_registration_email` never raises, and stored errors contain
  only the generic messages from ``app/email_service.py``, never credentials.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable

import mysql.connector
from mysql.connector import MySQLConnection

from .config import settings
from .database import create_connection
from .email_service import (
    EmailDeliveryError,
    is_email_configured,
    mask_email,
    send_registration_email,
)
from .email_templates import EVENT_APPROVED, EVENT_REGISTERED, EVENT_REJECTED

logger = logging.getLogger(__name__)

#: Frontend route the approval email links to (see src/Utils/Shared/routePaths.ts).
FRONTEND_LOGIN_PATH = "/login"

#: The account status each email describes. Anything else makes it outdated.
_REQUIRED_ACCOUNT_STATUS = {
    EVENT_REGISTERED: "pending",
    EVENT_APPROVED: "active",
    EVENT_REJECTED: "rejected",
}

DELIVERY_SENT = "sent"
DELIVERY_FAILED = "failed"
DELIVERY_SKIPPED = "skipped"
DELIVERY_IN_PROGRESS = "in_progress"

#: Seconds before the worker may pick up a row the request has not sent yet.
INITIAL_GRACE_SECONDS = 120
#: Seconds to wait after the 1st, 2nd, ... failed attempt.
RETRY_BACKOFF_SECONDS = (60, 300, 900, 3600, 21600)
STALE_CLAIM_SECONDS = 600
_DUE_BATCH_SIZE = 20
_MAX_STORED_ERROR_LENGTH = 500


def event_for_account_status(account_status: str) -> str | None:
    """Return the event whose email describes this account status, if any."""
    for event, required_status in _REQUIRED_ACCOUNT_STATUS.items():
        if required_status == account_status:
            return event
    return None


def enqueue_registration_email(
    connection: MySQLConnection, *, user_id: int, event: str
) -> None:
    """Queue the email. The caller's transaction owns the commit."""
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO registration_emails
              (user_id, event_type, next_attempt_at)
            VALUES (%s, %s, UTC_TIMESTAMP() + INTERVAL %s SECOND)
            ON DUPLICATE KEY UPDATE id = id
            """,
            (user_id, event, INITIAL_GRACE_SECONDS),
        )
    finally:
        cursor.close()


def reset_registration_emails(connection: MySQLConnection, *, user_id: int) -> None:
    """Start a new application's emails. The caller's transaction owns the commit."""
    cursor = connection.cursor()
    try:
        cursor.execute(
            "DELETE FROM registration_emails WHERE user_id = %s",
            (user_id,),
        )
    finally:
        cursor.close()


def deliver_registration_email(
    connection: MySQLConnection, *, user_id: int, event: str
) -> str:
    """Send one queued email if nobody else has. Returns a ``DELIVERY_*`` value."""
    try:
        if not _claim(connection, user_id=user_id, event=event):
            return _existing_outcome(connection, user_id=user_id, event=event)

        recipient = _load_recipient(connection, user_id=user_id)
        required_status = _REQUIRED_ACCOUNT_STATUS[event]
        if recipient is None or recipient["account_status"] != required_status:
            _record(
                connection,
                user_id=user_id,
                event=event,
                delivery_status=DELIVERY_SKIPPED,
                error="The account status changed before this email was sent.",
            )
            return DELIVERY_SKIPPED

        email = str(recipient["email"])
        try:
            send_registration_email(
                to_email=email,
                event=event,
                login_url=f"{settings.frontend_url}{FRONTEND_LOGIN_PATH}",
                rejection_reason=recipient["rejection_reason"],
                resident_name=str(recipient.get("resident_name") or ""),
                # The real moment of the event (UTC), not when a retry ran:
                # submitted for "registered", reviewed for approved/rejected.
                event_time=(
                    recipient.get("created_at")
                    if event == EVENT_REGISTERED
                    else recipient.get("reviewed_at") or None
                ),
            )
        except EmailDeliveryError as error:
            logger.error(
                "Could not send the '%s' registration email to %s: %s",
                event,
                mask_email(email),
                error,
            )
            _record_failure(connection, user_id, event, email, str(error))
            return DELIVERY_FAILED
        except Exception as error:  # noqa: BLE001 - email must never break the caller
            logger.exception(
                "Unexpected problem sending the '%s' registration email to %s.",
                event,
                mask_email(email),
            )
            _record_failure(connection, user_id, event, email, type(error).__name__)
            return DELIVERY_FAILED

        _record(
            connection,
            user_id=user_id,
            event=event,
            delivery_status=DELIVERY_SENT,
            recipient_email=email,
        )
        return DELIVERY_SENT
    except mysql.connector.Error as error:
        _safe_rollback(connection)
        logger.error(
            "Database problem while processing the '%s' registration email for "
            "user #%s: %s.",
            event,
            user_id,
            type(error).__name__,
        )
        return DELIVERY_FAILED


def deliver_in_background(user_id: int, event: str) -> None:
    """``BackgroundTasks`` entry point: the request's connection is closed by now."""
    try:
        connection = create_connection()
    except mysql.connector.Error as error:
        # The queued row is still there, so the worker delivers it later.
        logger.error(
            "No database connection for the '%s' registration email: %s.",
            event,
            type(error).__name__,
        )
        return
    try:
        deliver_registration_email(connection, user_id=user_id, event=event)
    finally:
        connection.close()


def process_due_registration_emails(connection: MySQLConnection) -> int:
    """Attempt every email whose retry time has arrived. Returns how many ran."""
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT user_id, event_type
            FROM registration_emails
            WHERE (delivery_status IN ('pending', 'failed')
                   AND attempts < %s
                   AND next_attempt_at IS NOT NULL
                   AND next_attempt_at <= UTC_TIMESTAMP())
               OR (delivery_status = 'sending'
                   AND claimed_at < UTC_TIMESTAMP() - INTERVAL %s SECOND)
            ORDER BY id ASC
            LIMIT %s
            """,
            (
                settings.registration_email_max_attempts,
                STALE_CLAIM_SECONDS,
                _DUE_BATCH_SIZE,
            ),
        )
        due = cursor.fetchall()
    finally:
        cursor.close()
    connection.commit()

    for row in due:
        deliver_registration_email(
            connection, user_id=int(row["user_id"]), event=str(row["event_type"])
        )
    return len(due)


def start_registration_email_worker() -> Callable[[], None]:
    """Start the retry loop and return the function that stops it.

    An interval of 0 or less disables the worker (the admin retry still works).
    """
    interval = settings.registration_email_worker_interval_seconds
    if interval <= 0:
        return lambda: None

    stop_event = threading.Event()

    def run() -> None:
        while not stop_event.wait(interval):
            # Without SMTP settings every attempt would fail, so keep the
            # remaining attempts for when the server is configured.
            if not is_email_configured():
                continue
            try:
                connection = create_connection()
                try:
                    process_due_registration_emails(connection)
                finally:
                    connection.close()
            except mysql.connector.Error as error:
                logger.error(
                    "The registration email retry pass failed: %s.",
                    type(error).__name__,
                )
            except Exception:  # noqa: BLE001 - the loop must survive one bad pass
                logger.exception("The registration email retry pass failed.")

    thread = threading.Thread(
        target=run, name="registration-email-worker", daemon=True
    )
    thread.start()

    def stop() -> None:
        stop_event.set()
        thread.join(timeout=2)

    return stop


def _claim(connection: MySQLConnection, *, user_id: int, event: str) -> bool:
    """Reserve the send slot. ``True`` means this caller is the only sender."""
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            UPDATE registration_emails
            SET delivery_status = 'sending',
                claimed_at = UTC_TIMESTAMP(),
                attempts = attempts + 1
            WHERE user_id = %s
              AND event_type = %s
              AND (delivery_status IN ('pending', 'failed')
                   OR (delivery_status = 'sending'
                       AND claimed_at < UTC_TIMESTAMP() - INTERVAL %s SECOND))
            """,
            (user_id, event, STALE_CLAIM_SECONDS),
        )
        claimed = cursor.rowcount == 1
    finally:
        cursor.close()
    connection.commit()
    return claimed


def _existing_outcome(
    connection: MySQLConnection, *, user_id: int, event: str
) -> str:
    """Describe a row this call could not claim."""
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT delivery_status
            FROM registration_emails
            WHERE user_id = %s AND event_type = %s
            """,
            (user_id, event),
        )
        row = cursor.fetchone()
    finally:
        cursor.close()
    connection.commit()
    if row is None:
        return DELIVERY_SKIPPED
    status = row["delivery_status"]
    return DELIVERY_IN_PROGRESS if status == "sending" else str(status)


def _load_recipient(
    connection: MySQLConnection, *, user_id: int
) -> dict[str, object] | None:
    """Read the registered address and current decision of this one resident."""
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT users.email, users.account_status, users.rejection_reason,
                   users.created_at, users.reviewed_at,
                   CONCAT_WS(' ', NULLIF(resident_profiles.first_name, ''),
                                  NULLIF(resident_profiles.middle_name, ''),
                                  NULLIF(resident_profiles.last_name, ''),
                                  NULLIF(resident_profiles.suffix, ''))
                     AS resident_name
            FROM users
            LEFT JOIN resident_profiles ON resident_profiles.user_id = users.id
            WHERE users.id = %s AND users.role = 'resident'
            """,
            (user_id,),
        )
        return cursor.fetchone()
    finally:
        cursor.close()


def _record_failure(
    connection: MySQLConnection,
    user_id: int,
    event: str,
    email: str,
    error: str,
) -> None:
    """Store the failure and schedule the next automatic attempt, if any remain."""
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT attempts
            FROM registration_emails
            WHERE user_id = %s AND event_type = %s
            """,
            (user_id, event),
        )
        row = cursor.fetchone()
    finally:
        cursor.close()

    attempts = int(row["attempts"]) if row else settings.registration_email_max_attempts
    retry_in: int | None = None
    if attempts < settings.registration_email_max_attempts:
        step = max(min(attempts, len(RETRY_BACKOFF_SECONDS)) - 1, 0)
        retry_in = RETRY_BACKOFF_SECONDS[step]

    _record(
        connection,
        user_id=user_id,
        event=event,
        delivery_status=DELIVERY_FAILED,
        recipient_email=email,
        error=error,
        retry_in_seconds=retry_in,
    )


def _record(
    connection: MySQLConnection,
    *,
    user_id: int,
    event: str,
    delivery_status: str,
    recipient_email: str | None = None,
    error: str | None = None,
    retry_in_seconds: int | None = None,
) -> None:
    """Persist the outcome of the claimed attempt."""
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            UPDATE registration_emails
            SET delivery_status = %s,
                recipient_email = COALESCE(%s, recipient_email),
                last_error = %s,
                claimed_at = NULL,
                next_attempt_at = UTC_TIMESTAMP() + INTERVAL %s SECOND,
                sent_at = CASE WHEN %s = 'sent' THEN UTC_TIMESTAMP() ELSE sent_at END
            WHERE user_id = %s AND event_type = %s
            """,
            (
                delivery_status,
                recipient_email,
                error[:_MAX_STORED_ERROR_LENGTH] if error else None,
                retry_in_seconds,
                delivery_status,
                user_id,
                event,
            ),
        )
    finally:
        cursor.close()
    connection.commit()


def _safe_rollback(connection: MySQLConnection) -> None:
    try:
        connection.rollback()
    except mysql.connector.Error:
        pass
