/**
 * Types for the Admin "User Management" page.
 *
 * The role and status values match the existing database enums
 * (``users.role`` / ``users.account_status``) and the payloads returned by
 * ``/api/admin/staff`` in backend/app/main.py.
 */

/** Roles User Management can list and maintain (residents live on Residents). */
export type AdminStaffRole = "staff" | "admin" | "super_admin";

/** Values of the existing ``users.account_status`` enum. */
export type AdminStaffAccountStatus = "active" | "inactive" | "suspended";

export type AdminStaffAccount = {
  id: number;
  /** Short, stable id shown under the name (e.g. ``ADM-010``). */
  staff_code: string;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  role: AdminStaffRole;
  account_status: AdminStaffAccountStatus;
  /** Most recent recorded sign-in, or ``null`` when the account never signed in. */
  last_login: string | null;
  created_at: string;
};

export type AdminStaffCreatePayload = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role: AdminStaffRole;
  account_status: AdminStaffAccountStatus;
};

export type AdminStaffUpdatePayload = {
  first_name: string;
  last_name: string;
  email: string;
  role: AdminStaffRole;
};

/** Fields validated in the Add/Edit Staff form. */
export type AdminStaffFormValues = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type AdminStaffFormErrors = Partial<
  Record<keyof AdminStaffFormValues, string>
>;
