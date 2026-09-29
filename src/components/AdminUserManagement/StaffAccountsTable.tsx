import type { AdminStaffAccount } from "../../Types/AdminUserManagementType";
import {
  canManageStaffAccount,
  canResetStaffPassword,
  canToggleStaffStatus,
  describeActionRestriction,
  formatStaffLastLogin,
  getStaffAvatarClass,
  getStaffInitials,
  getStaffRoleMeta,
  getStaffStatusMeta,
} from "../../Utils/AdminUserManagementLogic";

type StaffAccountsTableProps = {
  accounts: AdminStaffAccount[];
  /** Id and role of the signed-in administrator (drives the allowed actions). */
  actorId: number;
  actorRole: string;
  onEdit: (account: AdminStaffAccount) => void;
  onToggleStatus: (account: AdminStaffAccount) => void;
  onResetPassword: (account: AdminStaffAccount) => void;
};

const StaffAccountsTable = ({
  accounts,
  actorId,
  actorRole,
  onEdit,
  onToggleStatus,
  onResetPassword,
}: StaffAccountsTableProps) => {
  return (
    <div className="staff-table-card">
      <table className="staff-table">
        <thead>
          <tr>
            <th>Staff</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Last Login</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {accounts.length === 0 ? (
            <tr>
              <td className="staff-empty" colSpan={6}>
                No staff accounts found.
              </td>
            </tr>
          ) : (
            accounts.map((account, index) => {
              const roleMeta = getStaffRoleMeta(account.role);
              const statusMeta = getStaffStatusMeta(account.account_status);
              const isActive = account.account_status === "active";
              const restriction = describeActionRestriction(
                actorRole,
                actorId,
                account,
              );
              // Editing covers the account's own information (name/email) for
              // the signed-in user as well; the role select is locked there.
              const canEdit = canManageStaffAccount(actorRole, account);
              const canToggle = canToggleStaffStatus(actorRole, actorId, account);
              const canReset = canResetStaffPassword(actorRole, account);

              return (
                <tr key={account.id}>
                  <td className="staff-cell-primary" data-label="Staff">
                    <div className="staff-account-cell">
                      <span className={getStaffAvatarClass(index)}>
                        {getStaffInitials(account.name)}
                      </span>
                      <div className="staff-account-info">
                        <strong>{account.name}</strong>
                        <span className="staff-account-code">
                          {account.staff_code}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td data-label="Email">
                    <span className="staff-email">{account.email}</span>
                  </td>

                  <td data-label="Role">
                    <span className={`staff-role ${roleMeta.className}`}>
                      {roleMeta.label}
                    </span>
                  </td>

                  <td data-label="Status">
                    <span className={`staff-status ${statusMeta.className}`}>
                      {statusMeta.label}
                    </span>
                  </td>

                  <td data-label="Last Login">
                    <span className="staff-last-login">
                      {formatStaffLastLogin(account.last_login)}
                    </span>
                  </td>

                  <td data-label="Actions">
                    <div className="staff-actions">
                      <button
                        type="button"
                        className="staff-action-button edit"
                        onClick={() => onEdit(account)}
                        disabled={!canEdit}
                        title={canEdit ? undefined : restriction}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className={`staff-action-button ${
                          isActive ? "deactivate" : "activate"
                        }`}
                        onClick={() => onToggleStatus(account)}
                        disabled={!canToggle}
                        title={canToggle ? undefined : restriction}
                      >
                        {isActive ? "Deactivate" : "Activate"}
                      </button>

                      <button
                        type="button"
                        className="staff-action-button reset"
                        onClick={() => onResetPassword(account)}
                        disabled={!canReset}
                        title={canReset ? undefined : restriction}
                      >
                        Reset PW
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default StaffAccountsTable;
