from __future__ import annotations

import calendar
import math
from datetime import date, datetime, timedelta, timezone

import mysql.connector
import secrets
from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from mysql.connector import MySQLConnection

from .config import settings
from .database import create_connection, get_db
from .dependencies import get_current_admin_user, get_current_user
from .schemas import (
    AdminActivityEntry,
    AdminDashboardResponse,
    AdminDocumentRequestDetailResponse,
    AdminDocumentRequestResponse,
    AdminRequestActionInput,
    AdminRequestHistoryResponse,
    AdminDocumentTypeCount,
    AdminMonthlyDataPoint,
    AdminRecentRegistration,
    AdminRecentRequest,
    AdminResidentDetailResponse,
    AdminResidentRequestEntry,
    AdminResidentResponse,
    AdminResidentStatusInput,
    AdminResidentUpdateInput,
    AdminReportsExportRow,
    AdminReportsMonthlyPoint,
    AdminReportsResponse,
    AdminReportsSummary,
    AdminPurokCount,
    AdminStatusStats,
    AuthResponse,
    CreateRequestInput,
    DashboardSummaryResponse,
    DocumentTypeResponse,
    LoginInput,
    NotificationResponse,
    RegisterInput,
    RequestDetailResponse,
    RequestResponse,
    RequestStatusHistoryEntry,
    UpdateRequestInput,
    UserResponse,
)
from .security import (
    create_access_token,
    hash_access_token,
    hash_password,
    verify_password,
)
from .rate_limit import (
    get_client_ip,
    login_attempt_limiter,
    login_ip_limiter,
)


app = FastAPI(title="Barangay Portal API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def clean_optional(value: str | None) -> str | None:
    """Return a stripped string, or None when the value is empty/missing."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped if stripped else None


def raise_rate_limited(retry_after: float, message: str) -> None:
    """Raise HTTP 429 for an active rate limit, with a Retry-After header."""
    retry_seconds = max(1, math.ceil(retry_after))
    minutes = math.ceil(retry_seconds / 60)
    suffix = "s" if minutes != 1 else ""
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=(
            f"{message} Try again in about {minutes} minute{suffix}."
        ),
        headers={"Retry-After": str(retry_seconds)},
    )


def build_auth_response(connection: MySQLConnection, user_id: int) -> AuthResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT users.id, users.email, users.role, resident_profiles.first_name,
               resident_profiles.last_name
        FROM users
        JOIN resident_profiles ON resident_profiles.user_id = users.id
        WHERE users.id = %s
        """,
        (user_id,),
    )
    user = cursor.fetchone()
    cursor.close()
    if user is None:
        raise HTTPException(status_code=500, detail="User profile is missing.")

    token = create_access_token()
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.access_token_days,
    )
    cursor = connection.cursor()
    cursor.execute(
        """
        INSERT INTO auth_sessions (user_id, token_hash, expires_at)
        VALUES (%s, %s, %s)
        """,
        (user_id, hash_access_token(token), expires_at.replace(tzinfo=None)),
    )
    cursor.close()
    connection.commit()

    return AuthResponse(
        access_token=token,
        user=UserResponse(**user),
    )


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/docs")


@app.get("/api/health")
def health_check() -> dict[str, str]:
    try:
        connection = create_connection()
        connection.close()
    except mysql.connector.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MySQL is unavailable.",
        ) from error
    return {"status": "ok"}


@app.post("/api/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterInput,
    connection: MySQLConnection = Depends(get_db),
) -> AuthResponse:
    cursor = connection.cursor(dictionary=True)
    email = normalize_email(payload.email)
    try:
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cursor.fetchone() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account already exists for this email.",
            )

        cursor.execute(
            """
            INSERT INTO users (email, password_hash)
            VALUES (%s, %s)
            """,
            (email, hash_password(payload.password)),
        )
        user_id = cursor.lastrowid
        cursor.execute(
            """
            INSERT INTO resident_profiles
              (user_id, first_name, middle_name, last_name, suffix,
               date_of_birth, place_of_birth, sex, civil_status, nationality,
               religion, voter_status, house_no, street, purok,
               years_of_residency, occupation, employer,
               emergency_contact_name, emergency_contact_relationship,
               emergency_contact_number, emergency_contact_address,
               contact_number, address)
            VALUES (%s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s)
            """,
            (
                user_id,
                payload.first_name.strip(),
                clean_optional(payload.middle_name),
                payload.last_name.strip(),
                clean_optional(payload.suffix),
                payload.date_of_birth,
                clean_optional(payload.place_of_birth),
                clean_optional(payload.sex),
                clean_optional(payload.civil_status),
                clean_optional(payload.nationality),
                clean_optional(payload.religion),
                clean_optional(payload.voter_status),
                clean_optional(payload.house_no),
                clean_optional(payload.street),
                clean_optional(payload.purok),
                payload.years_of_residency,
                clean_optional(payload.occupation),
                clean_optional(payload.employer),
                clean_optional(payload.emergency_contact_name),
                clean_optional(payload.emergency_contact_relationship),
                clean_optional(payload.emergency_contact_number),
                clean_optional(payload.emergency_contact_address),
                payload.phone.strip(),
                payload.address.strip(),
            ),
        )
        connection.commit()
    except HTTPException:
        connection.rollback()
        raise
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(status_code=500, detail="Could not create the account.") from error
    finally:
        cursor.close()

    return build_auth_response(connection, user_id)


