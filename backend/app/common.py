"""Small helpers and constants shared by more than one router."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import mysql.connector
from mysql.connector import MySQLConnection

logger = logging.getLogger(__name__)


#: Frontend route the emailed reset link points at (see src/Utils/Shared/routePaths.ts).
FRONTEND_RESET_PASSWORD_PATH = "/reset-password"


#: Asia/Manila has no daylight saving, so a fixed offset is always correct.
MANILA_TIMEZONE = timezone(timedelta(hours=8))


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
