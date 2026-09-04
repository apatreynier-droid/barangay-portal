from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from mysql.connector import MySQLConnection

from .database import get_db
from .security import hash_access_token


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    connection: MySQLConnection = Depends(get_db),
) -> dict[str, object]:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is required.",
        )

    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT users.id, users.email, users.role, resident_profiles.first_name,
               resident_profiles.last_name, auth_sessions.id AS session_id
        FROM auth_sessions
        JOIN users ON users.id = auth_sessions.user_id
        JOIN resident_profiles ON resident_profiles.user_id = users.id
        WHERE auth_sessions.token_hash = %s
          AND auth_sessions.revoked_at IS NULL
          AND auth_sessions.expires_at > UTC_TIMESTAMP()
          AND users.account_status = 'active'
        """,
        (hash_access_token(credentials.credentials),),
    )
    user = cursor.fetchone()
    cursor.close()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session is invalid or has expired.",
        )

    return user