@app.post("/api/auth/login", response_model=AuthResponse)
def login(
    payload: LoginInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
) -> AuthResponse:
    client_ip = get_client_ip(request)
    # Track consecutive failures per client IP + account pair.
    attempt_key = f"{client_ip}|{normalize_email(payload.email)}"

    # IP-based flood protection for login requests.
    retry_after = login_ip_limiter.hit(client_ip)
    if retry_after > 0:
        raise_rate_limited(
            retry_after,
            "Too many login requests from this network.",
        )

    # Temporary block after too many consecutive failed attempts.
    retry_after = login_attempt_limiter.remaining_block(attempt_key)
    if retry_after > 0:
        raise_rate_limited(
            retry_after,
            "Too many failed login attempts. Login is temporarily blocked.",
        )

    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT id, password_hash
        FROM users
        WHERE email = %s AND account_status = 'active'
        """,
        (normalize_email(payload.email),),
    )
    user = cursor.fetchone()
    cursor.close()

    if user is None or not verify_password(payload.password, user["password_hash"]):
        blocked_for = login_attempt_limiter.record_failure(attempt_key)
        if blocked_for > 0:
            raise_rate_limited(
                blocked_for,
                "Too many failed login attempts. Login is temporarily blocked.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    # Successful login: give the client a clean slate again.
    login_attempt_limiter.record_success(attempt_key)
    return build_auth_response(connection, user["id"])


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    current_user: dict[str, object] = Depends(get_current_user),
    connection: MySQLConnection = Depends(get_db),
) -> Response:
    cursor = connection.cursor()
    cursor.execute(
        "UPDATE auth_sessions SET revoked_at = UTC_TIMESTAMP() WHERE id = %s",
        (current_user["session_id"],),
    )
    connection.commit()
    cursor.close()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/document-types", response_model=list[DocumentTypeResponse])
def list_document_types(
    connection: MySQLConnection = Depends(get_db),
    _: dict[str, object] = Depends(get_current_user),
) -> list[DocumentTypeResponse]:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT id, document_name, description
        FROM document_types
        WHERE is_active = 1
        ORDER BY document_name
        """,
    )
    document_types = cursor.fetchall()
    cursor.close()
    return [DocumentTypeResponse(**document_type) for document_type in document_types]


@app.get("/api/requests", response_model=list[RequestResponse])
def list_requests(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> list[RequestResponse]:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.request_number, requests.document_type_id,
               document_types.document_name AS document, requests.purpose,
               requests.status, requests.submitted_at, requests.last_updated,
               requests.pickup_date
        FROM requests
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE requests.user_id = %s
        ORDER BY requests.submitted_at DESC, requests.id DESC
        """,
        (current_user["id"],),
    )
    requests = cursor.fetchall()
    cursor.close()
    return [RequestResponse(**request) for request in requests]


@app.get("/api/requests/{request_id}", response_model=RequestDetailResponse)
def get_request_detail(
    request_id: int,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> RequestDetailResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.request_number, requests.purpose,
               requests.status, requests.admin_remarks, requests.submitted_at,
               requests.last_updated, requests.pickup_date,
               document_types.document_name AS document
        FROM requests
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE requests.id = %s AND requests.user_id = %s
        """,
        (request_id, current_user["id"]),
    )
    request = cursor.fetchone()

    if request is None:
        cursor.close()
        raise HTTPException(status_code=404, detail="Request was not found.")

    cursor.execute(
        """
        SELECT old_status, new_status, remarks, changed_at
        FROM request_status_history
        WHERE request_id = %s
        ORDER BY changed_at ASC, id ASC
        """,
        (request_id,),
    )
    history = cursor.fetchall()
    cursor.close()

    return RequestDetailResponse(
        **request,
        history=[RequestStatusHistoryEntry(**entry) for entry in history],
    )


