"""Registration, sign-in, sign-out and password reset."""

from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import mysql.connector
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from mysql.connector import MySQLConnection

from ..activity_logs import record_activity_log
from ..common import (
    FRONTEND_RESET_PASSWORD_PATH,
    clean_optional,
    discard_password_reset_token,
    format_manila_datetime,
    normalize_email,
)
from ..config import settings
from ..database import get_db
from ..dependencies import get_current_user
from ..email_service import (
    EmailDeliveryError,
    is_email_configured,
    send_password_reset_email,
)
from ..email_templates import EVENT_REGISTERED
from ..notifications import (
    NOTIFICATION_TYPE_REGISTRATION,
    build_dedupe_key,
    record_admin_notification,
)
from ..rate_limit import (
    get_client_ip,
    login_attempt_limiter,
    login_ip_limiter,
    password_reset_email_limiter,
    password_reset_ip_limiter,
    password_reset_submit_limiter,
    registration_ip_limiter,
)
from ..registration_emails import (
    deliver_in_background,
    enqueue_registration_email,
    reset_registration_emails,
)
from ..schemas import (
    AuthResponse,
    ForgotPasswordInput,
    LoginInput,
    MessageResponse,
    RegisterInput,
    RegistrationResponse,
    ResetPasswordInput,
    UserResponse,
)
from ..security import (
    create_access_token,
    create_password_reset_token,
    hash_access_token,
    hash_password,
    verify_password,
)

router = APIRouter()
logger = logging.getLogger(__name__)


#: MySQL error number for a duplicate value on a UNIQUE key.
DUPLICATE_ENTRY_ERROR = 1062


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


@router.post(
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


@router.post("/api/auth/login", response_model=AuthResponse)
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


@router.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
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


@router.post(
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


@router.post("/api/auth/reset-password", response_model=MessageResponse)
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
