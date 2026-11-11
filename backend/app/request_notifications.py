"""Emails the request owner when a document request changes status.

The recipient is always resolved from the database
(``requests.user_id -> users.email``), never shared between residents.

Guarantees relied on by ``PATCH /api/admin/document-requests/{id}``:

* :func:`send_request_status_email` never raises: failures are logged and
  recorded in ``request_status_emails``, never roll back the committed status
  change, and never expose SMTP details to the resident.
* Each ``(request_id, status)`` pair is emailed at most once, claimed via a
  UNIQUE-guarded ``INSERT`` before sending.
"""

from __future__ import annotations

import logging
from typing import Any

import mysql.connector
from mysql.connector import MySQLConnection

from .config import settings
from .email_service import (
    EmailDeliveryError,
    is_email_configured,
    mask_email,
    send_document_status_email,
)
from .email_templates import SCHEDULE_SET, SCHEDULE_UPDATED, format_pickup_time

logger = logging.getLogger(__name__)

#: Resident "My Requests" page (src/Utils/Shared/routePaths.ts), linked from
#: the status emails. Signed-out residents are sent to the login page first.
FRONTEND_MY_REQUESTS_PATH = "/myRequests"

#: Statuses that trigger an automatic email to the resident.
NOTIFIABLE_STATUSES: tuple[str, ...] = (
    "Approved",
    "Processing",
    "Ready for Pickup",
    "Completed",
    "Rejected",
)

#: MySQL error number for a duplicate value on a UNIQUE key.
DUPLICATE_ENTRY_ERROR = 1062

#: MySQL error number for "table doesn't exist" (migration not applied yet).
MISSING_TABLE_ERROR = 1146

#: Delivery outcomes reported back to the caller (for logging).
DELIVERY_SENT = "sent"
DELIVERY_FAILED = "failed"
DELIVERY_SKIPPED = "skipped"
DELIVERY_DUPLICATE = "duplicate"

_NOTIFICATION_LOG_TABLE = "request_status_emails"
_MAX_STORED_ERROR_LENGTH = 500


def load_request_owner(
    connection: MySQLConnection, request_id: int
) -> dict[str, Any] | None:
    """Return the request details and its owner's registered email.

    Returns ``None`` when the request no longer exists.
    """
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT requests.id, requests.user_id, requests.request_number,
                   requests.status, requests.pickup_date, requests.pickup_time,
                   requests.admin_remarks, requests.last_updated,
                   document_types.document_name,
                   users.email,
                   CONCAT_WS(' ', NULLIF(resident_profiles.first_name, ''),
                                  NULLIF(resident_profiles.middle_name, ''),
                                  NULLIF(resident_profiles.last_name, ''),
                                  NULLIF(resident_profiles.suffix, ''))
                     AS resident_name
            FROM requests
            JOIN users ON users.id = requests.user_id
            JOIN document_types ON document_types.id = requests.document_type_id
            LEFT JOIN resident_profiles
                   ON resident_profiles.user_id = users.id
            WHERE requests.id = %s
            """,
            (request_id,),
        )
        return cursor.fetchone()
    finally:
        cursor.close()


def _claim_notification(
    connection: MySQLConnection, *, request_id: int, user_id: int | None, status: str
) -> bool:
    """Reserve the single send slot for ``(request, status)``.

    Returns ``True`` when this call owns the slot, ``False`` for a duplicate.
    If ``request_status_emails`` does not exist yet, the email is still sent
    and a warning is logged.
    """
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO request_status_emails
              (request_id, user_id, status, delivery_status)
            VALUES (%s, %s, %s, 'pending')
            """,
            (request_id, user_id, status),
        )
        connection.commit()
        return True
    except mysql.connector.Error as error:
        connection.rollback()
        if error.errno == DUPLICATE_ENTRY_ERROR:
            logger.info(
                "The '%s' email for request #%s was already recorded; "
                "no duplicate notification was sent.",
                status,
                request_id,
            )
            return False
        if error.errno == MISSING_TABLE_ERROR:
            logger.warning(
                "Table %s is missing (run scripts/apply_request_status_email_"
                "migration.py). Sending the '%s' email for request #%s without "
                "duplicate protection.",
                _NOTIFICATION_LOG_TABLE,
                status,
                request_id,
            )
            return True
        logger.error(
            "Could not record the '%s' email attempt for request #%s: %s.",
            status,
            request_id,
            type(error).__name__,
        )
        return True
    finally:
        cursor.close()


