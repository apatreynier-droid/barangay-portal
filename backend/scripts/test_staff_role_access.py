"""End-to-end checks for Staff role routing/authorization in the Admin Portal.

Run from the backend folder with the API already listening on port 8000:

    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    uvicorn app.main:app --port 8000
    # in a second terminal:
    python scripts\\test_staff_role_access.py

Verifies the fixed role behaviour against the real database:

* login returns the stored role for every account type (admin/staff/resident),
* Staff reaches the operational Admin endpoints (dashboard, residents,
  document requests + processing, request history, notifications),
* Staff cannot approve/reject requests or call administrator-only endpoints
  (User Management, Reports, Activity Logs, resident editing/status) - every
  such call must answer HTTP 403,
* Residents can no longer call any /api/admin endpoint (HTTP 403),
* Administrator behaviour is unchanged.

The throwaway Staff/Resident accounts, their requests and the audit/notification
rows created by this run are removed afterwards, so the database keeps only the
real data.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

BASE_URL = "http://127.0.0.1:8000"

ADMIN_EMAIL = "admin@barangaylagab.com"
ADMIN_PASSWORD = "Admin@123"

STAFF_EMAIL = "staff-role-probe@example.com"
STAFF_PASSWORD = "ProbeStaff123!"

RESIDENT_EMAIL = "resident-role-probe@example.com"
RESIDENT_PASSWORD = "ProbeResident123!"

failures: list[str] = []


def check(condition: bool, message: str) -> None:
    if condition:
        print(f"  PASS  {message}")
    else:
        print(f"  FAIL  {message}")
        failures.append(message)


def request_json(
    path: str,
    *,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    token: str | None = None,
) -> tuple[int, Any]:
    """Return ``(status_code, parsed_body)``; never raises on HTTP errors."""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(
        f"{BASE_URL}{path}", data=data, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return response.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8")
        try:
            return error.code, json.loads(raw)
        except json.JSONDecodeError:
            return error.code, raw


def login(email: str, password: str) -> tuple[int, Any]:
    return request_json(
        "/api/auth/login",
        method="POST",
        body={"email": email, "password": password},
    )


def summarize() -> None:
    print()
    if failures:
        print(f"{len(failures)} check(s) FAILED:")
        for failure in failures:
            print(f"  - {failure}")
        sys.exit(1)
    print("All staff role access checks passed.")


def table_watermark(table: str) -> int:
    """Highest id in ``table`` before the run, so this run's rows can be removed."""
    from app.database import create_connection

    connection = create_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(f"SELECT COALESCE(MAX(id), 0) FROM {table}")
        value = int(cursor.fetchone()[0])
        cursor.close()
    finally:
        connection.close()
    return value


