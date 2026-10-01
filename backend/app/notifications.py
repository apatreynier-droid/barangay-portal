"""Automatic admin notifications for important portal actions.

The portal has exactly one notification system: the ``notifications`` table,
read through ``GET /api/notifications`` and updated through
``PATCH /api/notifications/{id}/read`` and ``POST /api/notifications/read-all``
(rendered by the resident Notification page and the Admin Notification page).
This module is the single place that *writes* the admin-facing rows of that
existing system:

    resident action -> endpoint in app/main.py
                    -> row in ``notifications`` for every active admin
                    -> Admin Notification page (GET /api/notifications)

Nothing here is hardcoded: recipients are resolved from the Admin Portal
roles in ``users.role`` (``staff``, ``admin``, ``super_admin``) and every
message is built from the data the endpoint just read or wrote (resident name,
document name, request number, status).

Guarantees relied on by the endpoints:

* :func:`create_notification` and :func:`notify_admins` do **not** commit, so a
  notification can stay in the same transaction as the action it describes.
  When the action fails and is rolled back, no misleading notification is left
  behind.
* :func:`record_admin_notification` is the best-effort variant for actions that
  are already committed. A notification problem is logged and swallowed, so it
  can never break or roll back the action that produced it.
* Repeating the same action (accidental double submit, frontend retry) does not
  create a second notification. Every row carries a deterministic
  ``dedupe_key`` that is claimed through a UNIQUE index (migration 007). When
  that column has not been migrated yet the row is still written, so the
  feature keeps working on an older database.
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

#: MySQL error number for "unknown column" (migration 007 not applied yet).
UNKNOWN_COLUMN_ERROR = 1054

#: MySQL error number for "table doesn't exist".
MISSING_TABLE_ERROR = 1146

#: Longest value the ``dedupe_key`` column accepts (see migration 007).
DEDUPE_KEY_MAX_LENGTH = 191

#: Actions repeated within this window count as one action. This is what stops
#: an accidental double submit or a retried API call from notifying the admin
#: twice, while a genuinely later action still produces a new notification.
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
) -> int:
    """Write the notification to every active administrator account.

    Returns how many rows were created (``0`` when the same action was already
    recorded). Nothing is committed here.
    """
    created = 0
    for admin_id in _load_admin_ids(connection):
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


def _load_admin_ids(connection: MySQLConnection) -> list[int]:
    """Return the ids of every active Admin Portal account.

    Staff accounts are included: they process the same document requests, so
    they need the same operational notifications (new requests, registrations,
    status changes) as the administrators.
    """
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id
            FROM users
            WHERE role IN ('staff', 'admin', 'super_admin')
              AND account_status = 'active'
            ORDER BY id ASC
            """
        )
        return [int(row["id"]) for row in cursor.fetchall()]
    finally:
        cursor.close()

