"""End-to-end checks for the Admin Activity Logs feature.

Run from the backend folder with the API already listening on port 8000:

    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    uvicorn app.main:app --port 8000
    # in a second terminal:
    python scripts\\test_activity_logs_api.py

Verifies that signing in records an audit entry, that the admin-only
``GET /api/admin/activity-logs`` endpoint returns it (newest first), that the
search and ``action_type`` filters narrow the results, that a resident token
is rejected with 403, and that every audited action (submitting a request,
approving a request, updating a resident, deactivating and reactivating a
resident account) writes its own entry. All rows created by this run -
disposable accounts, requests, and the audit entries themselves - are removed
afterwards.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

BASE_URL = "http://127.0.0.1:8000"

ADMIN_EMAIL = "admin@barangaylagab.com"
ADMIN_PASSWORD = "Admin@123"

PROBE_EMAIL = "activity-logs-probe@example.com"
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
        with urllib.request.urlopen(request, timeout=15) as response:
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
    print("All activity-log checks passed.")
def start_probe_resident() -> None:
    """Create (or reset) the throwaway resident used for the 403 check."""
    from app.database import create_connection
    from app.security import hash_password

    connection = create_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT id FROM users WHERE email = %s", (PROBE_EMAIL,))
        existing = cursor.fetchone()
        if existing is None:
            cursor.execute(
                "INSERT INTO users (email, password_hash, role, account_status) "
                "VALUES (%s, %s, 'resident', 'active')",
                (PROBE_EMAIL, hash_password(PROBE_PASSWORD)),
            )
            user_id = cursor.lastrowid
            cursor.execute(
                "INSERT INTO resident_profiles (user_id, first_name, last_name) "
                "VALUES (%s, 'Audit', 'Probe')",
                (user_id,),
            )
        else:
            cursor.execute(
                "UPDATE users SET password_hash = %s, account_status = 'active' "
                "WHERE id = %s",
                (hash_password(PROBE_PASSWORD), existing["id"]),
            )
        connection.commit()
        cursor.close()
    finally:
        connection.close()


def remove_probe_resident() -> None:
    """Delete the throwaway resident account (its audit rows are kept)."""
    from app.database import create_connection

    connection = create_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM users WHERE email = %s", (PROBE_EMAIL,))
        connection.commit()
        cursor.close()
    finally:
        connection.close()
def log_id_watermark() -> int:
    """Highest audit id before the run, so this script's rows can be removed."""
    from app.database import create_connection

    connection = create_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT COALESCE(MAX(id), 0) FROM activity_logs")
        watermark = int(cursor.fetchone()[0])
        cursor.close()
    finally:
        connection.close()
    return watermark


def remove_test_log_entries(watermark: int) -> None:
    """Delete only the audit rows this script created during the run."""
    from app.database import create_connection

    connection = create_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM activity_logs WHERE id > %s", (watermark,))
        removed = cursor.rowcount
        connection.commit()
        cursor.close()
    finally:
        connection.close()
    print(f"  cleaned up {removed} audit row(s) written by this run")


