"""Notification listing and read state."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from mysql.connector import MySQLConnection

from ..database import get_db
from ..dependencies import get_current_user
from ..schemas import NotificationResponse

router = APIRouter()


@router.get("/api/notifications", response_model=list[NotificationResponse])
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


@router.patch("/api/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
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


@router.post("/api/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
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
