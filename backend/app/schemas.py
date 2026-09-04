from __future__ import annotations

from datetime import date, datetime

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
