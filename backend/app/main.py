from __future__ import annotations

import calendar
import logging
import math
from datetime import date, datetime, timedelta, timezone

import mysql.connector
import secrets
from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from mysql.connector import MySQLConnection
from urllib.parse import quote

from .config import settings
from .database import create_connection, get_db
from .activity_logs import record_activity_log
from .dependencies import get_current_admin_user, get_current_user
from .notifications import (
    NOTIFICATION_TYPE_REQUEST,
    action_time_bucket,
    build_dedupe_key,
    notify_admins,
    record_admin_notification,
)
from .email_service import (
    EmailDeliveryError,
    is_email_configured,
    send_password_reset_email,
)
from .request_notifications import send_request_status_email
from .schemas import (
    AdminActivityEntry,
    AdminDashboardResponse,
    AdminDocumentRequestDetailResponse,
    AdminDocumentRequestResponse,
    AdminRequestActionInput,
    AdminRequestHistoryResponse,
    AdminDocumentTypeCount,
    AdminMonthlyDataPoint,
    AdminRecentRegistration,
    AdminRecentRequest,
    AdminActivityLogResponse,
    AdminResidentDetailResponse,
    AdminResidentRequestEntry,
    AdminResidentResponse,
    AdminResidentStatusInput,
    AdminResidentUpdateInput,
    AdminReportsExportRow,
    AdminReportsMonthlyPoint,
    AdminReportsResponse,
    AdminReportsSummary,
    AdminPurokCount,
    AdminStaffAccountResponse,
    AdminStaffCreateInput,
    AdminStaffStatusInput,
    AdminStaffUpdateInput,
    AdminStatusStats,
    AuthResponse,
    CreateRequestInput,
    DashboardSummaryResponse,
    DocumentTypeResponse,
    ForgotPasswordInput,
    LoginInput,
    MessageResponse,
    NotificationResponse,
    RegisterInput,
    ResetPasswordInput,
    RequestDetailResponse,
    RequestResponse,
    RequestStatusHistoryEntry,
    UpdateRequestInput,
    UserResponse,
)
from .security import (
    create_access_token,
    create_password_reset_token,
    hash_access_token,
    hash_password,
    verify_password,
)
from .rate_limit import (
    get_client_ip,
    login_attempt_limiter,
    login_ip_limiter,
    password_reset_email_limiter,
    password_reset_ip_limiter,
    password_reset_submit_limiter,
)


