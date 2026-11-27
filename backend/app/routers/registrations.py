"""Admin review of resident registrations."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import mysql.connector
from fastapi import APIRouter, Depends, HTTPException, Request, status
from mysql.connector import MySQLConnection

from ..activity_logs import record_activity_log
from ..common import format_manila_datetime
from ..database import get_db
from ..dependencies import get_current_admin_user
from ..email_templates import EVENT_APPROVED, EVENT_REJECTED
from ..notifications import (
    NOTIFICATION_TYPE_REGISTRATION,
    build_dedupe_key,
    create_notification,
)
from ..rate_limit import get_client_ip
from ..registration_emails import (
    DELIVERY_FAILED,
    DELIVERY_IN_PROGRESS,
    DELIVERY_SENT,
    deliver_registration_email,
    enqueue_registration_email,
    event_for_account_status,
)
from ..schemas import (
    AdminRegistrationActionResponse,
    AdminRegistrationRejectInput,
    AdminRegistrationResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)


REGISTRATION_SELECT = """
    SELECT resident_profiles.id, users.id AS user_id,
           CONCAT_WS(' ', NULLIF(resident_profiles.first_name, ''),
                          NULLIF(resident_profiles.middle_name, ''),
                          NULLIF(resident_profiles.last_name, ''),
                          NULLIF(resident_profiles.suffix, '')) AS name,
           users.email, users.account_status,
           users.created_at AS registered_at,
           users.reviewed_at, users.rejection_reason,
           TRIM(CONCAT(reviewer.first_name, ' ', reviewer.last_name)) AS reviewed_by,
           registration_emails.delivery_status AS email_status,
           resident_profiles.contact_number, resident_profiles.address,
           resident_profiles.purok, resident_profiles.date_of_birth,
           resident_profiles.place_of_birth, resident_profiles.sex,
           resident_profiles.civil_status, resident_profiles.nationality,
           resident_profiles.religion, resident_profiles.voter_status,
           resident_profiles.house_no, resident_profiles.street,
           resident_profiles.years_of_residency, resident_profiles.occupation,
           resident_profiles.employer,
           resident_profiles.emergency_contact_name,
           resident_profiles.emergency_contact_relationship,
           resident_profiles.emergency_contact_number,
           resident_profiles.emergency_contact_address
    FROM resident_profiles
    JOIN users ON users.id = resident_profiles.user_id
    LEFT JOIN resident_profiles reviewer ON reviewer.user_id = users.reviewed_by
    LEFT JOIN registration_emails
           ON registration_emails.user_id = users.id
          AND registration_emails.event_type = CASE users.account_status
                  WHEN 'pending' THEN 'registered'
                  WHEN 'active' THEN 'approved'
                  WHEN 'rejected' THEN 'rejected'
              END
    WHERE users.role = 'resident'
"""


def registration_response(row: dict[str, object]) -> AdminRegistrationResponse:
    return AdminRegistrationResponse(
        **{
            key: value
            for key, value in row.items()
            if key not in ("user_id", "account_status")
        },
        resident_code=f"RES-{row['id']:03d}",
        status=row["account_status"],
    )


def load_registration_row(
    connection: MySQLConnection, resident_id: int
) -> dict[str, object]:
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            f"{REGISTRATION_SELECT} AND resident_profiles.id = %s",
            (resident_id,),
        )
        row = cursor.fetchone()
    finally:
        cursor.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Registration was not found.")
    return row


def registration_email_message(outcome: str, success: str) -> str:
    """Tell the administrator what happened to the decision and to the email."""
    if outcome == DELIVERY_SENT:
        return f"{success} The resident was notified by email."
    if outcome == DELIVERY_IN_PROGRESS:
        return f"{success} The email to the resident is being sent."
    if outcome == DELIVERY_FAILED:
        return (
            f"{success} The email could not be sent yet. It will be retried "
            "automatically, or you can retry it now."
        )
    return success


def review_registration(
    connection: MySQLConnection,
    *,
    resident_id: int,
    reviewer: dict[str, object],
    new_status: str,
    event: str,
    rejection_reason: str | None,
    notification_title: str,
    notification_message: str,
) -> dict[str, object]:
    """Move a registration out of ``pending`` exactly once.

    The ``account_status = 'pending'`` condition makes the change atomic: of
    two simultaneous reviews only one updates a row, so only one decision is
    stored and only one email and notification exist. The caller sends the
    email after this commits.
    """
    registration = load_registration_row(connection, resident_id)
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            UPDATE users
            SET account_status = %s,
                reviewed_by = %s,
                reviewed_at = UTC_TIMESTAMP(),
                rejection_reason = %s
            WHERE id = %s AND role = 'resident' AND account_status = 'pending'
            """,
            (new_status, reviewer["id"], rejection_reason, registration["user_id"]),
        )
        if cursor.rowcount != 1:
            connection.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This registration has already been reviewed.",
            )
        enqueue_registration_email(
            connection, user_id=registration["user_id"], event=event
        )
        create_notification(
            connection,
            user_id=registration["user_id"],
            title=notification_title,
            message=notification_message,
            notification_type=NOTIFICATION_TYPE_REGISTRATION,
            # An account can be reviewed once per application.
            dedupe_key=build_dedupe_key(
                f"registration-{event}",
                registration["user_id"],
                registration["registered_at"],
            ),
        )
        connection.commit()
    except mysql.connector.Error as error:
        connection.rollback()
        logger.exception("Could not save the registration review.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save the review. Please try again.",
        ) from error
    finally:
        cursor.close()
    return registration


