"""Writes admin-facing rows to the ``notifications`` table.

Recipients are the active Admin Portal accounts (``staff``, ``admin``,
``super_admin``); rows are read via ``GET /api/notifications``.

Guarantees relied on by the endpoints:

* :func:`create_notification` and :func:`notify_admins` do not commit, so the
  notification rolls back together with a failed action.
* :func:`record_admin_notification` is best-effort for already committed
  actions: errors are logged and swallowed, never rolling back the action.
* Repeated actions (double submit, retries) are deduplicated through a UNIQUE
  ``dedupe_key`` (migration 007). Without that column, rows are still written
  without duplicate protection.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone

import mysql.connector
from mysql.connector import MySQLConnection

logger = logging.getLogger(__name__)

#: ``notifications.notification_type`` values that already exist in the schema.
NOTIFICATION_TYPE_REQUEST = "request"
NOTIFICATION_TYPE_SYSTEM = "system"
#: Added by migration 010; lets the Admin page link to the Approvals page.
NOTIFICATION_TYPE_REGISTRATION = "registration"

#: MySQL error number for "unknown column" (migration 007 not applied yet).
UNKNOWN_COLUMN_ERROR = 1054

#: MySQL error number for "table doesn't exist".
MISSING_TABLE_ERROR = 1146

#: Longest value the ``dedupe_key`` column accepts (see migration 007).
DEDUPE_KEY_MAX_LENGTH = 191

#: Repeats of the same action within this window produce only one notification.
DUPLICATE_ACTION_WINDOW_SECONDS = 120


def build_dedupe_key(event: str, *parts: object) -> str:
    """Return the deterministic key for one action.

    ``event`` names the action (``"request-submitted"``, ...) and ``parts`` are
    the values that make this action unique. The values are hashed so the key
    stays short, stable, and safe for a UNIQUE index.
    """
    raw = ":".join(str(part) for part in parts)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:40]
    return f"{event}:{digest}"


def action_time_bucket(moment: datetime | None = None) -> int:
    """Return the coarse time bucket used to detect accidental repeats."""
    current = moment or datetime.now(timezone.utc)
    return int(current.timestamp() // DUPLICATE_ACTION_WINDOW_SECONDS)


def create_notification(
    connection: MySQLConnection,
    *,
    user_id: int,
    title: str,
    message: str,
    notification_type: str = NOTIFICATION_TYPE_SYSTEM,
    related_request_id: int | None = None,
    dedupe_key: str | None = None,
) -> bool:
    """Insert one row into the existing ``notifications`` table.

    Returns ``True`` when a new (unread) notification row was written and
    ``False`` when an identical action was already recorded. The caller owns
    the transaction: nothing is committed here.
    """
    scoped_key = _scope_key(dedupe_key, user_id) if dedupe_key else None

    inserted = _insert_notification(
        connection,
        user_id=user_id,
        title=title,
        message=message,
        notification_type=notification_type,
        related_request_id=related_request_id,
        dedupe_key=scoped_key,
    )
    if inserted is None:
        # The dedupe column is not in this database (migration 007 pending):
        # store the notification without duplicate protection.
        logger.warning(
            "notifications.dedupe_key is missing; run "
            "scripts/apply_notification_dedupe_migration.py. Storing the "
            "notification for user #%s without duplicate protection.",
            user_id,
        )
        inserted = _insert_notification(
            connection,
            user_id=user_id,
            title=title,
            message=message,
            notification_type=notification_type,
            related_request_id=related_request_id,
            dedupe_key=None,
        )
        return bool(inserted)

    return inserted


def notify_admins(
    connection: MySQLConnection,
    *,
    title: str,
    message: str,
    notification_type: str = NOTIFICATION_TYPE_SYSTEM,
    related_request_id: int | None = None,
    dedupe_key: str | None = None,
    administrators_only: bool = False,
) -> int:
    """Write the notification to every active administrator account.

    Set ``administrators_only`` for work Staff accounts cannot act on.
    Returns how many rows were created (``0`` when the same action was already
    recorded). Nothing is committed here.
    """
    created = 0
    for admin_id in _load_admin_ids(connection, administrators_only):
        if create_notification(
            connection,
            user_id=admin_id,
            title=title,
            message=message,
            notification_type=notification_type,
            related_request_id=related_request_id,
            dedupe_key=dedupe_key,
        ):
            created += 1
    if created == 0:
        logger.info("No admin notification was created for: %s", title)
    return created


def record_admin_notification(
    connection: MySQLConnection,
    *,
    title: str,
    message: str,
    notification_type: str = NOTIFICATION_TYPE_SYSTEM,
    related_request_id: int | None = None,
    dedupe_key: str | None = None,
    administrators_only: bool = False,
) -> int:
    """Best-effort :func:`notify_admins` for an already committed action.

    Commits on success and swallows (but logs) any database problem, so the
    action that produced the notification is never rolled back.
    """
    try:
        created = notify_admins(
            connection,
            title=title,
            message=message,
            notification_type=notification_type,
            related_request_id=related_request_id,
            dedupe_key=dedupe_key,
            administrators_only=administrators_only,
        )
        connection.commit()
        return created
    except mysql.connector.Error:
        try:
            connection.rollback()
        except mysql.connector.Error:
            pass
        logger.exception("Could not record the admin notification.")
        return 0


def _insert_notification(
    connection: MySQLConnection,
    *,
    user_id: int,
    title: str,
    message: str,
    notification_type: str,
    related_request_id: int | None,
    dedupe_key: str | None,
) -> bool | None:
    """Run the INSERT; ``None`` when the dedupe column is not available yet."""
    cursor = connection.cursor()
    try:
        if dedupe_key is None:
            cursor.execute(
                """
                INSERT INTO notifications
                  (user_id, title, message, notification_type,
                   related_request_id)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    title[:255],
                    message,
                    notification_type,
                    related_request_id,
                ),
            )
            return True

        cursor.execute(
            """
            INSERT INTO notifications
              (user_id, title, message, notification_type,
               related_request_id, dedupe_key)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE id = id
            """,
            (
                user_id,
                title[:255],
                message,
                notification_type,
                related_request_id,
                dedupe_key,
            ),
        )
        # Affected rows: 1 for a fresh row, 0 when the UNIQUE dedupe key
        # already held this exact action (nothing changed).
        return cursor.rowcount == 1
    except mysql.connector.Error as error:
        if error.errno in (UNKNOWN_COLUMN_ERROR, MISSING_TABLE_ERROR):
            return None
        raise
    finally:
        cursor.close()


def _scope_key(dedupe_key: str, user_id: int) -> str:
    """Make a dedupe key unique per recipient and short enough for the column."""
    digest = hashlib.sha1(
        f"{dedupe_key}:user:{user_id}".encode("utf-8")
    ).hexdigest()
    event = dedupe_key.split(":", 1)[0]
    return f"{event}:u{user_id}:{digest}"[:DEDUPE_KEY_MAX_LENGTH]


def _load_admin_ids(
    connection: MySQLConnection, administrators_only: bool = False
) -> list[int]:
    """Return the ids of every active Admin Portal account.

    Staff are included unless ``administrators_only`` is set (e.g. for
    registration reviews, which only administrators can perform).
    """
    roles = (
        ("admin", "super_admin")
        if administrators_only
        else ("staff", "admin", "super_admin")
    )
    placeholders = ", ".join(["%s"] * len(roles))
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            f"""
            SELECT id
            FROM users
            WHERE role IN ({placeholders})
              AND account_status = 'active'
            ORDER BY id ASC
            """,
            roles,
        )
        return [int(row["id"]) for row in cursor.fetchall()]
    finally:
        cursor.close()

