"""Admin Dashboard and Admin Reports figures."""

from __future__ import annotations

import logging
from datetime import date
from typing import Literal

import mysql.connector
from fastapi import APIRouter, Depends, HTTPException, Query, status
from mysql.connector import MySQLConnection

from ..analytics import (
    AnalyticsInputError,
    build_dashboard_analytics,
    build_reports_analytics,
)
from ..database import get_db
from ..dependencies import get_current_admin_portal_user, get_current_admin_user
from ..schemas import (
    AdminActivityEntry,
    AdminDashboardResponse,
    AdminRecentRegistration,
    AdminRecentRequest,
    AdminReportsResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/api/admin/dashboard", response_model=AdminDashboardResponse)
def admin_dashboard(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_portal_user),
) -> AdminDashboardResponse:
    # Statistics, trends and Purok analytics come from the Pandas analytics
    # service; this handler only adds the "recent" lists shown beside them.
    try:
        analytics = build_dashboard_analytics(connection)
    except mysql.connector.Error as error:
        logger.exception("Could not compute the dashboard analytics")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not load the dashboard statistics from the database.",
        ) from error

    cursor = connection.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT requests.request_number,
               CONCAT(resident_profiles.first_name, ' ', resident_profiles.last_name)
                   AS resident_name,
               document_types.document_name AS document,
               requests.status,
               requests.submitted_at
        FROM requests
        JOIN users ON users.id = requests.user_id
        JOIN resident_profiles ON resident_profiles.user_id = users.id
        JOIN document_types ON document_types.id = requests.document_type_id
        ORDER BY requests.submitted_at DESC, requests.id DESC
        LIMIT 5
        """
    )
    recent_requests = [
        AdminRecentRequest(
            request_number=row["request_number"],
            resident_name=row["resident_name"],
            document=row["document"],
            status=row["status"],
            submitted_at=row["submitted_at"],
        )
        for row in cursor.fetchall()
    ]

    cursor.execute(
        """
        SELECT CONCAT(resident_profiles.first_name, ' ', resident_profiles.last_name)
                   AS resident_name,
               resident_profiles.created_at,
               users.account_status
        FROM resident_profiles
        JOIN users ON users.id = resident_profiles.user_id
        WHERE users.role = 'resident'
        ORDER BY resident_profiles.created_at DESC, resident_profiles.id DESC
        LIMIT 4
        """
    )
    recent_registrations = [
        AdminRecentRegistration(
            resident_name=row["resident_name"],
            created_at=row["created_at"],
            status=row["account_status"],
        )
        for row in cursor.fetchall()
    ]

    # Activity titles include the document type and resident name.
    cursor.execute(
        """
        SELECT CONCAT(
                   document_types.document_name,
                   ' request from ',
                   resident_profiles.first_name,
                   ' ',
                   resident_profiles.last_name
               ) AS title,
               requests.submitted_at AS created_at
        FROM requests
        JOIN resident_profiles ON resident_profiles.user_id = requests.user_id
        JOIN document_types ON document_types.id = requests.document_type_id
        ORDER BY requests.submitted_at DESC, requests.id DESC
        LIMIT 3
        """
    )
    recent_activity = [
        AdminActivityEntry(title=row["title"], created_at=row["created_at"])
        for row in cursor.fetchall()
    ]

    cursor.close()

    return AdminDashboardResponse(
        **analytics,
        recent_requests=recent_requests,
        recent_registrations=recent_registrations,
        recent_activity=recent_activity,
    )


@router.get("/api/admin/reports", response_model=AdminReportsResponse)
def admin_reports(
    date_from: date | None = Query(
        default=None,
        description="First Manila calendar day (YYYY-MM-DD). Omit for all time.",
    ),
    date_to: date | None = Query(
        default=None,
        description="Last Manila calendar day (YYYY-MM-DD). Defaults to today.",
    ),
    granularity: Literal["daily", "weekly", "monthly", "yearly"] = Query(
        default="monthly",
        description="Interval of the request, registration and pothole trends.",
    ),
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminReportsResponse:
    """Administrator reports for a date range, computed with Pandas."""
    try:
        analytics = build_reports_analytics(
            connection, date_from, date_to, granularity
        )
    except AnalyticsInputError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error
    except mysql.connector.Error as error:
        logger.exception("Could not compute the report analytics")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not load the report data from the database.",
        ) from error

    return AdminReportsResponse(**analytics)
