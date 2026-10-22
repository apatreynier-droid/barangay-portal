import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ChangeEvent, FormEvent } from "react";
import Sidebar from "../../../components/Resident/Dashboard/Sidebar";
import {
  ApiError,
  createDocumentRequest,
  fetchDocumentTypes,
  type DocumentTypeOption,
  type AuthUser,
} from "../../../Utils/Shared/api";
import { RESIDENT_ROLE_LABEL } from "../../../Utils/Resident/ResidentDisplay";
import { POTHOLE_DETECTION_PATH, RESIDENT_REQUEST_DOCUMENT_PATH } from "../../../Utils/Shared/routePaths";
import useResponsiveSidebar from "../../../Utils/Shared/useResponsiveSidebar";
import MobileMenuButton from "../../../components/Shared/MobileMenuButton";
import "../../../Styles/Resident/Pages/Dashboard.css";
import "../../../Styles/Resident/Pages/RequestDocumentPage.css";

type RequestDocumentPageProps = {
  user: AuthUser;
  onBackToDashboard: () => void;
  onMyRequests: () => void;
  onRequestHistory: () => void;
  onNotifications: () => void;
  onRequestSubmitted: () => void;
  onSessionExpired: () => void;
  onLogout: () => void;
};

type RequestFormData = {
  documentTypeId: string;
  purpose: string;
};

function RequestDocumentPage({
  user,
  onBackToDashboard,
  onMyRequests,
  onRequestHistory,
  onNotifications,
  onRequestSubmitted,
  onSessionExpired,
  onLogout,
}: RequestDocumentPageProps) {
  const navigate = useNavigate();
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [isLoadingTypes, setIsLoadingTypes] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<RequestFormData>({
    documentTypeId: "",
    purpose: "",
  });
  const [formError, setFormError] = useState("");

  const { isDrawerOpen, closeDrawer, toggleDrawer } = useResponsiveSidebar();

  useEffect(() => {
    let cancelled = false;

    const loadDocumentTypes = async () => {
      try {
        const types = await fetchDocumentTypes();

        if (cancelled) return;

        setDocumentTypes(types);
        setFormData((current) => ({
          ...current,
          documentTypeId: current.documentTypeId || String(types[0]?.id ?? ""),
        }));
      } catch (error) {
        if (cancelled) return;

        if (error instanceof ApiError && error.status === 401) {
          onSessionExpired();
          return;
        }

        setFormError(
          error instanceof ApiError
            ? error.message
            : "Could not load document types.",
        );
      } finally {
        if (!cancelled) {
          setIsLoadingTypes(false);
        }
      }
    };

    void loadDocumentTypes();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (
    event: ChangeEvent<HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
    setFormError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const documentTypeId = Number(formData.documentTypeId);

    if (!documentTypeId) {
      setFormError("Please choose a document type.");
      return;
    }

    if (!formData.purpose.trim()) {
      setFormError("Please tell us why you need this document.");
      return;
    }

    setIsSubmitting(true);
    setFormError("");

    try {
      await createDocumentRequest(documentTypeId, formData.purpose.trim());
      onRequestSubmitted();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }

      setFormError(
        error instanceof ApiError
          ? error.message
          : "Could not submit your request. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="request-document-layout">
      <Sidebar
        activePage="request-document"
        onDashboard={onBackToDashboard}
        onMyRequests={onMyRequests}
        onRequestHistory={onRequestHistory}
        onNotifications={onNotifications}
        onRequestDocument={() => navigate(RESIDENT_REQUEST_DOCUMENT_PATH)}
        onPotholeDetection={() => navigate(POTHOLE_DETECTION_PATH)}
        onLogout={onLogout}
        firstName={user.first_name}
        lastName={user.last_name}
        role={RESIDENT_ROLE_LABEL}
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

      <main className="request-document-page">
        <header className="request-document-header">
          <div className="topbar-leading">
            {toggleDrawer && <MobileMenuButton onOpen={toggleDrawer} />}

            <div>
              <p className="page-label">Resident Portal</p>
              <h1>Request a Document</h1>
              <p>Submit a document request for review by the Barangay Hall.</p>
            </div>
          </div>
        </header>

        <section
          className="request-document-card"
          aria-labelledby="document-form-title"
        >
          <div className="request-document-card-header">
            <h2 id="document-form-title">Request details</h2>
            <p>Fields marked with an asterisk are required.</p>
          </div>

          <form className="request-document-form" onSubmit={handleSubmit}>
            <label htmlFor="documentTypeId">Document type *</label>
            <select
              id="documentTypeId"
              name="documentTypeId"
              value={formData.documentTypeId}
              onChange={handleChange}
              disabled={isLoadingTypes || isSubmitting}
            >
              {isLoadingTypes ? (
                <option>Loading document types…</option>
              ) : documentTypes.length === 0 ? (
                <option value="">No document types available</option>
              ) : (
                documentTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.document_name}
                  </option>
                ))
              )}
            </select>

            <label htmlFor="purpose">Purpose of request *</label>
            <textarea
              id="purpose"
              name="purpose"
              value={formData.purpose}
              onChange={handleChange}
              placeholder="Enter the reason for your request"
              rows={5}
              disabled={isSubmitting}
            />

            {formError && (
              <p className="request-document-error" role="alert">
                {formError}
              </p>
            )}

            <div className="request-document-actions">
              <button
                type="button"
                className="request-document-cancel"
                onClick={onBackToDashboard}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="request-document-submit"
                disabled={isSubmitting || isLoadingTypes}
              >
                {isSubmitting ? "Submitting…" : "Submit request"}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

export default RequestDocumentPage;
