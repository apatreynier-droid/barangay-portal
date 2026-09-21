import type { AuthUser } from "./api";

export const LOGIN_PATH = "/login";
export const CREATE_ACCOUNT_PATH = "/create-account";
export const FORGOT_PASSWORD_PATH = "/forgot-password";
/** Target of the link inside the password-reset email. */
export const RESET_PASSWORD_PATH = "/reset-password";

export const RESIDENT_HOME_PATH = "/resident/dashboard";
/** Old dashboard URL kept as a redirect target for bookmarks/links. */
export const LEGACY_RESIDENT_HOME_PATH = "/dashboardResident";
export const RESIDENT_MY_REQUESTS_PATH = "/myRequests";
export const RESIDENT_REQUEST_HISTORY_PATH = "/requestHistory";
export const RESIDENT_REQUEST_DOCUMENT_PATH = "/requestDocument";
export const NOTIFICATIONS_PATH = "/notifications";

export const ADMIN_HOME_PATH = "/AdminDashboard";
export const ADMIN_RESIDENTS_PATH = "/AdminResidents";
export const ADMIN_DOCUMENT_REQUESTS_PATH = "/AdminDocumentRequests";
export const ADMIN_REQUEST_HISTORY_PATH = "/AdminRequestHistory";
export const ADMIN_DOCUMENT_MANAGEMENT_PATH = "/AdminDocumentManagement";
export const ADMIN_APPROVALS_PATH = "/AdminApprovals";
export const ADMIN_REPORTS_PATH = "/AdminReports";

export const isAdminUser = (user: AuthUser | null): boolean =>
  user?.role === "admin";

/** The authorized landing path for the given user (login when logged out). */
export const getHomePath = (user: AuthUser | null): string => {
  if (!user) {
    return LOGIN_PATH;
  }

  return isAdminUser(user) ? ADMIN_HOME_PATH : RESIDENT_HOME_PATH;
};