def probe_resident_id() -> int:
    """Return the probe resident's ``resident_profiles.id``."""
    from app.database import create_connection

    connection = create_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT resident_profiles.id AS profile_id
            FROM resident_profiles
            JOIN users ON users.id = resident_profiles.user_id
            WHERE users.email = %s
            """,
            (PROBE_EMAIL,),
        )
        row = cursor.fetchone()
        cursor.close()
    finally:
        connection.close()
    return int(row["profile_id"])


def latest_entry(
    token: str, action_type: str, target_contains: str
) -> dict[str, Any] | None:
    """Newest audit entry of ``action_type`` whose target matches."""
    status, logs = request_json(
        "/api/admin/activity-logs?"
        + urllib.parse.urlencode({"action_type": action_type}),
        token=token,
    )
    if status != 200 or not isinstance(logs, list):
        return None
    return next(
        (entry for entry in logs if target_contains in entry["target"]), None
    )


def cleanup_flow(request_id: int | None) -> None:
    """Remove the probe request and resident account created by the flow."""
    from app.database import create_connection

    connection = create_connection()
    try:
        cursor = connection.cursor()
        if request_id is not None:
            cursor.execute("DELETE FROM requests WHERE id = %s", (request_id,))
        cursor.execute("DELETE FROM users WHERE email = %s", (PROBE_EMAIL,))
        connection.commit()
        cursor.close()
    finally:
        connection.close()


def run_logging_flow(admin_token: str) -> None:
    """Submit a request as a resident, then process it as the admin.

    Covers the remaining audit call sites (request creation, request
    approval, resident information update, account deactivation and
    reactivation) so the whole trail is exercised, not just the login path.
    """
    start_probe_resident()
    request_id: int | None = None
    try:
        status, resident = login(PROBE_EMAIL, PROBE_PASSWORD)
        check(status == 200, f"probe resident login returns 200 (got {status})")
        if status != 200:
            return
        resident_token = resident["access_token"]

        status, types = request_json("/api/document-types", token=resident_token)
        check(
            status == 200 and isinstance(types, list) and bool(types),
            f"document types are listed (got {status})",
        )
        if status != 200 or not isinstance(types, list) or not types:
            return

        status, created = request_json(
            "/api/requests",
            method="POST",
            body={
                "document_type_id": types[0]["id"],
                "purpose": "Activity-log verification request.",
            },
            token=resident_token,
        )
        check(status == 201, f"resident submits a request (got {status})")
        if status != 201:
            print(f"  body: {created}")
            return
        request_id = created["id"]
        number = created["request_number"]

        entry = latest_entry(admin_token, "Create", number)
        check(entry is not None, f"request submission logged (Create, {number})")
        if entry is not None:
            check(
                entry["actor_role"] == "resident",
                f"request entry actor is the resident ({entry['actor_role']})",
            )
            check(
                entry["target_type"] == "Request",
                f"request entry target type is Request ({entry['target_type']})",
            )

        status, _ = request_json(
            f"/api/admin/document-requests/{request_id}",
            method="PATCH",
            body={
                "status": "Approved",
                "admin_remarks": "Approved by the activity-log check.",
            },
            token=admin_token,
        )
        check(status == 200, f"admin approves the request (got {status})")

        entry = latest_entry(admin_token, "Approve", number)
        check(entry is not None, f"approval logged (Approve, {number})")
        if entry is not None:
            check(
                entry["actor_role"] == "admin",
                f"approval entry actor is the admin ({entry['actor_role']})",
            )

        resident_id = probe_resident_id()
        target = f"RES-{resident_id:03d}"

        status, _ = request_json(
            f"/api/admin/residents/{resident_id}/status",
            method="PATCH",
            body={"account_status": "inactive"},
            token=admin_token,
        )
        check(status == 200, f"admin deactivates the resident (got {status})")
        entry = latest_entry(admin_token, "Update", target)
        check(
            entry is not None and entry["action"] == "deactivated resident account",
            "deactivation logged with an explicit action",
        )

        status, _ = request_json(
            f"/api/admin/residents/{resident_id}/status",
            method="PATCH",
            body={"account_status": "active"},
            token=admin_token,
        )
        check(status == 200, f"admin reactivates the resident (got {status})")
        entry = latest_entry(admin_token, "Update", target)
        check(
            entry is not None and entry["action"] == "reactivated resident account",
            "reactivation logged with an explicit action",
        )

        status, _ = request_json(
            f"/api/admin/residents/{resident_id}",
            method="PUT",
            body={
                "first_name": "Audit",
                "last_name": "Probe",
                "email": PROBE_EMAIL,
                "purok": "Purok Test",
            },
            token=admin_token,
        )
        check(status == 200, f"admin updates resident information (got {status})")
        entry = latest_entry(admin_token, "Update", f"{target} (Audit Probe)")
        check(
            entry is not None and entry["action"] == "updated resident information",
            "resident profile update logged with the resident reference",
        )
    finally:
        cleanup_flow(request_id)




def main() -> None:
    print("Admin activity logs API checks")
    print(f"  target: {BASE_URL}")

    # Rows with a higher id are written by this run and removed at the end.
    watermark = log_id_watermark()

    # --- 1. Admin login writes a "Login" audit entry ----------------------
    status, payload = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    check(status == 200, f"admin login returns 200 (got {status})")
    if status != 200:
        print(f"  body: {payload}")
        remove_test_log_entries(watermark)
        summarize()
        return

    token = payload["access_token"]

    status, logs = request_json("/api/admin/activity-logs", token=token)
    check(status == 200, f"activity logs endpoint returns 200 (got {status})")
    if status != 200:
        print(f"  body: {logs}")
        remove_test_log_entries(watermark)
        summarize()
        return

    check(isinstance(logs, list), "response body is a JSON array")
    check(len(logs) > 0, "at least one audit entry was returned")

    expected_keys = {
        "id",
        "actor_name",
        "actor_role",
        "action_type",
        "action",
        "target_type",
        "target",
        "ip_address",
        "created_at",
    }
    check(
        expected_keys == set(logs[0].keys()),
        f"entry fields match the frontend type ({sorted(logs[0].keys())})",
    )

    login_entries = [entry for entry in logs if entry["action_type"] == "Login"]
    check(len(login_entries) > 0, "the fresh admin login was recorded")

    admin_entry = next(
        (entry for entry in login_entries if entry["actor_role"] == "admin"), None
    )
    check(admin_entry is not None, "the login entry carries the admin role")
    if admin_entry is not None:
        check(
            admin_entry["actor_name"] == "Administrator",
            f"actor name resolved from the profile ({admin_entry['actor_name']})",
        )
        check(
            admin_entry["action"] == "logged in",
            f"action text is descriptive ({admin_entry['action']!r})",
        )
        check(
            admin_entry["target"] == "System",
            f"target defaults to System ({admin_entry['target']!r})",
        )
        check(
            bool(admin_entry["ip_address"]),
            f"client IP captured ({admin_entry['ip_address']})",
        )

    # --- 2. Newest-first ordering ----------------------------------------
    timestamps = [entry["created_at"] for entry in logs]
    check(
        timestamps == sorted(timestamps, reverse=True),
        "entries are ordered newest first",
    )

    # --- 3. action_type filter -------------------------------------------
    status, filtered = request_json(
        "/api/admin/activity-logs?action_type=Login", token=token
    )
    check(status == 200, f"action_type filter returns 200 (got {status})")
    check(
        isinstance(filtered, list) and len(filtered) > 0,
        "action_type=Login returns entries",
    )
    check(
        all(entry["action_type"] == "Login" for entry in filtered),
        "action_type=Login only returns Login entries",
    )
    check(
        len(filtered) == len(login_entries),
        f"action_type=Login matches every Login entry ({len(filtered)})",
    )

    # --- 4. Free-text search ---------------------------------------------
    status, searched = request_json(
        "/api/admin/activity-logs?"
        + urllib.parse.urlencode({"search": "logged in"}),
        token=token,
    )
    check(status == 200, f"search filter returns 200 (got {status})")
    check(
        isinstance(searched, list) and len(searched) > 0,
        "search='logged in' returns entries",
    )
    check(
        all(
            "logged in"
            in f"{entry['actor_name']} {entry['action']} {entry['target']}".lower()
            for entry in searched
        ),
        "every search hit contains the search term",
    )

    status, empty = request_json(
        "/api/admin/activity-logs?"
        + urllib.parse.urlencode({"search": "no-such-activity-xyz"}),
        token=token,
    )
    check(status == 200, "a search with no matches still returns 200")
    check(
        isinstance(empty, list) and len(empty) == 0,
        f"an unmatched search returns an empty list ({len(empty)})",
    )

    # --- 5. Access control ------------------------------------------------
    status, _ = request_json("/api/admin/activity-logs")
    check(status == 401, f"no token is rejected with 401 (got {status})")

    start_probe_resident()
    try:
        status, probe = login(PROBE_EMAIL, PROBE_PASSWORD)
        if status != 200:
            print(f"  SKIP  resident access check (probe login returned {status})")
        else:
            status, _ = request_json(
                "/api/admin/activity-logs", token=probe["access_token"]
            )
            check(
                status == 403,
                f"a resident token is rejected with 403 (got {status})",
            )
    finally:
        remove_probe_resident()

    # --- 6. Every logging call site records an entry -----------------------
    run_logging_flow(token)

    remove_test_log_entries(watermark)
    summarize()


if __name__ == "__main__":
    main()