@app.post("/api/requests", response_model=RequestResponse, status_code=status.HTTP_201_CREATED)
def create_request(
    payload: CreateRequestInput,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> RequestResponse:
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id, document_name
            FROM document_types
            WHERE id = %s AND is_active = 1
            """,
            (payload.document_type_id,),
        )
        document_type = cursor.fetchone()
        if document_type is None:
            raise HTTPException(status_code=404, detail="Document type was not found.")

        cursor.execute(
            """
            INSERT INTO requests (request_number, user_id, document_type_id,
                                   purpose, status)
            VALUES (%s, %s, %s, %s, 'Pending')
            """,
            (
                f"TEMP-{secrets.token_hex(12)}",
                current_user["id"],
                payload.document_type_id,
                payload.purpose.strip(),
            ),
        )
        request_id = cursor.lastrowid
        request_number = f"REQ-{datetime.now(timezone.utc).year}-{request_id:06d}"
        cursor.execute(
            "UPDATE requests SET request_number = %s WHERE id = %s",
            (request_number, request_id),
        )
        cursor.execute(
            """
            INSERT INTO request_status_history (request_id, new_status, changed_by)
            VALUES (%s, 'Pending', %s)
            """,
            (request_id, current_user["id"]),
        )
        cursor.execute(
            """
            INSERT INTO notifications
              (user_id, title, message, notification_type, related_request_id)
            VALUES (%s, %s, %s, 'request', %s)
            """,
            (
                current_user["id"],
                "Request received",
                f"Your request {request_number} has been submitted for review.",
                request_id,
            ),
        )
        connection.commit()
    except HTTPException:
        connection.rollback()
        raise
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(status_code=500, detail="Could not create the request.") from error

    cursor.execute(
        """
        SELECT requests.id, requests.request_number, requests.document_type_id,
               document_types.document_name AS document, requests.purpose,
               requests.status, requests.submitted_at, requests.last_updated,
               requests.pickup_date
        FROM requests
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE requests.id = %s
        """,
        (request_id,),
    )
    request = cursor.fetchone()
    cursor.close()
    return RequestResponse(**request)


@app.put("/api/requests/{request_id}", response_model=RequestResponse)
def update_request(
    request_id: int,
    payload: UpdateRequestInput,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> RequestResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT id, status
        FROM requests
        WHERE id = %s AND user_id = %s
        """,
        (request_id, current_user["id"]),
    )
    request = cursor.fetchone()
    cursor.close()

    if request is None:
        raise HTTPException(status_code=404, detail="Request was not found.")
    if request["status"] != "Pending":
        raise HTTPException(
            status_code=409,
            detail="Only requests that are still pending can be edited.",
        )

    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            UPDATE requests
            SET purpose = %s
            WHERE id = %s AND user_id = %s
            """,
            (payload.purpose.strip(), request_id, current_user["id"]),
        )
        connection.commit()
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(
            status_code=500, detail="Could not update the request."
        ) from error
    finally:
        cursor.close()

    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.request_number, requests.document_type_id,
               document_types.document_name AS document, requests.purpose,
               requests.status, requests.submitted_at, requests.last_updated,
               requests.pickup_date
        FROM requests
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE requests.id = %s
        """,
        (request_id,),
    )
    updated_request = cursor.fetchone()
    cursor.close()
    return RequestResponse(**updated_request)


@app.delete("/api/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_request(
    request_id: int,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> Response:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT id, status
        FROM requests
        WHERE id = %s AND user_id = %s
        """,
        (request_id, current_user["id"]),
    )
    request = cursor.fetchone()
    cursor.close()

    if request is None:
        raise HTTPException(status_code=404, detail="Request was not found.")
    if request["status"] != "Pending":
        raise HTTPException(
            status_code=409,
            detail="Only requests that are still pending can be deleted.",
        )

    cursor = connection.cursor()
    try:
        cursor.execute(
            "DELETE FROM request_status_history WHERE request_id = %s",
            (request_id,),
        )
        cursor.execute(
            "UPDATE notifications SET related_request_id = NULL WHERE related_request_id = %s",
            (request_id,),
        )
        cursor.execute(
            "DELETE FROM requests WHERE id = %s AND user_id = %s",
            (request_id, current_user["id"]),
        )
        connection.commit()
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(
            status_code=500, detail="Could not delete the request."
        ) from error
    finally:
        cursor.close()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/dashboard-summary", response_model=DashboardSummaryResponse)
def dashboard_summary(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> DashboardSummaryResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT COUNT(*) AS total_requests,
               COALESCE(SUM(status = 'Pending'), 0) AS pending,
               COALESCE(SUM(status = 'Processing'), 0) AS processing,
               COALESCE(SUM(status = 'Ready for Pickup'), 0) AS ready_for_pickup
        FROM requests
        WHERE user_id = %s
        """,
        (current_user["id"],),
    )
    summary = cursor.fetchone()
    cursor.close()
    return DashboardSummaryResponse(**summary)


