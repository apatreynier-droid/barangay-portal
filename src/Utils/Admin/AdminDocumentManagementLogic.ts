import {
  Award,
  FileCheck,
  FileText,
  HandHeart,
  MapPinHouse,
  ScrollText,
  Store,
  type LucideIcon,
} from "lucide-react";
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

/** Statuses where the request was approved, so the document may be printed. */
const PRINTABLE_STATUSES = new Set([
  "approved",
  "processing",
  "ready for pickup",
  "completed",
]);

export function isIssuanceRecordPrintable(status: string): boolean {
  return PRINTABLE_STATUSES.has(status.trim().toLowerCase());
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
  icon: LucideIcon;
  className: string;
};

const TEMPLATE_META: Array<{
  keywords: string[];
  meta: DocumentTemplateMeta;
}> = [
  {
    keywords: ["good moral", "moral character"],
    meta: { icon: Award, className: "template-gold" },
  },
  {
    keywords: ["business permit"],
    meta: { icon: Store, className: "template-rose" },
  },
  {
    keywords: ["indigency"],
    meta: { icon: HandHeart, className: "template-green" },
  },
  {
    keywords: ["residency"],
    meta: { icon: MapPinHouse, className: "template-slate" },
  },
  {
    keywords: ["clearance"],
    meta: { icon: FileCheck, className: "template-blue" },
  },
  {
    keywords: ["certificate"],
    meta: { icon: ScrollText, className: "template-purple" },
  },
];

const DEFAULT_TEMPLATE_META: DocumentTemplateMeta = {
  icon: FileText,
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
      <div class="republic">Province of Davao de Oro</div>
      <div class="republic">Municipality of Compostela</div>
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

const getIssuanceRecordFields = (
  record: AdminRequestHistoryEntry,
): PrintableDocumentField[] => [
  { label: "Reference No.", value: record.request_number },
  { label: "Resident", value: record.resident_name },
  { label: "Document Type", value: record.document },
  { label: "Status", value: record.status },
  { label: "Date Submitted", value: record.submitted_at.slice(0, 10) },
  { label: "Processed By", value: record.processed_by ?? "N/A" },
];

const getIssuanceRecordIntro = (record: AdminRequestHistoryEntry): string =>
  `The Barangay Office of Lagab hereby issues this ${record.document} to the resident named below.`;

const ensureIssuanceRecordPrintable = (
  record: AdminRequestHistoryEntry,
): boolean => {
  if (isIssuanceRecordPrintable(record.status)) return true;

  window.alert(
    `This request is ${record.status}. A document can only be printed once the request is approved.`,
  );
  return false;
};

export function printIssuanceRecord(record: AdminRequestHistoryEntry): void {
  if (!ensureIssuanceRecordPrintable(record)) return;

  openPrintWindow(
    buildDocumentHtml(
      record.document,
      getIssuanceRecordFields(record),
      getIssuanceRecordIntro(record),
    ),
  );
}

const toSafeFileName = (value: string): string =>
  value
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "_")
    .replace(/^_+|_+$/g, "") || "document";

/** Generates the issued document as a real PDF file and downloads it. */
export async function saveIssuanceRecordAsPdf(
  record: AdminRequestHistoryEntry,
): Promise<void> {
  if (!ensureIssuanceRecordPrintable(record)) return;

  try {
    // Loaded on demand so jsPDF is not part of the main bundle.
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "pt", format: "a4" });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const marginX = 56;
    const contentWidth = pageWidth - marginX * 2;
    const centerX = pageWidth / 2;
    const ink: [number, number, number] = [31, 41, 55];
    let y = 64;

    pdf.setTextColor(...ink);
    pdf.setDrawColor(...ink);

    // Header
    pdf.setFont("times", "normal");
    pdf.setFontSize(10);
    for (const line of [
      "REPUBLIC OF THE PHILIPPINES",
      "PROVINCE OF DAVAO DE ORO",
      "MUNICIPALITY OF COMPOSTELA",
    ]) {
      pdf.text(line, centerX, y, { align: "center" });
      y += 14;
    }

    y += 6;
    pdf.setFont("times", "bold");
    pdf.setFontSize(18);
    pdf.text("BARANGAY LAGAB", centerX, y, { align: "center" });

    y += 16;
    pdf.setFont("times", "italic");
    pdf.setFontSize(10);
    pdf.text("Office of the Punong Barangay", centerX, y, { align: "center" });

    y += 14;
    pdf.setLineWidth(1.5);
    pdf.line(marginX, y, pageWidth - marginX, y);

    // Title
    y += 40;
    pdf.setFont("times", "bold");
    pdf.setFontSize(15);
    const titleLines = pdf.splitTextToSize(
      record.document.toUpperCase(),
      contentWidth,
    ) as string[];
    pdf.text(titleLines, centerX, y, { align: "center" });
    y += titleLines.length * 18 + 18;

    // Intro paragraph
    pdf.setFont("times", "normal");
    pdf.setFontSize(12);
    const introLines = pdf.splitTextToSize(
      getIssuanceRecordIntro(record),
      contentWidth,
    ) as string[];
    pdf.text(introLines, marginX, y, { lineHeightFactor: 1.6 });
    y += introLines.length * 12 * 1.6 + 16;

    // Detail fields
    const labelWidth = 140;
    for (const field of getIssuanceRecordFields(record)) {
      pdf.setFont("times", "bold");
      pdf.text(`${field.label}:`, marginX, y);
      pdf.setFont("times", "normal");
      const valueLines = pdf.splitTextToSize(
        field.value,
        contentWidth - labelWidth,
      ) as string[];
      pdf.text(valueLines, marginX + labelWidth, y);
      y += Math.max(valueLines.length, 1) * 15 + 8;
    }

    // Signatures
    y += 70;
    const signatureWidth = 190;
    pdf.setLineWidth(0.75);
    pdf.setFontSize(11);
    const signatures: Array<[string, number]> = [
      ["Applicant Signature", marginX],
      ["Punong Barangay", pageWidth - marginX - signatureWidth],
    ];
    for (const [label, x] of signatures) {
      pdf.line(x, y, x + signatureWidth, y);
      pdf.text(label, x + signatureWidth / 2, y + 15, { align: "center" });
    }

    // Footer
    y += 70;
    pdf.setFontSize(9);
    pdf.setTextColor(107, 114, 128);
    pdf.text(
      "This document was generated by the Barangay Lagab Admin Portal.",
      centerX,
      y,
      { align: "center" },
    );

    pdf.setProperties({
      title: `${record.document} - ${record.request_number}`,
      subject: record.document,
      author: "Barangay Lagab",
    });

    pdf.save(
      `${toSafeFileName(record.request_number)}_${toSafeFileName(record.document)}.pdf`,
    );
  } catch (error) {
    console.error("Failed to generate PDF", error);
    window.alert("Unable to generate the PDF. Please try again.");
  }
}