app = FastAPI(title="Barangay Portal API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


logger = logging.getLogger(__name__)

#: Frontend route the emailed reset link points at (see src/App.tsx).
FRONTEND_RESET_PASSWORD_PATH = "/reset-password"


def normalize_email(email: str) -> str:
    return email.strip().lower()


def clean_optional(value: str | None) -> str | None:
    """Return a stripped string, or None when the value is empty/missing."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped if stripped else None


def user_display_name(user: dict[str, object]) -> str:
    """Full name of the signed-in user (resolved by the auth dependencies).

    Admin notifications name the person who performed the action, so every
    call site can use this instead of re-reading the profile from the database.
    """
    return f"{user['first_name']} {user['last_name']}".strip()


def raise_rate_limited(retry_after: float, message: str) -> None:
    """Raise HTTP 429 for an active rate limit, with a Retry-After header."""
    retry_seconds = max(1, math.ceil(retry_after))
    minutes = math.ceil(retry_seconds / 60)
    suffix = "s" if minutes != 1 else ""
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=(
            f"{message} Try again in about {minutes} minute{suffix}."
        ),
        headers={"Retry-After": str(retry_seconds)},
    )


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

    # The account exists and is committed, so the administrator notification is
    # written now. Recording it is best-effort: a notification problem must
    # never fail a registration that already succeeded.
    record_admin_notification(
        connection,
        title="New resident account",
        message=(
            f"{payload.first_name.strip()} {payload.last_name.strip()} "
            f"created a resident account ({email})."
        ),
        dedupe_key=build_dedupe_key("resident-registered", user_id),
    )

    return build_auth_response(connection, user_id)


@app.post("/api/auth/login", response_model=AuthResponse)
def login(
    payload: LoginInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
) -> AuthResponse:
    client_ip = get_client_ip(request)
    # Track consecutive failures per client IP + account pair.
    attempt_key = f"{client_ip}|{normalize_email(payload.email)}"

    # IP-based flood protection for login requests.
    retry_after = login_ip_limiter.hit(client_ip)
    if retry_after > 0:
        raise_rate_limited(
            retry_after,
            "Too many login requests from this network.",
        )

    # Temporary block after too many consecutive failed attempts.
    retry_after = login_attempt_limiter.remaining_block(attempt_key)
    if retry_after > 0:
        raise_rate_limited(
            retry_after,
            "Too many failed login attempts. Login is temporarily blocked.",
        )

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
        blocked_for = login_attempt_limiter.record_failure(attempt_key)
        if blocked_for > 0:
            raise_rate_limited(
                blocked_for,
                "Too many failed login attempts. Login is temporarily blocked.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    # Successful login: give the client a clean slate again.
    login_attempt_limiter.record_success(attempt_key)
    response = build_auth_response(connection, user["id"])

    record_activity_log(
        connection,
        user_id=user["id"],
        action_type="Login",
        action="logged in",
        target="System",
        ip_address=client_ip,
    )

    return response


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


@app.post(
    "/api/auth/forgot-password",
    response_model=MessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def forgot_password(
    payload: ForgotPasswordInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
) -> MessageResponse:
    """Email a single-use password-reset link for the submitted address.

    Always replies with the same generic message so the endpoint cannot be
    used to discover which email addresses have an account.
    """
    client_ip = get_client_ip(request)
    email = normalize_email(payload.email)
    generic_message = MessageResponse(
        message=(
            "If an account exists for that email address, a password reset "
            "link has been sent. Please check your inbox and spam folder."
        )
    )

    # Abuse protection: cap reset emails per network and per address.
    retry_after = password_reset_ip_limiter.hit(client_ip)
    if retry_after > 0:
        raise_rate_limited(
            retry_after,
            "Too many password reset requests from this network.",
        )

    retry_after = password_reset_email_limiter.hit(f"email:{email}")
    if retry_after > 0:
        raise_rate_limited(
            retry_after,
            "Too many password reset requests for this email address.",
        )

    # Fail for everyone while mail delivery is unavailable instead of only for
    # addresses that exist (which would leak which accounts are registered).
    if not is_email_configured():
        logger.error("Password reset requested while SMTP is not configured.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Password reset is temporarily unavailable. Please contact "
                "the Barangay office."
            ),
        )

    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        "SELECT id, account_status FROM users WHERE email = %s",
        (email,),
    )
    user = cursor.fetchone()
    cursor.close()

    if user is None or user["account_status"] != "active":
        return generic_message

    # Cryptographically secure token; only its SHA-256 hash is persisted.
    token = create_password_reset_token()
    token_hash = hash_access_token(token)
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.password_reset_token_expiration_minutes,
    )
    reset_url = (
        f"{settings.frontend_url}{FRONTEND_RESET_PASSWORD_PATH}"
        f"?token={quote(token)}"
    )

    cursor = connection.cursor()
    try:
        # Requesting a new link invalidates every older one for this account.
        cursor.execute(
            "DELETE FROM password_reset_tokens WHERE user_id = %s",
            (user["id"],),
        )
        cursor.execute(
            """
            INSERT INTO password_reset_tokens
              (user_id, token_hash, expires_at, requested_ip)
            VALUES (%s, %s, %s, %s)
            """,
            (
                user["id"],
                token_hash,
                expires_at.replace(tzinfo=None),
                client_ip[:45],
            ),
        )
        connection.commit()
    except mysql.connector.Error as error:
        connection.rollback()
        logger.exception("Could not store the password reset token.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not process the password reset request.",
        ) from error
    finally:
        cursor.close()

    try:
        send_password_reset_email(
            to_email=email,
            reset_url=reset_url,
            expires_in_minutes=settings.password_reset_token_expiration_minutes,
        )
    except EmailDeliveryError as error:
        # Never leave a usable token behind when the mail did not go out.
        discard_password_reset_token(connection, token_hash)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "We could not send the reset email right now. Please try "
                "again in a few minutes."
            ),
        ) from error

    return generic_message


@app.post("/api/auth/reset-password", response_model=MessageResponse)
def reset_password(
    payload: ResetPasswordInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
) -> MessageResponse:
    """Set a new password using a valid, unused, unexpired reset token."""
    retry_after = password_reset_submit_limiter.hit(get_client_ip(request))
    if retry_after > 0:
        raise_rate_limited(
            retry_after,
            "Too many password reset attempts from this network.",
        )

    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT password_reset_tokens.id, password_reset_tokens.user_id,
               password_reset_tokens.expires_at, password_reset_tokens.used_at
        FROM password_reset_tokens
        JOIN users ON users.id = password_reset_tokens.user_id
        WHERE password_reset_tokens.token_hash = %s
          AND users.account_status = 'active'
        """,
        (hash_access_token(payload.token.strip()),),
    )
    token_row = cursor.fetchone()
    cursor.close()

    if token_row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset link is invalid. Please request a new one.",
        )
    if token_row["used_at"] is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This password reset link has already been used. "
                "Please request a new one."
            ),
        )
    if token_row["expires_at"] <= datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This password reset link has expired. Please request a new one."
            ),
        )

    cursor = connection.cursor()
    try:
        # Passwords keep using the existing scrypt hashing from security.py.
        cursor.execute(
            "UPDATE users SET password_hash = %s WHERE id = %s",
            (hash_password(payload.password), token_row["user_id"]),
        )
        # Single use: this token can never be replayed...
        cursor.execute(
            """
            UPDATE password_reset_tokens
            SET used_at = UTC_TIMESTAMP()
            WHERE id = %s
            """,
            (token_row["id"],),
        )
        # ...and neither can any other outstanding link for the account.
        cursor.execute(
            """
            DELETE FROM password_reset_tokens
            WHERE user_id = %s AND id != %s
            """,
            (token_row["user_id"], token_row["id"]),
        )
        # Existing sessions are no longer trusted after a password change.
        cursor.execute(
            """
            UPDATE auth_sessions SET revoked_at = UTC_TIMESTAMP()
            WHERE user_id = %s AND revoked_at IS NULL
            """,
            (token_row["user_id"],),
        )
        connection.commit()
    except mysql.connector.Error as error:
        connection.rollback()
        logger.exception("Could not store the new password hash.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update your password. Please try again.",
        ) from error
    finally:
        cursor.close()

    return MessageResponse(
        message="Your password has been reset. You can now sign in with it."
    )


def discard_password_reset_token(
    connection: MySQLConnection, token_hash: str
) -> None:
    """Best-effort cleanup of a token whose email could not be delivered."""
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(
                "DELETE FROM password_reset_tokens WHERE token_hash = %s",
                (token_hash,),
            )
            connection.commit()
        finally:
            cursor.close()
    except mysql.connector.Error:
        connection.rollback()
        logger.warning("Could not discard an undelivered password reset token.")


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
    request: Request,
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
            INSERT INTO requests (request_number, user_id, document_type_id,
                                   purpose, status)
            VALUES (%s, %s, %s, %s, 'Pending')
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
        # Same transaction as the request itself: when the insert above fails
        # and the request is rolled back, the admin is not told about a request
        # that does not exist.
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
                payload.document_type_id,
                payload.purpose.strip(),
                action_time_bucket(),
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
        # Written in the same transaction as the edit: a failed update (or a
        # rollback) leaves no admin notification behind, and a retry of the
        # same edit is suppressed by the dedupe key.
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
        # The request row is gone, so the admin notification carries no
        # related_request_id; it still records who deleted what, and the
        # dedupe key keeps a retried delete from notifying twice.
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