@app.get("/api/admin/dashboard", response_model=AdminDashboardResponse)
def admin_dashboard(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminDashboardResponse:
    cursor = connection.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT COUNT(*) AS total_residents,
               COALESCE(SUM(users.created_at
                            >= CURDATE() - INTERVAL (DAY(CURDATE()) - 1) DAY), 0)
                   AS new_residents_this_month
        FROM users
        WHERE users.role = 'resident'
        """
    )
    resident_stats = cursor.fetchone()

    cursor.execute(
        """
        SELECT COALESCE(SUM(status = 'Pending'), 0) AS pending,
               COALESCE(SUM(status = 'Ready for Pickup'), 0) AS approved,
               COALESCE(SUM(status = 'Processing'), 0) AS processing,
               COALESCE(SUM(status = 'Completed'
                            AND COALESCE(completed_at, last_updated)
                                >= CURDATE() - INTERVAL (DAY(CURDATE()) - 1) DAY), 0)
                   AS completed,
               COALESCE(SUM(status = 'Rejected'
                            AND last_updated
                                >= CURDATE() - INTERVAL (DAY(CURDATE()) - 1) DAY), 0)
                   AS rejected
        FROM requests
        """
    )
    request_stats = cursor.fetchone()

    # Monthly overview (submitted vs completed vs rejected) for the last 7 months.
    cursor.execute(
        """
        SELECT YEAR(submitted_at) AS yr, MONTH(submitted_at) AS mo,
               COUNT(*) AS submitted,
               COALESCE(SUM(status = 'Completed'), 0) AS completed,
               COALESCE(SUM(status = 'Rejected'), 0) AS rejected
        FROM requests
        WHERE submitted_at
              >= SUBDATE(CURDATE() - INTERVAL (DAY(CURDATE()) - 1) DAY, INTERVAL 6 MONTH)
        GROUP BY yr, mo
        """
    )
    monthly_rows = {
        (row["yr"], row["mo"]): row for row in cursor.fetchall()
    }

    today = date.today()
    month_keys: list[tuple[int, int]] = []
    year, month = today.year, today.month
    for _ in range(7):
        month_keys.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    month_keys.reverse()

    monthly: list[AdminMonthlyDataPoint] = []
    for row_year, row_month in month_keys:
        row = monthly_rows.get((row_year, row_month))
        monthly.append(
            AdminMonthlyDataPoint(
                month=calendar.month_abbr[row_month],
                submitted=row["submitted"] if row else 0,
                completed=row["completed"] if row else 0,
                rejected=row["rejected"] if row else 0,
            )
        )

    cursor.execute(
        """
        SELECT document_types.document_name, COUNT(requests.id) AS total
        FROM document_types
        JOIN requests ON requests.document_type_id = document_types.id
        GROUP BY document_types.id, document_types.document_name
        ORDER BY total DESC
        LIMIT 5
        """
    )
    document_types = [
        AdminDocumentTypeCount(document_name=row["document_name"], count=row["total"])
        for row in cursor.fetchall()
    ]

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
               resident_profiles.created_at
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
        )
        for row in cursor.fetchall()
    ]

    cursor.execute(
        """
        SELECT 'New Document Request' AS title, requests.submitted_at AS created_at
        FROM requests
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
        stats=AdminStatusStats(
            total_residents=resident_stats["total_residents"],
            new_residents_this_month=resident_stats["new_residents_this_month"],
            pending=request_stats["pending"],
            approved=request_stats["approved"],
            processing=request_stats["processing"],
            completed=request_stats["completed"],
            rejected=request_stats["rejected"],
        ),
        monthly=monthly,
        document_types=document_types,
        recent_requests=recent_requests,
        recent_registrations=recent_registrations,
        recent_activity=recent_activity,
    )


