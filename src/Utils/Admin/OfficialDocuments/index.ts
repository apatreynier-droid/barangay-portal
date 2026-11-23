import { barangayClearanceTemplate } from "./barangayClearance";
import { businessPermitTemplate } from "./businessPermit";
import { certificateOfIndigencyTemplate } from "./certificateOfIndigency";
import { certificateOfResidencyTemplate } from "./certificateOfResidency";
import { travelPassTemplate } from "./travelPass";
import {
  openDocumentInNewTab,
  type OfficialDocumentTemplate,
} from "./shared";

export type {
  DetailField,
  DocumentDetails,
  OfficialDocumentTemplate,
} from "./shared";
export { openDocumentInNewTab, saveDocumentPdf } from "./shared";

/** Documents that have an official layout. Others use the generic printout. */
const OFFICIAL_DOCUMENT_TEMPLATES: OfficialDocumentTemplate[] = [
  businessPermitTemplate,
  certificateOfResidencyTemplate,
  certificateOfIndigencyTemplate,
  travelPassTemplate,
  barangayClearanceTemplate,
];

export function getOfficialDocumentTemplate(
  documentName: string,
): OfficialDocumentTemplate | null {
  return (
    OFFICIAL_DOCUMENT_TEMPLATES.find((template) =>
      template.matches(documentName),
    ) ?? null
  );
}

/** Opens the blank official layout (Document Management "Preview"). */
export function previewOfficialDocument(
  template: OfficialDocumentTemplate,
): void {
  openDocumentInNewTab(template, template.blankDetails, { autoPrint: false });
}
