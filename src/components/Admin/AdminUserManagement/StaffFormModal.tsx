import { useState } from "react";
import "../../../Styles/Admin/Components/StaffFormModal.css";
import type {
  AdminStaffAccount,
  AdminStaffAccountStatus,
  AdminStaffFormErrors,
  AdminStaffRole,
} from "../../../Types/Admin/AdminUserManagementType";
import {
  MIN_PASSWORD_LENGTH,
  canChangeStaffRole,
  getAssignableRoles,
  getStaffRoleMeta,
  validateStaffForm,
} from "../../../Utils/Admin/AdminUserManagementLogic";
import { ApiError, createStaffAccount, updateStaffAccount } from "../../../Utils/Shared/api";

type StaffFormModalProps = {
  /** "create" renders the Add Staff form, "edit" the Edit Staff form. */
  mode: "create" | "edit";
  /** Required when mode is "edit": the row that was opened. */
  account?: AdminStaffAccount | null;
  actorId: number;
  actorRole: string;
  onClose: () => void;
  /** Called with the confirmation message once the API saved the account. */
  onSaved: (message: string) => void;
};

const STATUS_OPTIONS: AdminStaffAccountStatus[] = ["active", "inactive"];

const StaffFormModal = ({
  mode,
  account = null,
  actorId,
  actorRole,
  onClose,
  onSaved,
}: StaffFormModalProps) => {
  const isEdit = mode === "edit" && account !== null;
  const assignableRoles = getAssignableRoles(actorRole);
  // Only a Super Admin may change a role, and never their own (backend rule).
  const roleEditable = isEdit
    ? canChangeStaffRole(actorRole, actorId, account as AdminStaffAccount)
    : true;
  // While editing, the current role must stay visible - also when the
  // signed-in administrator may not assign it.
  const roleOptions: AdminStaffRole[] =
    isEdit && account && !assignableRoles.includes(account.role)
      ? [account.role, ...assignableRoles]
      : assignableRoles;

  const [form, setForm] = useState({
    first_name: account?.first_name ?? "",
    last_name: account?.last_name ?? "",
    email: account?.email ?? "",
    password: "",
    confirmPassword: "",
  });
  const [role, setRole] = useState<AdminStaffRole>(account?.role ?? "staff");
  const [accountStatus, setAccountStatus] =
    useState<AdminStaffAccountStatus>("active");
  const [errors, setErrors] = useState<AdminStaffFormErrors>({});
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const updateField = (
    field: "first_name" | "last_name" | "email" | "password" | "confirmPassword",
    value: string,
  ) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();

  const handleSave = async () => {
    const validation = validateStaffForm(form, !isEdit, MIN_PASSWORD_LENGTH);

    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      setError("");
      return;
    }

    setErrors({});
    setError("");
    setIsSaving(true);

    try {
      if (isEdit && account) {
        const updated = await updateStaffAccount(account.id, {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          role,
        });
        onSaved(`${updated.name} (${updated.staff_code}) was updated.`);
      } else {
        const created = await createStaffAccount({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          password: form.password,
          role,
          account_status: accountStatus,
        });
        onSaved(
          `${created.name} (${created.staff_code}) was added as ${
            getStaffRoleMeta(created.role).label
          }.`,
        );
      }
    } catch (saveError) {
      setError(
        saveError instanceof ApiError
          ? saveError.message
          : "Could not save the staff account. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="staff-form-backdrop" onClick={onClose} role="presentation">
      <div
        className="staff-form-modal"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? `Edit ${account?.name}` : "Add staff account"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="staff-form-header">
          <div>
            <p className="staff-form-label">
              {isEdit
                ? `${account?.staff_code} · ${account?.name}`
                : "New account"}
            </p>
            <h2>{isEdit ? "Edit Staff Account" : "Add Staff Account"}</h2>
          </div>

          <button
            type="button"
            className="staff-form-close"
            onClick={onClose}
            aria-label="Close staff form"
          >
            ✕
          </button>
        </div>

        <div className="staff-form-body">
          {error && (
            <p className="staff-form-error" role="alert">
              {error}
            </p>
          )}

          <div className="staff-form-grid">
            <label className="staff-form-field">
              <span>First Name *</span>
              <input
                type="text"
                value={form.first_name}
                onChange={(event) =>
                  updateField("first_name", event.target.value)
                }
                maxLength={100}
              />
              {errors.first_name && (
                <em className="staff-form-hint">{errors.first_name}</em>
              )}
            </label>

            <label className="staff-form-field">
              <span>Last Name *</span>
              <input
                type="text"
                value={form.last_name}
                onChange={(event) =>
                  updateField("last_name", event.target.value)
                }
                maxLength={100}
              />
              {errors.last_name && (
                <em className="staff-form-hint">{errors.last_name}</em>
              )}
            </label>

            <label className="staff-form-field staff-form-field-wide">
              <span>Email *</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                maxLength={255}
              />
              {errors.email && (
                <em className="staff-form-hint">{errors.email}</em>
              )}
            </label>

            <label className="staff-form-field">
              <span>Role</span>
              <select
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as AdminStaffRole)
                }
                disabled={!roleEditable}
              >
                {roleOptions.map((option) => (
                  <option key={option} value={option}>
                    {getStaffRoleMeta(option).label}
                  </option>
                ))}
              </select>
              {!roleEditable && (
                <em className="staff-form-hint">
                  {isEdit && account && account.id === actorId
                    ? "You cannot change your own role."
                    : "Only a Super Admin can change roles."}
                </em>
              )}
            </label>
            {isEdit ? (
              <div className="staff-form-note">
                The password is not edited here. Use <strong>Reset PW</strong> to
                email this account a single-use password reset link.
              </div>
            ) : (
              <>
                <label className="staff-form-field">
                  <span>Account Status</span>
                  <select
                    value={accountStatus}
                    onChange={(event) =>
                      setAccountStatus(
                        event.target.value as AdminStaffAccountStatus,
                      )
                    }
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option === "active" ? "Active" : "Inactive"}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="staff-form-field">
                  <span>Password *</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) =>
                      updateField("password", event.target.value)
                    }
                    maxLength={128}
                    autoComplete="new-password"
                  />
                  {errors.password && (
                    <em className="staff-form-hint">{errors.password}</em>
                  )}
                </label>

                <label className="staff-form-field">
                  <span>Confirm Password *</span>
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(event) =>
                      updateField("confirmPassword", event.target.value)
                    }
                    maxLength={128}
                    autoComplete="new-password"
                  />
                  {errors.confirmPassword && (
                    <em className="staff-form-hint">
                      {errors.confirmPassword}
                    </em>
                  )}
                </label>
              </>
            )}
          </div>
        </div>

        <div className="staff-form-footer">
          <button
            type="button"
            className="staff-form-cancel"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="staff-form-save"
            onClick={() => void handleSave()}
            disabled={isSaving}
          >
            {isSaving
              ? "Saving…"
              : isEdit
                ? "Save Changes"
                : `Add ${fullName || "Staff"}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StaffFormModal;