@app.get("/api/admin/reports", response_model=AdminReportsResponse)
def admin_reports(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminReportsResponse:
    cursor = connection.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT COUNT(*) AS total_residents,
               COALESCE(SUM(users.account_status = 'active'), 0) AS active_residents
        FROM users
        WHERE users.role = 'resident'
        """
    )
    resident_stats = cursor.fetchone()

    cursor.execute(
        """
        SELECT COUNT(*) AS total_requests,
               COALESCE(SUM(status = 'Completed'), 0) AS completed,
               COALESCE(SUM(status = 'Rejected'), 0) AS rejected
        FROM requests
        """
    )
    request_stats = cursor.fetchone()

    # Monthly overview (requests vs completed vs rejected) for the last 7 months.
    cursor.execute(
        """
        SELECT YEAR(submitted_at) AS yr, MONTH(submitted_at) AS mo,
               COUNT(*) AS requests,
               COALESCE(SUM(status = 'Completed'), 0) AS completed,
               COALESCE(SUM(status = 'Rejected'), 0) AS rejected
        FROM requests
        WHERE submitted_at
              >= SUBDATE(CURDATE() - INTERVAL (DAY(CURDATE()) - 1) DAY, INTERVAL 6 MONTH)
        GROUP BY yr, mo
        """
    )
    monthly_rows = {
        (row["yr"], row["mo"]): row for row in cursor.fetchall()
    }

    today = date.today()
    month_keys: list[tuple[int, int]] = []
    year, month = today.year, today.month
    for _ in range(7):
        month_keys.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    month_keys.reverse()

    monthly: list[AdminReportsMonthlyPoint] = []
    for row_year, row_month in month_keys:
        row = monthly_rows.get((row_year, row_month))
        monthly.append(
            AdminReportsMonthlyPoint(
                month=calendar.month_abbr[row_month],
                requests=row["requests"] if row else 0,
                completed=row["completed"] if row else 0,
                rejected=row["rejected"] if row else 0,
            )
        )

    # Registered residents grouped by their purok.
    cursor.execute(
        """
        SELECT resident_profiles.purok,
               COUNT(*) AS total
        FROM resident_profiles
        JOIN users ON users.id = resident_profiles.user_id
        WHERE users.role = 'resident'
              AND resident_profiles.purok IS NOT NULL
              AND TRIM(resident_profiles.purok) <> ''
        GROUP BY resident_profiles.purok
        ORDER BY total DESC, resident_profiles.purok ASC
        """
    )
    residents_by_purok = [
        AdminPurokCount(purok=row["purok"], count=row["total"])
        for row in cursor.fetchall()
    ]

    # Requests grouped by document type (all types with at least one request).
    cursor.execute(
        """
        SELECT document_types.document_name, COUNT(requests.id) AS total
        FROM document_types
        JOIN requests ON requests.document_type_id = document_types.id
        GROUP BY document_types.id, document_types.document_name
        ORDER BY total DESC
        """
    )
    document_types = [
        AdminDocumentTypeCount(document_name=row["document_name"], count=row["total"])
        for row in cursor.fetchall()
    ]

    # Full request records used for the CSV export / printable report.
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
        """
    )
    export_requests = [
        AdminReportsExportRow(
            request_number=row["request_number"],
            resident_name=row["resident_name"],
            document=row["document"],
            status=row["status"],
            submitted_at=row["submitted_at"],
        )
        for row in cursor.fetchall()
    ]

    cursor.close()

    total_requests = int(request_stats["total_requests"])
    completed = int(request_stats["completed"])
    rejected = int(request_stats["rejected"])

    return AdminReportsResponse(
        summary=AdminReportsSummary(
            total_residents=resident_stats["total_residents"],
            active_residents=resident_stats["active_residents"],
            total_requests=total_requests,
            completed=completed,
            rejected=rejected,
            completion_rate=round((completed / total_requests) * 100, 1)
            if total_requests
            else 0.0,
            rejection_rate=round((rejected / total_requests) * 100, 1)
            if total_requests
            else 0.0,
        ),
        monthly=monthly,
        residents_by_purok=residents_by_purok,
        document_types=document_types,
        export_requests=export_requests,
    )


