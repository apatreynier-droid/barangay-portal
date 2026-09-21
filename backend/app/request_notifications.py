"""Automatic email notifications for document-request status changes.

When an administrator moves a document request to a new status, the resident
who *owns that request* must be told about it by email. This module is the
single place that turns a status change into an email:

    request #101 -> requests.user_id -> users.email -> that one inbox

Nothing here is hardcoded: the recipient address is read from the database
through the ``requests.user_id -> users.id`` foreign key every time, so two
residents with two requests always receive their own notification only.

Guarantees relied on by the admin endpoint (``PATCH /api/admin/document-requests/{id}``):

* :func:`send_request_status_email` never raises. A mail server problem is
  logged (and recorded in ``request_status_emails``) but can never roll back
  the status change that was already committed, and never leaks SMTP
  credentials or technical details to the resident.
* Every ``(request_id, status)`` pair is emailed at most once: the row in
  ``request_status_emails`` is claimed with an ``INSERT`` guarded by a UNIQUE
  key before the message is built, so an accidentally repeated update cannot
  send a duplicate.
"""

from __future__ import annotations

import logging
from typing import Any

import mysql.connector
from mysql.connector import MySQLConnection

from .email_service import (
    EmailDeliveryError,
    is_email_configured,
    mask_email,
    send_document_status_email,
)

logger = logging.getLogger(__name__)

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
    """Return the resident who owns ``request_id`` plus the request details.

    The row is loaded through the existing relationships
    (``requests.user_id -> users.id -> resident_profiles.user_id``), so the
    ``email`` value is always the registered address of *that* resident.
    Returns ``None`` when the request no longer exists.
    """
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT requests.id, requests.user_id, requests.request_number,
                   requests.status, requests.pickup_date,
                   requests.admin_remarks,
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

    Returns ``True`` when this call owns the slot, ``False`` when a previous
    update already recorded it (duplicate update -> no second email). When the
    migration that creates ``request_status_emails`` has not been applied the
    email is still sent and a warning is logged, so the feature keeps working.
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

    Call this *after* the status change has been committed. The recipient is
    resolved from the database for this one request (``requests.user_id`` ->
    ``users.email``), so the notification always goes to the registered address
    of the resident who submitted it.

    Returns one of the ``DELIVERY_*`` constants for the caller to log, and
    never raises and never modifies the request row: a mail problem must not
    undo a successful status update or leak details to the resident.
    """
    if new_status not in NOTIFIABLE_STATUSES:
        return DELIVERY_SKIPPED

    try:
        owner = load_request_owner(connection, request_id)
    except mysql.connector.Error as error:
        logger.error(
            "Could not load request #%s to send its '%s' email: %s.",
            request_id,
            new_status,
            type(error).__name__,
        )
        return DELIVERY_FAILED

    if owner is None:
        logger.error(
            "Request #%s no longer exists; its '%s' email was not sent.",
            request_id,
            new_status,
        )
        return DELIVERY_SKIPPED

    user_id = owner.get("user_id")
    if not _claim_notification(
        connection,
        request_id=request_id,
        user_id=user_id if isinstance(user_id, int) else None,
        status=new_status,
    ):
        return DELIVERY_DUPLICATE

    recipient = str(owner.get("email") or "").strip()
    if not recipient:
        logger.error(
            "The resident who owns request #%s has no registered email "
            "address; the '%s' notification was skipped.",
            request_id,
            new_status,
        )
        _record_delivery(
            connection,
            request_id=request_id,
            status=new_status,
            delivery_status=DELIVERY_SKIPPED,
            error_message="Resident account has no registered email address.",
        )
        return DELIVERY_SKIPPED

    if not is_email_configured():
        logger.error(
            "SMTP is not configured; the '%s' email for request #%s (%s) was "
            "not sent.",
            new_status,
            request_id,
            mask_email(recipient),
        )
        _record_delivery(
            connection,
            request_id=request_id,
            status=new_status,
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
            status=new_status,
            pickup_date=owner.get("pickup_date"),
            admin_remarks=owner.get("admin_remarks"),
        )
    except EmailDeliveryError as error:
        # The status change stays committed; only the failure is logged.
        logger.error(
            "Could not email %s about request #%s ('%s'): %s.",
            mask_email(recipient),
            request_id,
            new_status,
            error,
        )
        _record_delivery(
            connection,
            request_id=request_id,
            status=new_status,
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
            new_status,
        )
        _record_delivery(
            connection,
            request_id=request_id,
            status=new_status,
            delivery_status=DELIVERY_FAILED,
            recipient_email=recipient,
            error_message=type(error).__name__[:_MAX_STORED_ERROR_LENGTH],
        )
        return DELIVERY_FAILED

    logger.info(
        "Sent the '%s' notification for request #%s to the resident's "
        "registered address %s.",
        new_status,
        request_id,
        mask_email(recipient),
    )
    _record_delivery(
        connection,
        request_id=request_id,
        status=new_status,
        delivery_status=DELIVERY_SENT,
        recipient_email=recipient,
    )
    return DELIVERY_SENT
