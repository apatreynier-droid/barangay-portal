import { useCallback, useEffect, useState } from "react";
import type {
  AdminResidentAccountStatus,
  AdminResidentDetail,
} from "../../../Types/Admin/AdminResidentsType";
import {
  fetchResidentDetail,
  updateResidentStatus,
} from "../../../Utils/Shared/api";
import ResidentProfileCard from "./ResidentProfileCard";
import ResidentPersonalInfo from "./ResidentPersonalInfo";
import ResidentRequestHistory from "./ResidentRequestHistory";
import EditResidentModal from "./EditResidentModal";
import ResidentStatusConfirmModal from "./ResidentStatusConfirmModal";

type ResidentDetailsViewProps = {
  residentId: number;
  /** Administrator accounts may edit/deactivate; Staff only view the profile. */
  canManage: boolean;
  onBack: () => void;
  onResidentChanged: () => void;
};

const ResidentDetailsView = ({
  residentId,
  canManage,
  onBack,
  onResidentChanged,
}: ResidentDetailsViewProps) => {
  const [resident, setResident] = useState<AdminResidentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isStatusConfirmOpen, setIsStatusConfirmOpen] = useState(false);
  const [isProcessingStatus, setIsProcessingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");

  const loadResident = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      setResident(await fetchResidentDetail(residentId));
    } catch {
      setError("Could not load the resident details. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [residentId]);

  useEffect(() => {
    void loadResident();
  }, [loadResident]);

  const handleResidentSaved = (updated: AdminResidentDetail) => {
    setResident(updated);
    setIsEditOpen(false);
    onResidentChanged();
  };

  const handleStatusToggle = async () => {
    if (!resident) {
      return;
    }

    const nextStatus: AdminResidentAccountStatus =
      resident.status === "active" ? "inactive" : "active";

    setIsProcessingStatus(true);
    setStatusError("");

    try {
      const updated = await updateResidentStatus(resident.id, nextStatus);
      setResident(updated);
      setIsStatusConfirmOpen(false);
      onResidentChanged();
    } catch (statusUpdateError) {
      setStatusError(
        statusUpdateError instanceof Error
          ? statusUpdateError.message
          : "Could not update the account status.",
      );
    } finally {
      setIsProcessingStatus(false);
    }
  };

  return (
    <div className="residents-details-view">
      <button type="button" className="residents-back-link" onClick={onBack}>
        ← Back to Residents
      </button>

      {error && (
        <div className="admin-error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void loadResident()}>
            Retry
          </button>
        </div>
      )}

      {statusError && (
        <div className="admin-error-banner" role="alert">
          <span>{statusError}</span>
        </div>
      )}

      {isLoading && !resident ? (
        <p className="admin-loading-state">Loading the resident details…</p>
      ) : (
        resident && (
          <div className="residents-detail-grid">
            <ResidentProfileCard
              resident={resident}
              canManage={canManage}
              onEdit={() => setIsEditOpen(true)}
              onToggleStatus={() => setIsStatusConfirmOpen(true)}
            />

            <div className="residents-detail-stack">
              <ResidentPersonalInfo resident={resident} />
              <ResidentRequestHistory resident={resident} />
            </div>
          </div>
        )
      )}

      {resident && isEditOpen && (
        <EditResidentModal
          resident={resident}
          onClose={() => setIsEditOpen(false)}
          onSaved={handleResidentSaved}
        />
      )}

      {resident && isStatusConfirmOpen && (
        <ResidentStatusConfirmModal
          mode={resident.status === "active" ? "deactivate" : "activate"}
          residentName={resident.name}
          isProcessing={isProcessingStatus}
          onCancel={() => setIsStatusConfirmOpen(false)}
          onConfirm={() => void handleStatusToggle()}
        />
      )}
    </div>
  );
};

export default ResidentDetailsView;
