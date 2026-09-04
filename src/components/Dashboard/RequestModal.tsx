import type { ChangeEvent, FormEvent } from "react";

type RequestFormData = {
  document: string;
  purpose: string;
};

type RequestModalProps = {
  isOpen: boolean;
  formData: RequestFormData;
  formError: string;
  onChange: (
    event: ChangeEvent<HTMLSelectElement | HTMLTextAreaElement>,
  ) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

const RequestModal = ({
  isOpen,
  formData,
  formError,
  onChange,
  onSubmit,
  onClose,
}: RequestModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="request-modal-backdrop">
      <section
        className="request-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-form-title"
      >
        <div className="request-modal-header">
          <div>
            <p>Document request</p>
            <h2 id="request-form-title">Request a document</h2>
          </div>

          <button
            type="button"
            className="modal-close-button"
            onClick={onClose}
            aria-label="Close request form"
          >
            ×
          </button>
        </div>

        <form className="request-form" onSubmit={onSubmit}>
          <label htmlFor="document">Document type</label>
          <select
            id="document"
            name="document"
            value={formData.document}
            onChange={onChange}
          >
            <option>Barangay Clearance</option>
            <option>Certificate of Residency</option>
            <option>Barangay Certificate</option>
            <option>Barangay Permit</option>
          </select>

          <label htmlFor="purpose">Purpose of request</label>
          <textarea
            id="purpose"
            name="purpose"
            value={formData.purpose}
            onChange={onChange}
            placeholder="Enter the reason for your request"
            rows={4}
          />

          {formError && <p className="form-error">{formError}</p>}

          <div className="request-form-actions">
            <button type="button" className="cancel-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="submit-request-button">
              Submit request
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default RequestModal;
