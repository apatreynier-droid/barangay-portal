"""Admin processing of document requests and request history."""

from __future__ import annotations

import mysql.connector
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from mysql.connector import MySQLConnection

from ..activity_logs import record_activity_log
from ..attachments import (
    build_attachment_response,
    fetch_attachment_row,
    load_attachment_meta,
)
from ..common import actor_display_name, actor_role_label, clean_optional
from ..database import get_db
from ..dependencies import get_current_admin_portal_user
from ..email_templates import format_pickup_schedule
from ..notifications import NOTIFICATION_TYPE_REQUEST, build_dedupe_key, notify_admins
from ..rate_limit import get_client_ip
from ..request_notifications import (
    send_pickup_schedule_email,
    send_request_status_email,
)
from ..schemas import (
    AdminDocumentRequestDetailResponse,
    AdminDocumentRequestResponse,
    AdminRequestActionInput,
    AdminRequestHistoryResponse,
    pickup_time_from_db,
)

router = APIRouter()


#: Resident notification title when a request becomes Ready for Pickup. The
#: Resident Notifications page shows "View My Request" for it (and for the
#: older "Request Ready for Pickup" title and the "Pickup schedule ..." notices).
READY_FOR_PICKUP_NOTIFICATION_TITLE = "Your Document Is Ready for Pickup!"


@router.get("/api/admin/document-requests", response_model=list[AdminDocumentRequestResponse])
def list_document_requests(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_portal_user),
) -> list[AdminDocumentRequestResponse]:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.request_number,
               CONCAT(resident_profiles.first_name, ' ',
                      resident_profiles.last_name) AS resident_name,
               document_types.document_name AS document,
               requests.purpose,
               requests.status, requests.submitted_at, document_types.fee
        FROM requests
        JOIN users ON users.id = requests.user_id
        JOIN resident_profiles ON resident_profiles.user_id = users.id
        JOIN document_types ON document_types.id = requests.document_type_id
        ORDER BY requests.submitted_at DESC, requests.id DESC
        """
    )
    document_requests = [
        AdminDocumentRequestResponse(
            id=row["id"],
            request_number=row["request_number"],
            resident_name=row["resident_name"],
            document=row["document"],
            purpose=row["purpose"],
            status=row["status"],
            submitted_at=row["submitted_at"],
            fee=float(row["fee"]),
        )
        for row in cursor.fetchall()
    ]
    cursor.close()
    return document_requests


@router.get(
    "/api/admin/request-history",
    response_model=list[AdminRequestHistoryResponse],
)
def list_request_history(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_portal_user),
) -> list[AdminRequestHistoryResponse]:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.request_number,
               CONCAT(resident_profiles.first_name, ' ',
                      resident_profiles.last_name) AS resident_name,
               document_types.document_name AS document,
               requests.status, requests.submitted_at,
               (SELECT TRIM(CONCAT(admin_profile.first_name, ' ',
                                   admin_profile.last_name))
                FROM request_status_history history
                JOIN resident_profiles admin_profile
                     ON admin_profile.user_id = history.changed_by
                WHERE history.request_id = requests.id
                  AND history.changed_by IS NOT NULL
                ORDER BY history.changed_at DESC, history.id DESC
                LIMIT 1) AS processed_by,
               resident_profiles.first_name AS resident_first_name,
               resident_profiles.middle_name AS resident_middle_name,
               resident_profiles.last_name AS resident_last_name,
               resident_profiles.suffix AS resident_suffix,
               resident_profiles.civil_status, resident_profiles.nationality,
               resident_profiles.date_of_birth, resident_profiles.purok,
               resident_profiles.years_of_residency,
               resident_profiles.place_of_birth, resident_profiles.sex,
               requests.purpose, document_types.fee
        FROM requests
        JOIN users ON users.id = requests.user_id
        JOIN resident_profiles ON resident_profiles.user_id = users.id
        JOIN document_types ON document_types.id = requests.document_type_id
        ORDER BY requests.submitted_at DESC, requests.id DESC
        """
    )
    history_requests = [
        AdminRequestHistoryResponse(
            id=row["id"],
            request_number=row["request_number"],
            resident_name=row["resident_name"],
            document=row["document"],
            status=row["status"],
            submitted_at=row["submitted_at"],
            processed_by=row["processed_by"],
            resident_first_name=row["resident_first_name"],
            resident_middle_name=row["resident_middle_name"],
            resident_last_name=row["resident_last_name"],
            resident_suffix=row["resident_suffix"],
            civil_status=row["civil_status"],
            nationality=row["nationality"],
            date_of_birth=row["date_of_birth"],
            purok=row["purok"],
            years_of_residency=row["years_of_residency"],
            place_of_birth=row["place_of_birth"],
            sex=row["sex"],
            purpose=row["purpose"],
            fee=float(row["fee"]) if row["fee"] is not None else None,
        )
        for row in cursor.fetchall()
    ]
    cursor.close()
    return history_requests


