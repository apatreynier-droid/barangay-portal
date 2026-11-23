/**
 * Business Permit, following the paper permit issued by the Office of the
 * Punong Barangay of Barangay Lagab.
 */
import type { jsPDF } from "jspdf";
import {
  BARANGAY_ADDRESS,
  BLANK_LINE,
  PUNONG_BARANGAY,
  clean,
  describeAge,
  drawCenteredText,
  drawCondensedCenteredText,
  drawImage,
  drawParagraphs,
  drawTextAt,
  formatResidentName,
  getPurokNumber,
  issuedDateRuns,
  measureText,
  todayIsoDate,
  type DocumentDetails,
  type DocumentImages,
  type OfficialDocumentTemplate,
  type Paragraph,
} from "./shared";

const DEFAULT_SB_MEMBER = "HON. JUDY S. DAMASCO";

/** "Purok - 4" -> "P-4" (the short form used on the permit). */
const toShortPurok = (purok: string | null | undefined): string => {
  const number = getPurokNumber(purok);
  return number ? `P-${number}` : clean(purok);
};

const buildParagraphs = (details: DocumentDetails): Paragraph[] => {
  const name = clean(details.permitteeName) || BLANK_LINE;
  const civilStatus = clean(details.civilStatus);
  const nationality = clean(details.nationality) || "Filipino";
  const residence = [clean(details.residentPurok), BARANGAY_ADDRESS]
    .filter(Boolean)
    .join(" ");
  const personDescription = [
    clean(details.ageDescription) || "of legal age",
    civilStatus ? `${civilStatus} and a ${nationality}` : `a ${nationality}`,
  ].join(", ");

  return [
    [
      { text: "Permission is hereby granted to " },
      { text: name },
      {
        text: `, ${personDescription} is a bona fide resident of ${residence}`,
      },
    ],
    [
      {
        text: "This is to certify further the above-mentioned name has granted a ",
      },
      { text: "PERMIT", bold: true },
      { text: " of " },
      {
        text: `${clean(details.businessName) || BLANK_LINE} located`,
        bold: true,
      },
      { text: ` at ${clean(details.businessLocation) || BLANK_LINE}.` },
    ],
    [
      {
        text: "Permission is being issued upon the personal request of the name stated above for whatever any legal purposes this may serve best.",
      },
    ],
    [
      { text: "Issued this " },
      ...issuedDateRuns(details.issuedDate),
      { text: ` at ${BARANGAY_ADDRESS}, Philippines.` },
    ],
  ];
};

/* Page geometry (A4, mm). */
const MARGIN_LEFT = 25;
const CONTENT_WIDTH = 165;
const CONTENT_CENTER = MARGIN_LEFT + CONTENT_WIDTH / 2;
const SIGNATURE_CENTER = 143;
const SEAL_SIZE = 30;
/** Space between the seal and the left edge of the header lines. */
const SEAL_GAP = 10;

const HEADER_LINES = [
  "REPUBLIC OF THE PHILIPPINES",
  "PROVINCE OF DAVAO DE ORO",
  "MUNICIPALITY OF COMPOSTELA",
];

