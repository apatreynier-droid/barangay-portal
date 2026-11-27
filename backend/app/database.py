from __future__ import annotations

import os
import ssl
from collections.abc import Generator

import mysql.connector
from fastapi import HTTPException, status
from mysql.connector import MySQLConnection

from .config import settings


def _default_ca_bundle() -> str:
    """The operating system's CA bundle, else certifi's ('' when neither exists)."""
    candidates = [
        ssl.get_default_verify_paths().cafile,
        "/etc/ssl/certs/ca-certificates.crt",  # Debian/Ubuntu (Render)
        "/etc/pki/tls/certs/ca-bundle.crt",  # Fedora/RHEL
    ]
    found = next((path for path in candidates if path and os.path.isfile(path)), "")
    if found:
        return found
    try:
        import certifi  # Windows has no CA bundle file
    except ImportError:
        return ""
    return certifi.where()


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
    if settings.mysql_ssl or settings.mysql_ssl_ca:
        config["ssl_disabled"] = False
        config["ssl_verify_cert"] = True
        config["tls_versions"] = ["TLSv1.2", "TLSv1.3"]
        ca_file = settings.mysql_ssl_ca or _default_ca_bundle()
        if ca_file:
            config["ssl_ca"] = ca_file

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
