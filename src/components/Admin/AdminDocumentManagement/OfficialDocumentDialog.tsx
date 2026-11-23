import "../../../Styles/Admin/Components/OfficialDocumentDialog.css";
import { useEffect, useState, type ChangeEvent } from "react";
import { FileDown, Printer } from "lucide-react";
import type { AdminRequestHistoryEntry } from "../../../Types/Admin/AdminRequestHistoryType";
import {
  openDocumentInNewTab,
  saveDocumentPdf,
  type DocumentDetails,
  type OfficialDocumentTemplate,
} from "../../../Utils/Admin/OfficialDocuments";

type OfficialDocumentDialogProps = {
  template: OfficialDocumentTemplate;
  record: AdminRequestHistoryEntry;
  onClose: () => void;
};

/** Lets the admin check and edit the details printed on an official
 *  document (pre-filled from the resident's profile and request). */
const OfficialDocumentDialog = ({
  template,
  record,
  onClose,
}: OfficialDocumentDialogProps) => {
  const [details, setDetails] = useState<DocumentDetails>(() =>
    template.getDefaults(record),
  );
  const [isSaving, setIsSaving] = useState(false);
  const missingFields = template.fields.filter(
    (field) => field.required && !details[field.name]?.trim(),
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose]);

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setDetails((current) => ({ ...current, [name]: value }));
  };

  const handlePrint = () => {
    openDocumentInNewTab(template, details, {
      autoPrint: true,
      referenceNumber: record.request_number,
    });
  };

  const handleSavePdf = async () => {
    setIsSaving(true);
    try {
      await saveDocumentPdf(template, details, record.request_number);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="odoc-dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <section
        className="odoc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="odoc-dialog-title"
      >
        <header className="odoc-dialog-header">
          <div>
            <p className="odoc-dialog-eyebrow">{record.request_number}</p>
            <h2 id="odoc-dialog-title">{template.documentTitle} details</h2>
            <p className="odoc-dialog-subtitle">
              Check the details printed on the document. They are pre-filled
              from {record.resident_name}'s profile and request.
            </p>
          </div>
          <button
            type="button"
            className="odoc-dialog-close"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {record.purpose && (
          <p className="odoc-dialog-purpose">
            <span>Resident's purpose:</span> {record.purpose}
          </p>
        )}

        <div className="odoc-dialog-grid">
          {template.fields.map((field) => (
            <label
              key={field.name}
              className={`odoc-dialog-field${field.wide ? " wide" : ""}`}
            >
              <span>
                {field.label}
                {field.required && <em aria-hidden="true"> *</em>}
              </span>
              {field.type === "select" ? (
                <select
                  name={field.name}
                  value={details[field.name] ?? ""}
                  onChange={handleChange}
                  required={field.required}
                >
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option || "Not specified"}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type ?? "text"}
                  name={field.name}
                  value={details[field.name] ?? ""}
                  onChange={handleChange}
                  placeholder={field.hint}
                  required={field.required}
                />
              )}
              {field.hint && field.type !== "date" && (
                <small>{field.hint}</small>
              )}
            </label>
          ))}
        </div>

        {missingFields.length > 0 && (
          <p className="odoc-dialog-warning" role="status">
            Enter the {missingFields.map((field) => field.label.toLowerCase()).join(", ")}{" "}
            before printing.
          </p>
        )}

        <footer className="odoc-dialog-actions">
          <button
            type="button"
            className="odoc-dialog-cancel"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="odoc-dialog-secondary"
            onClick={() => void handleSavePdf()}
            disabled={isSaving || missingFields.length > 0}
          >
            <FileDown size={15} strokeWidth={2} aria-hidden="true" />
            {isSaving ? "Saving…" : "Save PDF"}
          </button>
          <button
            type="button"
            className="odoc-dialog-primary"
            onClick={handlePrint}
            disabled={isSaving || missingFields.length > 0}
          >
            <Printer size={15} strokeWidth={2} aria-hidden="true" />
            Print
          </button>
        </footer>
      </section>
    </div>
  );
};

export default OfficialDocumentDialog;
