"""Document types, resident document requests and dashboard summary."""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone

import mysql.connector
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from mysql.connector import MySQLConnection

from ..activity_logs import record_activity_log
from ..attachments import (
    ValidatedImage,
    build_attachment_response,
    delete_stored_file,
    fetch_attachment_row,
    insert_attachment_row,
    read_validated_image,
    store_image_file,
)
from ..common import user_display_name
from ..database import get_db
from ..dependencies import get_current_user
from ..email_templates import PICKUP_INSTRUCTIONS, PICKUP_LOCATION
from ..notifications import (
    NOTIFICATION_TYPE_REQUEST,
    action_time_bucket,
    build_dedupe_key,
    notify_admins,
)
from ..rate_limit import get_client_ip
from ..schemas import (
    CreateRequestInput,
    DashboardSummaryResponse,
    DocumentTypeResponse,
    RequestDetailResponse,
    RequestResponse,
    RequestStatusHistoryEntry,
    UpdateRequestInput,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/api/document-types", response_model=list[DocumentTypeResponse])
def list_document_types(
    connection: MySQLConnection = Depends(get_db),
    _: dict[str, object] = Depends(get_current_user),
) -> list[DocumentTypeResponse]:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT id, document_name, description
        FROM document_types
        WHERE is_active = 1
        ORDER BY document_name
        """,
    )
    document_types = cursor.fetchall()
    cursor.close()
    return [DocumentTypeResponse(**document_type) for document_type in document_types]


@router.get("/api/requests", response_model=list[RequestResponse])
def list_requests(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> list[RequestResponse]:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.request_number, requests.document_type_id,
               document_types.document_name AS document, requests.purpose,
               requests.status, requests.submitted_at, requests.last_updated,
               requests.pickup_date, requests.pickup_time
        FROM requests
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE requests.user_id = %s
        ORDER BY requests.submitted_at DESC, requests.id DESC
        """,
        (current_user["id"],),
    )
    requests = cursor.fetchall()
    cursor.close()
    return [RequestResponse(**request) for request in requests]


