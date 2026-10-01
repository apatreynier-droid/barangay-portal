import type { AuthUser } from "./api";

// Display name shown for the administrator throughout the Admin Portal
// (sidebar, topbar/profile, and page headings). Intentionally independent
// from the account's stored first/last name and credentials.
export const ADMIN_DISPLAY_NAME = "Administrator";

/**
 * Name shown in the Admin Portal profile (sidebar footer and topbar).
 *
 * Administrators keep the generic "Administrator" display; Staff accounts show
 * their own name so the shared portal makes clear who is signed in.
 */
export const getPortalProfileName = (user: AuthUser): string =>
  user.role === "staff"
    ? `${user.first_name} ${user.last_name}`.trim() || ADMIN_DISPLAY_NAME
    : ADMIN_DISPLAY_NAME;

/**
 * Role label shown under the profile name (sidebar footer). Mirrors
 * ROLE_LABELS in backend/app/main.py.
 */
export const getPortalRoleLabel = (user: AuthUser): string => {
  if (user.role === "staff") {
    return "Staff";
  }

  if (user.role === "super_admin") {
    return "Super Admin";
  }

  return "Brgy. Administrator";
};

/** First name for the shared sidebar footer (blank for administrators). */
export const getPortalFirstName = (user: AuthUser): string =>
  user.role === "staff" ? user.first_name : ADMIN_DISPLAY_NAME;

/** Last name for the shared sidebar footer (blank for administrators). */
export const getPortalLastName = (user: AuthUser): string =>
  user.role === "staff" ? user.last_name : "";