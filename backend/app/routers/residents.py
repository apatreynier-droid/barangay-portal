"""Admin management of resident accounts."""

from __future__ import annotations

from datetime import datetime, timezone

import mysql.connector
from fastapi import APIRouter, Depends, HTTPException, Request, status
from mysql.connector import MySQLConnection

from ..activity_logs import record_activity_log
from ..common import actor_display_name, clean_optional, normalize_email
from ..database import get_db
from ..dependencies import get_current_admin_portal_user, get_current_admin_user
from ..notifications import (
    action_time_bucket,
    build_dedupe_key,
    record_admin_notification,
)
from ..rate_limit import get_client_ip
from ..schemas import (
    AdminResidentDetailResponse,
    AdminResidentRequestEntry,
    AdminResidentResponse,
    AdminResidentStatusInput,
    AdminResidentUpdateInput,
)

router = APIRouter()


@router.get("/api/admin/residents", response_model=list[AdminResidentResponse])
def list_residents(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_portal_user),
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
          AND users.account_status NOT IN ('pending', 'rejected')
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


@router.get("/api/admin/residents/{resident_id}", response_model=AdminResidentDetailResponse)
def get_resident_detail(
    resident_id: int,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_portal_user),
) -> AdminResidentDetailResponse:
    return load_resident_detail(connection, resident_id)


@router.put("/api/admin/residents/{resident_id}", response_model=AdminResidentDetailResponse)
def update_resident(
    resident_id: int,
    payload: AdminResidentUpdateInput,
    request: Request,
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

    record_activity_log(
        connection,
        user_id=current_user["id"],
        action_type="Update",
        action="updated resident information",
        target=(
            f"RES-{resident_id:03d} "
            f"({payload.first_name.strip()} {payload.last_name.strip()})"
        ),
        target_type="Resident",
        ip_address=get_client_ip(request),
    )

    # Best-effort: a notification failure must not fail the committed save.
    record_admin_notification(
        connection,
        title="Resident profile updated",
        message=(
            f"{actor_display_name(current_user)} updated the "
            f"profile of {payload.first_name.strip()} "
            f"{payload.last_name.strip()} (RES-{resident_id:03d})."
        ),
        dedupe_key=build_dedupe_key(
            "resident-updated",
            resident_id,
            email,
            payload.first_name.strip(),
            payload.last_name.strip(),
            payload.purok,
            payload.contact_number,
            action_time_bucket(),
        ),
    )

    return load_resident_detail(connection, resident_id)


@router.patch(
    "/api/admin/residents/{resident_id}/status",
    response_model=AdminResidentDetailResponse,
)
def set_resident_status(
    resident_id: int,
    payload: AdminResidentStatusInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_user),
) -> AdminResidentDetailResponse:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT users.id AS user_id, users.account_status,
               CONCAT(resident_profiles.first_name, ' ',
                      resident_profiles.last_name) AS resident_name
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

    # Activating here would skip the review, its record and the resident's email.
    if resident["account_status"] in ("pending", "rejected"):
        cursor.close()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This registration has not been approved. Use the Approvals "
                "page to review it."
            ),
        )

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

    status_action = (
        "deactivated resident account"
        if payload.account_status == "inactive"
        else "reactivated resident account"
    )
    record_activity_log(
        connection,
        user_id=current_user["id"],
        action_type="Update",
        action=status_action,
        target=f"RES-{resident_id:03d}",
        target_type="Resident",
        ip_address=get_client_ip(request),
    )

    # Best-effort: a notification failure must not fail the committed change.
    deactivated = payload.account_status == "inactive"
    record_admin_notification(
        connection,
        title=(
            "Resident account deactivated"
            if deactivated
            else "Resident account reactivated"
        ),
        message=(
            f"{actor_display_name(current_user)} "
            f"{'deactivated' if deactivated else 'reactivated'} the account "
            f"of {resident['resident_name']} (RES-{resident_id:03d})."
        ),
        dedupe_key=build_dedupe_key(
            "resident-account-status", resident_id, payload.account_status
        ),
    )

    return load_resident_detail(connection, resident_id)