@router.get("/api/admin/registrations", response_model=list[AdminRegistrationResponse])
def list_registrations(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> list[AdminRegistrationResponse]:
    """Registrations awaiting review plus those already decided.

    Accounts created before this workflow were never reviewed, so they are not
    registrations and stay out of this list.
    """
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            f"""
            {REGISTRATION_SELECT}
              AND (users.account_status IN ('pending', 'rejected')
                   OR users.reviewed_at IS NOT NULL)
            ORDER BY users.created_at DESC, users.id DESC
            """
        )
        return [registration_response(row) for row in cursor.fetchall()]
    finally:
        cursor.close()


@router.post(
    "/api/admin/registrations/{resident_id}/approve",
    response_model=AdminRegistrationActionResponse,
)
def approve_registration(
    resident_id: int,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminRegistrationActionResponse:
    decided_at = format_manila_datetime(datetime.now(timezone.utc))
    registration = review_registration(
        connection,
        resident_id=resident_id,
        reviewer=current_user,
        new_status="active",
        event=EVENT_APPROVED,
        rejection_reason=None,
        notification_title="Registration approved",
        notification_message=(
            f"Your registration was approved on {decided_at}. Your account is "
            "now active."
        ),
    )
    record_activity_log(
        connection,
        user_id=current_user["id"],
        action_type="Approve",
        action="approved resident registration",
        target=f"RES-{resident_id:03d}",
        target_type="Resident",
        ip_address=get_client_ip(request),
    )
    outcome = deliver_registration_email(
        connection, user_id=registration["user_id"], event=EVENT_APPROVED
    )
    return AdminRegistrationActionResponse(
        registration=registration_response(
            load_registration_row(connection, resident_id)
        ),
        email_delivery=outcome,
        message=registration_email_message(outcome, "Registration approved."),
    )


@router.post(
    "/api/admin/registrations/{resident_id}/reject",
    response_model=AdminRegistrationActionResponse,
)
def reject_registration(
    resident_id: int,
    payload: AdminRegistrationRejectInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminRegistrationActionResponse:
    decided_at = format_manila_datetime(datetime.now(timezone.utc))
    registration = review_registration(
        connection,
        resident_id=resident_id,
        reviewer=current_user,
        new_status="rejected",
        event=EVENT_REJECTED,
        rejection_reason=payload.reason,
        notification_title="Registration rejected",
        notification_message=(
            f"Your registration was rejected on {decided_at}. "
            f"Reason: {payload.reason}"
        ),
    )
    record_activity_log(
        connection,
        user_id=current_user["id"],
        action_type="Reject",
        action="rejected resident registration",
        target=f"RES-{resident_id:03d}",
        target_type="Resident",
        ip_address=get_client_ip(request),
    )
    outcome = deliver_registration_email(
        connection, user_id=registration["user_id"], event=EVENT_REJECTED
    )
    return AdminRegistrationActionResponse(
        registration=registration_response(
            load_registration_row(connection, resident_id)
        ),
        email_delivery=outcome,
        message=registration_email_message(outcome, "Registration rejected."),
    )


@router.post(
    "/api/admin/registrations/{resident_id}/email/retry",
    response_model=AdminRegistrationActionResponse,
)
def retry_registration_email(
    resident_id: int,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminRegistrationActionResponse:
    """Resend the email for the current status, only if it was not delivered."""
    registration = load_registration_row(connection, resident_id)
    event = event_for_account_status(str(registration["account_status"]))
    if event is None or registration["email_status"] != DELIVERY_FAILED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="There is no failed email to retry for this registration.",
        )
    outcome = deliver_registration_email(
        connection, user_id=registration["user_id"], event=event
    )
    return AdminRegistrationActionResponse(
        registration=registration_response(
            load_registration_row(connection, resident_id)
        ),
        email_delivery=outcome,
        message=(
            "The email was sent."
            if outcome == DELIVERY_SENT
            else registration_email_message(outcome, "The retry did not finish.")
        ),
    )
