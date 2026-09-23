"""End-to-end checks for the automatic Admin notifications.

Run from the backend folder with the API already listening on port 8000:

    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    uvicorn app.main:app --port 8000
    # in a second terminal:
    python scripts\\test_admin_notifications_api.py

The script signs in as the administrator and then *acts like a resident*: it
registers a throwaway account, submits, edits and deletes document requests,
and lets the administrator update that resident's profile and account status.
After every action it reads GET /api/notifications with the administrator token
and proves that the backend wrote a real notification that names the actor, the
affected document/request and the current status - and that repeating an action
(double submit, retried call) does not write a second notification.

Notifications, requests and accounts created by this run are removed again
afterwards.
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

PROBE_EMAIL = "admin-notifications-probe@example.com"
PROBE_PASSWORD = "ProbePassword123!"
PROBE_FIRST_NAME = "Nena"
PROBE_LAST_NAME = "Probe"

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
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else None
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
    print("All admin notification checks passed.")


def notification_watermark() -> int:
    """Highest notification id before the run, so this script's rows can go."""
    from app.database import create_connection

    connection = create_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT COALESCE(MAX(id), 0) FROM notifications")
        watermark = int(cursor.fetchone()[0])
        cursor.close()
    finally:
        connection.close()
    return watermark


def remove_test_notifications(watermark: int) -> None:
    """Delete only the notification rows this script's run created."""
    from app.database import create_connection

    connection = create_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM notifications WHERE id > %s", (watermark,))
        removed = cursor.rowcount
        connection.commit()
        cursor.close()
    finally:
        connection.close()
    print(f"  cleaned up {removed} notification row(s) written by this run")


def remove_probe_resident() -> None:
    """Delete the throwaway resident (cascades its requests/notifications)."""
    from app.database import create_connection

    connection = create_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM users WHERE email = %s", (PROBE_EMAIL,))
        connection.commit()
        cursor.close()
    finally:
        connection.close()


def probe_profile_id() -> int:
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


def admin_notifications(
    token: str, *, title_contains: str, message_contains: str
) -> list[dict[str, Any]]:
    """Every notification of the admin feed matching the given wording."""
    status, body = request_json("/api/notifications", token=token)
    if status != 200 or not isinstance(body, list):
        return []
    return [
        notification
        for notification in body
        if title_contains.lower() in str(notification["title"]).lower()
        and message_contains.lower() in str(notification["message"]).lower()
    ]



