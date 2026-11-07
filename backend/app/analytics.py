"""Pandas analytics for the Admin Dashboard and the Admin Reports page.

This module is the analytics *service*: it reads only the columns it needs
from MySQL (through the request's existing connection from ``get_db``) and
uses Pandas to group, reindex, compare and summarize them. The route handlers
in ``main.py`` stay thin: they validate the query parameters, call
:func:`build_dashboard_analytics` / :func:`build_reports_analytics` and wrap
the plain dictionaries returned here in the response schemas.

Division of work
----------------
* **SQL** does straightforward counts (``GROUP BY status``/``purok``) and the
  date filtering, so only the rows of the selected period ever leave MySQL.
* **Pandas** does everything that needs reshaping: filling missing periods and
  Puroks with zero, Manila-time bucketing (daily/weekly/monthly/yearly),
  percentages, period-over-period comparison, and processing-time statistics.

Time zone rules
---------------
Every timestamp is stored in UTC (see ``database.create_connection``). Report
dates are *Philippine calendar days* (Asia/Manila, UTC+8, no daylight saving
since 1978 - so a fixed offset is exact for every stored record). A Manila day
is converted to a UTC half-open interval ``[start, end)`` for SQL filtering,
and row timestamps are converted to Manila wall-clock time before Pandas puts
them into periods. Missing timestamps stay ``NaT`` and are never counted as an
event date.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable, Literal

import mysql.connector
import pandas as pd
from mysql.connector import MySQLConnection

from .puroks import STANDARDIZED_PUROKS

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  Constants                                                                  #
# --------------------------------------------------------------------------- #

#: Philippine time. Asia/Manila has had no DST since 1978, so UTC+8 is exact.
MANILA_TIMEZONE = timezone(timedelta(hours=8))
MANILA_TIMEZONE_NAME = "Asia/Manila"

#: Every status a document request can have, in workflow order.
REQUEST_STATUSES: tuple[str, ...] = (
    "Pending",
    "Approved",
    "Processing",
    "Ready for Pickup",
    "Completed",
    "Rejected",
)
FINAL_REQUEST_STATUSES: tuple[str, ...] = ("Completed", "Rejected")

#: Resident account statuses. "Registered" = approved by an administrator
#: (the account exists as a resident, whether currently active or not).
REGISTERED_ACCOUNT_STATUSES: tuple[str, ...] = ("active", "inactive", "suspended")
DEACTIVATED_ACCOUNT_STATUSES: tuple[str, ...] = ("inactive", "suspended")

POTHOLE_STATUSES: tuple[str, ...] = (
    "pending",
    "verified",
    "under_maintenance",
    "resolved",
    "rejected",
)
POTHOLE_STATUS_LABELS: dict[str, str] = {
    "pending": "Pending",
    "verified": "Verified",
    "under_maintenance": "Under Maintenance",
    "resolved": "Resolved",
    "rejected": "Rejected",
}
#: Open pothole reports. Rejected reports (not a real pothole) are neither
#: resolved nor unresolved and are kept out of that split.
POTHOLE_UNRESOLVED_STATUSES: tuple[str, ...] = ("pending", "verified", "under_maintenance")

#: Label used for records whose Purok / road was never filled in.
UNSPECIFIED_LABEL = "Not specified"

Granularity = Literal["daily", "weekly", "monthly", "yearly"]

#: Pandas period frequency per granularity. ``W-SUN`` = weeks that end on
#: Sunday, i.e. Monday-to-Sunday weeks.
GRANULARITY_FREQUENCIES: dict[str, str] = {
    "daily": "D",
    "weekly": "W-SUN",
    "monthly": "M",
    "yearly": "Y",
}

#: Upper bound on the number of points one trend may return, so an "all time"
#: daily report can never produce an unreadable (or huge) payload.
MAX_TREND_POINTS: dict[str, int] = {
    "daily": 400,
    "weekly": 260,
    "monthly": 240,
    "yearly": 100,
}

#: Workflow stages measured by the processing-time statistics.
PROCESSING_STAGES: tuple[tuple[str, str, str], ...] = (
    ("Pending", "Approved", "Submitted to Approved"),
    ("Approved", "Processing", "Approved to Processing"),
    ("Processing", "Ready for Pickup", "Processing to Ready for Pickup"),
    ("Ready for Pickup", "Completed", "Ready for Pickup to Completed"),
)

#: How many roads the pothole "per road" ranking lists.
TOP_ROADS = 10

#: MySQL error raised when a table is missing (pothole migration not applied).
TABLE_MISSING_ERROR = 1146

#: Only requests made by resident accounts are analysed (the same scope the
#: dashboard request counters have always used).
RESIDENT_REQUESTS_FROM = """
    FROM requests
    JOIN users ON users.id = requests.user_id
    JOIN resident_profiles ON resident_profiles.user_id = users.id