@app.get("/api/admin/dashboard", response_model=AdminDashboardResponse)
def admin_dashboard(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminDashboardResponse:
    cursor = connection.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT COUNT(*) AS total_residents,
               COALESCE(SUM(users.created_at
                            >= CURDATE() - INTERVAL (DAY(CURDATE()) - 1) DAY), 0)
                   AS new_residents_this_month
        FROM users
        WHERE users.role = 'resident'
        """
    )
    resident_stats = cursor.fetchone()

    cursor.execute(
        """
        SELECT COALESCE(SUM(status = 'Pending'), 0) AS pending,
               COALESCE(SUM(status = 'Ready for Pickup'), 0) AS approved,
               COALESCE(SUM(status = 'Processing'), 0) AS processing,
               COALESCE(SUM(status = 'Completed'
                            AND COALESCE(completed_at, last_updated)
                                >= CURDATE() - INTERVAL (DAY(CURDATE()) - 1) DAY), 0)
                   AS completed,
               COALESCE(SUM(status = 'Rejected'
                            AND last_updated
                                >= CURDATE() - INTERVAL (DAY(CURDATE()) - 1) DAY), 0)
                   AS rejected
        FROM requests
        """
    )
    request_stats = cursor.fetchone()

    # Monthly overview (submitted vs completed vs rejected) for the last 7 months.
    cursor.execute(
        """
        SELECT YEAR(submitted_at) AS yr, MONTH(submitted_at) AS mo,
               COUNT(*) AS submitted,
               COALESCE(SUM(status = 'Completed'), 0) AS completed,
               COALESCE(SUM(status = 'Rejected'), 0) AS rejected
        FROM requests
        WHERE submitted_at
              >= SUBDATE(CURDATE() - INTERVAL (DAY(CURDATE()) - 1) DAY, INTERVAL 6 MONTH)
        GROUP BY yr, mo
        """
    )
    monthly_rows = {
        (row["yr"], row["mo"]): row for row in cursor.fetchall()
    }

    today = date.today()
    month_keys: list[tuple[int, int]] = []
    year, month = today.year, today.month
    for _ in range(7):
        month_keys.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    month_keys.reverse()

    monthly: list[AdminMonthlyDataPoint] = []
    for row_year, row_month in month_keys:
        row = monthly_rows.get((row_year, row_month))
        monthly.append(
            AdminMonthlyDataPoint(
                month=calendar.month_abbr[row_month],
                submitted=row["submitted"] if row else 0,
                completed=row["completed"] if row else 0,
                rejected=row["rejected"] if row else 0,
            )
        )

    cursor.execute(
        """
        SELECT document_types.document_name, COUNT(requests.id) AS total
        FROM document_types
        JOIN requests ON requests.document_type_id = document_types.id
        GROUP BY document_types.id, document_types.document_name
        ORDER BY total DESC
        LIMIT 5
        """
    )
    document_types = [
        AdminDocumentTypeCount(document_name=row["document_name"], count=row["total"])
        for row in cursor.fetchall()
    ]

    cursor.execute(
        """
        SELECT requests.request_number,
               CONCAT(resident_profiles.first_name, ' ', resident_profiles.last_name)
                   AS resident_name,
               document_types.document_name AS document,
               requests.status,
               requests.submitted_at
        FROM requests
        JOIN users ON users.id = requests.user_id
        JOIN resident_profiles ON resident_profiles.user_id = users.id
        JOIN document_types ON document_types.id = requests.document_type_id
        ORDER BY requests.submitted_at DESC, requests.id DESC
        LIMIT 5
        """
    )
    recent_requests = [
        AdminRecentRequest(
            request_number=row["request_number"],
            resident_name=row["resident_name"],
            document=row["document"],
            status=row["status"],
            submitted_at=row["submitted_at"],
        )
        for row in cursor.fetchall()
    ]

    cursor.execute(
        """
        SELECT CONCAT(resident_profiles.first_name, ' ', resident_profiles.last_name)
                   AS resident_name,
               resident_profiles.created_at
        FROM resident_profiles
        JOIN users ON users.id = resident_profiles.user_id
        WHERE users.role = 'resident'
        ORDER BY resident_profiles.created_at DESC, resident_profiles.id DESC
        LIMIT 4
        """
    )
    recent_registrations = [
        AdminRecentRegistration(
            resident_name=row["resident_name"],
            created_at=row["created_at"],
        )
        for row in cursor.fetchall()
    ]

    cursor.execute(
        """
        SELECT 'New Document Request' AS title, requests.submitted_at AS created_at
        FROM requests
        ORDER BY requests.submitted_at DESC, requests.id DESC
        LIMIT 3
        """
    )
    recent_activity = [
        AdminActivityEntry(title=row["title"], created_at=row["created_at"])
        for row in cursor.fetchall()
    ]

    cursor.close()

    return AdminDashboardResponse(
        stats=AdminStatusStats(
            total_residents=resident_stats["total_residents"],
            new_residents_this_month=resident_stats["new_residents_this_month"],
            pending=request_stats["pending"],
            approved=request_stats["approved"],
            processing=request_stats["processing"],
            completed=request_stats["completed"],
            rejected=request_stats["rejected"],
        ),
        monthly=monthly,
        document_types=document_types,
        recent_requests=recent_requests,
        recent_registrations=recent_registrations,
        recent_activity=recent_activity,
    )


@app.get("/api/admin/reports", response_model=AdminReportsResponse)
def admin_reports(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminReportsResponse:
    cursor = connection.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT COUNT(*) AS total_residents,
               COALESCE(SUM(users.account_status = 'active'), 0) AS active_residents
        FROM users
        WHERE users.role = 'resident'
        """
    )
    resident_stats = cursor.fetchone()

    cursor.execute(
        """
        SELECT COUNT(*) AS total_requests,
               COALESCE(SUM(status = 'Completed'), 0) AS completed,
               COALESCE(SUM(status = 'Rejected'), 0) AS rejected
        FROM requests
        """
    )
    request_stats = cursor.fetchone()

    # Monthly overview (requests vs completed vs rejected) for the last 7 months.
    cursor.execute(
        """
        SELECT YEAR(submitted_at) AS yr, MONTH(submitted_at) AS mo,
               COUNT(*) AS requests,
               COALESCE(SUM(status = 'Completed'), 0) AS completed,
               COALESCE(SUM(status = 'Rejected'), 0) AS rejected
        FROM requests
        WHERE submitted_at
              >= SUBDATE(CURDATE() - INTERVAL (DAY(CURDATE()) - 1) DAY, INTERVAL 6 MONTH)
        GROUP BY yr, mo
        """
    )
    monthly_rows = {
        (row["yr"], row["mo"]): row for row in cursor.fetchall()
    }

    today = date.today()
    month_keys: list[tuple[int, int]] = []
    year, month = today.year, today.month
    for _ in range(7):
        month_keys.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    month_keys.reverse()

    monthly: list[AdminReportsMonthlyPoint] = []
    for row_year, row_month in month_keys:
        row = monthly_rows.get((row_year, row_month))
        monthly.append(
            AdminReportsMonthlyPoint(
                month=calendar.month_abbr[row_month],
                requests=row["requests"] if row else 0,
                completed=row["completed"] if row else 0,
                rejected=row["rejected"] if row else 0,
            )
        )

    # Registered residents grouped by their purok.
    cursor.execute(
        """
        SELECT resident_profiles.purok,
               COUNT(*) AS total
        FROM resident_profiles
        JOIN users ON users.id = resident_profiles.user_id
        WHERE users.role = 'resident'
              AND resident_profiles.purok IS NOT NULL
              AND TRIM(resident_profiles.purok) <> ''
        GROUP BY resident_profiles.purok
        ORDER BY total DESC, resident_profiles.purok ASC
        """
    )
    residents_by_purok = [
        AdminPurokCount(purok=row["purok"], count=row["total"])
        for row in cursor.fetchall()
    ]

    # Requests grouped by document type (all types with at least one request).
    cursor.execute(
        """
        SELECT document_types.document_name, COUNT(requests.id) AS total
        FROM document_types
        JOIN requests ON requests.document_type_id = document_types.id
        GROUP BY document_types.id, document_types.document_name
        ORDER BY total DESC
        """
    )
    document_types = [
        AdminDocumentTypeCount(document_name=row["document_name"], count=row["total"])
        for row in cursor.fetchall()
    ]

    # Full request records used for the CSV export / printable report.
    cursor.execute(
        """
        SELECT requests.request_number,
               CONCAT(resident_profiles.first_name, ' ', resident_profiles.last_name)
                   AS resident_name,
               document_types.document_name AS document,
               requests.status,
               requests.submitted_at
        FROM requests
        JOIN users ON users.id = requests.user_id
        JOIN resident_profiles ON resident_profiles.user_id = users.id
        JOIN document_types ON document_types.id = requests.document_type_id
        ORDER BY requests.submitted_at DESC, requests.id DESC
        """
    )
    export_requests = [
        AdminReportsExportRow(
            request_number=row["request_number"],
            resident_name=row["resident_name"],
            document=row["document"],
            status=row["status"],
            submitted_at=row["submitted_at"],
        )
        for row in cursor.fetchall()
    ]

    cursor.close()

    total_requests = int(request_stats["total_requests"])
    completed = int(request_stats["completed"])
    rejected = int(request_stats["rejected"])

    return AdminReportsResponse(
        summary=AdminReportsSummary(
            total_residents=resident_stats["total_residents"],
            active_residents=resident_stats["active_residents"],
            total_requests=total_requests,
            completed=completed,
            rejected=rejected,
            completion_rate=round((completed / total_requests) * 100, 1)
            if total_requests
            else 0.0,
            rejection_rate=round((rejected / total_requests) * 100, 1)
            if total_requests
            else 0.0,
        ),
        monthly=monthly,
        residents_by_purok=residents_by_purok,
        document_types=document_types,
        export_requests=export_requests,
    )


