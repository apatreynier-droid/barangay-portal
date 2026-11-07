r"""Checks for the Pandas analytics behind the Admin Dashboard and Reports.

    cd backend
    .\.venv\Scripts\Activate.ps1
    python scripts\test_analytics.py

What is covered
---------------
1. Environment: Pandas imports from this virtual environment (NumPy is
   reported - it is a Pandas dependency, not used directly).
2. Pure Pandas logic (no database): empty datasets, missing / out-of-order
   timestamps, Puroks with no records, legacy Purok values, percentage
   denominators, previous period with zero records, gaps between years.
3. Live MySQL cross-check: every dashboard and report figure is recomputed
   with plain SQL (MySQL's own ``CONVERT_TZ`` for Manila time) and compared.
4. Pothole analytics on temporary rows inserted inside a transaction that is
   rolled back (nothing is stored).
5. HTTP + authorization on a private uvicorn process (port 8013): no token ->
   401, resident -> 403, staff -> dashboard only, administrator -> both;
   invalid dates / ranges / intervals -> 422.

Nothing is left behind: the temporary sessions are deleted at the end.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
import warnings
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# A Pandas FutureWarning/DeprecationWarning in the analytics code is an error.
warnings.simplefilter("error", FutureWarning)
warnings.simplefilter("error", DeprecationWarning)

import pandas as pd  # noqa: E402

from app import analytics  # noqa: E402
from app.database import create_connection  # noqa: E402
from app.security import create_access_token, hash_access_token  # noqa: E402

PORT = 8013
BASE_URL = f"http://127.0.0.1:{PORT}"

results = {"pass": 0, "fail": 0}


def check(condition: bool, message: str, detail: object = "") -> None:
    if condition:
        results["pass"] += 1
        print(f"  PASS  {message}")
    else:
        results["fail"] += 1
        print(f"  FAIL  {message}  {detail}")


def section(title: str) -> None:
    print(f"\n== {title}")


# --------------------------------------------------------------------------- #
#  1. Environment                                                             #
# --------------------------------------------------------------------------- #


def test_environment() -> None:
    section("Environment")
    check(Path(sys.prefix).name == ".venv", f"running inside backend .venv ({sys.prefix})")
    check(bool(pd.__version__), f"pandas {pd.__version__} imports")
    try:
        import numpy

        print(f"  INFO  numpy {numpy.__version__} present (installed as a pandas dependency)")
    except ImportError:
        print("  INFO  numpy not importable")


# --------------------------------------------------------------------------- #
#  2. Pure Pandas logic                                                       #
# --------------------------------------------------------------------------- #


def utc(*args: int) -> datetime:
    return datetime(*args)  # naive UTC, exactly like the DB driver returns


def test_pure_logic() -> None:
    section("Pandas logic (no database)")

    # Status breakdown: empty data -> every status 0, percentages 0.
    empty = analytics.status_breakdown(pd.Series(dtype="int64"))
    check(
        [row["count"] for row in empty] == [0] * 6
        and all(row["percentage"] == 0.0 for row in empty),
        "status breakdown of an empty dataset is all zeros",
    )
    shares = analytics.status_breakdown(pd.Series({"Pending": 1, "Completed": 3}))
    check(
        {row["status"]: row["percentage"] for row in shares}["Completed"] == 75.0,
        "status percentage uses the total as denominator (3 of 4 = 75%)",
    )

    # Purok distribution: zeros, NULL/blank -> Not specified, legacy kept.
    rows = analytics.purok_distribution(
        pd.Series({"Purok - 2": 2, None: 1, "  ": 1, "Purok - 3 Lagab": 1}),
        pd.Series({"Purok - 2": 6}),
    )
    by_name = {row["purok"]: row for row in rows}
    check(
        all(by_name[f"Purok - {i}"]["residents"] == 0 for i in (1, 3, 4, 5, 6, 7)),
        "Puroks without residents are listed with 0",
    )
    check(by_name["Not specified"]["residents"] == 2, "NULL and blank Purok merge into 'Not specified'")
    check("Purok - 3 Lagab" in by_name, "a legacy Purok value is reported, not silently dropped")
    check(
        round(sum(row["resident_percentage"] for row in rows)) == 100,
        "resident percentages add up to 100 (denominator = all residents)",
    )
    check(by_name["Purok - 2"]["requests_per_resident"] == 3.0, "requests per resident = 6 / 2")
    check(
        by_name["Purok - 1"]["requests_per_resident"] is None,
        "requests per resident is undefined (None) for a Purok with no residents",
    )
    empty_puroks = analytics.purok_distribution(pd.Series(dtype="int64"), pd.Series(dtype="int64"))
    check(
        len(empty_puroks) == 7 and all(row["residents"] == 0 for row in empty_puroks),
        "empty data still lists the seven standardized Puroks with zeros",
    )

    # Comparison: previous period with no records -> change % is None.
    comparison = analytics.period_comparison(
        {"requests": 5, "completed": 0}, {"requests": 0, "completed": 4},
        {"requests": "Requests", "completed": "Completed"},
    )
    check(comparison[0]["change_percentage"] is None, "change % is None when the previous period is 0")
    check(comparison[1]["change_percentage"] == -100.0, "change % from 4 to 0 is -100%")

    # Yearly trend fills a year without requests and computes the YoY change.
    yearly = analytics.yearly_trend(
        pd.DataFrame(
            [
                {"year": 2024, "status": "Completed", "total": 4},
                {"year": 2026, "status": "Pending", "total": 2},
            ]
        ),
        2026,
    )
    check([row["year"] for row in yearly] == [2024, 2025, 2026], "yearly trend fills the gap year")
    check(
        yearly[1]["requests"] == 0 and yearly[1]["change_percentage"] == -100.0
        and yearly[2]["change_percentage"] is None,
        "year-over-year change is -100% then undefined after a zero year",
    )

    # Request trend on an empty frame keeps every period with zeros.
    report_range = analytics.ReportRange(start=date(2026, 1, 1), end=date(2026, 3, 31))
    frame = pd.DataFrame(columns=["id", "status", "submitted_at"])
    frame["submitted_local"] = analytics._to_manila_local(frame["submitted_at"])
    trend = analytics.request_trend(frame, report_range, "monthly")
    check(
        [point["label"] for point in trend] == ["Jan", "Feb", "Mar"]
        and all(point["requests"] == 0 for point in trend),
        "empty request trend still returns Jan-Mar with zeros",
    )

    # Manila bucketing: 2026-01-31 16:30 UTC is 2026-02-01 00:30 in Manila.
    frame = pd.DataFrame(
        [{"id": 1, "status": "Pending", "submitted_at": utc(2026, 1, 31, 16, 30)}]
    )
    frame["submitted_local"] = analytics._to_manila_local(frame["submitted_at"])
    trend = analytics.request_trend(frame, report_range, "monthly")
    check(
        [point["requests"] for point in trend] == [0, 1, 0],
        "a request at 00:30 Manila time on Feb 1 is counted in February, not January",
    )

    # Weekly periods are Monday-Sunday and clipped to the selected range.
    weekly = analytics.request_trend(
        frame, analytics.ReportRange(start=date(2026, 1, 28), end=date(2026, 2, 8)), "weekly"
    )
    check(
        [(str(p["period_start"]), str(p["period_end"])) for p in weekly]
        == [("2026-01-28", "2026-02-01"), ("2026-02-02", "2026-02-08")],
        "weekly periods are Monday-Sunday, clipped to the range",
        weekly,
    )

    # Processing time: missing and out-of-order timestamps are excluded.
    completed = pd.DataFrame(
        [
            {"id": 1, "document_name": "A", "submitted_at": utc(2026, 1, 1, 0), "completed_at": utc(2026, 1, 1, 10)},
            {"id": 2, "document_name": "A", "submitted_at": utc(2026, 1, 1, 0), "completed_at": utc(2026, 1, 1, 20)},
            {"id": 3, "document_name": "B", "submitted_at": utc(2026, 1, 2, 0), "completed_at": None},
            {"id": 4, "document_name": "B", "submitted_at": utc(2026, 1, 5, 0), "completed_at": utc(2026, 1, 4, 0)},
        ]
    )
    history = pd.DataFrame(
        [
            {"request_id": 1, "new_status": "Approved", "first_changed_at": utc(2026, 1, 1, 2)},
            {"request_id": 2, "new_status": "Approved", "first_changed_at": utc(2026, 1, 1, 4)},
        ]
    )
    stats = analytics.processing_time_stats(completed, history)
    check(stats["overall"]["count"] == 2, "only requests with valid timestamps are measured")
    check(stats["excluded_records"] == 2, "missing / negative durations are excluded and counted")
    check(stats["overall"]["average_hours"] == 15.0, "average processing time = (10 + 20) / 2 hours")
    check(stats["overall"]["median_hours"] == 15.0, "median processing time = 15 hours")
    stage = stats["stages"][0]
    check(
        stage["count"] == 2 and stage["average_hours"] == 3.0,
        "Submitted->Approved stage average = (2 + 4) / 2 hours",
    )
    check(stats["stages"][1]["count"] == 0, "a stage without history entries has no measurements")
    empty_stats = analytics.processing_time_stats(
        pd.DataFrame(columns=["id", "document_name", "submitted_at", "completed_at"]),
        pd.DataFrame(columns=["request_id", "new_status", "first_changed_at"]),
    )
    check(
        empty_stats["overall"]["count"] == 0 and empty_stats["overall"]["average_hours"] is None,
        "processing time of an empty dataset is None (not 0)",
    )

    # Range validation.
    try:
        analytics.check_trend_size(
            analytics.ReportRange(start=date(2020, 1, 1), end=date(2026, 1, 1)), "daily"
        )
        check(False, "a 6-year daily trend is rejected")
    except analytics.AnalyticsInputError:
        check(True, "a 6-year daily trend is rejected")
    previous = analytics.ReportRange(start=date(2026, 3, 1), end=date(2026, 3, 31)).previous()
    check(
        (previous.start, previous.end) == (date(2026, 1, 29), date(2026, 2, 28)),
        "previous period has the same length and ends the day before",
    )
    day = analytics.ReportRange(start=date(2026, 11, 7), end=date(2026, 11, 7))
    check(
        day.sql_params == (datetime(2026, 11, 6, 16, 0), datetime(2026, 11, 7, 16, 0)),
        "a Manila day maps to UTC [16:00 previous day, 16:00)",
    )


# --------------------------------------------------------------------------- #
#  3. Live MySQL cross-check                                                  #
# --------------------------------------------------------------------------- #

MANILA = "CONVERT_TZ({col}, '+00:00', '+08:00')"


def test_database_crosscheck() -> None:
    section("Live MySQL cross-check (plain SQL vs Pandas)")
    connection = create_connection()
    cursor = connection.cursor(dictionary=True)

    def rows(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        cursor.execute(sql, params)
        return cursor.fetchall()

    try:
        data = analytics.build_dashboard_analytics(connection)
        stats = data["stats"]

        by_status = {
            row["status"]: row["n"]
            for row in rows(
                "SELECT r.status, COUNT(*) n FROM requests r JOIN users u ON u.id = r.user_id "
                "WHERE u.role = 'resident' GROUP BY r.status"
            )
        }
        for key, name in (
            ("pending", "Pending"),
            ("approved", "Approved"),
            ("processing", "Processing"),
            ("ready_for_pickup", "Ready for Pickup"),
            ("completed_all_time", "Completed"),
            ("rejected_all_time", "Rejected"),
        ):
            check(stats[key] == by_status.get(name, 0), f"dashboard '{name}' = {stats[key]}")
        check(stats["total_requests"] == sum(by_status.values()), f"total requests = {stats['total_requests']}")

        accounts = {
            row["account_status"]: row["n"]
            for row in rows(
                "SELECT account_status, COUNT(*) n FROM users WHERE role = 'resident' GROUP BY account_status"
            )
        }
        summary = data["resident_summary"]
        check(summary["active"] == accounts.get("active", 0), f"active residents = {summary['active']}")
        check(summary["pending"] == accounts.get("pending", 0), f"pending residents = {summary['pending']}")
        check(summary["rejected"] == accounts.get("rejected", 0), f"rejected residents = {summary['rejected']}")
        check(
            summary["deactivated"] == accounts.get("inactive", 0) + accounts.get("suspended", 0),
            f"deactivated residents = {summary['deactivated']}",
        )

        purok_sql = {
            row["purok"]: row["n"]
            for row in rows(
                "SELECT rp.purok, COUNT(*) n FROM resident_profiles rp JOIN users u ON u.id = rp.user_id "
                "WHERE u.role = 'resident' AND u.account_status IN ('active','inactive','suspended') "
                "GROUP BY rp.purok"
            )
        }
        purok_rows = {row["purok"]: row for row in data["purok_distribution"]}
        check(
            all(
                purok_rows[f"Purok - {i}"]["residents"] == purok_sql.get(f"Purok - {i}", 0)
                for i in range(1, 8)
            ),
            "residents per Purok match SQL for all seven Puroks",
        )
        check(
            sum(row["residents"] for row in data["purok_distribution"]) == summary["total_registered"],
            "residents per Purok add up to the registered total (no record lost or doubled)",
        )
        check(
            sum(row["requests"] for row in data["purok_distribution"]) == stats["total_requests"],
            "requests per Purok add up to the total requests",
        )

        month_start = analytics.manila_today().replace(day=1)
        completed_month = rows(
            "SELECT COUNT(*) n FROM requests WHERE status = 'Completed' AND "
            + MANILA.format(col="completed_at") + " >= %s",
            (month_start,),
        )[0]["n"]
        check(stats["completed"] == completed_month, f"completed this month = {completed_month}")

        months = rows(
            f"SELECT DATE_FORMAT({MANILA.format(col='submitted_at')}, '%Y-%m') ym, COUNT(*) n, "
            "SUM(status = 'Completed') c, SUM(status = 'Rejected') r FROM requests GROUP BY ym"
        )
        by_month = {row["ym"]: row for row in months}
        expected = []
        for offset in range(-6, 1):
            first = analytics.shift_months(month_start, offset)
            row = by_month.get(first.strftime("%Y-%m"), {"n": 0, "c": 0, "r": 0})
            expected.append(
                {
                    "month": first.strftime("%b"),
                    "submitted": int(row["n"]),
                    "completed": int(row["c"] or 0),
                    "rejected": int(row["r"] or 0),
                }
            )
        check(data["monthly"] == expected, "7-month overview matches MySQL CONVERT_TZ grouping")

        # Reports: last 90 days, weekly.
        today = analytics.manila_today()
        start = today - timedelta(days=89)
        report = analytics.build_reports_analytics(connection, start, today, "weekly")
        window = (
            f"{MANILA.format(col='submitted_at')} >= %s AND {MANILA.format(col='submitted_at')} < %s"
        )
        totals = rows(
            "SELECT COUNT(*) n, SUM(status = 'Completed') c, SUM(status = 'Rejected') r "
            f"FROM requests WHERE {window}",
            (start, today + timedelta(days=1)),
        )[0]
        check(report["summary"]["total_requests"] == totals["n"], f"report total (90 days) = {totals['n']}")
        check(report["summary"]["completed"] == int(totals["c"] or 0), "report completed matches SQL")
        check(report["summary"]["rejected"] == int(totals["r"] or 0), "report rejected matches SQL")
        check(sum(p["requests"] for p in report["trend"]) == totals["n"], "weekly trend adds up to the total")
        check(len(report["export_requests"]) == totals["n"], "export rows = requests in range")
        check(
            len({row["request_number"] for row in report["export_requests"]}) == totals["n"],
            "export has no duplicate request",
        )
        all_time = analytics.build_reports_analytics(connection, None, None, "yearly")
        check(
            all_time["summary"]["total_requests"] == stats["total_requests"],
            "all-time report total = dashboard total",
        )
        check(all_time["comparison"] is None, "no previous-period comparison for all time")
    finally:
        cursor.close()
        connection.close()


# --------------------------------------------------------------------------- #
#  4. Pothole analytics on temporary rows (rolled back)                       #
# --------------------------------------------------------------------------- #


def test_pothole_analytics() -> None:
    section("Pothole analytics (temporary rows, rolled back)")
    connection = create_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM users WHERE role = 'resident' ORDER BY id LIMIT 1")
        resident = cursor.fetchone()
        if resident is None:
            print("  SKIP  no resident account to attach temporary reports to")
            return
        today = analytics.manila_today()
        report_range = analytics.ReportRange(start=today - timedelta(days=30), end=today)
        baseline = analytics.pothole_analytics(connection, report_range, "monthly")
        reported_at = analytics.manila_day_start_utc(today) + timedelta(hours=2)
        samples = [
            ("Purok - 1", "Rizal Street", "pending"),
            ("Purok - 1", "  rizal   street ", "resolved"),
            ("Purok - 4", "Mabini Road", "under_maintenance"),
            (None, None, "rejected"),
        ]
        for purok, road, state in samples:
            token = uuid.uuid4().hex
            cursor.execute(
                """
                INSERT INTO pothole_reports
                    (report_number, user_id, purok, road_name, location_description,
                     status, photo_original_filename, photo_stored_filename,
                     photo_content_type, photo_file_size, reported_at)
                VALUES (%s, %s, %s, %s, 'analytics probe', %s, 'probe.jpg', %s,
                        'image/jpeg', 1, %s)
                """,
                (f"PH-PROBE-{token[:8]}", resident["id"], purok, road, state, token, reported_at),
            )
        result = analytics.pothole_analytics(connection, report_range, "monthly")
        check(result["available"], "pothole analytics available")
        check(result["total"] == baseline["total"] + 4, "4 temporary reports are counted")
        check(result["resolved"] == baseline["resolved"] + 1, "resolved count")
        check(result["unresolved"] == baseline["unresolved"] + 2, "unresolved = pending + under maintenance")
        check(result["rejected"] == baseline["rejected"] + 1, "rejected kept out of the resolved split")
        purok = {row["purok"]: row["count"] for row in result["by_purok"]}
        check(purok["Purok - 1"] >= 2 and purok["Purok - 7"] >= 0, "reports per Purok (zeros kept)")
        roads = {row["road_name"].casefold(): row["count"] for row in result["by_road"]}
        check(roads.get("rizal street", 0) >= 2, "road names differing in case/spacing are merged")
        check(roads.get("not specified", 0) >= 1, "reports without a road are 'Not specified'")
        check(sum(p["reported"] for p in result["trend"]) == result["total"], "monthly trend adds up")
    finally:
        connection.rollback()
        cursor.close()
        connection.close()
    after = create_connection()
    try:
        cursor = after.cursor()
        cursor.execute("SELECT COUNT(*) FROM pothole_reports WHERE location_description = 'analytics probe'")
        check(cursor.fetchone()[0] == 0, "temporary pothole rows were rolled back")
        cursor.close()
    finally:
        after.close()


# --------------------------------------------------------------------------- #
#  5. HTTP + authorization                                                    #
# --------------------------------------------------------------------------- #


def get(path: str, token: str | None) -> tuple[int, Any]:
    request = urllib.request.Request(f"{BASE_URL}{path}")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as error:
        with error:
            return error.code, json.loads(error.read() or b"null")


def create_temporary_sessions() -> tuple[dict[str, str], list[int]]:
    """A session token for one active account of each role (no passwords)."""
    tokens: dict[str, str] = {}
    session_ids: list[int] = []
    connection = create_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        for role in ("admin", "staff", "resident"):
            cursor.execute(
                "SELECT id FROM users WHERE role = %s AND account_status = 'active' ORDER BY id LIMIT 1",
                (role,),
            )
            user = cursor.fetchone()
            if user is None:
                continue
            token = create_access_token()
            cursor.execute(
                "INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (%s, %s, %s)",
                (
                    user["id"],
                    hash_access_token(token),
                    datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1),
                ),
            )
            session_ids.append(cursor.lastrowid)
            tokens[role] = token
        connection.commit()
        cursor.close()
    finally:
        connection.close()
    return tokens, session_ids


def delete_sessions(session_ids: list[int]) -> None:
    if not session_ids:
        return
    connection = create_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"DELETE FROM auth_sessions WHERE id IN ({', '.join(['%s'] * len(session_ids))})",
            tuple(session_ids),
        )
        connection.commit()
        cursor.close()
    finally:
        connection.close()


def wait_for_server(process: subprocess.Popen) -> bool:
    for _ in range(60):
        if process.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(f"{BASE_URL}/api/health", timeout=2):
                return True
        except OSError:
            time.sleep(0.5)
    return False


def test_http() -> None:
    section(f"HTTP endpoints and authorization (uvicorn on port {PORT})")
    process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(PORT)],
        cwd=BACKEND_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    tokens, session_ids = create_temporary_sessions()
    try:
        if not wait_for_server(process):
            check(False, "backend started", process.stderr.read().decode(errors="replace")[-2000:] if process.stderr else "")
            return

        for path in ("/api/admin/dashboard", "/api/admin/reports"):
            status, _ = get(path, None)
            check(status == 401, f"{path} without a token -> 401", status)
        if "resident" in tokens:
            for path in ("/api/admin/dashboard", "/api/admin/reports"):
                status, _ = get(path, tokens["resident"])
                check(status == 403, f"{path} as a resident -> 403", status)
        if "staff" in tokens:
            status, _ = get("/api/admin/dashboard", tokens["staff"])
            check(status == 200, "dashboard as staff -> 200", status)
            status, _ = get("/api/admin/reports", tokens["staff"])
            check(status == 403, "reports as staff -> 403 (administrators only)", status)

        admin = tokens.get("admin")
        if admin is None:
            print("  SKIP  no active admin account")
            return
        status, body = get("/api/admin/dashboard", admin)
        check(status == 200, "dashboard as administrator -> 200", status)
        connection = create_connection()
        try:
            expected = analytics.build_dashboard_analytics(connection)
        finally:
            connection.close()
        check(body["stats"] == expected["stats"], "dashboard API stats = analytics service")
        api_puroks = [
            {key: value for key, value in row.items() if key != "potholes"}
            for row in body["purok_distribution"]
        ]
        check(
            api_puroks == json.loads(json.dumps(expected["purok_distribution"])),
            "dashboard API Purok analytics = analytics service",
        )

        today = analytics.manila_today()
        query = f"date_from={today.replace(day=1)}&date_to={today}&granularity=daily"
        status, body = get(f"/api/admin/reports?{query}", admin)
        check(status == 200, "reports with a date range -> 200", status)
        check(
            body["filters"]["date_from"] == str(today.replace(day=1))
            and body["filters"]["timezone"] == "Asia/Manila",
            "reports echo the applied range and the Asia/Manila timezone",
        )
        check(len(body["trend"]) == today.day, "daily trend has one point per day of the month")

        for bad, reason in (
            ("date_from=2026-13-01", "invalid date"),
            ("date_from=2026-11-08&date_to=2026-11-01", "start after end"),
            ("granularity=hourly", "unknown interval"),
            ("date_from=2015-01-01&granularity=daily", "daily range too long"),
        ):
            status, body = get(f"/api/admin/reports?{bad}", admin)
            check(status == 422, f"reports with {reason} -> 422", (status, body))
    finally:
        delete_sessions(session_ids)
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()


def main() -> None:
    print("Analytics checks")
    test_environment()
    test_pure_logic()
    test_database_crosscheck()
    test_pothole_analytics()
    test_http()
    print(f"\n{results['pass']} passed, {results['fail']} failed")
    sys.exit(1 if results["fail"] else 0)


if __name__ == "__main__":
    main()
