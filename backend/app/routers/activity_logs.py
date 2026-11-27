"""Admin activity log listing."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from mysql.connector import MySQLConnection

from ..database import get_db
from ..dependencies import get_current_admin_user
from ..schemas import AdminActivityLogResponse

router = APIRouter()


@router.get("/api/admin/activity-logs", response_model=list[AdminActivityLogResponse])
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