@app.get("/api/admin/residents", response_model=list[AdminResidentResponse])
def list_residents(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> list[AdminResidentResponse]:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT resident_profiles.id,
               CONCAT(resident_profiles.first_name, ' ',
                      resident_profiles.last_name) AS name,
               users.email,
               resident_profiles.purok,
               resident_profiles.contact_number,
               users.account_status AS status,
               resident_profiles.created_at
        FROM resident_profiles
        JOIN users ON users.id = resident_profiles.user_id
        WHERE users.role = 'resident'
        ORDER BY resident_profiles.id ASC
        """
    )
    residents = [
        AdminResidentResponse(
            id=row["id"],
            resident_code=f"RES-{row['id']:03d}",
            name=row["name"],
            email=row["email"],
            purok=row["purok"],
            contact_number=row["contact_number"],
            status=row["status"],
            registered_at=row["created_at"],
        )
        for row in cursor.fetchall()
    ]
    cursor.close()
    return residents


def load_resident_detail(
    connection: MySQLConnection, resident_id: int
) -> AdminResidentDetailResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT resident_profiles.id, resident_profiles.user_id,
               resident_profiles.first_name, resident_profiles.middle_name,
               resident_profiles.last_name, resident_profiles.suffix,
               resident_profiles.date_of_birth, resident_profiles.sex,
               resident_profiles.civil_status, resident_profiles.occupation,
               resident_profiles.purok, resident_profiles.address,
               resident_profiles.contact_number, users.email,
               users.account_status
        FROM resident_profiles
        JOIN users ON users.id = resident_profiles.user_id
        WHERE resident_profiles.id = %s AND users.role = 'resident'
        """,
        (resident_id,),
    )
    profile = cursor.fetchone()
    if profile is None:
        cursor.close()
        raise HTTPException(status_code=404, detail="Resident was not found.")

    cursor.execute(
        """
        SELECT requests.request_number,
               document_types.document_name AS document,
               requests.status,
               requests.submitted_at
        FROM requests
        JOIN users ON users.id = requests.user_id
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE users.id = %s
        ORDER BY requests.submitted_at DESC, requests.id DESC
        """,
        (profile["user_id"],),
    )
    requests = [
        AdminResidentRequestEntry(
            request_number=row["request_number"],
            document=row["document"],
            status=row["status"],
            submitted_at=row["submitted_at"],
        )
        for row in cursor.fetchall()
    ]
    cursor.close()

    name_parts = [
        profile["first_name"],
        profile["middle_name"],
        profile["last_name"],
        profile["suffix"],
    ]

    return AdminResidentDetailResponse(
        id=profile["id"],
        resident_code=f"RES-{profile['id']:03d}",
        name=" ".join(part for part in name_parts if part),
        first_name=profile["first_name"],
        middle_name=profile["middle_name"],
        last_name=profile["last_name"],
        suffix=profile["suffix"],
        email=profile["email"],
        purok=profile["purok"],
        contact_number=profile["contact_number"],
        address=profile["address"],
        birthday=profile["date_of_birth"],
        gender=profile["sex"],
        civil_status=profile["civil_status"],
        occupation=profile["occupation"],
        status=profile["account_status"],
        requests=requests,
    )


