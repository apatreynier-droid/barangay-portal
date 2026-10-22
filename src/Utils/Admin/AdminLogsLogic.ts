import type { AdminActivityLog } from "../../Types/Admin/AdminLogsType";
import { ADMIN_DISPLAY_NAME } from "./AdminDisplay";

export type ActivityLogsFiltersState = {
  search: string;
  actionType: string;
};

export const DEFAULT_ACTIVITY_LOGS_FILTERS: ActivityLogsFiltersState = {
  search: "",
  actionType: "all",
};

/** Action types shown in the filter dropdown (matches the backend enum). */
export const ACTIVITY_LOG_TYPE_OPTIONS = [
  "Approve",
  "Reject",
  "Status",
  "Update",
  "Create",
  "Login",
] as const;

export type ActivityLogTypeMeta = {
  label: string;
  icon: string;
  className: string;
};

const ACTIVITY_LOG_TYPE_META: Record<string, ActivityLogTypeMeta> = {
  Approve: { label: "Approve", icon: "✓", className: "type-approve" },
  Reject: { label: "Reject", icon: "✗", className: "type-reject" },
  Status: { label: "Status", icon: "⟳", className: "type-status" },
  Update: { label: "Update", icon: "✎", className: "type-update" },
  Create: { label: "Create", icon: "+", className: "type-create" },
  Login: { label: "Login", icon: "🔑", className: "type-login" },
  Delete: { label: "Delete", icon: "🗑", className: "type-reject" },
};

export function getActivityLogTypeMeta(
  actionType: string,
): ActivityLogTypeMeta {
  return (
    ACTIVITY_LOG_TYPE_META[actionType] ?? {
      label: actionType,
      icon: "•",
      className: "type-update",
    }
  );
}

/** "2026-09-04T07:45:00" -> "2026-09-04 07:45" (format used in the table). */
export function formatLogTimestamp(value: string): string {
  return `${value.slice(0, 10)} ${value.slice(11, 16)}`;
}

export function formatLogActorRole(role: string): string {
  if (role === "admin") {
    return "Administrator";
  }

  if (role === "super_admin") {
    return "Super Admin";
  }

  if (role === "staff") {
    return "Staff";
  }

  if (role === "resident") {
    return "Resident";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Display name shown in the Activity Logs "Actor" column.
 *
 * Display-only mapping: administrator accounts (admin and super_admin) are
 * presented as "Administrator", mirroring getPortalProfileName in AdminDisplay;
 * staff and resident actors keep their stored name. The underlying log rows,
 * profile, credentials, role, and permissions are not modified.
 */
export function formatLogActorName(
  actorName: string,
  actorRole: string,
): string {
  return actorRole === "admin" || actorRole === "super_admin"
    ? ADMIN_DISPLAY_NAME
    : actorName;
}

export function filterActivityLogs(
  logs: AdminActivityLog[],
  filters: ActivityLogsFiltersState,
): AdminActivityLog[] {
  const search = filters.search.trim().toLowerCase();

  return logs.filter((log) => {
    if (filters.actionType !== "all" && log.action_type !== filters.actionType) {
      return false;
    }

    if (search) {
      const haystack =
        `${log.actor_name} ${log.action} ${log.target}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}