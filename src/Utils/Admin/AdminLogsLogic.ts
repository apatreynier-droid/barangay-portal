import {
  Activity,
  CircleCheck,
  CirclePlus,
  CircleX,
  LogIn,
  RefreshCw,
  SquarePen,
  Trash2,
  type LucideIcon,
} from "lucide-react";
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
  icon: LucideIcon;
  className: string;
};

const ACTIVITY_LOG_TYPE_META: Record<string, ActivityLogTypeMeta> = {
  Approve: { label: "Approve", icon: CircleCheck, className: "type-approve" },
  Reject: { label: "Reject", icon: CircleX, className: "type-reject" },
  Status: { label: "Status", icon: RefreshCw, className: "type-status" },
  Update: { label: "Update", icon: SquarePen, className: "type-update" },
  Create: { label: "Create", icon: CirclePlus, className: "type-create" },
  Login: { label: "Login", icon: LogIn, className: "type-login" },
  Delete: { label: "Delete", icon: Trash2, className: "type-reject" },
};

export function getActivityLogTypeMeta(
  actionType: string,
): ActivityLogTypeMeta {
  return (
    ACTIVITY_LOG_TYPE_META[actionType] ?? {
      label: actionType,
      icon: Activity,
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
 * Display name for the Activity Logs "Actor" column. Administrator accounts
 * show as "Administrator" (like getPortalProfileName); others keep their name.
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