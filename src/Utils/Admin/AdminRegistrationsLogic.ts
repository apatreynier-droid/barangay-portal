import type { AdminRegistration } from "../../Types/Admin/AdminRegistrationsType";
import { toUtcTimestamp } from "./AdminDashboardLogic";

export const PENDING_REGISTRATION_STATUS = "pending";

const MANILA_TIMEZONE = "Asia/Manila";

const manilaDateTimeFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: MANILA_TIMEZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// The en-CA locale formats dates as YYYY-MM-DD, the same shape as the date filters.
const manilaDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: MANILA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type RegistrationFiltersState = {
  search: string;
  status: string;
  dateFrom: string;
  dateTo: string;
};

export const DEFAULT_REGISTRATION_FILTERS: RegistrationFiltersState = {
  search: "",
  status: PENDING_REGISTRATION_STATUS,
  dateFrom: "",
  dateTo: "",
};

export const REGISTRATION_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "inactive", label: "Deactivated" },
];

type StatusMeta = { label: string; className: string };

const STATUS_META: Record<string, StatusMeta> = {
  pending: { label: "Pending", className: "status-pending" },
  active: { label: "Active", className: "status-completed" },
  rejected: { label: "Rejected", className: "status-rejected" },
  inactive: { label: "Deactivated", className: "status-deactivated" },
  suspended: { label: "Deactivated", className: "status-deactivated" },
};

export function getRegistrationStatusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? { label: status, className: "status-pending" };
}

const EMAIL_STATUS_LABELS: Record<string, string> = {
  sent: "Delivered",
  pending: "Queued",
  sending: "Sending",
  failed: "Not delivered",
  skipped: "Not sent",
};

export function getEmailStatusLabel(status: string): string {
  return EMAIL_STATUS_LABELS[status] ?? status;
}

/** Backend timestamps are UTC; every registration time is shown in Philippine time. */
export function formatManilaDateTime(value: string): string {
  const parsed = new Date(toUtcTimestamp(value));
  return Number.isNaN(parsed.getTime())
    ? value
    : manilaDateTimeFormat.format(parsed);
}

function manilaDay(value: string): string {
  const parsed = new Date(toUtcTimestamp(value));
  return Number.isNaN(parsed.getTime()) ? "" : manilaDayFormat.format(parsed);
}

export function countPendingRegistrations(
  registrations: AdminRegistration[],
): number {
  return registrations.filter(
    (registration) => registration.status === PENDING_REGISTRATION_STATUS,
  ).length;
}

export function filterRegistrations(
  registrations: AdminRegistration[],
  filters: RegistrationFiltersState,
): AdminRegistration[] {
  const search = filters.search.trim().toLowerCase();

  return registrations.filter((registration) => {
    if (filters.status !== "all" && registration.status !== filters.status) {
      return false;
    }

    if (
      search &&
      !`${registration.name} ${registration.email} ${registration.resident_code}`
        .toLowerCase()
        .includes(search)
    ) {
      return false;
    }

    const day = manilaDay(registration.registered_at);
    if (filters.dateFrom && day < filters.dateFrom) return false;
    if (filters.dateTo && day > filters.dateTo) return false;

    return true;
  });
}