def run_flow(admin_token: str) -> None:
    """Exercise every action that must notify the administrator."""
    resident_name = f"{PROBE_FIRST_NAME} {PROBE_LAST_NAME}"

    # --- 1. A new resident account is created -----------------------------
    status, registered = request_json(
        "/api/auth/register",
        method="POST",
        body={
            "first_name": PROBE_FIRST_NAME,
            "last_name": PROBE_LAST_NAME,
            "email": PROBE_EMAIL,
            "password": PROBE_PASSWORD,
            "phone": "09171234567",
            "address": "Purok Notification, Barangay Lagab",
            "purok": "Purok Notification",
        },
    )
    check(status == 201, f"resident registers a new account (got {status})")
    if status != 201:
        print(f"  body: {registered}")
        return

    resident_token: str = registered["access_token"]

    created = admin_notifications(
        admin_token,
        title_contains="New resident account",
        message_contains=PROBE_EMAIL,
    )
    check(
        len(created) == 1,
        f"admin is notified about the new account ({len(created)} notification)",
    )
    if created:
        check(
            created[0]["notification_type"] == "system",
            f"account notification uses the system type ({created[0]['notification_type']})",
        )
        check(
            created[0]["is_read"] is False,
            "a brand new notification starts unread",
        )
        check(
            resident_name in created[0]["message"],
            f"notification names the resident ({created[0]['message']!r})",
        )
        check(
            bool(created[0]["created_at"]),
            f"notification carries a timestamp ({created[0]['created_at']})",
        )

    status, resident_feed = request_json("/api/notifications", token=resident_token)
    check(
        status == 200 and isinstance(resident_feed, list),
        f"resident notification feed still works (got {status})",
    )
    check(
        all(
            "New resident account" != notification["title"]
            for notification in resident_feed or []
        ),
        "the admin notification is not delivered to the resident account",
    )

    # --- 2. A resident submits a new document request ---------------------
    status, document_types = request_json("/api/document-types", token=resident_token)
    check(
        status == 200 and isinstance(document_types, list) and bool(document_types),
        f"document types are listed (got {status})",
    )
    if status != 200 or not isinstance(document_types, list) or not document_types:
        return

    document_name = document_types[0]["document_name"]
    submit_body = {
        "document_type_id": document_types[0]["id"],
        "purpose": "Admin notification verification request.",
    }

    status, first_request = request_json(
        "/api/requests", method="POST", body=submit_body, token=resident_token
    )
    check(status == 201, f"resident submits a request (got {status})")
    if status != 201:
        print(f"  body: {first_request}")
        return

    first_number = first_request["request_number"]
    notifications = admin_notifications(
        admin_token,
        title_contains="New document request",
        message_contains=first_number,
    )
    check(
        len(notifications) == 1,
        f"admin is notified about the new request ({len(notifications)} notification)",
    )
    if notifications:
        notification = notifications[0]
        check(
            notification["notification_type"] == "request",
            f"request notification uses the request type ({notification['notification_type']})",
        )
        check(
            notification["related_request_id"] == first_request["id"],
            "notification is linked to the request row",
        )
        check(
            resident_name in notification["message"]
            and document_name in notification["message"]
            and "Pending" in notification["message"],
            f"notification names actor, document and status ({notification['message']!r})",
        )
        check(notification["is_read"] is False, "the request notification is unread")

    # Accidental double submit: the second request is stored (existing API
    # behaviour) but the admin feed must not repeat the same action.
    status, duplicate_request = request_json(
        "/api/requests", method="POST", body=submit_body, token=resident_token
    )
    check(status == 201, f"the repeated submit is still accepted (got {status})")
    duplicate_request_id = duplicate_request["id"] if status == 201 else None
    duplicate_number = (
        duplicate_request["request_number"] if status == 201 else ""
    )
    check(
        len(
            admin_notifications(
                admin_token,
                title_contains="New document request",
                message_contains=resident_name,
            )
        )
        == 1,
        "a repeated submit does not create a duplicate admin notification",
    )

    # --- 3. A resident edits the request ----------------------------------
    status, _ = request_json(
        f"/api/requests/{first_request['id']}",
        method="PUT",
        body={"purpose": "Updated purpose for the notification check."},
        token=resident_token,
    )
    check(status == 200, f"resident edits the request (got {status})")

    edits = admin_notifications(
        admin_token,
        title_contains="Document request updated",
        message_contains=first_number,
    )
    check(
        len(edits) == 1,
        f"admin is notified about the edit ({len(edits)} notification)",
    )
    if edits:
        check(
            resident_name in edits[0]["message"]
            and document_name in edits[0]["message"]
            and "Pending" in edits[0]["message"],
            f"edit notification names actor, document and status ({edits[0]['message']!r})",
        )

    # A retried edit (identical payload) must not notify twice.
    status, _ = request_json(
        f"/api/requests/{first_request['id']}",
        method="PUT",
        body={"purpose": "Updated purpose for the notification check."},
        token=resident_token,
    )
    check(status == 200, f"the repeated edit is still accepted (got {status})")
    check(
        len(
            admin_notifications(
                admin_token,
                title_contains="Document request updated",
                message_contains=first_number,
            )
        )
        == 1,
        "a retried edit does not create a duplicate admin notification",
    )

    # --- 4. The request moves to another status ---------------------------
    status, _ = request_json(
        f"/api/admin/document-requests/{first_request['id']}",
        method="PATCH",
        body={"status": "Approved", "admin_remarks": "Checked by the test."},
        token=admin_token,
    )
    check(status == 200, f"admin moves the request to Approved (got {status})")

    statuses = admin_notifications(
        admin_token,
        title_contains="Request status: Approved",
        message_contains=first_number,
    )
    check(
        len(statuses) == 1,
        f"admin is notified about the status change ({len(statuses)} notification)",
    )
    if statuses:
        check(
            resident_name in statuses[0]["message"]
            and "Pending" in statuses[0]["message"]
            and "Approved" in statuses[0]["message"],
            f"status notification shows old and new status ({statuses[0]['message']!r})",
        )

    status, resident_feed = request_json("/api/notifications", token=resident_token)
    check(
        any(
            notification["title"] == "Request Approved"
            for notification in resident_feed or []
        ),
        "the resident status notification still works as before",
    )

    # --- 5. A resident deletes a pending request --------------------------
    if duplicate_request_id is not None:
        status, _ = request_json(
            f"/api/requests/{duplicate_request_id}",
            method="DELETE",
            token=resident_token,
        )
        check(status == 204, f"resident deletes the second request (got {status})")

        deleted = admin_notifications(
            admin_token,
            title_contains="Document request deleted",
            message_contains=duplicate_number,
        )
        check(
            len(deleted) == 1,
            f"admin is notified about the deletion ({len(deleted)} notification)",
        )
        if deleted:
            check(
                deleted[0]["related_request_id"] is None,
                "a deleted request leaves no dangling notification link",
            )
            check(
                resident_name in deleted[0]["message"],
                f"deletion notification names the resident ({deleted[0]['message']!r})",
            )


    # --- 6. The resident's profile information is updated -----------------
    profile_id = probe_profile_id()
    status, _ = request_json(
        f"/api/admin/residents/{profile_id}",
        method="PUT",
        body={
            "first_name": PROBE_FIRST_NAME,
            "last_name": PROBE_LAST_NAME,
            "email": PROBE_EMAIL,
            "purok": "Purok Notification Updated",
            "contact_number": "09171234567",
        },
        token=admin_token,
    )
    check(status == 200, f"resident profile information is updated (got {status})")

    profile_updates = admin_notifications(
        admin_token,
        title_contains="Resident profile updated",
        message_contains=f"RES-{profile_id:03d}",
    )
    check(
        len(profile_updates) == 1,
        f"admin is notified about the profile update ({len(profile_updates)} notification)",
    )
    if profile_updates:
        check(
            resident_name in profile_updates[0]["message"],
            f"profile notification names the resident ({profile_updates[0]['message']!r})",
        )

    # --- 7. The resident account is deactivated and reactivated -----------
    status, _ = request_json(
        f"/api/admin/residents/{profile_id}/status",
        method="PATCH",
        body={"account_status": "inactive"},
        token=admin_token,
    )
    check(status == 200, f"resident account is deactivated (got {status})")
    check(
        len(
            admin_notifications(
                admin_token,
                title_contains="Resident account deactivated",
                message_contains=f"RES-{profile_id:03d}",
            )
        )
        == 1,
        "admin is notified about the deactivation",
    )

    status, _ = request_json(
        f"/api/admin/residents/{profile_id}/status",
        method="PATCH",
        body={"account_status": "active"},
        token=admin_token,
    )
    check(status == 200, f"resident account is reactivated (got {status})")
    check(
        len(
            admin_notifications(
                admin_token,
                title_contains="Resident account reactivated",
                message_contains=f"RES-{profile_id:03d}",
            )
        )
        == 1,
        "admin is notified about the reactivation",
    )

    # --- 8. Existing read/unread behaviour still applies ------------------
    target = admin_notifications(
        admin_token,
        title_contains="New resident account",
        message_contains=PROBE_EMAIL,
    )
    if target:
        notification_id = target[0]["id"]
        status, _ = request_json(
            f"/api/notifications/{notification_id}/read",
            method="PATCH",
            token=admin_token,
        )
        check(status == 204, f"a notification can still be marked as read (got {status})")

        status, feed = request_json("/api/notifications", token=admin_token)
        marked = next(
            (
                notification
                for notification in feed or []
                if notification["id"] == notification_id
            ),
            None,
        )
        check(
            marked is not None and marked["is_read"] is True,
            "the read flag is persisted and returned by the API",
        )



def main() -> None:
    print("Automatic admin notification checks")
    print(f"  target: {BASE_URL}")

    # Notification rows with a higher id are written by this run and removed.
    watermark = notification_watermark()
    remove_probe_resident()

    try:
        status, payload = login(ADMIN_EMAIL, ADMIN_PASSWORD)
        check(status == 200, f"admin login returns 200 (got {status})")
        if status != 200:
            print(f"  body: {payload}")
            return

        run_flow(payload["access_token"])
    finally:
        remove_probe_resident()
        remove_test_notifications(watermark)

    summarize()


if __name__ == "__main__":
    main()

