"""Activity (audit) logging helpers.

Every notable action performed in the portal is stored once in the
``activity_logs`` table (see scripts/migrations/006_add_activity_logs.sql)
and surfaced on the Admin "Activity Logs" page.

Recording is deliberately best-effort: a logging problem must never break or
roll back the action that produced the entry.
"""

from __future__ import annotations

import logging

import mysql.connector
from mysql.connector import MySQLConnection

logger = logging.getLogger(__name__)


def record_activity_log(
    connection: MySQLConnection,
    *,
    user_id: int | None,
    action_type: str,
    action: str,
    target: str = "System",
    target_type: str = "System",
    ip_address: str | None = None,
) -> None:
    """Persist one audit entry for the action that just succeeded.

    The actor's display name and role are resolved from ``user_id`` so every
    endpoint only has to describe *what* happened. Failures are logged and
    swallowed on purpose.
    """
    try:
        actor_name, actor_role = _resolve_actor(connection, user_id)
        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO activity_logs
              (user_id, actor_name, actor_role, action_type, action,
               target_type, target, ip_address)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                user_id,
                actor_name,
                actor_role,
                action_type,
                action,
                target_type,
                target,
                ip_address[:45] if ip_address else None,
            ),
        )
        cursor.close()
        connection.commit()
    except mysql.connector.Error:
        try:
            connection.rollback()
        except mysql.connector.Error:
            pass
        logger.exception("Could not record the activity log entry.")


def _resolve_actor(
    connection: MySQLConnection,
    user_id: int | None,
) -> tuple[str, str]:
    """Return the display name and role for a user id."""
    if user_id is None:
        return "System", "system"

    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT CONCAT(resident_profiles.first_name, ' ',
                      resident_profiles.last_name) AS actor_name,
               users.role AS actor_role
        FROM users
        JOIN resident_profiles ON resident_profiles.user_id = users.id
        WHERE users.id = %s
        """,
        (user_id,),
    )
    actor = cursor.fetchone()
    cursor.close()

    if actor is None:
        return "Unknown user", "system"

    return actor["actor_name"], actor["actor_role"]