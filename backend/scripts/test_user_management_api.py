"""End-to-end checks for the Admin User Management feature.

Run from the backend folder with the API already listening on port 8000:

    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    uvicorn app.main:app --port 8000
    # in a second terminal:
    python scripts\\test_user_management_api.py

Verifies that ``GET/POST/PUT`` on ``/api/admin/staff`` and the status and
password-reset endpoints work against the real database, that every action is
recorded in the existing audit trail, and that the permission rules hold:

* a staff account can neither read nor change accounts (403),
* an administrator cannot create an administrator account or promote a staff
  account to an administrator (403) - that needs a Super Admin,
* nobody can change their own role or deactivate their own account (403),
* resident ids are not manageable accounts (404).

The throwaway account, the audit rows and the notifications created by this run
are removed afterwards, so the database keeps only the real data.
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

PROBE_EMAIL = "user-management-probe@example.com"
PROBE_PASSWORD = "ProbePassword123!"

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
            return response.status, json.loads(response.read().decode("utf-8"))
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
    print("All user-management checks passed.")


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


def probe_user_id() -> int | None:
    from app.database import create_connection

    connection = create_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT id FROM users WHERE email = %s", (PROBE_EMAIL,))
        row = cursor.fetchone()
        cursor.close()
    finally:
        connection.close()
    return int(row["id"]) if row else None


def main() -> None:
    print("User Management API checks")
    log_watermark = table_watermark("activity_logs")
    notification_watermark = table_watermark("notifications")

    status, auth = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    check(status == 200, "administrator can sign in")
    if status != 200:
        summarize()
        return

    token = auth["access_token"]
    admin_id = int(auth["user"]["id"])

    # ---------------------------------------------------------------- listing
    status, accounts = request_json("/api/admin/staff", token=token)
    check(status == 200, "GET /api/admin/staff returns 200")
    accounts = accounts if isinstance(accounts, list) else []
    check(
        all(
            account["role"] in ("staff", "admin", "super_admin")
            for account in accounts
        ),
        "the list holds staff/administrator accounts only (no residents)",
    )
    admin_row = next(
        (account for account in accounts if account["email"] == ADMIN_EMAIL), None
    )
    check(admin_row is not None, "the existing administrator account is listed")
    check(
        bool(admin_row and admin_row.get("last_login")),
        "last login is read from the recorded sessions",
    )
    check(
        bool(admin_row and str(admin_row["staff_code"]).startswith("ADM-")),
        "every row exposes a short ADM-### account id",
    )

    # ----------------------------------------------------------------- create
    probe_body = {
        "first_name": "Probe",
        "last_name": "Staff",
        "email": PROBE_EMAIL,
        "password": PROBE_PASSWORD,
        "role": "staff",
        "account_status": "active",
    }
    status, created = request_json(
        "/api/admin/staff", method="POST", token=token, body=probe_body
    )
    check(status == 201, "POST /api/admin/staff creates a staff account")
    probe_id = created.get("id") if isinstance(created, dict) else None
    check(
        isinstance(created, dict)
        and created.get("role") == "staff"
        and created.get("account_status") == "active",
        "the new account is stored as an active Staff account",
    )
    check(
        isinstance(created, dict) and "password" not in created,
        "the API never returns a password",
    )

    status, _ = request_json(
        "/api/admin/staff", method="POST", token=token, body=probe_body
    )
    check(status == 409, "a duplicate email address is rejected with 409")

    status, _ = request_json(
        "/api/admin/staff",
        method="POST",
        token=token,
        body={
            **probe_body,
            "email": "user-management-probe-admin@example.com",
            "role": "admin",
        },
    )
    check(
        status == 403,
        "an administrator cannot create an administrator account (Super Admin only)",
    )

    # -------------------------------------------------------------- edit (PUT)
    status, updated = request_json(
        f"/api/admin/staff/{probe_id}",
        method="PUT",
        token=token,
        body={
            "first_name": "Probe",
            "last_name": "Staff Updated",
            "email": PROBE_EMAIL,
            "role": "staff",
        },
    )
    check(status == 200, "PUT /api/admin/staff/{id} saves the edit form")
    check(
        isinstance(updated, dict) and updated.get("name") == "Probe Staff Updated",
        "the edited name is written to the database and returned",
    )

    status, _ = request_json(
        f"/api/admin/staff/{probe_id}",
        method="PUT",
        token=token,
        body={
            "first_name": "Probe",
            "last_name": "Staff Updated",
            "email": PROBE_EMAIL,
            "role": "admin",
        },
    )
    check(
        status == 403,
        "an administrator cannot promote a staff account (Super Admin only)",
    )

    admin_first = (admin_row or {}).get("first_name") or "Elena"
    admin_last = (admin_row or {}).get("last_name") or "Reyes"
    admin_role = str((admin_row or {}).get("role") or "admin")
    status, _ = request_json(
        f"/api/admin/staff/{admin_id}",
        method="PUT",
        token=token,
        body={
            "first_name": admin_first,
            "last_name": admin_last,
            "email": ADMIN_EMAIL,
            "role": "staff" if admin_role != "staff" else "admin",
        },
    )
    check(status == 403, "nobody can change their own role")

    # ---------------------------------------------------- activate/deactivate
    status, deactivated = request_json(
        f"/api/admin/staff/{probe_id}/status",
        method="PATCH",
        token=token,
        body={"account_status": "inactive"},
    )
    check(
        status == 200
        and isinstance(deactivated, dict)
        and deactivated.get("account_status") == "inactive",
        "PATCH .../status deactivates the account in the database",
    )

    status, _ = request_json(
        f"/api/admin/staff/{admin_id}/status",
        method="PATCH",
        token=token,
        body={"account_status": "inactive"},
    )
    check(status == 403, "an administrator cannot deactivate their own account")

    status, activated = request_json(
        f"/api/admin/staff/{probe_id}/status",
        method="PATCH",
        token=token,
        body={"account_status": "active"},
    )
    check(
        status == 200
        and isinstance(activated, dict)
        and activated.get("account_status") == "active",
        "the deactivated account can be activated again",
    )

    # ------------------------------------------------------------ reset PW
    reset_status, reset = request_json(
        f"/api/admin/staff/{probe_id}/reset-password", method="POST", token=token
    )
    # 200 = the existing password-reset email was handed to the mail server;
    # 503 is the documented answer while SMTP is not configured.
    check(
        reset_status in (200, 503),
        f"POST .../reset-password answers with a mail result (got {reset_status})",
    )
    if reset_status == 200:
        message = reset.get("message", "") if isinstance(reset, dict) else ""
        check(
            isinstance(reset, dict)
            and set(reset) == {"message"}
            and "scrypt$" not in json.dumps(reset),
            "the reset response is a confirmation only (no password or hash)",
        )
        check(
            "reset link" in message,
            "the confirmation names the emailed reset link",
        )

    # -------------------------------------------------------- permission walls
    status, probe_auth = login(PROBE_EMAIL, PROBE_PASSWORD)
    check(status == 200, "the new staff account can sign in with its password")
    if status == 200:
        staff_token = probe_auth["access_token"]
        for method, path, request_body in (
            ("GET", "/api/admin/staff", None),
            ("POST", "/api/admin/staff", probe_body),
            (
                "PATCH",
                f"/api/admin/staff/{probe_id}/status",
                {"account_status": "inactive"},
            ),
            ("POST", f"/api/admin/staff/{probe_id}/reset-password", None),
            (
                "PUT",
                f"/api/admin/staff/{probe_id}",
                {
                    "first_name": "Probe",
                    "last_name": "Staff Updated",
                    "email": PROBE_EMAIL,
                    "role": "super_admin",
                },
            ),
        ):
            denied_status, _ = request_json(
                path, method=method, token=staff_token, body=request_body
            )
            check(
                denied_status == 403,
                f"a staff account is refused {method} {path} (403)",
            )

    status, _ = request_json("/api/admin/staff")
    check(
        status in (401, 403),
        "the endpoint refuses requests without a session",
    )

    resident_id = first_resident_user_id()
    if resident_id is not None:
        status, _ = request_json(
            f"/api/admin/staff/{resident_id}/status",
            method="PATCH",
            token=token,
            body={"account_status": "inactive"},
        )
        check(
            status == 404,
            "resident accounts are not User Management accounts (404)",
        )

    status, _ = request_json(
        "/api/admin/staff/999999",
        method="PUT",
        token=token,
        body={
            "first_name": "Ghost",
            "last_name": "Account",
            "email": "ghost-account@example.com",
            "role": "staff",
        },
    )
    check(status == 404, "an unknown account id is rejected with 404")

    # ------------------------------------------------------------- audit trail
    status, logs = request_json("/api/admin/activity-logs", token=token)
    logs = logs if isinstance(logs, list) else []
    actions = {
        row["action"]
        for row in logs
        if isinstance(row, dict) and f"ADM-{probe_id:03d}" in str(row.get("target"))
    }
    required_actions = [
        "created a staff account",
        "updated staff account information",
        "deactivated staff account",
        "reactivated staff account",
    ]
    if reset_status == 200:
        required_actions.append("sent a staff account password reset link")
    for action in required_actions:
        check(action in actions, f"the audit trail records: {action}")

    # ----------------------------------------------------------------- cleanup
    cleanup(probe_id, log_watermark, notification_watermark)
    summarize()


def first_resident_user_id() -> int | None:
    """Id of any real resident account, used for the 404 check."""
    from app.database import create_connection

    connection = create_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT id FROM users WHERE role = 'resident' ORDER BY id LIMIT 1"
        )
        row = cursor.fetchone()
        cursor.close()
    finally:
        connection.close()
    return int(row["id"]) if row else None


def cleanup(
    probe_id: int | None, log_watermark: int, notification_watermark: int
) -> None:
    """Delete the probe account and every row this run created."""
    from app.database import create_connection

    connection = create_connection()
    try:
        cursor = connection.cursor()
        if probe_id is not None:
            # Cascades to the probe's profile, sessions and reset tokens.
            cursor.execute("DELETE FROM users WHERE id = %s", (probe_id,))
        cursor.execute("DELETE FROM activity_logs WHERE id > %s", (log_watermark,))
        removed_logs = cursor.rowcount
        cursor.execute(
            "DELETE FROM notifications WHERE id > %s", (notification_watermark,)
        )
        removed_notifications = cursor.rowcount
        connection.commit()
        cursor.close()
    finally:
        connection.close()

    print(
        f"  cleaned up the probe account plus {removed_logs} audit row(s) and "
        f"{removed_notifications} notification(s) written by this run"
    )


if __name__ == "__main__":
    main()