@app.get("/api/admin/residents/{resident_id}", response_model=AdminResidentDetailResponse)
def get_resident_detail(
    resident_id: int,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminResidentDetailResponse:
    return load_resident_detail(connection, resident_id)


@app.put("/api/admin/residents/{resident_id}", response_model=AdminResidentDetailResponse)
def update_resident(
    resident_id: int,
    payload: AdminResidentUpdateInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminResidentDetailResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT resident_profiles.id AS profile_id, users.id AS user_id
        FROM resident_profiles
        JOIN users ON users.id = resident_profiles.user_id
        WHERE resident_profiles.id = %s AND users.role = 'resident'
        """,
        (resident_id,),
    )
    resident = cursor.fetchone()
    if resident is None:
        cursor.close()
        raise HTTPException(status_code=404, detail="Resident was not found.")

    email = normalize_email(payload.email)
    try:
        cursor.execute(
            "SELECT id FROM users WHERE email = %s AND id != %s",
            (email, resident["user_id"]),
        )
        if cursor.fetchone() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account already exists for this email.",
            )

        cursor.execute(
            """
            UPDATE resident_profiles
            SET first_name = %s, middle_name = %s, last_name = %s, suffix = %s,
                date_of_birth = %s, sex = %s, civil_status = %s, occupation = %s,
                house_no = %s, street = %s, purok = %s, address = %s,
                contact_number = %s
            WHERE id = %s
            """,
            (
                payload.first_name.strip(),
                clean_optional(payload.middle_name),
                payload.last_name.strip(),
                clean_optional(payload.suffix),
                payload.date_of_birth,
                payload.sex,
                payload.civil_status,
                clean_optional(payload.occupation),
                clean_optional(payload.house_no),
                clean_optional(payload.street),
                clean_optional(payload.purok),
                clean_optional(payload.address),
                clean_optional(payload.contact_number),
                resident["profile_id"],
            ),
        )
        cursor.execute(
            "UPDATE users SET email = %s WHERE id = %s",
            (email, resident["user_id"]),
        )
        connection.commit()
    except HTTPException:
        connection.rollback()
        raise
    except mysql.connector.IntegrityError as error:
        connection.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists for this email.",
        ) from error
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update the resident.",
        ) from error
    finally:
        cursor.close()

    record_activity_log(
        connection,
        user_id=current_user["id"],
        action_type="Update",
        action="updated resident information",
        target=(
            f"RES-{resident_id:03d} "
            f"({payload.first_name.strip()} {payload.last_name.strip()})"
        ),
        target_type="Resident",
        ip_address=get_client_ip(request),
    )

    # The profile change is committed; tell every administrator about the new
    # information. Best-effort, so a notification problem cannot fail the save.
    record_admin_notification(
        connection,
        title="Resident profile updated",
        message=(
            f"Administrator {user_display_name(current_user)} updated the "
            f"profile of {payload.first_name.strip()} "
            f"{payload.last_name.strip()} (RES-{resident_id:03d})."
        ),
        dedupe_key=build_dedupe_key(
            "resident-updated",
            resident_id,
            email,
            payload.first_name.strip(),
            payload.last_name.strip(),
            payload.purok,
            payload.contact_number,
            action_time_bucket(),
        ),
    )

    return load_resident_detail(connection, resident_id)


@app.patch(
    "/api/admin/residents/{resident_id}/status",
    response_model=AdminResidentDetailResponse,
)
def set_resident_status(
    resident_id: int,
    payload: AdminResidentStatusInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminResidentDetailResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT users.id AS user_id,
               CONCAT(resident_profiles.first_name, ' ',
                      resident_profiles.last_name) AS resident_name
        FROM resident_profiles
        JOIN users ON users.id = resident_profiles.user_id
        WHERE resident_profiles.id = %s AND users.role = 'resident'
        """,
        (resident_id,),
    )
    resident = cursor.fetchone()
    if resident is None:
        cursor.close()
        raise HTTPException(status_code=404, detail="Resident was not found.")

    try:
        cursor.execute(
            "UPDATE users SET account_status = %s WHERE id = %s",
            (payload.account_status, resident["user_id"]),
        )
        if payload.account_status == "inactive":
            # Revoke active sessions so the deactivation takes effect immediately.
            cursor.execute(
                """
                UPDATE auth_sessions
                SET revoked_at = %s
                WHERE user_id = %s AND revoked_at IS NULL
                """,
                (
                    datetime.now(timezone.utc).replace(tzinfo=None),
                    resident["user_id"],
                ),
            )
        connection.commit()
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update the account status.",
        ) from error
    finally:
        cursor.close()

    status_action = (
        "deactivated resident account"
        if payload.account_status == "inactive"
        else "reactivated resident account"
    )
    record_activity_log(
        connection,
        user_id=current_user["id"],
        action_type="Update",
        action=status_action,
        target=f"RES-{resident_id:03d}",
        target_type="Resident",
        ip_address=get_client_ip(request),
    )

    # The account status change is committed; every administrator is told which
    # resident was affected. Best-effort, so it can never fail the status change.
    deactivated = payload.account_status == "inactive"
    record_admin_notification(
        connection,
        title=(
            "Resident account deactivated"
            if deactivated
            else "Resident account reactivated"
        ),
        message=(
            f"Administrator {user_display_name(current_user)} "
            f"{'deactivated' if deactivated else 'reactivated'} the account "
            f"of {resident['resident_name']} (RES-{resident_id:03d})."
        ),
        dedupe_key=build_dedupe_key(
            "resident-account-status", resident_id, payload.account_status
        ),
    )

    return load_resident_detail(connection, resident_id)


@app.get("/api/admin/document-requests", response_model=list[AdminDocumentRequestResponse])
def list_document_requests(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
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


@app.get(
    "/api/admin/request-history",
    response_model=list[AdminRequestHistoryResponse],
)
def list_request_history(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> list[AdminRequestHistoryResponse]:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.request_number,
               CONCAT(resident_profiles.first_name, ' ',
                      resident_profiles.last_name) AS resident_name,
               document_types.document_name AS document,
               requests.status, requests.submitted_at,
               (SELECT CONCAT(admin_profile.first_name, ' ',
                              admin_profile.last_name)
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
        )
        for row in cursor.fetchall()
    ]
    cursor.close()
    return history_requests


# Allowed admin status transitions for document requests. Requests that are
# Completed or Rejected are final and cannot be changed anymore.
VALID_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "Pending": {"Approved", "Rejected"},
    "Approved": {"Processing", "Rejected"},
    "Processing": {"Ready for Pickup", "Rejected"},
    "Ready for Pickup": {"Completed"},
    "Completed": set(),
    "Rejected": set(),
}


