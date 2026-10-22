export const getAdminStatusClass = (status: string): string => {
  switch (status) {
    case "Pending":
      return "status-pending";

    case "Processing":
      return "status-processing";

    case "Ready for Pickup":
      return "status-approved";

    case "Completed":
      return "status-completed";

    case "Rejected":
      return "status-rejected";

    default:
      return "";
  }
};

export const getAdminStatusLabel = (status: string): string => {
  if (status === "Ready for Pickup") {
    return "Approved";
  }

  return status;
};

export const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);

  if (parts.length === 0 || parts[0] === "") {
    return "?";
  }

  const first = parts[0].charAt(0);
  const last =
    parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";

  return (first + last).toUpperCase();
};

const AVATAR_CLASS_COUNT = 5;

export const getAvatarClass = (name: string): string => {
  let hash = 0;

  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 997;
  }

  return `admin-avatar-${(hash % AVATAR_CLASS_COUNT) + 1}`;
};

export const formatShortDate = (value: string): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const formatRelativeTime = (value: string): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 1000),
  );

  if (seconds < 60) {
    return "Just now";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }

  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
};

/**
 * MySQL timestamps arrive without a timezone marker; treat them as UTC.
 * Shared by the Admin Notifications page and the dashboard's notification
 * card so both render the exact same relative times.
 */
export const toUtcTimestamp = (value: string): string => {
  const trimmed = value.trim();

  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return value;
  }

  return `${trimmed}Z`;
};

/**
 * Request-status filter used by the dashboard's compact status strip.
 * The raw stored statuses come from the API; the strip presents "Approved"
 * as the alias for "Ready for Pickup" (same mapping as
 * getAdminStatusLabel above).
 */
export type AdminStatusFilter = "all" | "Pending" | "Ready for Pickup" | "Processing";

type AdminStatusFilterOption = {
  key: AdminStatusFilter;
  label: string;
};

/** The strip's chips, in display order. "All" resets the filter. */
export const ADMIN_STATUS_FILTER_OPTIONS: readonly AdminStatusFilterOption[] = [
  { key: "all", label: "All" },
  { key: "Pending", label: "Pending" },
  { key: "Ready for Pickup", label: "Approved" },
  { key: "Processing", label: "Processing" },
] as const;

/** True when a request matches the active strip filter ("all" matches every row). */
export const matchesAdminStatusFilter = (
  status: string,
  filter: AdminStatusFilter,
): boolean => filter === "all" || status === filter;
