from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .puroks import validate_purok

#: Basic deliverability check; registration emails are sent to this address.
_EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class RegisterInput(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    phone: str = Field(min_length=10, max_length=20)
    address: str = Field(min_length=1, max_length=255)
    # Extended registration details (all optional to stay backward compatible)
    middle_name: str | None = Field(default=None, max_length=100)
    suffix: str | None = Field(default=None, max_length=20)
    date_of_birth: date | None = None
    place_of_birth: str | None = Field(default=None, max_length=255)
    sex: str | None = Field(default=None, max_length=10)
    civil_status: str | None = Field(default=None, max_length=20)
    nationality: str | None = Field(default=None, max_length=100)
    religion: str | None = Field(default=None, max_length=100)
    voter_status: str | None = Field(default=None, max_length=30)
    house_no: str | None = Field(default=None, max_length=20)
    street: str | None = Field(default=None, max_length=150)
    purok: str | None = Field(default=None, max_length=50)
    years_of_residency: int | None = Field(default=None, ge=0, le=150)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        if not _EMAIL_PATTERN.match(value.strip()):
            raise ValueError("Enter a valid email address.")
        return value

    @field_validator("purok")
    @classmethod
    def _validate_purok(cls, value: str | None) -> str | None:
        """Accept only the seven standardized Purok names (or None/empty)."""
        return validate_purok(value)
    occupation: str | None = Field(default=None, max_length=100)
    employer: str | None = Field(default=None, max_length=150)
    emergency_contact_name: str | None = Field(default=None, max_length=150)
    emergency_contact_relationship: str | None = Field(
        default=None, max_length=50
    )
    emergency_contact_number: str | None = Field(default=None, max_length=20)
    emergency_contact_address: str | None = Field(default=None, max_length=255)


class LoginInput(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class ForgotPasswordInput(BaseModel):
    """Email address that a password-reset link is requested for."""

    email: str = Field(min_length=3, max_length=255)


class ResetPasswordInput(BaseModel):
    """Reset token from the emailed link plus the new password."""

    token: str = Field(min_length=16, max_length=512)
    password: str = Field(min_length=6, max_length=128)


class MessageResponse(BaseModel):
    """Simple, non-technical message returned by auth helper endpoints."""

    message: str


class RegistrationResponse(BaseModel):
    """Registration result. No token is issued until an Administrator approves."""

    message: str
    email: str
    account_status: str
    reference_number: str


class UserResponse(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    role: str
    purok: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class DocumentTypeResponse(BaseModel):
    id: int
    document_name: str
    description: str | None


class CreateRequestInput(BaseModel):
    document_type_id: int = Field(gt=0)
    purpose: str = Field(min_length=1, max_length=2000)


class UpdateRequestInput(BaseModel):
    purpose: str = Field(min_length=1, max_length=2000)


class RequestResponse(BaseModel):
    id: int
    request_number: str
    document_type_id: int
    document: str
    purpose: str
    status: str
    submitted_at: datetime
    last_updated: datetime
    pickup_date: date | None


class RequestStatusHistoryEntry(BaseModel):
    old_status: str | None
    new_status: str
    remarks: str | None
    changed_at: datetime


class RequestDetailResponse(BaseModel):
    id: int
    request_number: str
    document: str
    purpose: str
    status: str
    admin_remarks: str | None
    submitted_at: datetime
    last_updated: datetime
    pickup_date: date | None
    history: list[RequestStatusHistoryEntry]


class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    notification_type: str
    related_request_id: int | None
    is_read: bool
    created_at: datetime


class DashboardSummaryResponse(BaseModel):
    total_requests: int
    pending: int
    processing: int
    ready_for_pickup: int


class AdminStatusStats(BaseModel):
    """Dashboard counters (computed in app/analytics.py).

    ``pending``/``approved``/``processing``/``ready_for_pickup`` are the
    current number of requests in that exact status. ``completed`` and
    ``rejected`` count the requests completed / rejected *this month*
    (Manila time); the ``*_all_time`` fields hold the all-time totals.
    """

    total_residents: int
    new_residents_this_month: int
    total_requests: int = 0
    pending: int
    approved: int
    processing: int
    ready_for_pickup: int = 0
    completed: int
    rejected: int
    completed_all_time: int = 0
    rejected_all_time: int = 0
    pending_registrations: int


class AdminMonthlyDataPoint(BaseModel):
    month: str
    submitted: int
    completed: int
    rejected: int


class AdminDocumentTypeCount(BaseModel):
    document_name: str
    count: int
    #: Share of all requests in the same scope (0-100, one decimal).
    percentage: float = 0.0


class AdminResidentSummary(BaseModel):
    """Resident accounts by review/account status (current snapshot).

    ``total_registered`` = approved resident accounts (``active`` plus
    ``deactivated``); ``total_accounts`` also includes pending and rejected
    sign-ups.
    """

    total_registered: int
    active: int
    deactivated: int
    pending: int
    rejected: int
    total_accounts: int


class AdminStatusCount(BaseModel):
    status: str
    count: int
    percentage: float


class AdminPurokAnalytics(BaseModel):
    """One Purok compared on residents, requests (and pothole reports)."""

    purok: str
    #: False for the "Not specified" bucket (or a legacy, non-standard value).
    is_standardized: bool
    residents: int
    resident_percentage: float
    requests: int
    request_percentage: float
    #: Requests per registered resident; None when the Purok has no residents.
    requests_per_resident: float | None
    potholes: int | None = None


class AdminYearlyPoint(BaseModel):
    year: int
    requests: int
    completed: int
    rejected: int
    #: Change in requests vs the previous year; None when that year had none.
    change_percentage: float | None


class AdminRecentRequest(BaseModel):
    request_number: str
    resident_name: str
    document: str
    status: str
    submitted_at: datetime


class AdminRecentRegistration(BaseModel):
    resident_name: str
    created_at: datetime
    status: str


class AdminActivityEntry(BaseModel):
    title: str
    created_at: datetime


class AdminActivityLogResponse(BaseModel):
    id: int
    actor_name: str
    actor_role: str
    action_type: str
    action: str
    target_type: str
    target: str
    ip_address: str | None
    created_at: datetime


class AdminResidentResponse(BaseModel):
    id: int
    resident_code: str
    name: str
    email: str
    purok: str | None
    contact_number: str | None
    status: str
    registered_at: datetime


class AdminResidentRequestEntry(BaseModel):
    request_number: str
    document: str
    status: str
    submitted_at: datetime


class AdminResidentDetailResponse(BaseModel):
    id: int
    resident_code: str
    name: str
    first_name: str
    middle_name: str | None
    last_name: str
    suffix: str | None
    email: str
    purok: str | None
    contact_number: str | None
    address: str | None
    birthday: date | None
    gender: str | None
    civil_status: str | None
    occupation: str | None
    status: str
    requests: list[AdminResidentRequestEntry]


class AdminResidentUpdateInput(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    suffix: str | None = Field(default=None, max_length=20)
    email: str = Field(min_length=3, max_length=255)
    date_of_birth: date | None = None
    sex: Literal["Male", "Female"] | None = None
    civil_status: (
        Literal["Single", "Married", "Widowed", "Separated", "Annulled"] | None
    ) = None
    occupation: str | None = Field(default=None, max_length=100)
    house_no: str | None = Field(default=None, max_length=20)
    street: str | None = Field(default=None, max_length=150)
    purok: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=255)
    contact_number: str | None = Field(default=None, max_length=20)

    @field_validator("purok")
    @classmethod
    def _validate_purok(cls, value: str | None) -> str | None:
        """Accept only the seven standardized Purok names (or None/empty)."""
        return validate_purok(value)


class AdminResidentStatusInput(BaseModel):
    account_status: Literal["active", "inactive"]


class AdminRegistrationResponse(BaseModel):
    """One resident registration on the Admin Approvals page."""

    id: int
    resident_code: str
    name: str
    email: str
    contact_number: str | None
    address: str | None
    purok: str | None
    status: str
    registered_at: datetime
    reviewed_at: datetime | None
    reviewed_by: str | None
    rejection_reason: str | None
    # Delivery state of the email describing the current status.
    email_status: str | None
    date_of_birth: date | None
    place_of_birth: str | None
    sex: str | None
    civil_status: str | None
    nationality: str | None
    religion: str | None
    voter_status: str | None
    house_no: str | None
    street: str | None
    years_of_residency: int | None
    occupation: str | None
    employer: str | None
    emergency_contact_name: str | None
    emergency_contact_relationship: str | None
    emergency_contact_number: str | None
    emergency_contact_address: str | None


class AdminRegistrationRejectInput(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)

    @field_validator("reason")
    @classmethod
    def _require_reason(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("A rejection reason is required.")
        return stripped


class AdminRegistrationActionResponse(BaseModel):
    registration: AdminRegistrationResponse
    email_delivery: str
    message: str


class AdminDocumentRequestResponse(BaseModel):
    id: int
    request_number: str
    resident_name: str
    document: str
    purpose: str
    status: str
    submitted_at: datetime
    fee: float


class AdminRequestHistoryResponse(BaseModel):
    id: int
    request_number: str
    resident_name: str
    document: str
    status: str
    submitted_at: datetime
    processed_by: str | None


class RequestAttachmentResponse(BaseModel):
    """Metadata of a resident's image attachment (the bytes are served by the
    authenticated ``.../attachment`` endpoints, never in this payload)."""

    id: int
    original_filename: str
    content_type: str
    file_size: int
    uploaded_at: datetime


class AdminDocumentRequestDetailResponse(BaseModel):
    id: int
    request_number: str
    resident_name: str
    email: str
    document: str
    purpose: str
    status: str
    admin_remarks: str | None
    submitted_at: datetime
    last_updated: datetime
    pickup_date: date | None
    fee: float
    processed_by: str | None
    attachment: RequestAttachmentResponse | None = None


class AdminRequestActionInput(BaseModel):
    status: (
        Literal[
            "Approved",
            "Rejected",
            "Processing",
            "Ready for Pickup",
            "Completed",
        ]
        | None
    ) = None
    admin_remarks: str | None = Field(default=None, max_length=2000)
    pickup_date: date | None = None


class AdminDashboardResponse(BaseModel):
    stats: AdminStatusStats
    monthly: list[AdminMonthlyDataPoint]
    document_types: list[AdminDocumentTypeCount]
    recent_requests: list[AdminRecentRequest]
    recent_registrations: list[AdminRecentRegistration]
    recent_activity: list[AdminActivityEntry]
    resident_summary: AdminResidentSummary
    request_status: list[AdminStatusCount]
    yearly: list[AdminYearlyPoint]
    purok_distribution: list[AdminPurokAnalytics]
    generated_at: datetime


class AdminReportsSummary(BaseModel):
    total_residents: int
    active_residents: int
    total_requests: int
    completed: int
    rejected: int
    completion_rate: float
    rejection_rate: float
    open_requests: int = 0
    new_registrations: int = 0


class AdminReportsFilters(BaseModel):
    """The range the report was actually computed for (Manila calendar days)."""

    date_from: date
    date_to: date
    granularity: Literal["daily", "weekly", "monthly", "yearly"]
    is_all_time: bool
    days: int
    timezone: str


class AdminTrendPoint(BaseModel):
    period_start: date
    period_end: date
    label: str
    requests: int
    completed: int
    rejected: int


class AdminCompletionStats(BaseModel):
    """Outcome of the requests submitted in the period, plus completion /
    rejection events that happened in the period."""

    total_requests: int
    completed: int
    rejected: int
    open_requests: int
    completion_rate: float
    rejection_rate: float
    open_rate: float
    completed_in_period: int
    rejected_in_period: int


class AdminDurationStats(BaseModel):
    count: int
    average_hours: float | None
    median_hours: float | None
    min_hours: float | None
    max_hours: float | None
    p90_hours: float | None


class AdminStageDuration(BaseModel):
    stage: str
    from_status: str
    to_status: str
    count: int
    average_hours: float | None
    median_hours: float | None


class AdminDocumentTypeDuration(BaseModel):
    document_name: str
    count: int
    average_hours: float | None
    median_hours: float | None


class AdminProcessingTimeStats(BaseModel):
    """Submission-to-completion time of the requests completed in the period."""

    overall: AdminDurationStats
    stages: list[AdminStageDuration]
    by_document_type: list[AdminDocumentTypeDuration]
    #: Completed requests whose timestamps could not be measured.
    excluded_records: int


class AdminRegistrationPoint(BaseModel):
    period_start: date
    period_end: date
    label: str
    registrations: int
    approved: int
    pending: int
    rejected: int


class AdminRegistrationStats(BaseModel):
    total: int
    approved: int
    pending: int
    rejected: int
    trend: list[AdminRegistrationPoint]


class AdminComparisonMetric(BaseModel):
    key: str
    label: str
    current: int
    previous: int
    change: int
    #: None when the previous period had zero (a percentage is undefined).
    change_percentage: float | None


class AdminPeriodComparison(BaseModel):
    previous_from: date
    previous_to: date
    metrics: list[AdminComparisonMetric]


class AdminPotholeStatusShare(BaseModel):
    status: str
    label: str
    count: int
    percentage: float


class AdminPotholeRoadCount(BaseModel):
    road_name: str
    count: int
    percentage: float


class AdminPotholeTrendPoint(BaseModel):
    period_start: date
    period_end: date
    label: str
    reported: int
    resolved: int


class AdminPotholeAnalytics(BaseModel):
    """Statistics of submitted pothole reports (``available`` is False when
    the pothole tables are not installed)."""

    available: bool
    total: int
    resolved: int
    unresolved: int
    rejected: int
    #: resolved / (resolved + unresolved); rejected reports are excluded.
    resolution_rate: float
    by_status: list[AdminPotholeStatusShare]
    by_purok: list["AdminPurokCount"]
    unspecified_purok: int
    by_road: list[AdminPotholeRoadCount]
    trend: list[AdminPotholeTrendPoint]


class AdminReportsMonthlyPoint(BaseModel):
    month: str
    requests: int
    completed: int
    rejected: int


class AdminPurokCount(BaseModel):
    purok: str
    count: int


class AdminReportsExportRow(BaseModel):
    request_number: str
    resident_name: str
    document: str
    status: str
    submitted_at: datetime


class AdminStaffAccountResponse(BaseModel):
    """One manageable (non-resident) portal account, as shown in the table."""

    id: int
    staff_code: str
    name: str
    first_name: str
    last_name: str
    email: str
    role: str
    account_status: str
    last_login: datetime | None
    created_at: datetime


class AdminStaffCreateInput(BaseModel):
    """Account details entered in the "Add Staff" form."""

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    role: Literal["staff", "admin", "super_admin"] = "staff"
    account_status: Literal["active", "inactive"] = "active"


class AdminStaffUpdateInput(BaseModel):
    """Editable account details. The password is never part of an update."""

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=255)
    role: Literal["staff", "admin", "super_admin"]


class AdminStaffStatusInput(BaseModel):
    account_status: Literal["active", "inactive"]


class AdminReportsResponse(BaseModel):
    filters: AdminReportsFilters
    summary: AdminReportsSummary
    resident_summary: AdminResidentSummary
    monthly: list[AdminReportsMonthlyPoint]
    trend: list[AdminTrendPoint]
    residents_by_purok: list[AdminPurokCount]
    purok_distribution: list[AdminPurokAnalytics]
    document_types: list[AdminDocumentTypeCount]
    status_breakdown: list[AdminStatusCount]
    completion: AdminCompletionStats
    processing_time: AdminProcessingTimeStats
    registrations: AdminRegistrationStats
    comparison: AdminPeriodComparison | None
    potholes: AdminPotholeAnalytics
    export_requests: list[AdminReportsExportRow]
    generated_at: datetime


# --------------------------------------------------------------------------- #
#  Pothole reports (see app/potholes.py, migration 012)                       #
# --------------------------------------------------------------------------- #

PotholeStatus = Literal[
    "pending", "verified", "under_maintenance", "resolved", "rejected"
]
#: ``gps``: the device's Geolocation API. ``manual``: a pin the resident placed
#: on the map. ``None``: no coordinates were captured.
PotholeLocationSource = Literal["gps", "manual"]


class PotholePhotoMeta(BaseModel):
    """Metadata of the resident's photo (the bytes are served by the
    authenticated ``.../photo`` endpoint, never in this payload)."""

    original_filename: str
    content_type: str
    file_size: int


class PotholeLocationFields(BaseModel):
    purok: str | None
    road_name: str | None
    location_description: str
    latitude: float | None
    longitude: float | None
    gps_accuracy_m: float | None
    location_source: PotholeLocationSource | None
    location_captured_at: datetime | None


class ResidentPotholeReportResponse(PotholeLocationFields):
    """A resident's own report, as listed on the Pothole Detection page."""

    id: int
    report_number: str
    notes: str | None
    status: PotholeStatus
    #: The remark attached to the latest status change (e.g. why it was
    #: rejected), so the resident sees the reason next to the status.
    status_remark: str | None
    reported_at: datetime
    updated_at: datetime


class AdminPotholeReportResponse(PotholeLocationFields):
    id: int
    report_number: str
    resident_name: str
    resident_contact: str | None
    resident_address: str | None
    notes: str | None
    status: PotholeStatus
    reported_at: datetime
    updated_at: datetime
    photo: PotholePhotoMeta


class AdminPotholeUpdateEntry(BaseModel):
    id: int
    old_status: PotholeStatus | None
    new_status: PotholeStatus | None
    remark: str | None
    changed_by_name: str | None
    changed_by_role: str | None
    created_at: datetime


class AdminPotholeReportDetailResponse(AdminPotholeReportResponse):
    history: list[AdminPotholeUpdateEntry]


class AdminPotholeStatusCounts(BaseModel):
    total: int
    pending: int
    verified: int
    under_maintenance: int
    resolved: int
    rejected: int


class AdminPotholeSummaryResponse(BaseModel):
    status_counts: AdminPotholeStatusCounts
    #: Always the seven standardized Puroks, in order (zero counts included).
    by_purok: list[AdminPurokCount]
    #: Reports sent without a Purok.
    unspecified_purok: int
    #: Reports that can be placed on the map (GPS or manual pin).
    with_coordinates: int


class AdminPotholeStatusInput(BaseModel):
    status: Literal["verified", "under_maintenance", "resolved", "rejected"]
    remark: str | None = Field(default=None, max_length=500)


class AdminPotholeRemarkInput(BaseModel):
    remark: str = Field(min_length=1, max_length=500)