def _record_delivery(
    connection: MySQLConnection,
    *,
    request_id: int,
    status: str,
    delivery_status: str,
    recipient_email: str | None = None,
    error_message: str | None = None,
) -> None:
    """Store the outcome of an attempt (never raises, only logs)."""
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            UPDATE request_status_emails
            SET delivery_status = %s,
                recipient_email = COALESCE(%s, recipient_email),
                error_message = %s,
                sent_at = CASE WHEN %s = 'sent' THEN NOW() ELSE sent_at END
            WHERE request_id = %s AND status = %s
            """,
            (
                delivery_status,
                recipient_email,
                error_message,
                delivery_status,
                request_id,
                status,
            ),
        )
        connection.commit()
    except mysql.connector.Error as error:
        connection.rollback()
        logger.error(
            "Could not update the %s log row for request #%s (%s): %s.",
            _NOTIFICATION_LOG_TABLE,
            request_id,
            status,
            type(error).__name__,
        )
    finally:
        cursor.close()


def send_request_status_email(
    connection: MySQLConnection, *, request_id: int, new_status: str
) -> str:
    """Email the resident who owns ``request_id`` about ``new_status``.

    Call this after the status change is committed. Returns a ``DELIVERY_*``
    constant for logging; never raises and never modifies the request row.
    """
    if new_status not in NOTIFIABLE_STATUSES:
        return DELIVERY_SKIPPED

    owner, outcome = _load_owner_for_email(connection, request_id, new_status)
    if owner is None:
        return outcome
    return _deliver(connection, owner, template_status=new_status, log_key=new_status)


#: Prefix of the ``request_status_emails.status`` keys of schedule emails.
PICKUP_SCHEDULE_EMAIL = "Pickup schedule"


def send_pickup_schedule_email(
    connection: MySQLConnection, *, request_id: int, rescheduled: bool
) -> str:
    """Re-send the Ready for Pickup email with the pickup date and time.

    Used when the office sets or changes the schedule of a request that is
    already Ready for Pickup (its first Ready for Pickup email went out before
    the schedule existed, or shows the old one). Call it after the schedule is
    committed. Each schedule change is logged under its own key, so one change
    is emailed at most once. Never raises.
    """
    owner, outcome = _load_owner_for_email(connection, request_id, PICKUP_SCHEDULE_EMAIL)
    if owner is None:
        return outcome
    if owner.get("status") != "Ready for Pickup" or owner.get("pickup_date") is None:
        return DELIVERY_SKIPPED

    return _deliver(
        connection,
        owner,
        template_status="Ready for Pickup",
        log_key=_pickup_schedule_log_key(connection, owner),
        schedule_change=SCHEDULE_UPDATED if rescheduled else SCHEDULE_SET,
    )


def _pickup_schedule_log_key(connection: MySQLConnection, owner: dict[str, Any]) -> str:
    """``request_status_emails.status`` value for one schedule change.

    E.g. ``"Pickup schedule #2 2026-11-12 09:30"``. The number makes a return
    to an earlier schedule a new email, while two simultaneous saves of the
    same change still collide on the UNIQUE key (only one email).
    """
    previous = 0
    cursor = connection.cursor()
    try:
        cursor.execute(
            f"SELECT COUNT(*) FROM {_NOTIFICATION_LOG_TABLE} "
            "WHERE request_id = %s AND status LIKE %s",
            (owner["id"], f"{PICKUP_SCHEDULE_EMAIL} #%"),
        )
        previous = int(cursor.fetchone()[0])
    except mysql.connector.Error:
        # Table missing: _claim_notification then sends without the log.
        connection.rollback()
    finally:
        cursor.close()

    time_text = format_pickup_time(owner.get("pickup_time"))
    return " ".join(
        part
        for part in (
            f"{PICKUP_SCHEDULE_EMAIL} #{previous + 1}",
            str(owner["pickup_date"]),
            time_text.replace(" ", ""),
        )
        if part
    )


def _load_owner_for_email(
    connection: MySQLConnection, request_id: int, label: str
) -> tuple[dict[str, Any] | None, str]:
    """``(owner, outcome)``: the request and its owner, or None plus the
    ``DELIVERY_*`` outcome to report (logged here)."""
    try:
        owner = load_request_owner(connection, request_id)
    except mysql.connector.Error as error:
        logger.error(
            "Could not load request #%s to send its '%s' email: %s.",
            request_id,
            label,
            type(error).__name__,
        )
        return None, DELIVERY_FAILED

    if owner is None:
        logger.error(
            "Request #%s no longer exists; its '%s' email was not sent.",
            request_id,
            label,
        )
        return None, DELIVERY_SKIPPED
    return owner, DELIVERY_SENT


def _deliver(
    connection: MySQLConnection,
    owner: dict[str, Any],
    *,
    template_status: str,
    log_key: str,
    schedule_change: str | None = None,
) -> str:
    """Claim ``log_key``, send the ``template_status`` email, record the outcome."""
    request_id = int(owner["id"])
    user_id = owner.get("user_id")
    if not _claim_notification(
        connection,
        request_id=request_id,
        user_id=user_id if isinstance(user_id, int) else None,
        status=log_key,
    ):
        return DELIVERY_DUPLICATE

    recipient = str(owner.get("email") or "").strip()
    if not recipient:
        logger.error(
            "The resident who owns request #%s has no registered email "
            "address; the '%s' notification was skipped.",
            request_id,
            log_key,
        )
        _record_delivery(
            connection,
            request_id=request_id,
            status=log_key,
            delivery_status=DELIVERY_SKIPPED,
            error_message="Resident account has no registered email address.",
        )
        return DELIVERY_SKIPPED

    if not is_email_configured():
        logger.error(
            "SMTP is not configured; the '%s' email for request #%s (%s) was "
            "not sent.",
            log_key,
            request_id,
            mask_email(recipient),
        )
        _record_delivery(
            connection,
            request_id=request_id,
            status=log_key,
            delivery_status=DELIVERY_FAILED,
            recipient_email=recipient,
            error_message="SMTP is not configured.",
        )
        return DELIVERY_FAILED

    try:
        send_document_status_email(
            to_email=recipient,
            resident_name=str(owner.get("resident_name") or "Resident"),
            document_name=str(owner.get("document_name") or "Barangay document"),
            request_number=str(owner.get("request_number") or ""),
            status=template_status,
            pickup_date=owner.get("pickup_date"),
            pickup_time=owner.get("pickup_time"),
            admin_remarks=owner.get("admin_remarks"),
            # When the request last changed (UTC), shown in Philippine time.
            event_time=owner.get("last_updated"),
            portal_url=f"{settings.frontend_url}{FRONTEND_MY_REQUESTS_PATH}",
            schedule_change=schedule_change,
        )
    except EmailDeliveryError as error:
        # The saved change stays committed; only the failure is logged.
        logger.error(
            "Could not email %s about request #%s ('%s'): %s.",
            mask_email(recipient),
            request_id,
            log_key,
            error,
        )
        _record_delivery(
            connection,
            request_id=request_id,
            status=log_key,
            delivery_status=DELIVERY_FAILED,
            recipient_email=recipient,
            error_message=f"EmailDeliveryError: {error}"[:_MAX_STORED_ERROR_LENGTH],
        )
        return DELIVERY_FAILED
    except Exception as error:  # noqa: BLE001 - email must never break the endpoint
        logger.exception(
            "Unexpected problem while emailing %s about request #%s ('%s').",
            mask_email(recipient),
            request_id,
            log_key,
        )
        _record_delivery(
            connection,
            request_id=request_id,
            status=log_key,
            delivery_status=DELIVERY_FAILED,
            recipient_email=recipient,
            error_message=type(error).__name__[:_MAX_STORED_ERROR_LENGTH],
        )
        return DELIVERY_FAILED

    logger.info(
        "Sent the '%s' notification for request #%s to the resident's "
        "registered address %s.",
        log_key,
        request_id,
        mask_email(recipient),
    )
    _record_delivery(
        connection,
        request_id=request_id,
        status=log_key,
        delivery_status=DELIVERY_SENT,
        recipient_email=recipient,
    )
    return DELIVERY_SENT
