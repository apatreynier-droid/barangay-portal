from __future__ import annotations

import logging
import math
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Literal

import mysql.connector
import secrets
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from mysql.connector import MySQLConnection
from urllib.parse import quote

from .config import settings
from .database import create_connection, get_db
from .activity_logs import record_activity_log
from .analytics import (
    AnalyticsInputError,
    build_dashboard_analytics,
    build_reports_analytics,
)
from .attachments import (
    ValidatedImage,
    build_attachment_response,
    delete_stored_file,
    fetch_attachment_row,
    insert_attachment_row,
    load_attachment_meta,
    read_validated_image,
    store_image_file,
)
from .dependencies import (
    get_current_admin_portal_user,
    get_current_admin_user,
    get_current_user,
)
from .notifications import (
    NOTIFICATION_TYPE_REGISTRATION,
    NOTIFICATION_TYPE_REQUEST,
    action_time_bucket,
    build_dedupe_key,
    create_notification,
    notify_admins,
    record_admin_notification,
)
from .email_service import (
    EmailDeliveryError,
    is_email_configured,
    send_password_reset_email,
)
from .email_templates import EVENT_APPROVED, EVENT_REGISTERED, EVENT_REJECTED
from .registration_emails import (
    DELIVERY_FAILED,
    DELIVERY_IN_PROGRESS,
    DELIVERY_SENT,
    deliver_in_background,
    deliver_registration_email,
    enqueue_registration_email,
    event_for_account_status,
    reset_registration_emails,
    start_registration_email_worker,
)
from .potholes import router as pothole_router
from .request_notifications import send_request_status_email
from .schemas import (
    AdminActivityEntry,
    AdminDashboardResponse,
    AdminDocumentRequestDetailResponse,
    AdminDocumentRequestResponse,
    AdminRequestActionInput,
    AdminRequestHistoryResponse,
    AdminRecentRegistration,
    AdminRecentRequest,
    AdminActivityLogResponse,
    AdminRegistrationActionResponse,
    AdminRegistrationRejectInput,
    AdminRegistrationResponse,
    AdminResidentDetailResponse,
    AdminResidentRequestEntry,
    AdminResidentResponse,
    AdminResidentStatusInput,
    AdminResidentUpdateInput,
    AdminReportsResponse,
    AdminStaffAccountResponse,
    AdminStaffCreateInput,
    AdminStaffStatusInput,
    AdminStaffUpdateInput,
    AuthResponse,
    CreateRequestInput,
    DashboardSummaryResponse,
    DocumentTypeResponse,
    ForgotPasswordInput,
    LoginInput,
    MessageResponse,
    NotificationResponse,
    RegisterInput,
    RegistrationResponse,
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
    registration_ip_limiter,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    stop_registration_email_worker = start_registration_email_worker()
    try:
        yield
    finally:
        stop_registration_email_worker()


app = FastAPI(title="Barangay Portal API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Resident pothole reports and their administration (see app/potholes.py).
app.include_router(pothole_router)


logger = logging.getLogger(__name__)

#: Frontend route the emailed reset link points at (see src/Utils/Shared/routePaths.ts).
FRONTEND_RESET_PASSWORD_PATH = "/reset-password"

#: MySQL error number for a duplicate value on a UNIQUE key.
DUPLICATE_ENTRY_ERROR = 1062

#: Asia/Manila has no daylight saving, so a fixed offset is always correct.
MANILA_TIMEZONE = timezone(timedelta(hours=8))

#: Sign-in answers for a correct password on an account that is not active.
DEACTIVATED_LOGIN_MESSAGE = (
    "Your account is currently deactivated. Please contact the Barangay "
    "Administrator for assistance."
)
ACCOUNT_STATUS_LOGIN_MESSAGES = {
    "pending": (
        "Your registration is currently awaiting Administrator approval. You "
        "will receive an email notification once your account has been approved."
    ),
    "rejected": (
        "Your registration has been rejected. Please check your email for more "
        "information or contact the Barangay Administrator."
    ),
    "inactive": DEACTIVATED_LOGIN_MESSAGE,
    "suspended": DEACTIVATED_LOGIN_MESSAGE,
}


def normalize_email(email: str) -> str:
    return email.strip().lower()


def clean_optional(value: str | None) -> str | None:
    """Return a stripped string, or None when the value is empty/missing."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped if stripped else None


def user_display_name(user: dict[str, object]) -> str:
    """Full name of the signed-in user, used to name the actor in notifications."""
    return f"{user['first_name']} {user['last_name']}".strip()


def actor_role_label(user: dict[str, object]) -> str:
    """Short role label of the acting account for audit/notification messages."""
    role = user.get("role")
    if role == "staff":
        return "Staff"
    if role == "super_admin":
        return "Super Admin"
    return "Administrator"


def actor_display_name(
    user: dict[str, object], label: str = "Administrator"
) -> str:
    """Actor prefix for a notification message: ``"<label> <name>"``.

    The label is omitted when the name equals it (avoids "Administrator Administrator").
    """
    name = user_display_name(user)
    return name if name == label else f"{label} {name}"


def format_manila_datetime(moment: datetime) -> str:
    """Format an aware datetime for a notification, in Philippine time."""
    local = moment.astimezone(MANILA_TIMEZONE)
    hour = local.hour % 12 or 12
    return (
        f"{local:%B} {local.day}, {local.year} at "
        f"{hour}:{local:%M} {local:%p}"
    )


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
               resident_profiles.last_name, resident_profiles.purok
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


@app.post(
    "/api/auth/register",
    response_model=RegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    payload: RegisterInput,
    request: Request,
    background_tasks: BackgroundTasks,
    connection: MySQLConnection = Depends(get_db),
) -> RegistrationResponse:
    """Save a new resident as ``pending``; no session is issued until approval.

    A rejected resident may re-apply with the same email, reusing the account
    (and resident code). The previous decision stays visible until replaced.
    """
    retry_after = registration_ip_limiter.hit(get_client_ip(request))
    if retry_after > 0:
        raise_rate_limited(
            retry_after,
            "Too many registrations from this network.",
        )

    cursor = connection.cursor(dictionary=True)
    email = normalize_email(payload.email)
    try:
        cursor.execute(
            "SELECT id, role, account_status, reviewed_at FROM users WHERE email = %s",
            (email,),
        )
        existing = cursor.fetchone()
        is_resubmission = (
            existing is not None
            and existing["role"] == "resident"
            and existing["account_status"] == "rejected"
        )
        if existing is not None and not is_resubmission:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account already exists for this email.",
            )

        profile_values = (
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
        )

        if is_resubmission:
            user_id = existing["id"]
            # The status condition lets only one of several simultaneous
            # submissions through, like the review endpoints.
            cursor.execute(
                """
                UPDATE users
                SET password_hash = %s,
                    account_status = 'pending',
                    created_at = UTC_TIMESTAMP()
                WHERE id = %s AND role = 'resident' AND account_status = 'rejected'
                """,
                (hash_password(payload.password), user_id),
            )
            if cursor.rowcount != 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account already exists for this email.",
                )
            cursor.execute(
                """
                UPDATE resident_profiles
                SET first_name = %s, middle_name = %s, last_name = %s, suffix = %s,
                    date_of_birth = %s, place_of_birth = %s, sex = %s,
                    civil_status = %s, nationality = %s, religion = %s,
                    voter_status = %s, house_no = %s, street = %s, purok = %s,
                    years_of_residency = %s, occupation = %s, employer = %s,
                    emergency_contact_name = %s,
                    emergency_contact_relationship = %s,
                    emergency_contact_number = %s,
                    emergency_contact_address = %s,
                    contact_number = %s, address = %s,
                    created_at = UTC_TIMESTAMP()
                WHERE user_id = %s
                """,
                (*profile_values, user_id),
            )
            cursor.execute(
                "SELECT id FROM resident_profiles WHERE user_id = %s",
                (user_id,),
            )
            resident_id = cursor.fetchone()["id"]
            reset_registration_emails(connection, user_id=user_id)
        else:
            cursor.execute(
                """
                INSERT INTO users (email, password_hash, role, account_status)
                VALUES (%s, %s, 'resident', 'pending')
                """,
                (email, hash_password(payload.password)),
            )
            user_id = cursor.lastrowid
            cursor.execute(
                """
                INSERT INTO resident_profiles
                  (first_name, middle_name, last_name, suffix,
                   date_of_birth, place_of_birth, sex, civil_status, nationality,
                   religion, voter_status, house_no, street, purok,
                   years_of_residency, occupation, employer,
                   emergency_contact_name, emergency_contact_relationship,
                   emergency_contact_number, emergency_contact_address,
                   contact_number, address, user_id)
                VALUES (%s, %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s)
                """,
                (*profile_values, user_id),
            )
            resident_id = cursor.lastrowid
        # Same transaction as the account: the email cannot be lost once the
        # registration exists, and cannot exist without it.
        enqueue_registration_email(
            connection, user_id=user_id, event=EVENT_REGISTERED
        )
        connection.commit()
    except HTTPException:
        connection.rollback()
        raise
    except mysql.connector.Error as error:
        connection.rollback()
        if error.errno == DUPLICATE_ENTRY_ERROR:
            # Two simultaneous submissions for one address: the first one won.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account already exists for this email.",
            ) from error
        raise HTTPException(status_code=500, detail="Could not create the account.") from error
    finally:
        cursor.close()

    # Best-effort: a notification failure must not fail a committed registration.
    registered_at = format_manila_datetime(datetime.now(timezone.utc))
    registered_verb = (
        "registered again after a rejection"
        if is_resubmission
        else "registered"
    )
    record_admin_notification(
        connection,
        title="New resident registration",
        message=(
            f"{payload.first_name.strip()} {payload.last_name.strip()} "
            f"({email}) {registered_verb} on {registered_at} and is waiting "
            "for your approval."
        ),
        notification_type=NOTIFICATION_TYPE_REGISTRATION,
        # The previous decision's time makes each new application its own event.
        dedupe_key=build_dedupe_key(
            "resident-registered",
            user_id,
            *((existing["reviewed_at"],) if is_resubmission else ()),
        ),
        administrators_only=True,
    )
    if is_resubmission:
        record_activity_log(
            connection,
            user_id=user_id,
            action_type="Update",
            action="registered again after a rejection",
            target=f"RES-{resident_id:03d}",
            target_type="Resident",
            ip_address=get_client_ip(request),
        )

    # Sent after the response so an unreachable mail server cannot slow the
    # form down. A failed attempt stays queued for the retry worker.
    background_tasks.add_task(deliver_in_background, user_id, EVENT_REGISTERED)

    return RegistrationResponse(
        message=(
            "Your registration was received and is waiting for Administrator "
            "approval. You will receive an email once it has been reviewed."
        ),
        email=email,
        account_status="pending",
        reference_number=f"RES-{resident_id:03d}",
    )


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
        SELECT id, password_hash, account_status
        FROM users
        WHERE email = %s
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

    # Correct password: give the client a clean slate again.
    login_attempt_limiter.record_success(attempt_key)

    # The status is only revealed to someone who proved the password, so this
    # cannot be used to look up who has registered. No session is created.
    if user["account_status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ACCOUNT_STATUS_LOGIN_MESSAGES.get(
                user["account_status"], DEACTIVATED_LOGIN_MESSAGE
            ),
        )

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
    return create_document_request_record(
        connection,
        request,
        current_user,
        document_type_id=payload.document_type_id,
        purpose=payload.purpose,
        image=None,
    )


@app.post(
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


@app.get("/api/requests/{request_id}/attachment", response_class=FileResponse)
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
    current_user: dict[str, object] = Depends(get_current_admin_portal_user),
) -> AdminDashboardResponse:
    # Statistics, trends and Purok analytics come from the Pandas analytics
    # service; this handler only adds the "recent" lists shown beside them.
    try:
        analytics = build_dashboard_analytics(connection)
    except mysql.connector.Error as error:
        logger.exception("Could not compute the dashboard analytics")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not load the dashboard statistics from the database.",
        ) from error

    cursor = connection.cursor(dictionary=True)

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
               resident_profiles.created_at,
               users.account_status
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
            status=row["account_status"],
        )
        for row in cursor.fetchall()
    ]

    # Activity titles include the document type and resident name.
    cursor.execute(
        """
        SELECT CONCAT(
                   document_types.document_name,
                   ' request from ',
                   resident_profiles.first_name,
                   ' ',
                   resident_profiles.last_name
               ) AS title,
               requests.submitted_at AS created_at
        FROM requests
        JOIN resident_profiles ON resident_profiles.user_id = requests.user_id
        JOIN document_types ON document_types.id = requests.document_type_id
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
        **analytics,
        recent_requests=recent_requests,
        recent_registrations=recent_registrations,
        recent_activity=recent_activity,
    )


@app.get("/api/admin/reports", response_model=AdminReportsResponse)
def admin_reports(
    date_from: date | None = Query(
        default=None,
        description="First Manila calendar day (YYYY-MM-DD). Omit for all time.",
    ),
    date_to: date | None = Query(
        default=None,
        description="Last Manila calendar day (YYYY-MM-DD). Defaults to today.",
    ),
    granularity: Literal["daily", "weekly", "monthly", "yearly"] = Query(
        default="monthly",
        description="Interval of the request, registration and pothole trends.",
    ),
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminReportsResponse:
    """Administrator reports for a date range, computed with Pandas."""
    try:
        analytics = build_reports_analytics(
            connection, date_from, date_to, granularity
        )
    except AnalyticsInputError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error
    except mysql.connector.Error as error:
        logger.exception("Could not compute the report analytics")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not load the report data from the database.",
        ) from error

    return AdminReportsResponse(**analytics)


@app.get("/api/admin/residents", response_model=list[AdminResidentResponse])
def list_residents(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_portal_user),
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
          AND users.account_status NOT IN ('pending', 'rejected')
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
    current_user: dict[str, object] = Depends(get_current_admin_portal_user),
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

    # Best-effort: a notification failure must not fail the committed save.
    record_admin_notification(
        connection,
        title="Resident profile updated",
        message=(
            f"{actor_display_name(current_user)} updated the "
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
        SELECT users.id AS user_id, users.account_status,
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

    # Activating here would skip the review, its record and the resident's email.
    if resident["account_status"] in ("pending", "rejected"):
        cursor.close()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This registration has not been approved. Use the Approvals "
                "page to review it."
            ),
        )

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

    # Best-effort: a notification failure must not fail the committed change.
    deactivated = payload.account_status == "inactive"
    record_admin_notification(
        connection,
        title=(
            "Resident account deactivated"
            if deactivated
            else "Resident account reactivated"
        ),
        message=(
            f"{actor_display_name(current_user)} "
            f"{'deactivated' if deactivated else 'reactivated'} the account "
            f"of {resident['resident_name']} (RES-{resident_id:03d})."
        ),
        dedupe_key=build_dedupe_key(
            "resident-account-status", resident_id, payload.account_status
        ),
    )

    return load_resident_detail(connection, resident_id)


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


@app.get("/api/admin/registrations", response_model=list[AdminRegistrationResponse])
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


@app.post(
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


@app.post(
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


@app.post(
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


@app.get("/api/admin/document-requests", response_model=list[AdminDocumentRequestResponse])
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


@app.get(
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
               requests.last_updated, requests.pickup_date,
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
        fee=float(request["fee"]),
        processed_by=request["processed_by"],
        attachment=load_attachment_meta(connection, request_id),
    )


@app.get(
    "/api/admin/document-requests/{request_id}",
    response_model=AdminDocumentRequestDetailResponse,
)
def get_document_request_detail(
    request_id: int,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_portal_user),
) -> AdminDocumentRequestDetailResponse:
    return load_document_request_detail(connection, request_id)


@app.get(
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


@app.patch(
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
    if payload.status is None and payload.admin_remarks is None and payload.pickup_date is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide a status, remarks, or a pickup date.",
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

#: Display names of the stored roles.
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
    """Staff, Administrator and Super Admin accounts, highest privilege first.

    Residents are excluded (see the Residents page). Administrators only.
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

    # Audit entry and notification are best-effort after the commit.
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
            f"{actor_display_name(current_user)} created the "
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
            f"{actor_display_name(current_user)} updated the "
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
            f"{actor_display_name(current_user)} "
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
    """Email a password-reset link to the account's owner.

    Reuses the Forgot Password flow: only the token hash is stored, and the
    administrator never sees or chooses the password.
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
            f"{actor_display_name(current_user)} sent a password "
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
