/**
 * Display helpers and permission rules for the Admin "User Management" page.
 *
 * The permission helpers mirror the guards enforced by the backend
 * (``assert_role_assignment_allowed`` / ``assert_not_own_role_change`` in
 * backend/app/main.py). They only drive which buttons are usable; the server
 * re-checks every request, so hiding a button is never the protection itself.
 */
import type {
  AdminStaffAccount,
  AdminStaffFormErrors,
  AdminStaffFormValues,
  AdminStaffRole,
} from "../Types/AdminUserManagementType";

/** Matches the backend password rule in app/schemas.py (min_length=6). */
export { MIN_PASSWORD_LENGTH } from "./ResetPasswordLogic";

export type StaffBadgeMeta = {
  label: string;
  className: string;
};

/** Role names mirror ROLE_LABELS in backend/app/main.py. */
const ROLE_META: Record<string, StaffBadgeMeta> = {
  super_admin: { label: "Super Admin", className: "role-super-admin" },
  admin: { label: "Barangay Administrator", className: "role-admin" },
  staff: { label: "Staff", className: "role-staff" },
};

export const getStaffRoleMeta = (role: string): StaffBadgeMeta =>
  ROLE_META[role] ?? { label: role, className: "role-staff" };

const STATUS_META: Record<string, StaffBadgeMeta> = {
  active: { label: "Active", className: "status-active" },
  inactive: { label: "Inactive", className: "status-inactive" },
  suspended: { label: "Suspended", className: "status-suspended" },
};

export const getStaffStatusMeta = (status: string): StaffBadgeMeta =>
  STATUS_META[status] ?? { label: status, className: "status-active" };

/** Roles the signed-in administrator may assign in the Add/Edit form. */
export const getAssignableRoles = (actorRole: string): AdminStaffRole[] =>
  actorRole === "super_admin" ? ["staff", "admin", "super_admin"] : ["staff"];

export const isOwnAccount = (
  actorId: number,
  account: AdminStaffAccount,
): boolean => actorId === account.id;

/** Administrators may only manage staff accounts; Super Admins manage all. */
export const canManageStaffAccount = (
  actorRole: string,
  account: AdminStaffAccount,
): boolean => actorRole === "super_admin" || account.role === "staff";

/** Only a Super Admin may change a role, and never their own. */
export const canChangeStaffRole = (
  actorRole: string,
  actorId: number,
  account: AdminStaffAccount,
): boolean =>
  actorRole === "super_admin" && !isOwnAccount(actorId, account);

/** Activating/deactivating needs permission over the account, never your own. */
export const canToggleStaffStatus = (
  actorRole: string,
  actorId: number,
  account: AdminStaffAccount,
): boolean =>
  canManageStaffAccount(actorRole, account) && !isOwnAccount(actorId, account);

/** Reset PW only needs permission over the account (your own is allowed). */
export const canResetStaffPassword = (
  actorRole: string,
  account: AdminStaffAccount,
): boolean => canManageStaffAccount(actorRole, account);

/** Short explanation used as the tooltip of a disabled action button. */
export const describeActionRestriction = (
  actorRole: string,
  actorId: number,
  account: AdminStaffAccount,
): string => {
  if (!canManageStaffAccount(actorRole, account)) {
    return "Only a Super Admin can manage administrator accounts.";
  }

  if (isOwnAccount(actorId, account)) {
    return "You cannot change your own role or deactivate your own account.";
  }

  return "";
};

export function getStaffInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";

  return `${first}${last}`.toUpperCase() || "?";
}

/** Same muted palette as the residents table, so avatars look consistent. */
export function getStaffAvatarClass(index: number): string {
  const palette = ["1", "2", "3", "4", "5"];
  return `staff-avatar staff-avatar-${palette[index % palette.length]}`;
}

/** "2026-09-04T08:02:00" -> "2026-09-04 08:02" (matches the Activity Logs format). */
export function formatStaffLastLogin(value: string | null): string {
  if (!value) {
    return "Never";
  }

  return `${value.slice(0, 10)} ${value.slice(11, 16)}`;
}

export function formatStaffCreatedAt(value: string): string {
  return value.slice(0, 10);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates the Add/Edit Staff form.
 *
 * ``requiresPassword`` is true for a new account (the password is hashed by the
 * backend) and false when editing, where the password is handled through the
 * existing "Reset PW" email flow instead.
 */
export function validateStaffForm(
  values: AdminStaffFormValues,
  requiresPassword: boolean,
  minPasswordLength: number,
): AdminStaffFormErrors {
  const errors: AdminStaffFormErrors = {};

  if (!values.first_name.trim()) {
    errors.first_name = "First name is required";
  }

  if (!values.last_name.trim()) {
    errors.last_name = "Last name is required";
  }

  if (!values.email.trim()) {
    errors.email = "Email is required";
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = "Please enter a valid email address";
  }

  if (requiresPassword) {
    if (!values.password) {
      errors.password = "Password is required";
    } else if (values.password.length < minPasswordLength) {
      errors.password = `Password must be at least ${minPasswordLength} characters`;
    }

    if (!values.confirmPassword) {
      errors.confirmPassword = "Please confirm the password";
    } else if (values.password !== values.confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }
  }

  return errors;
}