@app.get("/api/admin/residents", response_model=list[AdminResidentResponse])
def list_residents(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> list[AdminResidentResponse]:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT resident_profiles.id,
               CONCAT(resident_profiles.first_name, ' ',
                      resident_profiles.last_name) AS name,
               users.email,
               resident_profiles.purok,
               resident_profiles.contact_number,
               users.account_status AS status,
               resident_profiles.created_at
        FROM resident_profiles
        JOIN users ON users.id = resident_profiles.user_id
        WHERE users.role = 'resident'
        ORDER BY resident_profiles.id ASC
        """
    )
    residents = [
        AdminResidentResponse(
            id=row["id"],
            resident_code=f"RES-{row['id']:03d}",
            name=row["name"],
            email=row["email"],
            purok=row["purok"],
            contact_number=row["contact_number"],
            status=row["status"],
            registered_at=row["created_at"],
        )
        for row in cursor.fetchall()
    ]
    cursor.close()
    return residents


def load_resident_detail(
    connection: MySQLConnection, resident_id: int
) -> AdminResidentDetailResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT resident_profiles.id, resident_profiles.user_id,
               resident_profiles.first_name, resident_profiles.middle_name,
               resident_profiles.last_name, resident_profiles.suffix,
               resident_profiles.date_of_birth, resident_profiles.sex,
               resident_profiles.civil_status, resident_profiles.occupation,
               resident_profiles.purok, resident_profiles.address,
               resident_profiles.contact_number, users.email,
               users.account_status
        FROM resident_profiles
        JOIN users ON users.id = resident_profiles.user_id
        WHERE resident_profiles.id = %s AND users.role = 'resident'
        """,
        (resident_id,),
    )
    profile = cursor.fetchone()
    if profile is None:
        cursor.close()
        raise HTTPException(status_code=404, detail="Resident was not found.")

    cursor.execute(
        """
        SELECT requests.request_number,
               document_types.document_name AS document,
               requests.status,
               requests.submitted_at
        FROM requests
        JOIN users ON users.id = requests.user_id
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE users.id = %s
        ORDER BY requests.submitted_at DESC, requests.id DESC
        """,
        (profile["user_id"],),
    )
    requests = [
        AdminResidentRequestEntry(
            request_number=row["request_number"],
            document=row["document"],
            status=row["status"],
            submitted_at=row["submitted_at"],
        )
        for row in cursor.fetchall()
    ]
    cursor.close()

    name_parts = [
        profile["first_name"],
        profile["middle_name"],
        profile["last_name"],
        profile["suffix"],
    ]

    return AdminResidentDetailResponse(
        id=profile["id"],
        resident_code=f"RES-{profile['id']:03d}",
        name=" ".join(part for part in name_parts if part),
        first_name=profile["first_name"],
        middle_name=profile["middle_name"],
        last_name=profile["last_name"],
        suffix=profile["suffix"],
        email=profile["email"],
        purok=profile["purok"],
        contact_number=profile["contact_number"],
        address=profile["address"],
        birthday=profile["date_of_birth"],
        gender=profile["sex"],
        civil_status=profile["civil_status"],
        occupation=profile["occupation"],
        status=profile["account_status"],
        requests=requests,
    )


@app.get("/api/admin/residents/{resident_id}", response_model=AdminResidentDetailResponse)
def get_resident_detail(
    resident_id: int,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminResidentDetailResponse:
    return load_resident_detail(connection, resident_id)


@app.put("/api/admin/residents/{resident_id}", response_model=AdminResidentDetailResponse)
def update_resident(
    resident_id: int,
    payload: AdminResidentUpdateInput,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminResidentDetailResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT resident_profiles.id AS profile_id, users.id AS user_id
        FROM resident_profiles
        JOIN users ON users.id = resident_profiles.user_id
        WHERE resident_profiles.id = %s AND users.role = 'resident'
        """,
        (resident_id,),
    )
    resident = cursor.fetchone()
    if resident is None:
        cursor.close()
        raise HTTPException(status_code=404, detail="Resident was not found.")

    email = normalize_email(payload.email)
    try:
        cursor.execute(
            "SELECT id FROM users WHERE email = %s AND id != %s",
            (email, resident["user_id"]),
        )
        if cursor.fetchone() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account already exists for this email.",
            )

        cursor.execute(
            """
            UPDATE resident_profiles
            SET first_name = %s, middle_name = %s, last_name = %s, suffix = %s,
                date_of_birth = %s, sex = %s, civil_status = %s, occupation = %s,
                house_no = %s, street = %s, purok = %s, address = %s,
                contact_number = %s
            WHERE id = %s
            """,
            (
                payload.first_name.strip(),
                clean_optional(payload.middle_name),
                payload.last_name.strip(),
                clean_optional(payload.suffix),
                payload.date_of_birth,
                payload.sex,
                payload.civil_status,
                clean_optional(payload.occupation),
                clean_optional(payload.house_no),
                clean_optional(payload.street),
                clean_optional(payload.purok),
                clean_optional(payload.address),
                clean_optional(payload.contact_number),
                resident["profile_id"],
            ),
        )
        cursor.execute(
            "UPDATE users SET email = %s WHERE id = %s",
            (email, resident["user_id"]),
        )
        connection.commit()
    except HTTPException:
        connection.rollback()
        raise
    except mysql.connector.IntegrityError as error:
        connection.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists for this email.",
        ) from error
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update the resident.",
        ) from error
    finally:
        cursor.close()

    return load_resident_detail(connection, resident_id)


@app.patch(
    "/api/admin/residents/{resident_id}/status",
    response_model=AdminResidentDetailResponse,
)
def set_resident_status(
    resident_id: int,
    payload: AdminResidentStatusInput,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminResidentDetailResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT users.id AS user_id
        FROM resident_profiles
        JOIN users ON users.id = resident_profiles.user_id
        WHERE resident_profiles.id = %s AND users.role = 'resident'
        """,
        (resident_id,),
    )
    resident = cursor.fetchone()
    if resident is None:
        cursor.close()
        raise HTTPException(status_code=404, detail="Resident was not found.")

    try:
        cursor.execute(
            "UPDATE users SET account_status = %s WHERE id = %s",
            (payload.account_status, resident["user_id"]),
        )
        if payload.account_status == "inactive":
            # Revoke active sessions so the deactivation takes effect immediately.
            cursor.execute(
                """
                UPDATE auth_sessions
                SET revoked_at = %s
                WHERE user_id = %s AND revoked_at IS NULL
                """,
                (
                    datetime.now(timezone.utc).replace(tzinfo=None),
                    resident["user_id"],
                ),
            )
        connection.commit()
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update the account status.",
        ) from error
    finally:
        cursor.close()

    return load_resident_detail(connection, resident_id)


