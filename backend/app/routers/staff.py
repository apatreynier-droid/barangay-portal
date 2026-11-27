"""Admin management of staff accounts."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import mysql.connector
from fastapi import APIRouter, Depends, HTTPException, Request, status
from mysql.connector import MySQLConnection

from ..activity_logs import record_activity_log
from ..common import (
    FRONTEND_RESET_PASSWORD_PATH,
    actor_display_name,
    discard_password_reset_token,
    normalize_email,
)
from ..config import settings
from ..database import get_db
from ..dependencies import get_current_admin_user
from ..email_service import (
    EmailDeliveryError,
    is_email_configured,
    send_password_reset_email,
)
from ..notifications import (
    action_time_bucket,
    build_dedupe_key,
    record_admin_notification,
)
from ..rate_limit import get_client_ip
from ..schemas import (
    AdminStaffAccountResponse,
    AdminStaffCreateInput,
    AdminStaffStatusInput,
    AdminStaffUpdateInput,
    MessageResponse,
)
from ..security import create_password_reset_token, hash_access_token, hash_password

router = APIRouter()
logger = logging.getLogger(__name__)


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


@router.get("/api/admin/staff", response_model=list[AdminStaffAccountResponse])
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


@router.post(
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


@router.put("/api/admin/staff/{user_id}", response_model=AdminStaffAccountResponse)
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


@router.patch(
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


@router.post(
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
