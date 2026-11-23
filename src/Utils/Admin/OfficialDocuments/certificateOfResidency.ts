/**
 * Certificate of Residency, following the paper certificate issued by the
 * Office of the Punong Barangay of Barangay Lagab.
 */
import type { jsPDF } from "jspdf";
import type { AdminRequestHistoryEntry } from "../../../Types/Admin/AdminRequestHistoryType";
import {
  BARANGAY_ADDRESS,
  BLANK_LINE,
  PAGE,
  PUNONG_BARANGAY,
  clean,
  describeAge,
  drawCenteredText,
  drawImage,
  drawParagraphs,
  drawTextAt,
  formatResidentName,
  getAge,
  getPurokNumber,
  issuedDateRuns,
  todayIsoDate,
  type DocumentDetails,
  type DocumentImages,
  type OfficialDocumentTemplate,
  type Paragraph,
} from "./shared";

const DEFAULT_SB_MEMBER = "HON. CHARLZENN B. EJAGO";

/** "Purok - 3" -> "Purok-3" (the form used on the certificate). */
const toCertificatePurok = (purok: string | null | undefined): string => {
  const number = getPurokNumber(purok);
  return number ? `Purok-${number}` : clean(purok);
};

/** "since birth", unless the profile shows the resident moved in later. */
const describeResidency = (record: AdminRequestHistoryEntry): string => {
  const years = Number(record.years_of_residency);
  if (!record.years_of_residency || !Number.isFinite(years) || years <= 0) {
    return "since birth";
  }

  const age = getAge(record.date_of_birth);
  if (age !== null && years >= age) return "since birth";

  return `for ${years} ${years === 1 ? "year" : "years"}`;
};

const buildParagraphs = (details: DocumentDetails): Paragraph[] => {
  const name = clean(details.residentName) || BLANK_LINE;
  const description = [
    clean(details.ageDescription) || "of legal age",
    clean(details.civilStatus),
    `${clean(details.nationality) || "Filipino"} citizen`,
  ]
    .filter(Boolean)
    .join(", ");
  const residence = [clean(details.residentPurok), BARANGAY_ADDRESS]
    .filter(Boolean)
    .join(" ");

  return [
    [
      { text: "This is to certify that " },
      { text: `${name},`, bold: true },
      { text: ` ${description}, a resident of this ${residence}.` },
    ],
    [
      {
        text: `Based on the records of this office, he/she has been residing of this barangay Lagab, Compostela, Davao de Oro ${clean(details.residencyPeriod) || "since birth"}.`,
      },
    ],
    [
      {
        text: "This certification has been issued upon the request of the above-mentioned name for whatever any legal purposes it may serve best.",
      },
    ],
    [
      { text: "Issued this " },
      ...issuedDateRuns(details.issuedDate, { boldDayWord: true }),
      { text: ` at ${BARANGAY_ADDRESS}.` },
    ],
  ];
};

/* Page geometry (A4, mm). */
const MARGIN_LEFT = 25;
const CONTENT_WIDTH = 160;
const PAGE_CENTER = PAGE.width / 2;
const SIGNATURE_CENTER = 140;
const SEAL = { x: 20, y: 25.5, size: 27 };
/** Bagong Pilipinas logo; its image is 572 x 476 px. */
const BAGONG_PILIPINAS = { x: 159, y: 21, width: 29, height: (29 * 476) / 572 };
const GOLD: [number, number, number] = [212, 160, 23];
const DARK_GRAY: [number, number, number] = [64, 64, 64];
const TITLE_INK: [number, number, number] = [34, 34, 34];