@app.get("/api/admin/document-requests", response_model=list[AdminDocumentRequestResponse])
def list_document_requests(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> list[AdminDocumentRequestResponse]:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.request_number,
               CONCAT(resident_profiles.first_name, ' ',
                      resident_profiles.last_name) AS resident_name,
               document_types.document_name AS document,
               requests.purpose,
               requests.status, requests.submitted_at, document_types.fee
        FROM requests
        JOIN users ON users.id = requests.user_id
        JOIN resident_profiles ON resident_profiles.user_id = users.id
        JOIN document_types ON document_types.id = requests.document_type_id
        ORDER BY requests.submitted_at DESC, requests.id DESC
        """
    )
    document_requests = [
        AdminDocumentRequestResponse(
            id=row["id"],
            request_number=row["request_number"],
            resident_name=row["resident_name"],
            document=row["document"],
            purpose=row["purpose"],
            status=row["status"],
            submitted_at=row["submitted_at"],
            fee=float(row["fee"]),
        )
        for row in cursor.fetchall()
    ]
    cursor.close()
    return document_requests


@app.get(
    "/api/admin/request-history",
    response_model=list[AdminRequestHistoryResponse],
)
def list_request_history(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> list[AdminRequestHistoryResponse]:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.request_number,
               CONCAT(resident_profiles.first_name, ' ',
                      resident_profiles.last_name) AS resident_name,
               document_types.document_name AS document,
               requests.status, requests.submitted_at,
               (SELECT CONCAT(admin_profile.first_name, ' ',
                              admin_profile.last_name)
                FROM request_status_history history
                JOIN resident_profiles admin_profile
                     ON admin_profile.user_id = history.changed_by
                WHERE history.request_id = requests.id
                  AND history.changed_by IS NOT NULL
                ORDER BY history.changed_at DESC, history.id DESC
                LIMIT 1) AS processed_by
        FROM requests
        JOIN users ON users.id = requests.user_id
        JOIN resident_profiles ON resident_profiles.user_id = users.id
        JOIN document_types ON document_types.id = requests.document_type_id
        ORDER BY requests.submitted_at DESC, requests.id DESC
        """
    )
    history_requests = [
        AdminRequestHistoryResponse(
            id=row["id"],
            request_number=row["request_number"],
            resident_name=row["resident_name"],
            document=row["document"],
            status=row["status"],
            submitted_at=row["submitted_at"],
            processed_by=row["processed_by"],
        )
        for row in cursor.fetchall()
    ]
    cursor.close()
    return history_requests


# Allowed admin status transitions for document requests. Requests that are
# Completed or Rejected are final and cannot be changed anymore.
VALID_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "Pending": {"Approved", "Rejected"},
    "Approved": {"Processing", "Rejected"},
    "Processing": {"Ready for Pickup", "Rejected"},
    "Ready for Pickup": {"Completed"},
    "Completed": set(),
    "Rejected": set(),
}


