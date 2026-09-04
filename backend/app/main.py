from __future__ import annotations

from datetime import datetime, timedelta, timezone

import mysql.connector
import secrets
from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from mysql.connector import MySQLConnection

from .config import settings
from .database import create_connection, get_db
from .dependencies import get_current_user
from .schemas import (
    AuthResponse,
    CreateRequestInput,
    DashboardSummaryResponse,
    DocumentTypeResponse,
    LoginInput,
    NotificationResponse,
    RegisterInput,
    RequestDetailResponse,
    RequestResponse,
    RequestStatusHistoryEntry,
    UpdateRequestInput,
    UserResponse,
)
from .security import (
    create_access_token,
    hash_access_token,
    hash_password,
    verify_password,
)


app = FastAPI(title="Barangay Portal API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def clean_optional(value: str | None) -> str | None:
    """Return a stripped string, or None when the value is empty/missing."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped if stripped else None


def build_auth_response(connection: MySQLConnection, user_id: int) -> AuthResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT users.id, users.email, users.role, resident_profiles.first_name,
               resident_profiles.last_name
        FROM users
        JOIN resident_profiles ON resident_profiles.user_id = users.id
        WHERE users.id = %s
        """,
        (user_id,),
    )
    user = cursor.fetchone()
    cursor.close()
    if user is None:
        raise HTTPException(status_code=500, detail="User profile is missing.")

    token = create_access_token()
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.access_token_days,
    )
    cursor = connection.cursor()
    cursor.execute(
        """
        INSERT INTO auth_sessions (user_id, token_hash, expires_at)
        VALUES (%s, %s, %s)
        """,
        (user_id, hash_access_token(token), expires_at.replace(tzinfo=None)),
    )
    cursor.close()
    connection.commit()

    return AuthResponse(
        access_token=token,
        user=UserResponse(**user),
    )


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/docs")


@app.get("/api/health")
def health_check() -> dict[str, str]:
    try:
        connection = create_connection()
        connection.close()
    except mysql.connector.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MySQL is unavailable.",
        ) from error
    return {"status": "ok"}


@app.post("/api/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterInput,
    connection: MySQLConnection = Depends(get_db),
) -> AuthResponse:
    cursor = connection.cursor(dictionary=True)
    email = normalize_email(payload.email)
    try:
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cursor.fetchone() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account already exists for this email.",
            )

        cursor.execute(
            """
            INSERT INTO users (email, password_hash)
            VALUES (%s, %s)
            """,
            (email, hash_password(payload.password)),
        )
        user_id = cursor.lastrowid
        cursor.execute(
            """
            INSERT INTO resident_profiles
              (user_id, first_name, middle_name, last_name, suffix,
               date_of_birth, place_of_birth, sex, civil_status, nationality,
               religion, voter_status, house_no, street, purok,
               years_of_residency, occupation, employer,
               emergency_contact_name, emergency_contact_relationship,
               emergency_contact_number, emergency_contact_address,
               contact_number, address)
            VALUES (%s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s)
            """,
            (
                user_id,
                payload.first_name.strip(),
                clean_optional(payload.middle_name),
                payload.last_name.strip(),
                clean_optional(payload.suffix),
                payload.date_of_birth,
                clean_optional(payload.place_of_birth),
                clean_optional(payload.sex),
                clean_optional(payload.civil_status),
                clean_optional(payload.nationality),
                clean_optional(payload.religion),
                clean_optional(payload.voter_status),
                clean_optional(payload.house_no),
                clean_optional(payload.street),
                clean_optional(payload.purok),
                payload.years_of_residency,
                clean_optional(payload.occupation),
                clean_optional(payload.employer),
                clean_optional(payload.emergency_contact_name),
                clean_optional(payload.emergency_contact_relationship),
                clean_optional(payload.emergency_contact_number),
                clean_optional(payload.emergency_contact_address),
                payload.phone.strip(),
                payload.address.strip(),
            ),
        )
        connection.commit()
    except HTTPException:
        connection.rollback()
        raise
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(status_code=500, detail="Could not create the account.") from error
    finally:
        cursor.close()

    return build_auth_response(connection, user_id)


