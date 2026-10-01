import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import {
  ADMIN_HOME_PATH,
  getHomePath,
  isAdminPortalUser,
  isAdministrator,
  LOGIN_PATH,
  RESIDENT_HOME_PATH,
} from "./routePaths";
import type { AuthUser } from "./api";

type GuardProps = {
  user: AuthUser | null;
  children: (authUser: AuthUser) => ReactNode;
};

/**
 * Allows access to any authenticated user, regardless of role.
 * Logged-out visitors are redirected to the Login page.
 */
export function RequireAuth({ user, children }: GuardProps) {
  if (!user) {
    return <Navigate to={LOGIN_PATH} replace />;
  }

  return <>{children(user)}</>;
}

/**
 * Allows access to the Admin Portal pages shared by Staff and Administrators
 * (dashboard, residents, document requests, request history...).
 * Logged-out visitors go to Login; residents are sent back to their own
 * dashboard instead of the requested Admin page.
 */
export function RequireAdminPortal({ user, children }: GuardProps) {
  if (!user) {
    return <Navigate to={LOGIN_PATH} replace />;
  }

  if (!isAdminPortalUser(user)) {
    return <Navigate to={RESIDENT_HOME_PATH} replace />;
  }

  return <>{children(user)}</>;
}

/**
 * Allows access to administrator-only pages (User Management, Reports,
 * Activity Logs). A Staff account is redirected to the Admin Dashboard, never
 * to the Resident Portal.
 */
export function RequireAdministrator({ user, children }: GuardProps) {
  if (!user) {
    return <Navigate to={LOGIN_PATH} replace />;
  }

  if (!isAdministrator(user)) {
    return (
      <Navigate
        to={isAdminPortalUser(user) ? ADMIN_HOME_PATH : RESIDENT_HOME_PATH}
        replace
      />
    );
  }

  return <>{children(user)}</>;
}

/**
 * Allows access to residents only.
 * Logged-out visitors go to Login; Staff and Administrators are sent to the
 * Admin Portal instead of the requested Resident page.
 */
export function RequireResident({ user, children }: GuardProps) {
  if (!user) {
    return <Navigate to={LOGIN_PATH} replace />;
  }

  if (isAdminPortalUser(user)) {
    return <Navigate to={ADMIN_HOME_PATH} replace />;
  }

  return <>{children(user)}</>;
}

/**
 * Public pages (Login, Create Account, Forgot Password).
 * Authenticated users are redirected to their role's home dashboard.
 */
export function PublicOnly({
  user,
  children,
}: {
  user: AuthUser | null;
  children: ReactNode;
}) {
  if (user) {
    return <Navigate to={getHomePath(user)} replace />;
  }

  return <>{children}</>;
}

/**
 * Root ("/") and any unknown URL: always Login when logged out,
 * otherwise the role's home dashboard.
 */
export function HomeRoute({ user }: { user: AuthUser | null }) {
  return <Navigate to={getHomePath(user)} replace />;
}