#: Allowed admin status transitions for document requests. Requests that are
#: Completed or Rejected are final and cannot be changed anymore.
VALID_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "Pending": {"Approved", "Rejected"},
    "Approved": {"Processing", "Rejected"},
    "Processing": {"Ready for Pickup", "Rejected"},
    "Ready for Pickup": {"Completed"},
    "Completed": set(),
    "Rejected": set(),
}


#: Statuses a Staff account may set. Approving and rejecting are reserved for
#: administrator roles; any other status from Staff is rejected with HTTP 403.
STAFF_PERMITTED_REQUEST_STATUSES = ("Processing", "Ready for Pickup", "Completed")


def load_document_request_detail(
    connection: MySQLConnection, request_id: int
) -> AdminDocumentRequestDetailResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.user_id, requests.request_number,
               requests.purpose,
               requests.status, requests.admin_remarks, requests.submitted_at,
               requests.last_updated, requests.pickup_date, requests.pickup_time,
               document_types.document_name AS document, document_types.fee,
               CONCAT(resident_profiles.first_name, ' ',
                      resident_profiles.last_name) AS resident_name,
               users.email,
               (SELECT TRIM(CONCAT(admin_profile.first_name, ' ',
                                   admin_profile.last_name))
                FROM request_status_history history
                JOIN resident_profiles admin_profile
                     ON admin_profile.user_id = history.changed_by
                WHERE history.request_id = requests.id
                  AND history.changed_by IS NOT NULL
                ORDER BY history.changed_at DESC, history.id DESC
                LIMIT 1) AS processed_by
        FROM requests
        JOIN users ON users.id = requests.user_id
        JOIN resident_profiles ON resident_profiles.user_id = users.id
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE requests.id = %s
        """,
        (request_id,),
    )
    request = cursor.fetchone()
    cursor.close()

    if request is None:
        raise HTTPException(status_code=404, detail="Request was not found.")

    return AdminDocumentRequestDetailResponse(
        id=request["id"],
        request_number=request["request_number"],
        resident_name=request["resident_name"],
        email=request["email"],
        document=request["document"],
        purpose=request["purpose"],
        status=request["status"],
        admin_remarks=request["admin_remarks"],
        submitted_at=request["submitted_at"],
        last_updated=request["last_updated"],
        pickup_date=request["pickup_date"],
        pickup_time=request["pickup_time"],
        fee=float(request["fee"]),
        processed_by=request["processed_by"],
        attachment=load_attachment_meta(connection, request_id),
    )


@router.get(
    "/api/admin/document-requests/{request_id}",
    response_model=AdminDocumentRequestDetailResponse,
)
def get_document_request_detail(
    request_id: int,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_portal_user),
) -> AdminDocumentRequestDetailResponse:
    return load_document_request_detail(connection, request_id)


@router.get(
    "/api/admin/document-requests/{request_id}/attachment",
    response_class=FileResponse,
)
def get_document_request_attachment(
    request_id: int,
    download: bool = False,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_portal_user),
) -> FileResponse:
    """The resident's image for this request (Staff and administrators only;
    the same roles that can open the request details)."""
    return build_attachment_response(
        fetch_attachment_row(connection, request_id), download=download
    )


@router.patch(
    "/api/admin/document-requests/{request_id}",
    response_model=AdminDocumentRequestDetailResponse,
)
def update_document_request(
    request_id: int,
    payload: AdminRequestActionInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_portal_user),
) -> AdminDocumentRequestDetailResponse:
    if (
        payload.status is None
        and payload.admin_remarks is None
        and payload.pickup_date is None
        and payload.pickup_time is None
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide a status, remarks, or a pickup date and time.",
        )

    # Server-side enforcement of the Staff status restriction (not just the UI).
    if (
        current_user.get("role") == "staff"
        and payload.status is not None
        and payload.status not in STAFF_PERMITTED_REQUEST_STATUSES
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only an administrator can approve or reject a document "
                "request. Staff accounts can process approved requests."
            ),
        )

    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.user_id, requests.request_number,
               requests.status, requests.pickup_date, requests.pickup_time,
               document_types.document_name AS document,
               CONCAT(resident_profiles.first_name, ' ',
                      resident_profiles.last_name) AS resident_name
        FROM requests
        JOIN users ON users.id = requests.user_id
        JOIN resident_profiles ON resident_profiles.user_id = users.id
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE requests.id = %s
        """,
        (request_id,),
    )
    row = cursor.fetchone()
    if row is None:
        cursor.close()
        raise HTTPException(status_code=404, detail="Request was not found.")

    new_status = payload.status
    current_status = row["status"]

    # A time only means something on a given day.
    if payload.pickup_time is not None and payload.pickup_date is None and row["pickup_date"] is None:
        cursor.close()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Set a pickup date together with the pickup time.",
        )

    # Pickup schedule before and after this change (None fields keep their value).
    old_pickup = (row["pickup_date"], pickup_time_from_db(row["pickup_time"]))
    new_pickup = (
        payload.pickup_date if payload.pickup_date is not None else old_pickup[0],
        payload.pickup_time if payload.pickup_time is not None else old_pickup[1],
    )
    pickup_changed = new_pickup != old_pickup
    pickup_text = format_pickup_schedule(*new_pickup)

    if new_status is not None and new_status != current_status:
        allowed_transitions = VALID_STATUS_TRANSITIONS.get(
            current_status, set()
        )
        if new_status not in allowed_transitions:
            cursor.close()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"A request with status '{current_status}' cannot be "
                    f"changed to '{new_status}'."
                ),
            )

    try:
        cursor.execute(
            """
            UPDATE requests
            SET completed_at = CASE
                    WHEN %s = 'Completed' AND status <> 'Completed'
                    THEN NOW()
                    ELSE completed_at
                END,
                status = COALESCE(%s, status),
                admin_remarks = COALESCE(%s, admin_remarks),
                pickup_date = COALESCE(%s, pickup_date),
                pickup_time = COALESCE(%s, pickup_time)
            WHERE id = %s
            """,
            (
                new_status,
                payload.status,
                clean_optional(payload.admin_remarks),
                payload.pickup_date,
                payload.pickup_time,
                request_id,
            ),
        )

        status_changed = payload.status is not None and payload.status != row["status"]
        # Tell the resident when (and at what time) they can collect the
        # document. A status change in the same call already notifies them,
        # and its email carries the schedule.
        rescheduled = old_pickup[0] is not None
        schedule_notice = bool(
            pickup_changed
            and pickup_text
            and not status_changed
            and current_status == "Ready for Pickup"
        )
        if schedule_notice:
            cursor.execute(
                """
                INSERT INTO notifications
                  (user_id, title, message, notification_type,
                   related_request_id)
                VALUES (%s, %s, %s, 'request', %s)
                """,
                (
                    row["user_id"],
                    "Pickup schedule updated" if rescheduled else "Pickup schedule set",
                    (
                        f"You can pick up your {row['document']} "
                        f"({row['request_number']}) at the Barangay office on "
                        f"{pickup_text}."
                    ),
                    request_id,
                ),
            )

        if payload.status is not None and payload.status != row["status"]:
            cursor.execute(
                """
                INSERT INTO request_status_history
                  (request_id, old_status, new_status, changed_by, remarks)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    request_id,
                    row["status"],
                    payload.status,
                    current_user["id"],
                    clean_optional(payload.admin_remarks),
                ),
            )

            cursor.execute(
                """
                INSERT INTO notifications
                  (user_id, title, message, notification_type,
                   related_request_id)
                VALUES (%s, %s, %s, 'request', %s)
                """,
                (
                    row["user_id"],
                    *(
                        (
                            # Matched by the Resident Notifications page
                            # (isPickupNotification) for "View My Request".
                            READY_FOR_PICKUP_NOTIFICATION_TITLE,
                            f"Your {row['document']} request ({row['request_number']}) "
                            "has been processed and is now ready for pickup. "
                            + (
                                f"Pickup: {pickup_text}. "
                                if pickup_text
                                else "The pickup schedule will be confirmed soon. "
                            )
                            + "Please check the pickup details.",
                        )
                        if payload.status == "Ready for Pickup"
                        else (
                            f"Request {payload.status}",
                            f"Your document request {row['request_number']} "
                            f"is now {payload.status}.",
                        )
                    ),
                    request_id,
                ),
            )

            # Mirror the resident notification in the admin/staff feed.
            notify_admins(
                connection,
                title=f"Request status: {payload.status}",
                message=(
                    f"{actor_display_name(current_user, actor_role_label(current_user))} "
                    f"changed {row['request_number']} ({row['document']}) from "
                    f"{current_status} to {payload.status} for "
                    f"{row['resident_name']}."
                ),
                notification_type=NOTIFICATION_TYPE_REQUEST,
                related_request_id=request_id,
                dedupe_key=build_dedupe_key(
                    "request-status", request_id, payload.status
                ),
            )

        connection.commit()

        # Sent after the commit so a mail failure never rolls back the status
        # change; failures are logged inside send_request_status_email.
        if payload.status is not None and payload.status != row["status"]:
            send_request_status_email(
                connection,
                request_id=request_id,
                new_status=payload.status,
            )
        elif schedule_notice:
            # The Ready for Pickup email went out without this schedule:
            # send it again with the date and time.
            send_pickup_schedule_email(
                connection, request_id=request_id, rescheduled=rescheduled
            )

        log_target = (
            f"{row['request_number']} "
            f"({row['document']} - {row['resident_name']})"
        )
        if payload.status == "Approved" and payload.status != row["status"]:
            log_action_type, log_action = "Approve", "approved request"
        elif payload.status == "Rejected" and payload.status != row["status"]:
            log_action_type, log_action = "Reject", "rejected request"
        elif payload.status is not None and payload.status != row["status"]:
            log_action_type = "Status"
            log_action = f"updated status to {payload.status}"
        elif pickup_changed and pickup_text:
            log_action_type = "Update"
            log_action = f"set pickup schedule to {pickup_text}"
        else:
            log_action_type, log_action = "Update", "updated request details"
        record_activity_log(
            connection,
            user_id=current_user["id"],
            action_type=log_action_type,
            action=log_action,
            target=log_target,
            target_type="Request",
            ip_address=get_client_ip(request),
        )

    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update the document request.",
        ) from error
    finally:
        cursor.close()

    return load_document_request_detail(connection, request_id)