const draw = (
  pdf: jsPDF,
  details: DocumentDetails,
  images: DocumentImages,
): void => {
  // Header: seal on the left, Bagong Pilipinas logo on the right.
  drawImage(pdf, images.seal, SEAL.x, SEAL.y, SEAL.size, SEAL.size);
  drawImage(
    pdf,
    images.bagongPilipinas,
    BAGONG_PILIPINAS.x,
    BAGONG_PILIPINAS.y,
    BAGONG_PILIPINAS.width,
    BAGONG_PILIPINAS.height,
  );

  drawCenteredText(pdf, "REPUBLIC OF THE PHILIPPINES", PAGE_CENTER, 28, {
    font: "helvetica",
    sizePt: 11,
    color: DARK_GRAY,
  });
  drawCenteredText(pdf, "PROVINCE OF DAVAO DE ORO", PAGE_CENTER, 33, {
    sizePt: 13,
    charSpace: 0.15,
  });
  drawCenteredText(pdf, "MUNICIPALITY OF COMPOSTELA", PAGE_CENTER, 38, {
    sizePt: 13,
    charSpace: 0.15,
  });
  drawCenteredText(pdf, "BARANGAY LAGAB", PAGE_CENTER, 43, {
    sizePt: 13,
    style: "bold",
    charSpace: 0.4,
  });
  drawCenteredText(pdf, "OFFICE OF THE PUNONG BARANGAY", PAGE_CENTER, 53, {
    sizePt: 13.5,
    style: "bold",
    charSpace: 0.45,
  });
  drawCenteredText(pdf, "ooo0000ooo", PAGE_CENTER, 58.5, {
    sizePt: 11,
    color: GOLD,
    charSpace: 0.2,
  });

  drawCenteredText(pdf, "CERTIFICATE OF RESIDENCY", PAGE_CENTER, 81, {
    sizePt: 28,
    style: "bold",
    color: TITLE_INK,
  });

  drawTextAt(pdf, "TO WHOM IT MAY CONCERN:", MARGIN_LEFT, 98, { sizePt: 13 });

  const bodyEnd = drawParagraphs(pdf, buildParagraphs(details), 109, {
    left: MARGIN_LEFT,
    width: CONTENT_WIDTH,
    firstLineIndent: 12.7,
    fontSizePt: 13,
    lineHeight: 1.15,
    paragraphGap: 5.5,
  });

  // Signature block, right of centre.
  let y = bodyEnd + 17;
  drawCenteredText(pdf, "By authority of Punong Barangay:", SIGNATURE_CENTER, y, {
    sizePt: 11.5,
  });
  y += 15;
  drawCenteredText(pdf, PUNONG_BARANGAY, SIGNATURE_CENTER, y, {
    sizePt: 13.5,
    style: "bold",
    underline: true,
  });
  y += 5.5;
  drawCenteredText(pdf, "Punong Barangay", SIGNATURE_CENTER, y, { sizePt: 13 });
  y += 17.5;
  drawCenteredText(
    pdf,
    clean(details.sbMember) || DEFAULT_SB_MEMBER,
    SIGNATURE_CENTER,
    y,
    { sizePt: 13.5, style: "bold", underline: true },
  );
  y += 5.5;
  drawCenteredText(pdf, "SB MEMBER", SIGNATURE_CENTER, y, {
    sizePt: 13,
    style: "bold",
  });
};

export const certificateOfResidencyTemplate: OfficialDocumentTemplate = {
  documentTitle: "Certificate of Residency",
  matches: (documentName) =>
    documentName.trim().toLowerCase().includes("residency"),
  fields: [
    { name: "residentName", label: "Resident name", hint: "e.g. JAMES B. PEROCHO" },
    { name: "ageDescription", label: "Age", hint: "e.g. of legal age" },
    { name: "civilStatus", label: "Civil status", hint: "e.g. married" },
    { name: "nationality", label: "Nationality", hint: "e.g. Filipino" },
    { name: "residentPurok", label: "Purok", hint: "e.g. Purok-3" },
    { name: "issuedDate", label: "Date issued", type: "date" },
    {
      name: "residencyPeriod",
      label: "Residing in the barangay",
      hint: "e.g. since birth, or for 10 years",
      wide: true,
    },
    {
      name: "sbMember",
      label: "SB Member (signatory)",
      hint: `e.g. ${DEFAULT_SB_MEMBER}`,
      wide: true,
    },
  ],
  getDefaults: (record) => ({
    residentName: formatResidentName(record),
    ageDescription: describeAge(record.date_of_birth),
    civilStatus: clean(record.civil_status).toLowerCase(),
    nationality: clean(record.nationality) || "Filipino",
    residentPurok: toCertificatePurok(record.purok),
    residencyPeriod: describeResidency(record),
    issuedDate: todayIsoDate(),
    sbMember: DEFAULT_SB_MEMBER,
  }),
  blankDetails: {
    residentName: BLANK_LINE,
    ageDescription: "of legal age",
    civilStatus: "__________",
    nationality: "Filipino",
    residentPurok: "Purok-____",
    residencyPeriod: "______________",
    issuedDate: "",
    sbMember: DEFAULT_SB_MEMBER,
  },
  draw,
};
