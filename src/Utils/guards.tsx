import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import {
  ADMIN_HOME_PATH,
  getHomePath,
  isAdminUser,
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
 * Allows access to administrators only.
 * Logged-out visitors go to Login; authenticated residents are sent to their
 * own dashboard instead of the requested Admin page.
 */
export function RequireAdmin({ user, children }: GuardProps) {
  if (!user) {
    return <Navigate to={LOGIN_PATH} replace />;
  }

  if (!isAdminUser(user)) {
    return <Navigate to={RESIDENT_HOME_PATH} replace />;
  }

  return <>{children(user)}</>;
}

/**
 * Allows access to residents only.
 * Logged-out visitors go to Login; administrators are sent to the Admin
 * Dashboard instead of the requested Resident page.
 */
export function RequireResident({ user, children }: GuardProps) {
  if (!user) {
    return <Navigate to={LOGIN_PATH} replace />;
  }

  if (isAdminUser(user)) {
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
