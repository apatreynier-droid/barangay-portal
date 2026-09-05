import { useMemo, useState } from "react";
import "./EditResidentModal.css";
import type {
  AdminResidentDetail,
  AdminResidentUpdatePayload,
} from "../../Types/AdminResidentsType";
import { updateResident } from "../../Utils/api";

type EditResidentModalProps = {
  resident: AdminResidentDetail;
  onClose: () => void;
  onSaved: (updated: AdminResidentDetail) => void;
};

type EditResidentFormState = {
  first_name: string;
  middle_name: string;
  last_name: string;
  suffix: string;
  email: string;
  date_of_birth: string;
  sex: string;
  civil_status: string;
  occupation: string;
  house_no: string;
  street: string;
  purok: string;
  address: string;
  contact_number: string;
};

const CIVIL_STATUS_OPTIONS = [
  "Single",
  "Married",
  "Widowed",
  "Separated",
  "Annulled",
];

const buildInitialState = (
  resident: AdminResidentDetail,
): EditResidentFormState => ({
  first_name: resident.first_name,
  middle_name: resident.middle_name ?? "",
  last_name: resident.last_name,
  suffix: resident.suffix ?? "",
  email: resident.email,
  date_of_birth: resident.birthday?.slice(0, 10) ?? "",
  sex: resident.gender ?? "",
  civil_status: resident.civil_status ?? "",
  occupation: resident.occupation ?? "",
  house_no: "",
  street: "",
  purok: resident.purok ?? "",
  address: resident.address ?? "",
  contact_number: resident.contact_number ?? "",
});

const EditResidentModal = ({
  resident,
  onClose,
  onSaved,
}: EditResidentModalProps) => {
  const [form, setForm] = useState<EditResidentFormState>(() =>
    buildInitialState(resident),
  );
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const updateField = (field: keyof EditResidentFormState, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const buildPayload = useMemo((): AdminResidentUpdatePayload => {
    const optional = (value: string): string | null => {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    };

    return {
      first_name: form.first_name.trim(),
      middle_name: optional(form.middle_name),
      last_name: form.last_name.trim(),
      suffix: optional(form.suffix),
      email: form.email.trim(),
      date_of_birth: optional(form.date_of_birth),
      sex: optional(form.sex),
      civil_status: optional(form.civil_status),
      occupation: optional(form.occupation),
      house_no: optional(form.house_no),
      street: optional(form.street),
      purok: optional(form.purok),
      address: optional(form.address),
      contact_number: optional(form.contact_number),
    };
  }, [form]);

  const handleSave = async () => {
    if (!form.first_name.trim()) {
      setError("First name is required.");
      return;
    }
    if (!form.last_name.trim()) {
      setError("Last name is required.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      onSaved(await updateResident(resident.id, buildPayload));
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not update the resident.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="residents-edit-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="residents-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit information for ${resident.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="residents-edit-header">
          <div>
            <p className="residents-edit-label">
              {resident.resident_code} · {resident.name}
            </p>
            <h2>Edit Resident Information</h2>
          </div>

          <button
            type="button"
            className="residents-edit-close"
            onClick={onClose}
            aria-label="Close edit form"
          >
            ✕
          </button>
        </div>

        <div className="residents-edit-body">
          <div className="residents-edit-grid">
            <label className="residents-edit-field">
              <span>First Name *</span>
              <input
                type="text"
                value={form.first_name}
                onChange={(event) =>
                  updateField("first_name", event.target.value)
                }
                maxLength={100}
              />
            </label>

            <label className="residents-edit-field">
              <span>Middle Name</span>
              <input
                type="text"
                value={form.middle_name}
                onChange={(event) =>
                  updateField("middle_name", event.target.value)
                }
                maxLength={100}
              />
            </label>

            <label className="residents-edit-field">
              <span>Last Name *</span>
              <input
                type="text"
                value={form.last_name}
                onChange={(event) =>
                  updateField("last_name", event.target.value)
                }
                maxLength={100}
              />
            </label>

            <label className="residents-edit-field">
              <span>Suffix</span>
              <input
                type="text"
                value={form.suffix}
                onChange={(event) => updateField("suffix", event.target.value)}
                maxLength={20}
              />
            </label>

            <label className="residents-edit-field">
              <span>Email *</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                maxLength={255}
              />
            </label>

            <label className="residents-edit-field">
              <span>Contact Number</span>
              <input
                type="tel"
                value={form.contact_number}
                onChange={(event) =>
                  updateField("contact_number", event.target.value)
                }
                maxLength={20}
              />
            </label>

            <label className="residents-edit-field">
              <span>Birthday</span>
              <input
                type="date"
                value={form.date_of_birth}
                onChange={(event) =>
                  updateField("date_of_birth", event.target.value)
                }
              />
            </label>

            <label className="residents-edit-field">
              <span>Gender</span>
              <select
                value={form.sex}
                onChange={(event) => updateField("sex", event.target.value)}
              >
                <option value="">Not specified</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </label>

            <label className="residents-edit-field">
              <span>Civil Status</span>
              <select
                value={form.civil_status}
                onChange={(event) =>
                  updateField("civil_status", event.target.value)
                }
              >
                <option value="">Not specified</option>
                {CIVIL_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="residents-edit-field">
              <span>Occupation</span>
              <input
                type="text"
                value={form.occupation}
                onChange={(event) =>
                  updateField("occupation", event.target.value)
                }
                maxLength={100}
              />
            </label>

            <label className="residents-edit-field">
              <span>House No.</span>
              <input
                type="text"
                value={form.house_no}
                onChange={(event) => updateField("house_no", event.target.value)}
                maxLength={20}
              />
            </label>

            <label className="residents-edit-field">
              <span>Street</span>
              <input
                type="text"
                value={form.street}
                onChange={(event) => updateField("street", event.target.value)}
                maxLength={150}
              />
            </label>

            <label className="residents-edit-field">
              <span>Purok</span>
              <input
                type="text"
                value={form.purok}
                onChange={(event) => updateField("purok", event.target.value)}
                maxLength={50}
              />
            </label>

            <label className="residents-edit-field residents-edit-field-wide">
              <span>Address</span>
              <input
                type="text"
                value={form.address}
                onChange={(event) => updateField("address", event.target.value)}
                maxLength={255}
              />
            </label>
          </div>
        </div>

        {error && (
          <p className="residents-edit-error" role="alert">
            {error}
          </p>
        )}

        <div className="residents-edit-footer">
          <button
            type="button"
            className="residents-edit-cancel"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="residents-edit-save"
            onClick={() => void handleSave()}
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditResidentModal;
