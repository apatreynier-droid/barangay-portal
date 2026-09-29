import "../AdminDashboard/AdminDashboard.css";
import "./AdminUserManagement.css";
import { useCallback, useEffect, useState } from "react";
import type { AuthUser } from "../../Utils/api";
import {
  fetchAdminDashboard,
  fetchStaffAccounts,
  resetStaffPassword,
  updateStaffAccountStatus,
} from "../../Utils/api";
import type { AdminStaffAccount } from "../../Types/AdminUserManagementType";
import { ADMIN_DISPLAY_NAME } from "../../Utils/AdminDisplay";
import AdminSidebar from "../../components/AdminDashboard/AdminSidebar";
import AdminTopbar from "../../components/AdminDashboard/AdminTopbar";
import useResponsiveSidebar from "../../Utils/useResponsiveSidebar";
import StaffAccountsTable from "../../components/AdminUserManagement/StaffAccountsTable";
import StaffFormModal from "../../components/AdminUserManagement/StaffFormModal";
import StaffActionConfirmModal from "../../components/AdminUserManagement/StaffActionConfirmModal";
import type { StaffActionMode } from "../../components/AdminUserManagement/StaffActionConfirmModal";

type AdminUserManagementProps = {
  user: AuthUser;
  unreadNotifications: number;
  onDashboard: () => void;
  onResidents: () => void;
  onDocumentRequests: () => void;
  onRequestHistory: () => void;
  onApprovals: () => void;
  onDocumentManagement: () => void;
  onReports: () => void;
  onActivityLogs: () => void;
  onNotifications: () => void;
  onLogout: () => void;
};

type StaffFormState =
  | { mode: "create" }
  | { mode: "edit"; account: AdminStaffAccount };

type StaffConfirmState = {
  mode: StaffActionMode;
  account: AdminStaffAccount;
};

const AdminUserManagement = ({
  user,
  unreadNotifications,
  onDashboard,
  onResidents,
  onDocumentRequests,
  onRequestHistory,
  onApprovals,
  onDocumentManagement,
  onReports,
  onActivityLogs,
  onNotifications,
  onLogout,
}: AdminUserManagementProps) => {
  const [accounts, setAccounts] = useState<AdminStaffAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formState, setFormState] = useState<StaffFormState | null>(null);
  const [confirmState, setConfirmState] = useState<StaffConfirmState | null>(
    null,
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [sidebarStats, setSidebarStats] = useState({ pending: 0, approved: 0 });

  const loadAccounts = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      setAccounts(await fetchStaffAccounts());
    } catch {
      setError("Could not load the staff accounts. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  // Sidebar badges stay consistent with the dashboard without blocking the page.
  useEffect(() => {
    let cancelled = false;

    fetchAdminDashboard()
      .then((data) => {
        if (!cancelled) {
          setSidebarStats({
            pending: data.stats.pending,
            approved: data.stats.approved,
          });
        }
      })
      .catch(() => {
        // Badges are optional here; the staff list still loads.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Every action below calls the API first and re-reads the list afterwards,
   * so the table always shows what the database actually contains.
   */
  const handleSaved = (message: string) => {
    setFormState(null);
    setActionError("");
    setNotice(message);
    void loadAccounts();
  };

  const handleConfirm = async () => {
    if (!confirmState) {
      return;
    }

    const { mode, account } = confirmState;
    setIsProcessing(true);
    setActionError("");

    try {
      if (mode === "reset-password") {
        const message = await resetStaffPassword(account.id);
        setNotice(
          message || `A password reset link was sent to ${account.email}.`,
        );
      } else {
        const deactivating = mode === "deactivate";
        const updated = await updateStaffAccountStatus(
          account.id,
          deactivating ? "inactive" : "active",
        );
        setNotice(
          `${updated.name} (${updated.staff_code}) was ${
            deactivating ? "deactivated" : "activated"
          }.`,
        );
      }

      setConfirmState(null);
      await loadAccounts();
    } catch (actionFailure) {
      setActionError(
        actionFailure instanceof Error
          ? actionFailure.message
          : "Could not complete the action. Please try again.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const roleLabel = user.role === "super_admin" ? "Super Admin" : "Brgy. Administrator";
  const staffCountLabel = `${accounts.length} staff account${
    accounts.length === 1 ? "" : "s"
  }`;

  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  return (
    <div className="admin-dashboard">
      <AdminSidebar
        pendingRequests={sidebarStats.pending}
        pendingApprovals={sidebarStats.approved}
        unreadNotifications={unreadNotifications}
        firstName={ADMIN_DISPLAY_NAME}
        lastName=""
        role={roleLabel}
        activeItem="user-management"
        onDashboard={onDashboard}
        onResidents={onResidents}
        onDocumentRequests={onDocumentRequests}
        onRequestHistory={onRequestHistory}
        onApprovals={onApprovals}
        onDocumentManagement={onDocumentManagement}
        onReports={onReports}
        onActivityLogs={onActivityLogs}
        onNotifications={onNotifications}
        onUserManagement={() => undefined}
        onLogout={onLogout}
        isOpen={isDrawerOpen}
        onNavigate={closeDrawer}
      />

      {isDrawerOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={closeDrawer}
        />
      )}

      <main className="admin-main">
        <AdminTopbar
          fullName={ADMIN_DISPLAY_NAME || "Administrator"}
          onMenuToggle={toggleDrawer}
          title="User Management"
          subtitle="Manage staff accounts and roles."
        />

        {error && (
          <div className="admin-error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadAccounts()}>
              Retry
            </button>
          </div>
        )}

        {notice && (
          <div className="staff-notice-banner" role="status">
            <span>{notice}</span>
            <button
              type="button"
              aria-label="Dismiss message"
              onClick={() => setNotice("")}
            >
              ✕
            </button>
          </div>
        )}

        <div className="staff-toolbar">
          <p className="staff-count">{staffCountLabel}</p>
          <button
            type="button"
            className="staff-add-button"
            onClick={() => {
              setActionError("");
              setFormState({ mode: "create" });
            }}
          >
            + Add Staff
          </button>
        </div>

        {isLoading && accounts.length === 0 ? (
          <p className="admin-loading-state">Loading the staff accounts…</p>
        ) : (
          <StaffAccountsTable
            accounts={accounts}
            actorId={user.id}
            actorRole={user.role}
            onEdit={(account) => {
              setActionError("");
              setFormState({ mode: "edit", account });
            }}
            onToggleStatus={(account) => {
              setActionError("");
              setConfirmState({
                mode: account.account_status === "active" ? "deactivate" : "activate",
                account,
              });
            }}
            onResetPassword={(account) => {
              setActionError("");
              setConfirmState({ mode: "reset-password", account });
            }}
          />
        )}
      </main>

      {formState && (
        <StaffFormModal
          mode={formState.mode}
          account={formState.mode === "edit" ? formState.account : null}
          actorId={user.id}
          actorRole={user.role}
          onClose={() => setFormState(null)}
          onSaved={handleSaved}
        />
      )}

      {confirmState && (
        <StaffActionConfirmModal
          mode={confirmState.mode}
          accountName={confirmState.account.name}
          accountEmail={confirmState.account.email}
          isProcessing={isProcessing}
          error={actionError}
          onCancel={() => {
            setActionError("");
            setConfirmState(null);
          }}
          onConfirm={() => void handleConfirm()}
        />
      )}
    </div>
  );
};

export default AdminUserManagement;