@router.get("/api/requests/{request_id}", response_model=RequestDetailResponse)
def get_request_detail(
    request_id: int,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> RequestDetailResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.request_number, requests.purpose,
               requests.status, requests.admin_remarks, requests.submitted_at,
               requests.last_updated, requests.pickup_date, requests.pickup_time,
               document_types.document_name AS document,
               NULLIF(CONCAT_WS(' ', NULLIF(resident_profiles.first_name, ''),
                                     NULLIF(resident_profiles.middle_name, ''),
                                     NULLIF(resident_profiles.last_name, ''),
                                     NULLIF(resident_profiles.suffix, '')), '')
                 AS resident_name
        FROM requests
        JOIN document_types ON document_types.id = requests.document_type_id
        LEFT JOIN resident_profiles ON resident_profiles.user_id = requests.user_id
        WHERE requests.id = %s AND requests.user_id = %s
        """,
        (request_id, current_user["id"]),
    )
    request = cursor.fetchone()

    if request is None:
        cursor.close()
        raise HTTPException(status_code=404, detail="Request was not found.")

    cursor.execute(
        """
        SELECT old_status, new_status, remarks, changed_at
        FROM request_status_history
        WHERE request_id = %s
        ORDER BY changed_at ASC, id ASC
        """,
        (request_id,),
    )
    history = cursor.fetchall()
    cursor.close()

    is_ready = request["status"] == "Ready for Pickup"
    return RequestDetailResponse(
        **request,
        pickup_location=PICKUP_LOCATION if is_ready else None,
        pickup_instructions=list(PICKUP_INSTRUCTIONS) if is_ready else [],
        history=[RequestStatusHistoryEntry(**entry) for entry in history],
    )


@router.post("/api/requests", response_model=RequestResponse, status_code=status.HTTP_201_CREATED)
def create_request(
    payload: CreateRequestInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> RequestResponse:
    return create_document_request_record(
        connection,
        request,
        current_user,
        document_type_id=payload.document_type_id,
        purpose=payload.purpose,
        image=None,
    )


@router.post(
    "/api/requests/with-attachment",
    response_model=RequestResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_request_with_attachment(
    request: Request,
    document_type_id: int = Form(gt=0),
    purpose: str = Form(min_length=1, max_length=2000),
    attachment: UploadFile = File(),
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> RequestResponse:
    """Submit a document request with its required image (multipart).

    The request, attachment row and stored file are created atomically (see
    ``create_document_request_record``). ``POST /api/requests`` remains for
    JSON requests without an attachment.
    """
    if not purpose.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please tell us why you need this document.",
        )

    image = read_validated_image(attachment)
    return create_document_request_record(
        connection,
        request,
        current_user,
        document_type_id=document_type_id,
        purpose=purpose,
        image=image,
    )


@router.get("/api/requests/{request_id}/attachment", response_class=FileResponse)
def get_request_attachment(
    request_id: int,
    download: bool = False,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> FileResponse:
    """A resident's own attachment. Another resident's request answers 404."""
    row = fetch_attachment_row(
        connection, request_id, owner_user_id=current_user["id"]
    )
    return build_attachment_response(row, download=download)


def create_document_request_record(
    connection: MySQLConnection,
    request: Request,
    current_user: dict[str, object],
    *,
    document_type_id: int,
    purpose: str,
    image: ValidatedImage | None,
) -> RequestResponse:
    purpose = purpose.strip()
    stored_filename: str | None = None
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id, document_name
            FROM document_types
            WHERE id = %s AND is_active = 1
            """,
            (document_type_id,),
        )
        document_type = cursor.fetchone()
        if document_type is None:
            raise HTTPException(status_code=404, detail="Document type was not found.")

        cursor.execute(
            """
            INSERT INTO requests (request_number, user_id, document_type_id,
                                   purpose, status)
            VALUES (%s, %s, %s, %s, 'Pending')
            """,
            (
                f"TEMP-{secrets.token_hex(12)}",
                current_user["id"],
                document_type_id,
                purpose,
            ),
        )
        request_id = cursor.lastrowid
        request_number = f"REQ-{datetime.now(timezone.utc).year}-{request_id:06d}"
        cursor.execute(
            "UPDATE requests SET request_number = %s WHERE id = %s",
            (request_number, request_id),
        )
        cursor.execute(
            """
            INSERT INTO request_status_history (request_id, new_status, changed_by)
            VALUES (%s, 'Pending', %s)
            """,
            (request_id, current_user["id"]),
        )
        cursor.execute(
            """
            INSERT INTO notifications
              (user_id, title, message, notification_type, related_request_id)
            VALUES (%s, %s, %s, 'request', %s)
            """,
            (
                current_user["id"],
                "Request received",
                f"Your request {request_number} has been submitted for review.",
                request_id,
            ),
        )
        # Same transaction as the request: a rollback also discards the notification.
        notify_admins(
            connection,
            title="New document request",
            message=(
                f"{user_display_name(current_user)} submitted a "
                f"{document_type['document_name']} request "
                f"({request_number}, status: Pending)."
            ),
            notification_type=NOTIFICATION_TYPE_REQUEST,
            related_request_id=request_id,
            dedupe_key=build_dedupe_key(
                "request-submitted",
                current_user["id"],
                document_type_id,
                purpose,
                action_time_bucket(),
            ),
        )
        # The image is written and recorded inside the same transaction, so a
        # request is never created without the attachment it was sent with.
        if image is not None:
            stored_filename = store_image_file(image)
            insert_attachment_row(
                cursor,
                request_id=request_id,
                image=image,
                stored_filename=stored_filename,
                uploaded_by=current_user["id"],
            )
        connection.commit()
    except HTTPException:
        connection.rollback()
        delete_stored_file(stored_filename)
        raise
    except mysql.connector.Error as error:
        connection.rollback()
        delete_stored_file(stored_filename)
        raise HTTPException(status_code=500, detail="Could not create the request.") from error
    except OSError as error:
        connection.rollback()
        delete_stored_file(stored_filename)
        logger.exception("Could not store a request attachment")
        raise HTTPException(
            status_code=500, detail="Could not save the attached image."
        ) from error

    cursor.execute(
        """
        SELECT requests.id, requests.request_number, requests.document_type_id,
               document_types.document_name AS document, requests.purpose,
               requests.status, requests.submitted_at, requests.last_updated,
               requests.pickup_date, requests.pickup_time
        FROM requests
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE requests.id = %s
        """,
        (request_id,),
    )
    row = cursor.fetchone()
    cursor.close()

    record_activity_log(
        connection,
        user_id=current_user["id"],
        action_type="Create",
        action="submitted a document request",
        target=f"{request_number} ({row['document']})",
        target_type="Request",
        ip_address=get_client_ip(request),
    )

    return RequestResponse(**row)