def load_document_request_detail(
    connection: MySQLConnection, request_id: int
) -> AdminDocumentRequestDetailResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.user_id, requests.request_number,
               requests.purpose,
               requests.status, requests.admin_remarks, requests.submitted_at,
               requests.last_updated, requests.pickup_date,
               document_types.document_name AS document, document_types.fee,
               CONCAT(resident_profiles.first_name, ' ',
                      resident_profiles.last_name) AS resident_name,
               users.email,
               (SELECT CONCAT(admin_profile.first_name, ' ',
                              admin_profile.last_name)
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
        fee=float(request["fee"]),
        processed_by=request["processed_by"],
    )


@app.get(
    "/api/admin/document-requests/{request_id}",
    response_model=AdminDocumentRequestDetailResponse,
)
def get_document_request_detail(
    request_id: int,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminDocumentRequestDetailResponse:
    return load_document_request_detail(connection, request_id)


@app.patch(
    "/api/admin/document-requests/{request_id}",
    response_model=AdminDocumentRequestDetailResponse,
)
def update_document_request(
    request_id: int,
    payload: AdminRequestActionInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminDocumentRequestDetailResponse:
    if payload.status is None and payload.admin_remarks is None and payload.pickup_date is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide a status, remarks, or a pickup date.",
        )

    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.user_id, requests.request_number,
               requests.status,
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
                pickup_date = COALESCE(%s, pickup_date)
            WHERE id = %s
            """,
            (
                new_status,
                payload.status,
                clean_optional(payload.admin_remarks),
                payload.pickup_date,
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
                    f"Request {payload.status}",
                    (
                        f"Your document request {row['request_number']} "
                        f"is now {payload.status}."
                    ),
                    request_id,
                ),
            )

            # Keep the admin feed in step with the resident notification: every
            # administrator sees that this request moved to a new status, who
            # moved it, and for which resident.
            notify_admins(
                connection,
                title=f"Request status: {payload.status}",
                message=(
                    f"Administrator {user_display_name(current_user)} changed "
                    f"{row['request_number']} ({row['document']}) from "
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

        # Send the status-change email to the resident who owns this request.
        # This runs after the commit so a mail problem never rolls back the
        # status change; failures are logged inside send_request_status_email.
        if payload.status is not None and payload.status != row["status"]:
            send_request_status_email(
                connection,
                request_id=request_id,
                new_status=payload.status,
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


# --------------------------------------------------------------------------- #
# User Management (Admin "User Management" page)
# --------------------------------------------------------------------------- #
#: Non-resident roles the User Management page can display and maintain.
#: ``resident`` accounts keep being handled by the Residents page.
MANAGED_ACCOUNT_ROLES = ("staff", "admin", "super_admin")

#: Roles a plain administrator may create or hand out. A Super Admin may also
#: assign ``admin``/``super_admin`` (see assert_role_assignment_allowed).
ADMIN_ASSIGNABLE_ROLES = ("staff",)

#: Human-readable names of the stored roles, used in the UI-facing payloads,
#: activity log targets and admin notifications.
ROLE_LABELS = {
    "resident": "Resident",
    "staff": "Staff",
    "admin": "Barangay Administrator",
    "super_admin": "Super Admin",
}


def role_label(role: str) -> str:
    """Display name of a stored role (``"admin"`` -> ``"Barangay Administrator"``)."""
    return ROLE_LABELS.get(role, role)


def load_managed_account(
    connection: MySQLConnection, user_id: int
) -> dict[str, object]:
    """Read one manageable (non-resident) account, or raise 404.

    ``last_login`` is the most recent sign-in recorded in ``auth_sessions``;
    ``None`` means the account has never signed in.
    """
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT users.id, users.email, users.role, users.account_status,
               users.created_at, resident_profiles.first_name,
               resident_profiles.last_name,
               (SELECT MAX(auth_sessions.created_at) FROM auth_sessions
                 WHERE auth_sessions.user_id = users.id) AS last_login
        FROM users
        LEFT JOIN resident_profiles ON resident_profiles.user_id = users.id
        WHERE users.id = %s AND users.role IN ('staff', 'admin', 'super_admin')
        """,
        (user_id,),
    )
    account = cursor.fetchone()
    cursor.close()

    if account is None:
        raise HTTPException(status_code=404, detail="The account was not found.")

    return account


def managed_account_response(
    account: dict[str, object],
) -> AdminStaffAccountResponse:
    """Shape one database row into the User Management row payload."""
    first_name = str(account["first_name"] or "")
    last_name = str(account["last_name"] or "")
    name = f"{first_name} {last_name}".strip() or str(account["email"])

    return AdminStaffAccountResponse(
        id=account["id"],
        # Same convention as the resident codes (RES-001), so every account
        # can be referenced by a short, stable identifier.
        staff_code=f"ADM-{account['id']:03d}",
        name=name,
        first_name=first_name,
        last_name=last_name,
        email=account["email"],
        role=account["role"],
        account_status=account["account_status"],
        last_login=account["last_login"],
        created_at=account["created_at"],
    )


def assert_role_assignment_allowed(
    current_user: dict[str, object], target_role: str, new_role: str
) -> None:
    """Stop an administrator from escalating accounts beyond their permission.

    A Super Admin manages every account. A plain Administrator may only manage
    Staff accounts and may never assign an administrator role, so a staff (or
    resident) account can never be used to gain administrator privileges.
    """
    if current_user.get("role") == "super_admin":
        return

    if (
        target_role not in ADMIN_ASSIGNABLE_ROLES
        or new_role not in ADMIN_ASSIGNABLE_ROLES
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only a Super Admin can manage administrator accounts or "
                "assign administrator roles."
            ),
        )


def assert_not_own_role_change(
    current_user: dict[str, object],
    user_id: int,
    current_role: str,
    new_role: str,
) -> None:
    """Nobody may change their own role (no self-promotion or self-demotion)."""
    if int(current_user["id"]) == user_id and new_role != current_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot change your own role.",
        )


def revoke_user_sessions(connection: MySQLConnection, user_id: int) -> None:
    """Revoke every active session of an account.

    Used when an account is deactivated or its role changes, so the new
    permission state takes effect immediately instead of at the next sign-in.
    """
    cursor = connection.cursor()
    cursor.execute(
        """
        UPDATE auth_sessions
        SET revoked_at = %s
        WHERE user_id = %s AND revoked_at IS NULL
        """,
        (datetime.now(timezone.utc).replace(tzinfo=None), user_id),
    )
    cursor.close()


