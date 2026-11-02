from __future__ import annotations

from collections.abc import Generator

import mysql.connector
from fastapi import HTTPException, status
from mysql.connector import MySQLConnection

from .config import settings


def create_connection(include_database: bool = True) -> MySQLConnection:
    config: dict[str, object] = {
        "host": settings.mysql_host,
        "port": settings.mysql_port,
        "user": settings.mysql_user,
        "password": settings.mysql_password,
        "autocommit": False,
    }
    if include_database:
        config["database"] = settings.mysql_database

    connection = mysql.connector.connect(**config)
    # Store and exchange timestamps in UTC so every layer (database, API,
    # frontend) agrees on a single canonical instant. The Philippine local
    # time (Asia/Manila, UTC+8) is applied only when rendering for users.
    cursor = connection.cursor()
    try:
        cursor.execute("SET time_zone = '+00:00'")
    finally:
        cursor.close()
    return connection


def get_db() -> Generator[MySQLConnection, None, None]:
    try:
        connection = create_connection()
    except mysql.connector.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is unavailable.",
        ) from error

    try:
        yield connection
    finally:
        connection.close()
