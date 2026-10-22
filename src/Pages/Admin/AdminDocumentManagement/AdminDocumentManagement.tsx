import "../../../Styles/Admin/Pages/AdminDashboard.css";
import "../../../Styles/Admin/Pages/AdminDocumentManagement.css";
import { useCallback, useEffect, useState } from "react";
import type { AuthUser } from "../../../Utils/Shared/api";
import {
  fetchAdminDashboard,
  fetchAdminRequestHistory,
  fetchDocumentTypes,
} from "../../../Utils/Shared/api";
import type { AdminRequestHistoryEntry } from "../../../Types/Admin/AdminRequestHistoryType";
import type { DocumentTypeOption } from "../../../Utils/Shared/api";
import { getPortalProfileName } from "../../../Utils/Admin/AdminDisplay";
import AdminSidebar from "../../../components/Admin/AdminDashboard/AdminSidebar";
import AdminTopbar from "../../../components/Admin/AdminDashboard/AdminTopbar";
import useResponsiveSidebar from "../../../Utils/Shared/useResponsiveSidebar";
import {
  getDocumentTemplateMeta,
  getIssuanceStatusMeta,
  previewDocumentTemplate,
  printIssuanceRecord,
  saveIssuanceRecordAsPdf,
} from "../../../Utils/Admin/AdminDocumentManagementLogic";

type AdminDocumentManagementProps = {
  user: AuthUser;
  unreadNotifications: number;
  onDashboard: () => void;
  onResidents: () => void;
  onDocumentRequests: () => void;
  onRequestHistory: () => void;
  onApprovals: () => void;
  onNotifications: () => void;
  onReports: () => void;
  onActivityLogs: () => void;
  onUserManagement: () => void;
  onLogout: () => void;
};

const AdminDocumentManagement = ({
  user,
  unreadNotifications,
  onDashboard,
  onResidents,
  onDocumentRequests,
  onRequestHistory,
  onApprovals,
  onNotifications,
  onReports,
  onActivityLogs,
  onUserManagement,
  onLogout,
}: AdminDocumentManagementProps) => {
  const [templates, setTemplates] = useState<DocumentTypeOption[]>([]);
  const [records, setRecords] = useState<AdminRequestHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarStats, setSidebarStats] = useState({ pending: 0, approved: 0 });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const [documentTypes, historyRecords] = await Promise.all([
        fetchDocumentTypes(),
        fetchAdminRequestHistory(),
      ]);

      setTemplates(documentTypes);
      setRecords(historyRecords);
    } catch {
      setError(
        "Could not load the document management data. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
        // Badges are optional here; the page still loads.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const fullName = getPortalProfileName(user);

  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  return (
    <div className="admin-dashboard">
      <AdminSidebar
        pendingRequests={sidebarStats.pending}
        pendingApprovals={sidebarStats.pending}
        unreadNotifications={unreadNotifications}
        user={user}
        activeItem="document-management"
        onDashboard={onDashboard}
        onResidents={onResidents}
        onDocumentRequests={onDocumentRequests}
        onRequestHistory={onRequestHistory}
        onApprovals={onApprovals}
        onDocumentManagement={() => undefined}
        onReports={onReports}
        onActivityLogs={onActivityLogs}
        onUserManagement={onUserManagement}
        onNotifications={onNotifications}
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
          fullName={fullName || "Administrator"}
          onMenuToggle={toggleDrawer}
          title="Document Management"
          subtitle="Generate and manage official barangay documents."
        />

        {error && (
          <div className="admin-error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadData()}>
              Retry
            </button>
          </div>
        )}

        {isLoading && templates.length === 0 ? (
          <p className="admin-loading-state">Loading the document templates…</p>
        ) : (
          <div className="docmgmt-templates">
            {templates.map((template) => {
              const templateMeta = getDocumentTemplateMeta(
                template.document_name,
              );

              return (
                <article key={template.id} className="docmgmt-template-card">
                  <span
                    className={`docmgmt-template-icon ${templateMeta.className}`}
                    aria-hidden="true"
                  >
                    {templateMeta.icon}
                  </span>

                  <h3 className="docmgmt-template-name">
                    {template.document_name}
                  </h3>
                  <p className="docmgmt-template-description">
                    {template.description?.trim() ||
                      "Official barangay template"}
                  </p>

                  <button
                    type="button"
                    className="docmgmt-preview-button"
                    onClick={() =>
                      previewDocumentTemplate(template.document_name)
                    }
                  >
                    Preview
                  </button>
                </article>
              );
            })}

            {!isLoading && templates.length === 0 && (
              <p className="admin-loading-state">
                No document templates are available yet.
              </p>
            )}
          </div>
        )}

        <h2 className="docmgmt-section-title docmgmt-issuance-title">
          Issuance Records
        </h2>

        {isLoading && records.length === 0 ? (
          <p className="admin-loading-state">Loading the issuance records…</p>
        ) : (
          <div className="docmgmt-table-wrapper">
            <table className="docmgmt-table">
              <thead>
                <tr>
                  <th scope="col">Reference No.</th>
                  <th scope="col">Resident</th>
                  <th scope="col">Document Type</th>
                  <th scope="col">Status</th>
                  <th scope="col">Processed By</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="docmgmt-empty">
                      No issuance records yet.
                    </td>
                  </tr>
                ) : (
                  records.map((record) => {
                    const statusMeta = getIssuanceStatusMeta(record.status);

                    return (
                      <tr key={record.id}>
                        <td className="docmgmt-reference">
                          {record.request_number}
                        </td>
                        <td className="docmgmt-resident">
                          {record.resident_name}
                        </td>
                        <td className="docmgmt-document" title={record.document}>
                          {record.document}
                        </td>
                        <td>
                          <span
                            className={`docmgmt-status ${statusMeta.className}`}
                          >
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="docmgmt-processed">
                          {record.processed_by ?? "—"}
                        </td>
                        <td>
                          <div className="docmgmt-actions">
                            <button
                              type="button"
                              className="docmgmt-action-button docmgmt-print"
                              onClick={() => printIssuanceRecord(record)}
                            >
                              <span aria-hidden="true">🖨</span> Print
                            </button>
                            <button
                              type="button"
                              className="docmgmt-action-button docmgmt-pdf"
                              onClick={() => saveIssuanceRecordAsPdf(record)}
                            >
                              <span aria-hidden="true">↓</span> PDF
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
        )}
      </main>
    </div>
  );
};

export default AdminDocumentManagement;