@app.post("/api/auth/login", response_model=AuthResponse)
def login(
    payload: LoginInput,
    connection: MySQLConnection = Depends(get_db),
) -> AuthResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT id, password_hash
        FROM users
        WHERE email = %s AND account_status = 'active'
        """,
        (normalize_email(payload.email),),
    )
    user = cursor.fetchone()
    cursor.close()

    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    return build_auth_response(connection, user["id"])


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    current_user: dict[str, object] = Depends(get_current_user),
    connection: MySQLConnection = Depends(get_db),
) -> Response:
    cursor = connection.cursor()
    cursor.execute(
        "UPDATE auth_sessions SET revoked_at = UTC_TIMESTAMP() WHERE id = %s",
        (current_user["session_id"],),
    )
    connection.commit()
    cursor.close()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/document-types", response_model=list[DocumentTypeResponse])
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


@app.get("/api/requests", response_model=list[RequestResponse])
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
               requests.pickup_date
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


@app.get("/api/requests/{request_id}", response_model=RequestDetailResponse)
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
               requests.last_updated, requests.pickup_date,
               document_types.document_name AS document
        FROM requests
        JOIN document_types ON document_types.id = requests.document_type_id
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

    return RequestDetailResponse(
        **request,
        history=[RequestStatusHistoryEntry(**entry) for entry in history],
    )


@app.post("/api/requests", response_model=RequestResponse, status_code=status.HTTP_201_CREATED)
def create_request(
    payload: CreateRequestInput,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> RequestResponse:
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id, document_name
            FROM document_types
            WHERE id = %s AND is_active = 1
            """,
            (payload.document_type_id,),
        )
        document_type = cursor.fetchone()
        if document_type is None:
            raise HTTPException(status_code=404, detail="Document type was not found.")

        cursor.execute(
            """
            INSERT INTO requests (request_number, user_id, document_type_id, purpose)
            VALUES (%s, %s, %s, %s)
            """,
            (
                f"TEMP-{secrets.token_hex(12)}",
                current_user["id"],
                payload.document_type_id,
                payload.purpose.strip(),
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
        connection.commit()
    except HTTPException:
        connection.rollback()
        raise
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(status_code=500, detail="Could not create the request.") from error

    cursor.execute(
        """
        SELECT requests.id, requests.request_number, requests.document_type_id,
               document_types.document_name AS document, requests.purpose,
               requests.status, requests.submitted_at, requests.last_updated,
               requests.pickup_date
        FROM requests
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE requests.id = %s
        """,
        (request_id,),
    )
    request = cursor.fetchone()
    cursor.close()
    return RequestResponse(**request)


@app.put("/api/requests/{request_id}", response_model=RequestResponse)
def update_request(
    request_id: int,
    payload: UpdateRequestInput,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> RequestResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT id, status
        FROM requests
        WHERE id = %s AND user_id = %s
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
               requests.pickup_date
        FROM requests
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE requests.id = %s
        """,
        (request_id,),
    )
    updated_request = cursor.fetchone()
    cursor.close()
    return RequestResponse(**updated_request)


@app.delete("/api/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_request(
    request_id: int,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> Response:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT id, status
        FROM requests
        WHERE id = %s AND user_id = %s
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

    cursor = connection.cursor()
    try:
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
        connection.commit()
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(
            status_code=500, detail="Could not delete the request."
        ) from error
    finally:
        cursor.close()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/dashboard-summary", response_model=DashboardSummaryResponse)
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


@app.get("/api/notifications", response_model=list[NotificationResponse])
def list_notifications(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> list[NotificationResponse]:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT id, title, message, notification_type, related_request_id,
               is_read, created_at
        FROM notifications
        WHERE user_id = %s
        ORDER BY created_at DESC, id DESC
        """,
        (current_user["id"],),
    )
    notifications = cursor.fetchall()
    cursor.close()
    return [NotificationResponse(**notification) for notification in notifications]


@app.patch("/api/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_notification_read(
    notification_id: int,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> Response:
    cursor = connection.cursor()
    cursor.execute(
        """
        UPDATE notifications
        SET is_read = 1
        WHERE id = %s AND user_id = %s
        """,
        (notification_id, current_user["id"]),
    )
    if cursor.rowcount == 0:
        connection.rollback()
        cursor.close()
        raise HTTPException(status_code=404, detail="Notification was not found.")
    connection.commit()
    cursor.close()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_notifications_read(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> Response:
    cursor = connection.cursor()
    cursor.execute(
        "UPDATE notifications SET is_read = 1 WHERE user_id = %s",
        (current_user["id"],),
    )
    connection.commit()
    cursor.close()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