@router.put("/api/requests/{request_id}", response_model=RequestResponse)
def update_request(
    request_id: int,
    payload: UpdateRequestInput,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> RequestResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.status, requests.request_number,
               document_types.document_name AS document
        FROM requests
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE requests.id = %s AND requests.user_id = %s
        """,
        (request_id, current_user["id"]),
    )
    request = cursor.fetchone()
    cursor.close()

    if request is None:
        raise HTTPException(status_code=404, detail="Request was not found.")
    if request["status"] != "Pending":
        raise HTTPException(
            status_code=409,
            detail="Only requests that are still pending can be edited.",
        )

    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            UPDATE requests
            SET purpose = %s
            WHERE id = %s AND user_id = %s
            """,
            (payload.purpose.strip(), request_id, current_user["id"]),
        )
        # Same transaction as the edit; retries are suppressed by the dedupe key.
        notify_admins(
            connection,
            title="Document request updated",
            message=(
                f"{user_display_name(current_user)} updated their "
                f"{request['document']} request "
                f"({request['request_number']}, "
                f"status: {request['status']})."
            ),
            notification_type=NOTIFICATION_TYPE_REQUEST,
            related_request_id=request_id,
            dedupe_key=build_dedupe_key(
                "request-updated",
                request_id,
                payload.purpose.strip(),
                action_time_bucket(),
            ),
        )
        connection.commit()
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(
            status_code=500, detail="Could not update the request."
        ) from error
    finally:
        cursor.close()

    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.request_number, requests.document_type_id,
               document_types.document_name AS document, requests.purpose,
               requests.status, requests.submitted_at, requests.last_updated,
               requests.pickup_date, requests.pickup_time
        FROM requests
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE requests.id = %s
        """,
        (request_id,),
    )
    updated_request = cursor.fetchone()
    cursor.close()
    return RequestResponse(**updated_request)


@router.delete("/api/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_request(
    request_id: int,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> Response:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.status, requests.request_number,
               document_types.document_name AS document
        FROM requests
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE requests.id = %s AND user_id = %s
        """,
        (request_id, current_user["id"]),
    )
    request = cursor.fetchone()
    cursor.close()

    if request is None:
        raise HTTPException(status_code=404, detail="Request was not found.")
    if request["status"] != "Pending":
        raise HTTPException(
            status_code=409,
            detail="Only requests that are still pending can be deleted.",
        )

    # Owner-scoped lookup; None when there is no attachment (or no table yet).
    attachment = fetch_attachment_row(
        connection, request_id, owner_user_id=current_user["id"]
    )

    cursor = connection.cursor()
    try:
        if attachment is not None:
            cursor.execute(
                "DELETE FROM request_attachments WHERE request_id = %s",
                (request_id,),
            )
        cursor.execute(
            "DELETE FROM request_status_history WHERE request_id = %s",
            (request_id,),
        )
        cursor.execute(
            "UPDATE notifications SET related_request_id = NULL WHERE related_request_id = %s",
            (request_id,),
        )
        cursor.execute(
            "DELETE FROM requests WHERE id = %s AND user_id = %s",
            (request_id, current_user["id"]),
        )
        # No related_request_id: the request row no longer exists.
        notify_admins(
            connection,
            title="Document request deleted",
            message=(
                f"{user_display_name(current_user)} deleted their "
                f"{request['document']} request ({request['request_number']})."
            ),
            notification_type=NOTIFICATION_TYPE_REQUEST,
            dedupe_key=build_dedupe_key("request-deleted", request_id),
        )
        connection.commit()
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(
            status_code=500, detail="Could not delete the request."
        ) from error
    finally:
        cursor.close()

    # Only after the commit: a failed delete keeps the request and its image.
    if attachment is not None:
        delete_stored_file(str(attachment["stored_filename"]))

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/api/dashboard-summary", response_model=DashboardSummaryResponse)
def dashboard_summary(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> DashboardSummaryResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT COUNT(*) AS total_requests,
               COALESCE(SUM(status = 'Pending'), 0) AS pending,
               COALESCE(SUM(status = 'Processing'), 0) AS processing,
               COALESCE(SUM(status = 'Ready for Pickup'), 0) AS ready_for_pickup
        FROM requests
        WHERE user_id = %s
        """,
        (current_user["id"],),
    )
    summary = cursor.fetchone()
    cursor.close()
    return DashboardSummaryResponse(**summary)