"""


class AnalyticsInputError(ValueError):
    """Raised for an invalid filter (shown to the administrator as HTTP 422)."""


# --------------------------------------------------------------------------- #
#  Date-range helpers                                                         #
# --------------------------------------------------------------------------- #


def manila_now() -> datetime:
    return datetime.now(MANILA_TIMEZONE)


def manila_today() -> date:
    return manila_now().date()


def manila_day_start_utc(day: date) -> datetime:
    """Start of a Manila calendar day as a naive UTC timestamp (DB time)."""
    return (
        datetime.combine(day, time.min, tzinfo=MANILA_TIMEZONE)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )


def shift_months(day: date, months: int) -> date:
    """First day of the month ``months`` away from ``day``'s month."""
    index = day.year * 12 + (day.month - 1) + months
    return date(index // 12, index % 12 + 1, 1)


@dataclass(frozen=True)
class ReportRange:
    """Inclusive range of Manila calendar days."""

    start: date
    end: date
    is_all_time: bool = False

    @property
    def start_utc(self) -> datetime:
        return manila_day_start_utc(self.start)

    @property
    def end_utc(self) -> datetime:
        """Exclusive upper bound: the start of the day after ``end``."""
        return manila_day_start_utc(self.end + timedelta(days=1))

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1

    @property
    def sql_params(self) -> tuple[datetime, datetime]:
        return self.start_utc, self.end_utc

    def previous(self) -> "ReportRange":
        """The range of equal length that ends the day before this one."""
        length = timedelta(days=self.days)
        return ReportRange(start=self.start - length, end=self.start - timedelta(days=1))


def _to_manila_date(value: object) -> date | None:
    """Manila calendar day of a UTC-naive DB timestamp (None stays None)."""
    if not isinstance(value, datetime):
        return None
    return value.replace(tzinfo=timezone.utc).astimezone(MANILA_TIMEZONE).date()


def _earliest_record_day(connection: MySQLConnection) -> date | None:
    """First Manila day that has any request, resident sign-up or pothole report."""
    queries = (
        f"SELECT MIN(requests.submitted_at) AS first {RESIDENT_REQUESTS_FROM} "
        "WHERE users.role = 'resident'",
        "SELECT MIN(created_at) AS first FROM users WHERE role = 'resident'",
        "SELECT MIN(reported_at) AS first FROM pothole_reports",
    )
    days: list[date] = []
    cursor = connection.cursor(dictionary=True)
    try:
        for query in queries:
            try:
                cursor.execute(query)
            except mysql.connector.Error as error:
                if error.errno == TABLE_MISSING_ERROR:
                    continue  # Pothole migration not applied: nothing to add.
                raise
            day = _to_manila_date(cursor.fetchone()["first"])
            if day is not None:
                days.append(day)
    finally:
        cursor.close()
    return min(days) if days else None


def resolve_report_range(
    connection: MySQLConnection,
    date_from: date | None,
    date_to: date | None,
) -> ReportRange:
    """Validate the requested dates; open ends default to all time / today."""
    today = manila_today()
    end = date_to or today
    if date_from is None:
        start = _earliest_record_day(connection) or end
        start = min(start, end)
        return ReportRange(start=start, end=end, is_all_time=True)
    if date_from > end:
        raise AnalyticsInputError(
            "The start date must be on or before the end date."
        )
    return ReportRange(start=date_from, end=end)


# --------------------------------------------------------------------------- #
#  Pandas helpers                                                             #
# --------------------------------------------------------------------------- #


def _fetch_frame(
    connection: MySQLConnection,
    query: str,
    params: Iterable[object],
    columns: Iterable[str],
) -> pd.DataFrame:
    """Run a query and return its rows as a DataFrame with fixed columns.

    The columns are fixed so an empty result still has the expected shape
    (every later step works on an empty frame without special cases).
    """
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
    finally:
        cursor.close()
    return pd.DataFrame(rows, columns=list(columns))


def _fetch_counts(
    connection: MySQLConnection,
    query: str,
    params: Iterable[object] = (),
    key: str = "key",
) -> pd.Series:
    """Run a ``SELECT <key>, COUNT(*) AS total ... GROUP BY`` query as a Series."""
    frame = _fetch_frame(connection, query, params, (key, "total"))
    if frame.empty:
        return pd.Series(dtype="int64")
    return frame.set_index(key)["total"].astype("int64")


def _fetch_scalar(
    connection: MySQLConnection, query: str, params: Iterable[object] = ()
) -> int:
    cursor = connection.cursor()
    try:
        cursor.execute(query, tuple(params))
        row = cursor.fetchone()
    finally:
        cursor.close()
    return int(row[0] or 0) if row else 0


def _to_utc(values: pd.Series) -> pd.Series:
    """DB timestamps (naive UTC) as timezone-aware UTC; missing -> NaT."""
    parsed = pd.to_datetime(values, errors="coerce")
    if parsed.dt.tz is None:
        parsed = parsed.dt.tz_localize("UTC")
    return parsed


def _to_manila_local(values: pd.Series) -> pd.Series:
    """DB timestamps as naive Manila wall-clock time (for calendar bucketing)."""
    return _to_utc(values).dt.tz_convert(MANILA_TIMEZONE).dt.tz_localize(None)


def _percent(part: float, whole: float) -> float:
    """``part`` as a percentage of ``whole`` (0.0 when there is nothing to divide)."""
    if not whole:
        return 0.0
    return round(float(part) / float(whole) * 100, 1)


def _optional_float(value: object, digits: int = 2) -> float | None:
    """A rounded float, or None for NaN/None (JSON has no NaN)."""
    if value is None:
        return None
    number = float(value)  # type: ignore[arg-type]
    if math.isnan(number):
        return None
    return round(number, digits)


def _reindexed(counts: pd.Series, labels: Iterable[str]) -> pd.Series:
    """Counts for exactly ``labels`` (missing labels become 0)."""
    return counts.reindex(list(labels), fill_value=0).astype("int64")


def _normalize_label_index(counts: pd.Series) -> pd.Series:
    """Merge NULL/blank keys into "Not specified" and strip whitespace."""
    if counts.empty:
        return counts
    keys = pd.Series(counts.index, index=counts.index, dtype="object")
    cleaned = keys.where(keys.notna(), "").astype(str).str.strip()
    cleaned = cleaned.mask(cleaned == "", UNSPECIFIED_LABEL)
    return counts.groupby(cleaned.to_numpy()).sum().astype("int64")


def status_breakdown(counts: pd.Series) -> list[dict[str, object]]:
    """Count and share of every request status (zero for unused statuses)."""
    ordered = _reindexed(counts, REQUEST_STATUSES)
    total = int(counts.sum())
    return [
        {"status": name, "count": int(count), "percentage": _percent(count, total)}
        for name, count in ordered.items()
    ]


# --------------------------------------------------------------------------- #
#  Purok analytics                                                            #
# --------------------------------------------------------------------------- #


def purok_distribution(
    resident_counts: pd.Series,
    request_counts: pd.Series,
    pothole_counts: pd.Series | None = None,
) -> list[dict[str, object]]:
    """Residents / requests (/ potholes) per Purok, compared side by side.

    Every standardized Purok is always present (zero when it has no records).
    Records without a Purok are reported as "Not specified" instead of being
    dropped, so the percentages use the true totals as denominators.
    """
    sources = {
        "residents": _normalize_label_index(resident_counts),
        "requests": _normalize_label_index(request_counts),
    }
    if pothole_counts is not None:
        sources["potholes"] = _normalize_label_index(pothole_counts)

    table = pd.DataFrame(sources).fillna(0).astype("int64")

    # Standardized Puroks first (in order), then any legacy value that still
    # exists in the data, then the "Not specified" bucket.
    extra = [
        label
        for label in table.index
        if label not in STANDARDIZED_PUROKS and label != UNSPECIFIED_LABEL
    ]
    order = [*STANDARDIZED_PUROKS, *sorted(extra)]
    if UNSPECIFIED_LABEL in table.index and table.loc[UNSPECIFIED_LABEL].sum() > 0:
        order.append(UNSPECIFIED_LABEL)
    table = table.reindex(order, fill_value=0)

    totals = table.sum()
    table["resident_percentage"] = (
        (table["residents"] / totals["residents"] * 100).round(1)
        if totals["residents"]
        else 0.0
    )
    table["request_percentage"] = (
        (table["requests"] / totals["requests"] * 100).round(1)
        if totals["requests"]
        else 0.0
    )
    # Requests per registered resident: compares how actively each Purok uses
    # the portal. Undefined (None) for a Purok with no registered residents.
    table["requests_per_resident"] = (
        table["requests"] / table["residents"].where(table["residents"] > 0)
    ).round(2)

    rows: list[dict[str, object]] = []
    for purok, row in table.iterrows():
        entry: dict[str, object] = {
            "purok": purok,
            "is_standardized": purok in STANDARDIZED_PUROKS,
            "residents": int(row["residents"]),
            "resident_percentage": float(row["resident_percentage"]),
            "requests": int(row["requests"]),
            "request_percentage": float(row["request_percentage"]),
            "requests_per_resident": _optional_float(row["requests_per_resident"]),
        }
        if pothole_counts is not None:
            entry["potholes"] = int(row["potholes"])
        rows.append(entry)
    return rows


# --------------------------------------------------------------------------- #
#  Period (trend) analytics                                                   #
# --------------------------------------------------------------------------- #


def _period_index(report_range: ReportRange, granularity: str) -> pd.PeriodIndex:
    freq = GRANULARITY_FREQUENCIES[granularity]
    return pd.period_range(
        start=pd.Period(report_range.start, freq=freq),
        end=pd.Period(report_range.end, freq=freq),
        freq=freq,
    )


def check_trend_size(report_range: ReportRange, granularity: str) -> None:
    points = len(_period_index(report_range, granularity))
    limit = MAX_TREND_POINTS[granularity]
    if points > limit:
        raise AnalyticsInputError(
            f"The {granularity} view supports up to {limit} periods, but the "
            f"selected range has {points}. Choose a shorter date range or a "
            "larger interval (weekly, monthly or yearly)."
        )


def _period_meta(
    period: pd.Period,
    granularity: str,
    report_range: ReportRange,
    show_year: bool,
) -> dict[str, object]:
    """Start/end dates (clipped to the range) and a short chart label."""
    start = max(period.start_time.date(), report_range.start)
    end = min(period.end_time.date(), report_range.end)
    month = start.strftime("%b")
    if granularity in ("daily", "weekly"):
        label = f"{month} {start.day}" + (f", {start.year}" if show_year else "")
    elif granularity == "monthly":
        label = month + (f" {start.year}" if show_year else "")
    else:
        label = str(start.year)
    return {"period_start": start, "period_end": end, "label": label}


def _category_table(
    local_times: pd.Series,
    categories: pd.Series,
    index: pd.PeriodIndex,
    columns: Iterable[str],
) -> pd.DataFrame:
    """Rows = periods of ``index``, columns = categories, values = counts.

    Periods with no records are kept with zero counts (no gaps in a chart).
    """
    columns = list(columns)
    periods = local_times.dt.to_period(index.freqstr)
    valid = periods.notna()
    if not valid.any():
        return pd.DataFrame(0, index=index, columns=columns, dtype="int64")
    table = pd.crosstab(periods[valid], categories[valid])
    return table.reindex(index=index, columns=columns, fill_value=0).astype("int64")


def request_trend(
    requests: pd.DataFrame,
    report_range: ReportRange,
    granularity: str,
    show_year: bool | None = None,
) -> list[dict[str, object]]:
    """Requests submitted per period, with how many of them ended Completed /
    Rejected (the same cohort definition the reports have always used)."""
    index = _period_index(report_range, granularity)
    table = _category_table(
        requests["submitted_local"], requests["status"], index, REQUEST_STATUSES
    )
    if show_year is None:
        show_year = report_range.start.year != report_range.end.year
    return [
        {
            **_period_meta(period, granularity, report_range, show_year),
            "requests": int(row.sum()),
            "completed": int(row["Completed"]),
            "rejected": int(row["Rejected"]),
        }
        for period, row in table.iterrows()
    ]


def period_comparison(
    current: dict[str, int],
    previous: dict[str, int],
    labels: dict[str, str],
) -> list[dict[str, object]]:
    """Current vs previous period: absolute and percentage change."""
    frame = pd.DataFrame({"current": current, "previous": previous}).fillna(0)
    frame["change"] = frame["current"] - frame["previous"]
    # Percentage change is undefined when the previous period had nothing.
    frame["change_percentage"] = (
        frame["change"] / frame["previous"].where(frame["previous"] > 0) * 100
    ).round(1)
    return [
        {
            "key": key,
            "label": labels[key],
            "current": int(row["current"]),
            "previous": int(row["previous"]),
            "change": int(row["change"]),
            "change_percentage": _optional_float(row["change_percentage"], 1),
        }
        for key, row in frame.reindex(list(labels)).iterrows()
    ]


# --------------------------------------------------------------------------- #
#  Processing-time analytics                                                  #
# --------------------------------------------------------------------------- #


def _hours_between(start: pd.Series, end: pd.Series) -> pd.Series:
    return (end - start).dt.total_seconds() / 3600


def _duration_summary(hours: pd.Series) -> dict[str, object]:
    hours = hours.dropna()
    if hours.empty:
        return {
            "count": 0,
            "average_hours": None,
            "median_hours": None,
            "min_hours": None,
            "max_hours": None,
            "p90_hours": None,
        }
    return {
        "count": int(hours.size),
        "average_hours": _optional_float(hours.mean()),
        "median_hours": _optional_float(hours.median()),
        "min_hours": _optional_float(hours.min()),
        "max_hours": _optional_float(hours.max()),
        "p90_hours": _optional_float(hours.quantile(0.9)),
    }


def processing_time_stats(
    completed: pd.DataFrame, history: pd.DataFrame
) -> dict[str, object]:
    """How long completed requests took, overall, per stage and per type.

    ``completed``: requests completed in the period (id, document_name,
    submitted_at, completed_at). ``history``: the first time each of those
    requests entered each status (request_id, new_status, first_changed_at).
    A duration is measured only when both of its timestamps really exist and
    are in order; anything else is excluded (never guessed).
    """
    frame = completed.copy()
    frame["submitted_at"] = _to_utc(frame["submitted_at"])
    frame["completed_at"] = _to_utc(frame["completed_at"])
    frame["hours"] = _hours_between(frame["submitted_at"], frame["completed_at"])
    valid = frame["hours"].notna() & (frame["hours"] >= 0)
    excluded = int((~valid).sum())
    measured = frame[valid]

    by_type = (
        measured.groupby("document_name")["hours"]
        .agg(["count", "mean", "median"])
        .sort_values(["count", "mean"], ascending=[False, True])
        if not measured.empty
        else pd.DataFrame(columns=["count", "mean", "median"])
    )

    # One row per request, one column per workflow status: when it got there.
    timeline = frame.set_index("id")[["submitted_at", "completed_at"]].rename(
        columns={"submitted_at": "Pending", "completed_at": "Completed"}
    )
    if not history.empty:
        events = history.copy()
        events["first_changed_at"] = _to_utc(events["first_changed_at"])
        pivot = events.pivot(
            index="request_id", columns="new_status", values="first_changed_at"
        )
        for status in ("Approved", "Processing", "Ready for Pickup"):
            if status in pivot.columns:
                timeline[status] = pivot[status].reindex(timeline.index)
    for status in ("Approved", "Processing", "Ready for Pickup"):
        if status not in timeline.columns:
            timeline[status] = pd.Series(pd.NaT, index=timeline.index, dtype="datetime64[ns, UTC]")

    stages = []
    for from_status, to_status, label in PROCESSING_STAGES:
        hours = _hours_between(timeline[from_status], timeline[to_status])
        hours = hours[hours >= 0]
        summary = _duration_summary(hours)
        stages.append(
            {
                "stage": label,
                "from_status": from_status,
                "to_status": to_status,
                "count": summary["count"],
                "average_hours": summary["average_hours"],
                "median_hours": summary["median_hours"],
            }
        )

    return {
        "overall": _duration_summary(measured["hours"]),
        "stages": stages,
        "by_document_type": [
            {
                "document_name": str(name),
                "count": int(row["count"]),
                "average_hours": _optional_float(row["mean"]),
                "median_hours": _optional_float(row["median"]),
            }
            for name, row in by_type.iterrows()
        ],
        "excluded_records": excluded,
    }


# --------------------------------------------------------------------------- #
#  Shared queries                                                             #
# --------------------------------------------------------------------------- #


def _resident_status_counts(connection: MySQLConnection) -> pd.Series:
    return _fetch_counts(
        connection,
        """
        SELECT account_status AS `key`, COUNT(*) AS total
        FROM users
        WHERE role = 'resident'
        GROUP BY account_status
        """,
    )


def resident_summary(status_counts: pd.Series) -> dict[str, int]:
    counts = _reindexed(
        status_counts, ("active", "inactive", "suspended", "pending", "rejected")
    )
    registered = int(counts[list(REGISTERED_ACCOUNT_STATUSES)].sum())
    return {
        "total_registered": registered,
        "active": int(counts["active"]),
        "deactivated": int(counts[list(DEACTIVATED_ACCOUNT_STATUSES)].sum()),
        "pending": int(counts["pending"]),
        "rejected": int(counts["rejected"]),
        "total_accounts": int(status_counts.sum()),
    }


def _registered_residents_by_purok(connection: MySQLConnection) -> pd.Series:
    placeholders = ", ".join(["%s"] * len(REGISTERED_ACCOUNT_STATUSES))
    return _fetch_counts(
        connection,
        f"""
        SELECT resident_profiles.purok AS `key`, COUNT(*) AS total
        FROM resident_profiles
        JOIN users ON users.id = resident_profiles.user_id
        WHERE users.role = 'resident'
          AND users.account_status IN ({placeholders})
        GROUP BY resident_profiles.purok
        """,
        REGISTERED_ACCOUNT_STATUSES,
    )


# --------------------------------------------------------------------------- #
#  Admin Dashboard                                                            #
# --------------------------------------------------------------------------- #

#: Months shown by the dashboard's "Monthly Requests Overview" chart.
DASHBOARD_MONTHS = 7
#: Document types listed by the dashboard donut (most requested first).
DASHBOARD_TOP_DOCUMENT_TYPES = 5


def build_dashboard_analytics(connection: MySQLConnection) -> dict[str, object]:
    """Every statistic shown on the Admin Dashboard, from live records."""
    today = manila_today()
    month_start = today.replace(day=1)
    month_start_utc = manila_day_start_utc(month_start)

    # -- Residents ------------------------------------------------------------
    residents = resident_summary(_resident_status_counts(connection))
    placeholders = ", ".join(["%s"] * len(REGISTERED_ACCOUNT_STATUSES))
    new_residents_this_month = _fetch_scalar(
        connection,
        f"""
        SELECT COUNT(*) FROM users
        WHERE role = 'resident'
          AND account_status IN ({placeholders})
          AND created_at >= %s
        """,
        (*REGISTERED_ACCOUNT_STATUSES, month_start_utc),
    )

    # -- Request statuses (all time) -----------------------------------------
    status_counts = _fetch_counts(
        connection,
        f"""
        SELECT requests.status AS `key`, COUNT(*) AS total
        {RESIDENT_REQUESTS_FROM}
        WHERE users.role = 'resident'
        GROUP BY requests.status
        """,
    )
    statuses = _reindexed(status_counts, REQUEST_STATUSES)

    # Completed/rejected *this month* use the real event time: completed_at
    # (or the status-history entry for it) and the rejection history entry.
    # last_updated is NOT used - it changes on any edit of the record.
    completed_this_month = _fetch_scalar(
        connection,
        f"""
        SELECT COUNT(*)
        {RESIDENT_REQUESTS_FROM}
        WHERE users.role = 'resident'
          AND requests.status = 'Completed'
          AND COALESCE(
                requests.completed_at,
                (SELECT MIN(history.changed_at)
                 FROM request_status_history AS history
                 WHERE history.request_id = requests.id
                   AND history.new_status = 'Completed')
              ) >= %s
        """,
        (month_start_utc,),
    )
    rejected_this_month = _fetch_scalar(
        connection,
        f"""
        SELECT COUNT(DISTINCT requests.id)
        {RESIDENT_REQUESTS_FROM}
        JOIN request_status_history AS history
          ON history.request_id = requests.id
         AND history.new_status = 'Rejected'
        WHERE users.role = 'resident'
          AND requests.status = 'Rejected'
          AND history.changed_at >= %s
        """,
        (month_start_utc,),
    )

    # -- Monthly overview (last 7 months, Manila calendar months) -------------
    monthly_range = ReportRange(
        start=shift_months(month_start, -(DASHBOARD_MONTHS - 1)), end=today
    )
    recent = _fetch_frame(
        connection,
        f"""
        SELECT requests.id, requests.status, requests.submitted_at
        {RESIDENT_REQUESTS_FROM}
        WHERE users.role = 'resident'
          AND requests.submitted_at >= %s AND requests.submitted_at < %s
        """,
        monthly_range.sql_params,
        ("id", "status", "submitted_at"),
    )
    recent["submitted_local"] = _to_manila_local(recent["submitted_at"])
    monthly = [
        {
            "month": point["label"],
            "submitted": point["requests"],
            "completed": point["completed"],
            "rejected": point["rejected"],
        }
        for point in request_trend(recent, monthly_range, "monthly", show_year=False)
    ]

    # -- Yearly trend (all years since the first request) --------------------
    yearly_rows = _fetch_frame(
        connection,
        f"""
        SELECT YEAR(CONVERT_TZ(requests.submitted_at, '+00:00', '+08:00')) AS year,
               requests.status, COUNT(*) AS total
        {RESIDENT_REQUESTS_FROM}
        WHERE users.role = 'resident'
        GROUP BY year, requests.status
        """,
        (),
        ("year", "status", "total"),
    )
    yearly = yearly_trend(yearly_rows, today.year)

    # -- Document types --------------------------------------------------------
    document_counts = _fetch_counts(
        connection,
        f"""
        SELECT document_types.document_name AS `key`, COUNT(*) AS total
        {RESIDENT_REQUESTS_FROM}
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE users.role = 'resident'
        GROUP BY document_types.id, document_types.document_name
        """,
    )
    document_types = document_type_ranking(document_counts)[:DASHBOARD_TOP_DOCUMENT_TYPES]

    # -- Purok distribution ----------------------------------------------------
    request_purok_counts = _fetch_counts(
        connection,
        f"""
        SELECT resident_profiles.purok AS `key`, COUNT(*) AS total
        {RESIDENT_REQUESTS_FROM}
        WHERE users.role = 'resident'
        GROUP BY resident_profiles.purok
        """,
    )
    puroks = purok_distribution(
        _registered_residents_by_purok(connection), request_purok_counts
    )

    return {
        "stats": {
            "total_residents": residents["total_registered"],
            "new_residents_this_month": new_residents_this_month,
            "total_requests": int(statuses.sum()),
            "pending": int(statuses["Pending"]),
            "approved": int(statuses["Approved"]),
            "processing": int(statuses["Processing"]),
            "ready_for_pickup": int(statuses["Ready for Pickup"]),
            "completed": completed_this_month,
            "rejected": rejected_this_month,
            "completed_all_time": int(statuses["Completed"]),
            "rejected_all_time": int(statuses["Rejected"]),
            "pending_registrations": residents["pending"],
        },
        "resident_summary": residents,
        "request_status": status_breakdown(status_counts),
        "monthly": monthly,
        "yearly": yearly,
        "document_types": document_types,
        "purok_distribution": puroks,
        "generated_at": datetime.now(timezone.utc),
    }


def yearly_trend(rows: pd.DataFrame, current_year: int) -> list[dict[str, object]]:
    """Requests per Manila calendar year with the year-over-year change."""
    if rows.empty:
        return []
    rows = rows.astype({"year": "int64", "total": "int64"})
    table = rows.pivot_table(
        index="year", columns="status", values="total", aggfunc="sum", fill_value=0
    )
    years = range(int(table.index.min()), max(int(table.index.max()), current_year) + 1)
    table = table.reindex(index=years, columns=REQUEST_STATUSES, fill_value=0)
    frame = pd.DataFrame(
        {
            "requests": table.sum(axis=1),
            "completed": table["Completed"],
            "rejected": table["Rejected"],
        }
    )
    previous = frame["requests"].shift(1)
    frame["change_percentage"] = (
        (frame["requests"] - previous) / previous.where(previous > 0) * 100
    ).round(1)
    return [
        {
            "year": int(year),
            "requests": int(row["requests"]),
            "completed": int(row["completed"]),
            "rejected": int(row["rejected"]),
            "change_percentage": _optional_float(row["change_percentage"], 1),
        }
        for year, row in frame.iterrows()
    ]


def document_type_ranking(counts: pd.Series) -> list[dict[str, object]]:
    """Document types by number of requests (most requested first)."""
    if counts.empty:
        return []
    total = int(counts.sum())
    ranked = counts[counts > 0].sort_values(ascending=False, kind="stable")
    return [
        {
            "document_name": str(name),
            "count": int(count),
            "percentage": _percent(count, total),
        }
        for name, count in ranked.items()
    ]


# --------------------------------------------------------------------------- #
#  Admin Reports                                                              #
# --------------------------------------------------------------------------- #

COMPARISON_LABELS: dict[str, str] = {
    "requests": "Requests submitted",
    "completed": "Completed",
    "rejected": "Rejected",
    "registrations": "Resident registrations",
}


def _load_period_requests(
    connection: MySQLConnection, report_range: ReportRange
) -> pd.DataFrame:
    """Requests submitted in the period (also feeds the CSV export rows)."""
    frame = _fetch_frame(
        connection,
        f"""
        SELECT requests.id, requests.request_number, requests.status,
               requests.submitted_at, requests.completed_at,
               document_types.document_name,
               resident_profiles.purok,
               CONCAT(resident_profiles.first_name, ' ', resident_profiles.last_name)
                   AS resident_name
        {RESIDENT_REQUESTS_FROM}
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE users.role = 'resident'
          AND requests.submitted_at >= %s AND requests.submitted_at < %s
        ORDER BY requests.submitted_at DESC, requests.id DESC
        """,
        report_range.sql_params,
        (
            "id",
            "request_number",
            "status",
            "submitted_at",
            "completed_at",
            "document_name",
            "purok",
            "resident_name",
        ),
    )
    # A JOIN must never duplicate a request; guard against it anyway.
    frame = frame.drop_duplicates(subset="id")
    frame["submitted_local"] = _to_manila_local(frame["submitted_at"])
    return frame


def _load_completed_in_period(
    connection: MySQLConnection, report_range: ReportRange
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Requests completed in the period and their status-history timestamps."""
    completed = _fetch_frame(
        connection,
        f"""
        SELECT requests.id, document_types.document_name,
               requests.submitted_at, requests.completed_at
        {RESIDENT_REQUESTS_FROM}
        JOIN document_types ON document_types.id = requests.document_type_id
        WHERE users.role = 'resident'
          AND requests.status = 'Completed'
          AND requests.completed_at >= %s AND requests.completed_at < %s
        """,
        report_range.sql_params,
        ("id", "document_name", "submitted_at", "completed_at"),
    ).drop_duplicates(subset="id")
    history = _fetch_frame(
        connection,
        f"""
        SELECT history.request_id, history.new_status,
               MIN(history.changed_at) AS first_changed_at
        {RESIDENT_REQUESTS_FROM}
        JOIN request_status_history AS history ON history.request_id = requests.id
        WHERE users.role = 'resident'
          AND requests.status = 'Completed'
          AND requests.completed_at >= %s AND requests.completed_at < %s
        GROUP BY history.request_id, history.new_status
        """,
        report_range.sql_params,
        ("request_id", "new_status", "first_changed_at"),
    )
    return completed, history


def _count_rejected_in_period(
    connection: MySQLConnection, report_range: ReportRange
) -> int:
    return _fetch_scalar(
        connection,
        f"""
        SELECT COUNT(DISTINCT requests.id)
        {RESIDENT_REQUESTS_FROM}
        JOIN request_status_history AS history
          ON history.request_id = requests.id
         AND history.new_status = 'Rejected'
        WHERE users.role = 'resident'
          AND requests.status = 'Rejected'
          AND history.changed_at >= %s AND history.changed_at < %s
        """,
        report_range.sql_params,
    )


def _load_registrations(
    connection: MySQLConnection, report_range: ReportRange
) -> pd.DataFrame:
    frame = _fetch_frame(
        connection,
        """
        SELECT id, account_status, created_at
        FROM users
        WHERE role = 'resident'
          AND created_at >= %s AND created_at < %s
        """,
        report_range.sql_params,
        ("id", "account_status", "created_at"),
    )
    frame["created_local"] = _to_manila_local(frame["created_at"])
    return frame


def registration_analytics(
    registrations: pd.DataFrame, report_range: ReportRange, granularity: str
) -> dict[str, object]:
    """Resident sign-ups per period, split by their current review outcome."""
    outcome = registrations["account_status"].map(
        lambda value: "approved"
        if value in REGISTERED_ACCOUNT_STATUSES
        else value
    )
    index = _period_index(report_range, granularity)
    table = _category_table(
        registrations["created_local"],
        outcome,
        index,
        ("approved", "pending", "rejected"),
    )
    show_year = report_range.start.year != report_range.end.year
    totals = table.sum()
    return {
        "total": int(len(registrations)),
        "approved": int(totals["approved"]),
        "pending": int(totals["pending"]),
        "rejected": int(totals["rejected"]),
        "trend": [
            {
                **_period_meta(period, granularity, report_range, show_year),
                "registrations": int(row.sum()),
                "approved": int(row["approved"]),
                "pending": int(row["pending"]),
                "rejected": int(row["rejected"]),
            }
            for period, row in table.iterrows()
        ],
    }


def _road_key(value: object) -> str:
    """Grouping key for a road name: case and spacing differences merge."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    return " ".join(str(value).split()).casefold()


def pothole_analytics(
    connection: MySQLConnection, report_range: ReportRange, granularity: str
) -> dict[str, object]:
    """Statistics of submitted pothole reports (no detection/classification)."""
    empty = {
        "available": False,
        "total": 0,
        "resolved": 0,
        "unresolved": 0,
        "rejected": 0,
        "resolution_rate": 0.0,
        "by_status": [],
        "by_purok": [],
        "unspecified_purok": 0,
        "by_road": [],
        "trend": [],
    }
    try:
        reports = _fetch_frame(
            connection,
            """
            SELECT id, status, purok, road_name, reported_at
            FROM pothole_reports
            WHERE reported_at >= %s AND reported_at < %s
            """,
            report_range.sql_params,
            ("id", "status", "purok", "road_name", "reported_at"),
        )
    except mysql.connector.Error as error:
        if error.errno == TABLE_MISSING_ERROR:
            logger.warning("pothole_reports table is missing; skipping pothole analytics")
            return empty
        raise

    total = int(len(reports))
    status_counts = _reindexed(reports["status"].value_counts(), POTHOLE_STATUSES)
    resolved = int(status_counts["resolved"])
    unresolved = int(status_counts[list(POTHOLE_UNRESOLVED_STATUSES)].sum())

    purok_counts = _normalize_label_index(
        reports.groupby(reports["purok"].fillna(""), dropna=False).size()
    )
    by_purok = [
        {"purok": purok, "count": int(purok_counts.get(purok, 0))}
        for purok in STANDARDIZED_PUROKS
    ]

    roads = reports.assign(road_key=reports["road_name"].map(_road_key))
    named = roads[roads["road_key"] != ""]
    by_road: list[dict[str, object]] = []
    if not named.empty:
        grouped = named.groupby("road_key").agg(
            count=("id", "size"),
            # Show the spelling residents used most often for this road.
            road_name=("road_name", lambda names: names.str.strip().mode().iloc[0]),
        )
        grouped = grouped.sort_values(["count", "road_name"], ascending=[False, True])
        by_road = [
            {
                "road_name": str(row["road_name"]),
                "count": int(row["count"]),
                "percentage": _percent(row["count"], total),
            }
            for _, row in grouped.head(TOP_ROADS).iterrows()
        ]
    unnamed = int(len(roads) - len(named))
    if unnamed:
        by_road.append(
            {
                "road_name": UNSPECIFIED_LABEL,
                "count": unnamed,
                "percentage": _percent(unnamed, total),
            }
        )

    reported_local = _to_manila_local(reports["reported_at"])
    table = _category_table(
        reported_local,
        reports["status"],
        _period_index(report_range, granularity),
        POTHOLE_STATUSES,
    )
    show_year = report_range.start.year != report_range.end.year

    return {
        "available": True,
        "total": total,
        "resolved": resolved,
        "unresolved": unresolved,
        "rejected": int(status_counts["rejected"]),
        "resolution_rate": _percent(resolved, resolved + unresolved),
        "by_status": [
            {
                "status": status,
                "label": POTHOLE_STATUS_LABELS[status],
                "count": int(count),
                "percentage": _percent(count, total),
            }
            for status, count in status_counts.items()
        ],
        "by_purok": by_purok,
        "unspecified_purok": int(purok_counts.get(UNSPECIFIED_LABEL, 0)),
        "by_road": by_road,
        "trend": [
            {
                **_period_meta(period, granularity, report_range, show_year),
                "reported": int(row.sum()),
                "resolved": int(row["resolved"]),
            }
            for period, row in table.iterrows()
        ],
    }


def _previous_period_counts(
    connection: MySQLConnection, report_range: ReportRange
) -> dict[str, int]:
    """Plain SQL counts for the comparison period (no rows are loaded)."""
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            f"""
            SELECT COUNT(*) AS requests,
                   COALESCE(SUM(requests.status = 'Completed'), 0) AS completed,
                   COALESCE(SUM(requests.status = 'Rejected'), 0) AS rejected
            {RESIDENT_REQUESTS_FROM}
            WHERE users.role = 'resident'
              AND requests.submitted_at >= %s AND requests.submitted_at < %s
            """,
            report_range.sql_params,
        )
        row = cursor.fetchone() or {}
    finally:
        cursor.close()
    registrations = _fetch_scalar(
        connection,
        """
        SELECT COUNT(*) FROM users
        WHERE role = 'resident' AND created_at >= %s AND created_at < %s
        """,
        report_range.sql_params,
    )
    return {
        "requests": int(row.get("requests") or 0),
        "completed": int(row.get("completed") or 0),
        "rejected": int(row.get("rejected") or 0),
        "registrations": registrations,
    }


def build_reports_analytics(
    connection: MySQLConnection,
    date_from: date | None,
    date_to: date | None,
    granularity: str,
) -> dict[str, object]:
    """Everything the Admin Reports page shows for one date range.

    Request figures cover the requests *submitted* in the range (their current
    status says how they ended). Completion events and processing times cover
    the requests *completed* in the range. Resident totals and the residents
    per Purok are a current snapshot; registrations are counted by sign-up date.
    """
    if granularity not in GRANULARITY_FREQUENCIES:
        raise AnalyticsInputError("Unknown interval.")
    report_range = resolve_report_range(connection, date_from, date_to)
    check_trend_size(report_range, granularity)

    requests = _load_period_requests(connection, report_range)
    status_counts = requests["status"].value_counts()
    statuses = _reindexed(status_counts, REQUEST_STATUSES)
    total_requests = int(len(requests))
    completed = int(statuses["Completed"])
    rejected = int(statuses["Rejected"])
    open_requests = total_requests - completed - rejected

    residents = resident_summary(_resident_status_counts(connection))
    residents_by_purok = _registered_residents_by_purok(connection)
    request_purok_counts = requests.groupby(
        requests["purok"].fillna(""), dropna=False
    ).size()

    potholes = pothole_analytics(connection, report_range, granularity)
    pothole_purok_counts = (
        pd.Series(
            {
                **{row["purok"]: row["count"] for row in potholes["by_purok"]},
                UNSPECIFIED_LABEL: potholes["unspecified_purok"],
            },
            dtype="int64",
        )
        if potholes["available"]
        else None
    )
    puroks = purok_distribution(
        residents_by_purok, request_purok_counts, pothole_purok_counts
    )

    completed_in_period, history = _load_completed_in_period(connection, report_range)
    registrations = registration_analytics(
        _load_registrations(connection, report_range), report_range, granularity
    )

    comparison = None
    if not report_range.is_all_time:
        previous_range = report_range.previous()
        comparison = {
            "previous_from": previous_range.start,
            "previous_to": previous_range.end,
            "metrics": period_comparison(
                {
                    "requests": total_requests,
                    "completed": completed,
                    "rejected": rejected,
                    "registrations": registrations["total"],
                },
                _previous_period_counts(connection, previous_range),
                COMPARISON_LABELS,
            ),
        }

    trend = request_trend(requests, report_range, granularity)
    monthly = (
        trend
        if granularity == "monthly"
        else request_trend(requests, report_range, "monthly")
    )

    export_rows = requests[
        ["request_number", "resident_name", "document_name", "status", "submitted_at"]
    ].rename(columns={"document_name": "document"})

    return {
        "filters": {
            "date_from": report_range.start,
            "date_to": report_range.end,
            "granularity": granularity,
            "is_all_time": report_range.is_all_time,
            "days": report_range.days,
            "timezone": MANILA_TIMEZONE_NAME,
        },
        "summary": {
            "total_residents": residents["total_registered"],
            "active_residents": residents["active"],
            "total_requests": total_requests,
            "completed": completed,
            "rejected": rejected,
            "completion_rate": _percent(completed, total_requests),
            "rejection_rate": _percent(rejected, total_requests),
            "open_requests": open_requests,
            "new_registrations": registrations["total"],
        },
        "resident_summary": residents,
        "monthly": [
            {
                "month": point["label"],
                "requests": point["requests"],
                "completed": point["completed"],
                "rejected": point["rejected"],
            }
            for point in monthly
        ],
        "trend": trend,
        "residents_by_purok": [
            {"purok": row["purok"], "count": row["residents"]} for row in puroks
        ],
        "purok_distribution": puroks,
        "document_types": document_type_ranking(
            requests.groupby("document_name").size()
            if total_requests
            else pd.Series(dtype="int64")
        ),
        "status_breakdown": status_breakdown(status_counts),
        "completion": {
            "total_requests": total_requests,
            "completed": completed,
            "rejected": rejected,
            "open_requests": open_requests,
            "completion_rate": _percent(completed, total_requests),
            "rejection_rate": _percent(rejected, total_requests),
            "open_rate": _percent(open_requests, total_requests),
            "completed_in_period": int(len(completed_in_period)),
            "rejected_in_period": _count_rejected_in_period(connection, report_range),
        },
        "processing_time": processing_time_stats(completed_in_period, history),
        "registrations": registrations,
        "comparison": comparison,
        "potholes": potholes,
        "export_requests": export_rows.to_dict(orient="records"),
        "generated_at": datetime.now(timezone.utc),
    }
