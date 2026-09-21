from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


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


class UserResponse(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    role: str


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
    total_residents: int
    new_residents_this_month: int
    pending: int
    approved: int
    processing: int
    completed: int
    rejected: int


class AdminMonthlyDataPoint(BaseModel):
    month: str
    submitted: int
    completed: int
    rejected: int


class AdminDocumentTypeCount(BaseModel):
    document_name: str
    count: int


class AdminRecentRequest(BaseModel):
    request_number: str
    resident_name: str
    document: str
    status: str
    submitted_at: datetime


class AdminRecentRegistration(BaseModel):
    resident_name: str
    created_at: datetime


class AdminActivityEntry(BaseModel):
    title: str
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


class AdminResidentStatusInput(BaseModel):
    account_status: Literal["active", "inactive"]


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


class AdminReportsSummary(BaseModel):
    total_residents: int
    active_residents: int
    total_requests: int
    completed: int
    rejected: int
    completion_rate: float
    rejection_rate: float


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


class AdminReportsResponse(BaseModel):
    summary: AdminReportsSummary
    monthly: list[AdminReportsMonthlyPoint]
    residents_by_purok: list[AdminPurokCount]
    document_types: list[AdminDocumentTypeCount]
    export_requests: list[AdminReportsExportRow]
