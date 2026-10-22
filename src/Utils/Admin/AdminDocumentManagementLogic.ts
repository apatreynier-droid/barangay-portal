import type { AdminRequestHistoryEntry } from "../../Types/Admin/AdminRequestHistoryType";

export type DocumentManagementFiltersState = {
  search: string;
  status: string;
};

export const DEFAULT_DOCUMENT_MANAGEMENT_FILTERS: DocumentManagementFiltersState =
  {
    search: "",
    status: "all",
  };

export const ISSUANCE_STATUS_OPTIONS = [
  "Pending",
  "Approved",
  "Processing",
  "Ready for Pickup",
  "Completed",
  "Rejected",
];

export type IssuanceStatusMeta = {
  label: string;
  className: string;
};

const ISSUANCE_STATUS_META: Record<string, IssuanceStatusMeta> = {
  pending: { label: "Pending", className: "status-pending" },
  approved: { label: "Approved", className: "status-approved" },
  processing: { label: "Processing", className: "status-processing" },
  "ready for pickup": {
    label: "Ready for Pickup",
    className: "status-ready",
  },
  completed: { label: "Completed", className: "status-completed" },
  rejected: { label: "Rejected", className: "status-rejected" },
};

export function getIssuanceStatusMeta(status: string): IssuanceStatusMeta {
  return (
    ISSUANCE_STATUS_META[status.trim().toLowerCase()] ?? {
      label: status,
      className: "status-pending",
    }
  );
}

export function filterIssuanceRecords(
  records: AdminRequestHistoryEntry[],
  filters: DocumentManagementFiltersState,
): AdminRequestHistoryEntry[] {
  const search = filters.search.trim().toLowerCase();

  return records.filter((record) => {
    if (filters.status !== "all" && record.status !== filters.status) {
      return false;
    }

    if (search) {
      const haystack =
        `${record.resident_name} ${record.request_number} ${record.document}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

export type DocumentTemplateMeta = {
  icon: string;
  className: string;
};

const TEMPLATE_META: Array<{
  keywords: string[];
  meta: DocumentTemplateMeta;
}> = [
  {
    keywords: ["good moral", "moral character"],
    meta: { icon: "⭐", className: "template-gold" },
  },
  {
    keywords: ["business permit"],
    meta: { icon: "🏪", className: "template-rose" },
  },
  {
    keywords: ["indigency"],
    meta: { icon: "🏠", className: "template-green" },
  },
  {
    keywords: ["residency"],
    meta: { icon: "🏘️", className: "template-slate" },
  },
  {
    keywords: ["clearance"],
    meta: { icon: "📄", className: "template-blue" },
  },
  {
    keywords: ["certificate"],
    meta: { icon: "📜", className: "template-purple" },
  },
];

const DEFAULT_TEMPLATE_META: DocumentTemplateMeta = {
  icon: "📄",
  className: "template-blue",
};

export function getDocumentTemplateMeta(
  documentName: string,
): DocumentTemplateMeta {
  const normalized = documentName.trim().toLowerCase();

  for (const entry of TEMPLATE_META) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      return entry.meta;
    }
  }

  return DEFAULT_TEMPLATE_META;
}

const PRINT_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1f2937; padding: 40px 48px; }
  .doc-header { text-align: center; }
  .doc-header .republic { font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }
  .doc-header .barangay { font-size: 20px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; margin-top: 4px; }
  .doc-header .office { font-size: 12px; font-style: italic; margin-top: 2px; }
  .doc-header .divider { border-bottom: 2px solid #1f2937; margin: 14px 0 24px; }
  .doc-title { text-align: center; font-size: 17px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 24px; }
  .doc-body { font-size: 13px; line-height: 1.8; }
  .doc-fields { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  .doc-fields td { padding: 7px 4px; vertical-align: top; }
  .doc-fields td.label { width: 180px; font-weight: 700; }
  .doc-signatures { margin-top: 64px; display: flex; justify-content: space-between; }
  .doc-signature { text-align: center; font-size: 12px; }
  .doc-signature .line { border-top: 1px solid #1f2937; padding-top: 4px; margin-bottom: 4px; min-width: 200px; }
  .doc-footer { margin-top: 48px; font-size: 10px; color: #6b7280; text-align: center; }
  @media print { body { padding: 24px 32px; } }
`;

export type PrintableDocumentField = {
  label: string;
  value: string;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const buildDocumentHtml = (
  title: string,
  fields: PrintableDocumentField[],
  intro: string,
): string => {
  const fieldRows = fields
    .map(
      (field) =>
        `<tr><td class="label">${escapeHtml(field.label)}:</td>` +
        `<td>${escapeHtml(field.value)}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>${PRINT_STYLES}</style>
  </head>
  <body>
    <div class="doc-header">
      <div class="republic">Republic of the Philippines</div>
      <div class="republic">Province · Municipality</div>
      <div class="barangay">Barangay Lagab</div>
      <div class="office">Office of the Punong Barangay</div>
      <div class="divider"></div>
    </div>
    <h1 class="doc-title">${escapeHtml(title)}</h1>
    <p class="doc-body">${escapeHtml(intro)}</p>
    <table class="doc-fields">${fieldRows}</table>
    <div class="doc-signatures">
      <div class="doc-signature">
        <div class="line">&nbsp;</div>
        <div>Applicant Signature</div>
      </div>
      <div class="doc-signature">
        <div class="line">&nbsp;</div>
        <div>Punong Barangay</div>
      </div>
    </div>
    <div class="doc-footer">
      This document was generated by the Barangay Lagab Admin Portal.
    </div>
  </body>
</html>`;
};

const openPrintWindow = (html: string): void => {
  const printWindow = window.open("", "_blank", "width=860,height=960");

  if (!printWindow) {
    window.alert(
      "Please allow pop-ups for this site to open the printable document.",
    );
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};

export function previewDocumentTemplate(templateName: string): void {
  openPrintWindow(
    buildDocumentHtml(
      templateName,
      [],
      `This certifies that the official "${templateName}" template of Barangay Lagab is being previewed. The details below are completed when the document is issued to a resident.`,
    ),
  );
}

export function printIssuanceRecord(record: AdminRequestHistoryEntry): void {
  openPrintWindow(
    buildDocumentHtml(
      record.document,
      [
        { label: "Reference No.", value: record.request_number },
        { label: "Resident", value: record.resident_name },
        { label: "Document Type", value: record.document },
        { label: "Status", value: record.status },
        { label: "Date Submitted", value: record.submitted_at.slice(0, 10) },
        { label: "Processed By", value: record.processed_by ?? "—" },
      ],
      `The Barangay Office of Lagab hereby issues this ${record.document} to the resident named below.`,
    ),
  );
}

export function saveIssuanceRecordAsPdf(
  record: AdminRequestHistoryEntry,
): void {
  // Reuses the same printable document; the browser print dialog offers
  // "Save as PDF" as the destination for generating the PDF copy.
  printIssuanceRecord(record);
}