const draw = (
  pdf: jsPDF,
  details: DocumentDetails,
  images: DocumentImages,
): void => {
  // Header: the seal sits just left of the centred header lines.
  const headerBaselines = [23, 27.8, 32.6, 37.4];
  const headerStyle = { sizePt: 12 };
  HEADER_LINES.forEach((line, index) => {
    drawCenteredText(pdf, line, CONTENT_CENTER, headerBaselines[index], headerStyle);
  });
  drawCenteredText(pdf, "BARANGAY LAGAB", CONTENT_CENTER, headerBaselines[3], {
    sizePt: 12,
    style: "bold",
  });

  const headerWidth = Math.max(
    ...HEADER_LINES.map((line) => measureText(pdf, line, headerStyle)),
  );
  const sealRight = CONTENT_CENTER - headerWidth / 2 - SEAL_GAP;
  const sealCenterY = (headerBaselines[0] + headerBaselines[3]) / 2 - 1.5;
  drawImage(
    pdf,
    images.seal,
    sealRight - SEAL_SIZE,
    sealCenterY - SEAL_SIZE / 2,
    SEAL_SIZE,
    SEAL_SIZE,
  );

  drawCenteredText(pdf, "=OFFICE OF THE PUNONG BARANGAY=", CONTENT_CENTER, 52, {
    sizePt: 15,
    style: "italic",
  });

  // Title: tall, horizontally condensed capitals.
  drawCondensedCenteredText(
    pdf,
    "BUSINESS PERMIT",
    CONTENT_CENTER,
    69,
    { sizePt: 44, style: "bold" },
    0.87,
  );

  drawTextAt(pdf, "TO WHOM IT MAY CONCERN;", MARGIN_LEFT, 81, {
    sizePt: 12,
    style: "bold",
  });

  const bodyEnd = drawParagraphs(pdf, buildParagraphs(details), 96, {
    left: MARGIN_LEFT,
    width: CONTENT_WIDTH,
    firstLineIndent: 12.7,
    fontSizePt: 12,
    lineHeight: 1.15,
    paragraphGap: 5,
  });

  // Signature block, right of centre.
  let y = bodyEnd + 31;
  drawCenteredText(pdf, "By authority of the Punong by:", SIGNATURE_CENTER, y, {
    sizePt: 12,
    style: "italic",
  });
  y += 12;
  drawCenteredText(pdf, PUNONG_BARANGAY, SIGNATURE_CENTER, y, {
    sizePt: 14,
    style: "bold",
    underline: true,
  });
  y += 6;
  drawCenteredText(pdf, "Punong Barangay", SIGNATURE_CENTER, y, { sizePt: 14 });
  y += 16;
  drawCenteredText(
    pdf,
    clean(details.sbMember) || DEFAULT_SB_MEMBER,
    SIGNATURE_CENTER,
    y,
    { sizePt: 14, style: "bold", underline: true },
  );
  y += 6;
  drawCenteredText(pdf, "SB MEMBER", SIGNATURE_CENTER, y, {
    sizePt: 14,
    style: "bold",
  });
};

export const businessPermitTemplate: OfficialDocumentTemplate = {
  documentTitle: "Business Permit",
  matches: (documentName) =>
    documentName.trim().toLowerCase().includes("business permit"),
  fields: [
    { name: "permitteeName", label: "Permittee name", hint: "e.g. JANET C. JUBAN" },
    { name: "ageDescription", label: "Age", hint: "e.g. of legal age" },
    { name: "civilStatus", label: "Civil status", hint: "e.g. married" },
    { name: "nationality", label: "Nationality", hint: "e.g. Filipino" },
    { name: "residentPurok", label: "Resident purok", hint: "e.g. P-4" },
    { name: "issuedDate", label: "Date issued", type: "date" },
    {
      name: "businessName",
      label: "Business / permit",
      hint: "Printed in bold, e.g. BOARDING HOUSE PERMIT",
      wide: true,
      required: true,
    },
    {
      name: "businessLocation",
      label: "Business location",
      hint: "e.g. P-4 Barangay Lagab, Compostela, Davao de Oro",
      wide: true,
    },
    {
      name: "sbMember",
      label: "SB Member (signatory)",
      hint: `e.g. ${DEFAULT_SB_MEMBER}`,
      wide: true,
    },
  ],
  getDefaults: (record) => {
    const residentPurok = toShortPurok(record.purok);

    return {
      permitteeName: formatResidentName(record),
      ageDescription: describeAge(record.date_of_birth),
      civilStatus: clean(record.civil_status).toLowerCase(),
      nationality: clean(record.nationality) || "Filipino",
      residentPurok,
      businessName: clean(record.purpose).toUpperCase(),
      businessLocation: [residentPurok, BARANGAY_ADDRESS]
        .filter(Boolean)
        .join(" "),
      issuedDate: todayIsoDate(),
      sbMember: DEFAULT_SB_MEMBER,
    };
  },
  blankDetails: {
    permitteeName: BLANK_LINE,
    ageDescription: "of legal age",
    civilStatus: "__________",
    nationality: "Filipino",
    residentPurok: "_____",
    businessName: BLANK_LINE,
    businessLocation: `_____ ${BARANGAY_ADDRESS}`,
    issuedDate: "",
    sbMember: DEFAULT_SB_MEMBER,
  },
  draw,
};