def load_document_request_detail(
    connection: MySQLConnection, request_id: int
) -> AdminDocumentRequestDetailResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.user_id, requests.request_number,
               requests.purpose,
               requests.status, requests.admin_remarks, requests.submitted_at,
               requests.last_updated, requests.pickup_date,
               document_types.document_name AS document, document_types.fee,
               CONCAT(resident_profiles.first_name, ' ',
                      resident_profiles.last_name) AS resident_name,
               users.email,
               (SELECT CONCAT(admin_profile.first_name, ' ',
                              admin_profile.last_name)
                FROM request_status_history history
                JOIN resident_profiles admin_profile
                     ON admin_profile.user_id = history.changed_by
                WHERE history.request_id = requests.id
                  AND history.changed_by IS NOT NULL
                ORDER BY history.changed_at DESC, history.id DESC
                LIMIT 1) AS processed_by
        FROM requests
        JOIN users ON users.id = requests.user_id
        JOIN resident_profiles ON resident_profiles.user_id = users.id
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE requests.id = %s
        """,
        (request_id,),
    )
    request = cursor.fetchone()
    cursor.close()

    if request is None:
        raise HTTPException(status_code=404, detail="Request was not found.")

    return AdminDocumentRequestDetailResponse(
        id=request["id"],
        request_number=request["request_number"],
        resident_name=request["resident_name"],
        email=request["email"],
        document=request["document"],
        purpose=request["purpose"],
        status=request["status"],
        admin_remarks=request["admin_remarks"],
        submitted_at=request["submitted_at"],
        last_updated=request["last_updated"],
        pickup_date=request["pickup_date"],
        fee=float(request["fee"]),
        processed_by=request["processed_by"],
    )


@app.get(
    "/api/admin/document-requests/{request_id}",
    response_model=AdminDocumentRequestDetailResponse,
)
def get_document_request_detail(
    request_id: int,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminDocumentRequestDetailResponse:
    return load_document_request_detail(connection, request_id)


@app.patch(
    "/api/admin/document-requests/{request_id}",
    response_model=AdminDocumentRequestDetailResponse,
)
def update_document_request(
    request_id: int,
    payload: AdminRequestActionInput,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminDocumentRequestDetailResponse:
    if payload.status is None and payload.admin_remarks is None and payload.pickup_date is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide a status, remarks, or a pickup date.",
        )

    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT requests.id, requests.user_id, requests.request_number,
               requests.status
        FROM requests
        WHERE requests.id = %s
        """,
        (request_id,),
    )
    request = cursor.fetchone()
    if request is None:
        cursor.close()
        raise HTTPException(status_code=404, detail="Request was not found.")

    new_status = payload.status
    current_status = request["status"]

    if new_status is not None and new_status != current_status:
        allowed_transitions = VALID_STATUS_TRANSITIONS.get(
            current_status, set()
        )
        if new_status not in allowed_transitions:
            cursor.close()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"A request with status '{current_status}' cannot be "
                    f"changed to '{new_status}'."
                ),
            )

    try:
        cursor.execute(
            """
            UPDATE requests
            SET completed_at = CASE
                    WHEN %s = 'Completed' AND status <> 'Completed'
                    THEN NOW()
                    ELSE completed_at
                END,
                status = COALESCE(%s, status),
                admin_remarks = COALESCE(%s, admin_remarks),
                pickup_date = COALESCE(%s, pickup_date)
            WHERE id = %s
            """,
            (
                new_status,
                payload.status,
                clean_optional(payload.admin_remarks),
                payload.pickup_date,
                request_id,
            ),
        )

        if payload.status is not None and payload.status != request["status"]:
            cursor.execute(
                """
                INSERT INTO request_status_history
                  (request_id, old_status, new_status, changed_by, remarks)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    request_id,
                    request["status"],
                    payload.status,
                    current_user["id"],
                    clean_optional(payload.admin_remarks),
                ),
            )

            cursor.execute(
                """
                INSERT INTO notifications
                  (user_id, title, message, notification_type,
                   related_request_id)
                VALUES (%s, %s, %s, 'request', %s)
                """,
                (
                    request["user_id"],
                    f"Request {payload.status}",
                    (
                        f"Your document request {request['request_number']} "
                        f"is now {payload.status}."
                    ),
                    request_id,
                ),
            )

        connection.commit()
    except mysql.connector.Error as error:
        connection.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update the document request.",
        ) from error
    finally:
        cursor.close()

    return load_document_request_detail(connection, request_id)


@app.get("/api/notifications", response_model=list[NotificationResponse])
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


@app.patch("/api/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
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


@app.post("/api/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
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