@app.get("/api/admin/staff", response_model=list[AdminStaffAccountResponse])
def list_staff_accounts(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> list[AdminStaffAccountResponse]:
    """Accounts shown on the Admin "User Management" page.

    Real database rows only: Staff, Administrator and Super Admin accounts,
    ordered from the highest to the lowest privilege. Residents are excluded on
    purpose (they stay on the Residents page), and the administrator dependency
    keeps staff/resident callers out of this endpoint entirely.
    """
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT users.id, users.email, users.role, users.account_status,
               users.created_at, resident_profiles.first_name,
               resident_profiles.last_name,
               (SELECT MAX(auth_sessions.created_at) FROM auth_sessions
                 WHERE auth_sessions.user_id = users.id) AS last_login
        FROM users
        LEFT JOIN resident_profiles ON resident_profiles.user_id = users.id
        WHERE users.role IN ('staff', 'admin', 'super_admin')
        ORDER BY FIELD(users.role, 'super_admin', 'admin', 'staff'),
                 users.id ASC
        """
    )
    accounts = [managed_account_response(row) for row in cursor.fetchall()]
    cursor.close()
    return accounts


@app.post(
    "/api/admin/staff",
    response_model=AdminStaffAccountResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_staff_account(
    payload: AdminStaffCreateInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminStaffAccountResponse:
    """Create a Staff account (administrator roles need a Super Admin).

    The password is hashed with the portal's existing scheme before it is
    stored (``app.security.hash_password``) and is never returned by the API.
    """
    assert_role_assignment_allowed(current_user, payload.role, payload.role)

    email = normalize_email(payload.email)
    first_name = payload.first_name.strip()
    last_name = payload.last_name.strip()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cursor.fetchone() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account already exists for this email.",
            )

        cursor.execute(
            """
            INSERT INTO users (email, password_hash, role, account_status)
            VALUES (%s, %s, %s, %s)
            """,
            (
                email,
                hash_password(payload.password),
                payload.role,
                payload.account_status,
            ),
        )
        user_id = cursor.lastrowid

        # get_current_user joins resident_profiles, so every account needs a
        # profile row (same requirement as scripts/create_admin.py).
        cursor.execute(
            """
            INSERT INTO resident_profiles (user_id, first_name, last_name)
            VALUES (%s, %s, %s)
            """,
            (user_id, first_name, last_name),
        )
        connection.commit()
    except HTTPException:
        connection.rollback()
        raise
    except mysql.connector.IntegrityError as error:
        connection.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists for this email.",
        ) from error
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create the staff account.",
        ) from error
    finally:
        cursor.close()

    account = load_managed_account(connection, user_id)
    account_name = managed_account_response(account).name

    # The account exists and is committed, so the audit entry and the admin
    # notification are written now (both best-effort, see their docstrings).
    record_activity_log(
        connection,
        user_id=current_user["id"],
        action_type="Create",
        action="created a staff account",
        target=(
            f"ADM-{user_id:03d} ({account_name}) · "
            f"{role_label(str(account['role']))}"
        ),
        target_type="User",
        ip_address=get_client_ip(request),
    )
    record_admin_notification(
        connection,
        title="Staff account created",
        message=(
            f"Administrator {user_display_name(current_user)} created the "
            f"{role_label(str(account['role']))} account {account_name} "
            f"(ADM-{user_id:03d}, {email})."
        ),
        dedupe_key=build_dedupe_key("staff-created", user_id, action_time_bucket()),
    )

    return managed_account_response(account)


@app.put("/api/admin/staff/{user_id}", response_model=AdminStaffAccountResponse)
def update_staff_account(
    user_id: int,
    payload: AdminStaffUpdateInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminStaffAccountResponse:
    """Save changes made in the User Management "Edit" form.

    Guards applied here (and mirrored by the UI, which is not trusted):
    the account must exist, the caller's permission must cover the account's
    current *and* requested role, and nobody may change their own role.
    """
    account = load_managed_account(connection, user_id)
    previous_role = str(account["role"])
    assert_role_assignment_allowed(current_user, previous_role, payload.role)
    assert_not_own_role_change(current_user, user_id, previous_role, payload.role)

    email = normalize_email(payload.email)
    first_name = payload.first_name.strip()
    last_name = payload.last_name.strip()
    role_changed = payload.role != previous_role
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT id FROM users WHERE email = %s AND id != %s",
            (email, user_id),
        )
        if cursor.fetchone() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account already exists for this email.",
            )

        cursor.execute(
            "UPDATE users SET email = %s, role = %s WHERE id = %s",
            (email, payload.role, user_id),
        )
        cursor.execute(
            """
            INSERT INTO resident_profiles (user_id, first_name, last_name)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE
              first_name = VALUES(first_name), last_name = VALUES(last_name)
            """,
            (user_id, first_name, last_name),
        )
        if role_changed:
            # A role/permission change must take effect immediately.
            revoke_user_sessions(connection, user_id)
        connection.commit()
    except HTTPException:
        connection.rollback()
        raise
    except mysql.connector.IntegrityError as error:
        connection.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists for this email.",
        ) from error
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update the staff account.",
        ) from error
    finally:
        cursor.close()

    updated = load_managed_account(connection, user_id)
    updated_name = managed_account_response(updated).name
    target = f"ADM-{user_id:03d} ({updated_name})"

    record_activity_log(
        connection,
        user_id=current_user["id"],
        action_type="Update",
        action="updated staff account information",
        target=target,
        target_type="User",
        ip_address=get_client_ip(request),
    )
    record_admin_notification(
        connection,
        title="Staff account updated",
        message=(
            f"Administrator {user_display_name(current_user)} updated the "
            f"account information of {updated_name} (ADM-{user_id:03d})."
        ),
        dedupe_key=build_dedupe_key(
            "staff-updated",
            user_id,
            email,
            first_name,
            last_name,
            payload.role,
            action_time_bucket(),
        ),
    )

    if role_changed:
        record_activity_log(
            connection,
            user_id=current_user["id"],
            action_type="Update",
            action="changed a staff role/permission",
            target=(
                f"{target} · {role_label(previous_role)} → "
                f"{role_label(payload.role)}"
            ),
            target_type="User",
            ip_address=get_client_ip(request),
        )

    return managed_account_response(updated)


@app.patch(
    "/api/admin/staff/{user_id}/status",
    response_model=AdminStaffAccountResponse,
)
def set_staff_account_status(
    user_id: int,
    payload: AdminStaffStatusInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminStaffAccountResponse:
    """Activate or deactivate a staff account.

    Deactivating revokes the account's active sessions, so the person is signed
    out immediately (``get_current_user`` only accepts active accounts).
    """
    account = load_managed_account(connection, user_id)
    assert_role_assignment_allowed(current_user, str(account["role"]), str(account["role"]))

    activated = payload.account_status == "active"
    if not activated and int(current_user["id"]) == user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot deactivate your own account.",
        )

    cursor = connection.cursor()
    try:
        cursor.execute(
            "UPDATE users SET account_status = %s WHERE id = %s",
            (payload.account_status, user_id),
        )
        if not activated:
            revoke_user_sessions(connection, user_id)
        connection.commit()
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update the account status.",
        ) from error
    finally:
        cursor.close()

    updated = load_managed_account(connection, user_id)
    updated_name = managed_account_response(updated).name

    record_activity_log(
        connection,
        user_id=current_user["id"],
        action_type="Update",
        action=(
            "reactivated staff account" if activated else "deactivated staff account"
        ),
        target=f"ADM-{user_id:03d} ({updated_name})",
        target_type="User",
        ip_address=get_client_ip(request),
    )
    record_admin_notification(
        connection,
        title=(
            "Staff account reactivated" if activated else "Staff account deactivated"
        ),
        message=(
            f"Administrator {user_display_name(current_user)} "
            f"{'reactivated' if activated else 'deactivated'} the account of "
            f"{updated_name} (ADM-{user_id:03d})."
        ),
        dedupe_key=build_dedupe_key(
            "staff-account-status", user_id, payload.account_status
        ),
    )

    return managed_account_response(updated)


@app.post(
    "/api/admin/staff/{user_id}/reset-password",
    response_model=MessageResponse,
)
def send_staff_password_reset(
    user_id: int,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> MessageResponse:
    """Email the existing password-reset link to the account's owner.

    This reuses the Forgot Password architecture end to end: a single-use token
    is stored hashed in ``password_reset_tokens`` and only the emailed link
    contains the plain token, so no password is ever shown to (or chosen by)
    the administrator.
    """
    account = load_managed_account(connection, user_id)
    assert_role_assignment_allowed(current_user, str(account["role"]), str(account["role"]))

    email = str(account["email"])
    if not is_email_configured():
        logger.error("Staff password reset requested while SMTP is not configured.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Password reset is temporarily unavailable. Please contact "
                "the Barangay office."
            ),
        )

    token = create_password_reset_token()
    token_hash = hash_access_token(token)
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.password_reset_token_expiration_minutes,
    )
    reset_url = (
        f"{settings.frontend_url}{FRONTEND_RESET_PASSWORD_PATH}"
        f"?token={quote(token)}"
    )

    cursor = connection.cursor()
    try:
        # A new link invalidates every older one for this account.
        cursor.execute(
            "DELETE FROM password_reset_tokens WHERE user_id = %s",
            (user_id,),
        )
        cursor.execute(
            """
            INSERT INTO password_reset_tokens
              (user_id, token_hash, expires_at, requested_ip)
            VALUES (%s, %s, %s, %s)
            """,
            (
                user_id,
                token_hash,
                expires_at.replace(tzinfo=None),
                get_client_ip(request)[:45],
            ),
        )
        connection.commit()
    except mysql.connector.Error as error:
        connection.rollback()
        logger.exception("Could not store the password reset token.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not process the password reset request.",
        ) from error
    finally:
        cursor.close()

    try:
        send_password_reset_email(
            to_email=email,
            reset_url=reset_url,
            expires_in_minutes=settings.password_reset_token_expiration_minutes,
        )
    except EmailDeliveryError as error:
        # Never leave a usable token behind when the mail did not go out.
        discard_password_reset_token(connection, token_hash)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "We could not send the reset email right now. Please try "
                "again in a few minutes."
            ),
        ) from error

    updated = load_managed_account(connection, user_id)
    updated_name = managed_account_response(updated).name

    record_activity_log(
        connection,
        user_id=current_user["id"],
        action_type="Update",
        action="sent a staff account password reset link",
        target=f"ADM-{user_id:03d} ({updated_name})",
        target_type="User",
        ip_address=get_client_ip(request),
    )
    record_admin_notification(
        connection,
        title="Staff password reset",
        message=(
            f"Administrator {user_display_name(current_user)} sent a password "
            f"reset link to {updated_name} (ADM-{user_id:03d}, {email})."
        ),
        dedupe_key=build_dedupe_key(
            "staff-password-reset", user_id, action_time_bucket()
        ),
    )

    return MessageResponse(
        message=f"A password reset link was sent to {email}."
    )


@app.get("/api/admin/activity-logs", response_model=list[AdminActivityLogResponse])
def list_activity_logs(
    search: str | None = None,
    action_type: str | None = None,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> list[AdminActivityLogResponse]:
    """Audit trail for the Admin Activity Logs page (newest entries first)."""
    query = """
        SELECT id, actor_name, actor_role, action_type, action, target_type,
               target, ip_address, created_at
        FROM activity_logs
    """
    conditions: list[str] = []
    params: list[str] = []

    if search and search.strip():
        term = f"%{search.strip()}%"
        conditions.append(
            "(actor_name LIKE %s OR action LIKE %s OR target LIKE %s)"
        )
        params.extend([term, term, term])

    if action_type and action_type != "all":
        conditions.append("action_type = %s")
        params.append(action_type)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY created_at DESC, id DESC"

    cursor = connection.cursor(dictionary=True)
    cursor.execute(query, tuple(params))
    logs = [
        AdminActivityLogResponse(
            id=row["id"],
            actor_name=row["actor_name"],
            actor_role=row["actor_role"],
            action_type=row["action_type"],
            action=row["action"],
            target_type=row["target_type"],
            target=row["target"],
            ip_address=row["ip_address"],
            created_at=row["created_at"],
        )
        for row in cursor.fetchall()
    ]
    cursor.close()
    return logs


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