def resident_profile_id(email: str) -> int | None:
    """Resident profile id (the id used by /api/admin/residents/{id})."""
    from app.database import create_connection

    connection = create_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT resident_profiles.id
            FROM resident_profiles
            JOIN users ON users.id = resident_profiles.user_id
            WHERE users.email = %s
            """,
            (email,),
        )
        row = cursor.fetchone()
        cursor.close()
    finally:
        connection.close()
    return int(row["id"]) if row else None


def remove_probe_accounts() -> None:
    """Delete the probe accounts; rows tied to them cascade (requests, sessions)."""
    from app.database import create_connection

    connection = create_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            "DELETE FROM users WHERE email IN (%s, %s)",
            (STAFF_EMAIL, RESIDENT_EMAIL),
        )
        connection.commit()
        cursor.close()
    finally:
        connection.close()


def remove_run_rows(log_watermark: int, notification_watermark: int) -> None:
    """Remove the audit/notification rows this run added for real accounts."""
    from app.database import create_connection

    connection = create_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM activity_logs WHERE id > %s", (log_watermark,))
        cursor.execute("DELETE FROM notifications WHERE id > %s", (notification_watermark,))
        connection.commit()
        cursor.close()
    finally:
        connection.close()


def main() -> None:
    print("Staff role access checks")
    log_watermark = table_watermark("activity_logs")
    notification_watermark = table_watermark("notifications")
    # Remove leftovers from an interrupted earlier run.
    remove_probe_accounts()

    # ------------------------------------------------------------- accounts
    status, admin_auth = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    check(status == 200, "administrator can sign in")
    if status != 200:
        summarize()
        return
    admin_token = admin_auth["access_token"]
    check(
        admin_auth["user"]["role"] == "admin",
        "administrator login returns role 'admin'",
    )

    status, staff_account = request_json(
        "/api/admin/staff",
        method="POST",
        token=admin_token,
        body={
            "first_name": "Role",
            "last_name": "Probe Staff",
            "email": STAFF_EMAIL,
            "password": STAFF_PASSWORD,
            "role": "staff",
            "account_status": "active",
        },
    )
    check(status == 201, "administrator can create a Staff account")
    check(
        isinstance(staff_account, dict) and staff_account.get("role") == "staff",
        "the account stores the single 'staff' role value",
    )

    status, staff_auth = login(STAFF_EMAIL, STAFF_PASSWORD)
    check(status == 200, "staff account can sign in")
    if status != 200:
        remove_probe_accounts()
        summarize()
        return
    staff_token = staff_auth["access_token"]
    check(
        staff_auth["user"]["role"] == "staff",
        "staff login returns role 'staff' (not 'resident' and not 'admin')",
    )

    status, resident_auth = request_json(
        "/api/auth/register",
        method="POST",
        body={
            "first_name": "Role",
            "last_name": "Probe Resident",
            "email": RESIDENT_EMAIL,
            "password": RESIDENT_PASSWORD,
            "phone": "+639000000000",
            "address": "1 Probe Street, Purok 1",
        },
    )
    check(status == 201, "resident can register")
    if status != 201:
        remove_probe_accounts()
        summarize()
        return
    resident_token = resident_auth["access_token"]
    check(
        resident_auth["user"]["role"] == "resident",
        "resident registration returns role 'resident'",
    )

    # ----------------------------------------------------- document requests
    status, request_one = request_json(
        "/api/requests",
        method="POST",
        token=resident_token,
        body={"document_type_id": 2, "purpose": "Staff processing probe"},
    )
    check(status == 201, "resident can submit a document request")
    request_one_id = request_one.get("id") if isinstance(request_one, dict) else None

    status, request_two = request_json(
        "/api/requests",
        method="POST",
        token=resident_token,
        body={"document_type_id": 3, "purpose": "Staff approval-block probe"},
    )
    check(status == 201, "resident can submit a second document request")
    request_two_id = request_two.get("id") if isinstance(request_two, dict) else None

    if request_one_id:
        status, _ = request_json(
            f"/api/admin/document-requests/{request_one_id}",
            method="PATCH",
            token=admin_token,
            body={"status": "Approved"},
        )
        check(status == 200, "administrator approves the first request")

    # ----------------------------------------------------------- staff access
    status, _ = request_json("/api/admin/dashboard", token=staff_token)
    check(status == 200, "staff opens the Staff/Admin dashboard")

    status, _ = request_json("/api/admin/residents", token=staff_token)
    check(status == 200, "staff views residents")

    profile_id = resident_profile_id(RESIDENT_EMAIL)
    if profile_id:
        status, _ = request_json(
            f"/api/admin/residents/{profile_id}", token=staff_token
        )
        check(status == 200, "staff views a resident profile")

    status, _ = request_json("/api/admin/document-requests", token=staff_token)
    check(status == 200, "staff views document requests")

    status, _ = request_json("/api/admin/request-history", token=staff_token)
    check(status == 200, "staff views the request history")

    status, notifications = request_json("/api/notifications", token=staff_token)
    check(status == 200, "staff views notifications")

    if request_one_id:
        status, _ = request_json(
            f"/api/admin/document-requests/{request_one_id}", token=staff_token
        )
        check(status == 200, "staff opens a document request")

        status, _ = request_json(
            f"/api/admin/document-requests/{request_one_id}",
            method="PATCH",
            token=staff_token,
            body={"status": "Processing"},
        )
        check(status == 200, "staff moves an approved request to Processing")

        status, _ = request_json(
            f"/api/admin/document-requests/{request_one_id}",
            method="PATCH",
            token=staff_token,
            body={"admin_remarks": "Processed by the staff probe."},
        )
        check(status == 200, "staff adds remarks while processing")

        status, _ = request_json(
            f"/api/admin/document-requests/{request_one_id}",
            method="PATCH",
            token=staff_token,
            body={"status": "Ready for Pickup"},
        )
        check(status == 200, "staff marks a request Ready for Pickup")

        status, _ = request_json(
            f"/api/admin/document-requests/{request_one_id}",
            method="PATCH",
            token=staff_token,
            body={"pickup_date": "2026-10-15"},
        )
        check(status == 200, "staff sets the pickup date")

        status, _ = request_json(
            f"/api/admin/document-requests/{request_one_id}",
            method="PATCH",
            token=staff_token,
            body={"status": "Completed"},
        )
        check(status == 200, "staff marks a request Completed")

    if request_two_id:
        status, _ = request_json(
            f"/api/admin/document-requests/{request_two_id}",
            method="PATCH",
            token=staff_token,
            body={"status": "Approved"},
        )
        check(status == 403, "staff cannot approve a pending request (HTTP 403)")

        status, _ = request_json(
            f"/api/admin/document-requests/{request_two_id}",
            method="PATCH",
            token=staff_token,
            body={"status": "Rejected"},
        )
        check(status == 403, "staff cannot reject a request (HTTP 403)")

    # --------------------------------------- administrator-only endpoints
    status, _ = request_json("/api/admin/staff", token=staff_token)
    check(status == 403, "staff cannot read User Management accounts (HTTP 403)")

    status, _ = request_json(
        "/api/admin/staff",
        method="POST",
        token=staff_token,
        body={
            "first_name": "Blocked",
            "last_name": "Probe",
            "email": "blocked-staff-probe@example.com",
            "password": "BlockedProbe123!",
            "role": "staff",
            "account_status": "active",
        },
    )
    check(status == 403, "staff cannot create Staff accounts (HTTP 403)")

    status, _ = request_json("/api/admin/reports", token=staff_token)
    check(status == 403, "staff cannot open Reports (HTTP 403)")

    status, _ = request_json("/api/admin/activity-logs", token=staff_token)
    check(status == 403, "staff cannot read the Activity Logs (HTTP 403)")

    if profile_id:
        status, _ = request_json(
            f"/api/admin/residents/{profile_id}",
            method="PUT",
            token=staff_token,
            body={
                "first_name": "Blocked",
                "last_name": "Edit",
                "email": RESIDENT_EMAIL,
            },
        )
        check(status == 403, "staff cannot edit resident records (HTTP 403)")

        status, _ = request_json(
            f"/api/admin/residents/{profile_id}/status",
            method="PATCH",
            token=staff_token,
            body={"account_status": "inactive"},
        )
        check(status == 403, "staff cannot deactivate resident accounts (HTTP 403)")

    # ------------------------------------------------------------ resident
    status, _ = request_json("/api/admin/dashboard", token=resident_token)
    check(status == 403, "resident cannot open the Admin dashboard (HTTP 403)")

    status, _ = request_json("/api/admin/residents", token=resident_token)
    check(status == 403, "resident cannot view the admin resident list (HTTP 403)")

    status, _ = request_json("/api/admin/document-requests", token=resident_token)
    check(status == 403, "resident cannot view admin document requests (HTTP 403)")

    status, _ = request_json("/api/notifications", token=resident_token)
    check(status == 200, "resident still uses the resident APIs")

    # --------------------------------------------------- administrator (unchanged)
    status, _ = request_json("/api/admin/dashboard", token=admin_token)
    check(status == 200, "administrator dashboard still works")

    status, _ = request_json("/api/admin/residents", token=admin_token)
    check(status == 200, "administrator resident list still works")

    status, _ = request_json("/api/admin/reports", token=admin_token)
    check(status == 200, "administrator Reports still works")

    status, _ = request_json("/api/admin/activity-logs", token=admin_token)
    check(status == 200, "administrator Activity Logs still works")

    status, _ = request_json("/api/admin/staff", token=admin_token)
    check(status == 200, "administrator User Management still works")

    if request_two_id:
        status, _ = request_json(
            f"/api/admin/document-requests/{request_two_id}",
            method="PATCH",
            token=admin_token,
            body={"status": "Approved"},
        )
        check(status == 200, "administrator can still approve requests")

    # ------------------------------------------------------------- cleanup
    remove_probe_accounts()
    remove_run_rows(log_watermark, notification_watermark)
    summarize()


if __name__ == "__main__":
    main()
