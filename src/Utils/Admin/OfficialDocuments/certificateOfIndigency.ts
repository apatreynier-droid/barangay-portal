/**
 * Certificate of Indigency, following the paper certificate issued by the
 * Office of the Punong Barangay of Barangay Lagab.
 *
 * The second paragraph (relationship and clinic examination) is optional: it
 * is printed only when the admin fills in those details.
 */
import type { jsPDF } from "jspdf";
import {
  BLANK_LINE,
  PUNONG_BARANGAY,
  clean,
  describeAge,
  drawCenteredText,
  drawImage,
  drawParagraphs,
  drawTextAt,
  formatResidentName,
  getPurokNumber,
  issuedDateRuns,
  todayIsoDate,
  type DocumentDetails,
  type DocumentImages,
  type IndentedParagraph,
  type OfficialDocumentTemplate,
  type TextRun,
} from "./shared";

const DEFAULT_SB_MEMBER = "HON. CHARLZENN B. EJAGO";
const HOMETOWN = "Lagab, Compostela, Davao de Oro";

/** "Purok - 1" -> "Purok-1" (the form used on the certificate). */
const toCertificatePurok = (purok: string | null | undefined): string => {
  const number = getPurokNumber(purok);
  return number ? `Purok-${number}` : clean(purok);
};

/** Upper-cased text without a trailing period (the sentence adds its own). */
const boldPhrase = (value: string): string =>
  clean(value).replace(/[.\s]+$/, "").toUpperCase();

/* First-line indents (mm) differ per paragraph on the paper certificate. */
const INDENT = { resident: 19, relation: 30, request: 15, issued: 15.5 };

const buildParagraphs = (details: DocumentDetails): IndentedParagraph[] => {
  const name = clean(details.residentName) || BLANK_LINE;
  const nationality = clean(details.nationality) || "Filipino";
  const residence = [clean(details.residentPurok), HOMETOWN]
    .filter(Boolean)
    .join(" ");

  const paragraphs: IndentedParagraph[] = [
    {
      indent: INDENT.resident,
      runs: [
        { text: "This is to certify that " },
        { text: `${name},`, bold: true },
        {
          text: ` ${clean(details.ageDescription) || "of legal age"}, and a ${nationality} is a bona-fide resident of ${residence}, low income and belongs to indigent family of this barangay.`,
        },
      ],
    },
  ];

  // Optional: "...is the wife of GERARDO L. ALMILLA, was seen and examined at
  // LEAL CLINIC ... herewith attached the Medical Certificate."
  const relationship = clean(details.relationship).toLowerCase();
  const relatedPerson = boldPhrase(details.relatedPersonName);
  const clinic = boldPhrase(details.clinic);
  const relation: TextRun[] = [];

  if (relationship && relatedPerson) {
    relation.push(
      { text: `This is to certify further that the above-mentioned name is the ${relationship} of ` },
      { text: clinic ? `${relatedPerson},` : relatedPerson, bold: true },
    );
    if (!clinic) relation.push({ text: "." });
  } else if (clinic) {
    relation.push({ text: "This is to certify further that the above-mentioned name" });
  }

  if (clinic) {
    relation.push(
      { text: " was seen and examined at " },
      { text: clinic, bold: true },
      { text: " herewith attached the Medical Certificate." },
    );
  }

  if (relation.length) {
    paragraphs.push({ indent: INDENT.relation, runs: relation });
  }

  const assistance = boldPhrase(details.assistancePurpose);
  paragraphs.push(
    {
      indent: INDENT.request,
      runs: assistance
        ? [
            { text: "This certification is being issued upon the request of the above-mentioned name for " },
            { text: assistance, bold: true },
            { text: " and for whatever any legal purpose/s it may serve best." },
          ]
        : [
            {
              text: "This certification is being issued upon the request of the above-mentioned name for whatever any legal purpose/s it may serve best.",
            },
          ],
    },
    {
      indent: INDENT.issued,
      runs: [
        { text: "Issued this " },
        ...issuedDateRuns(details.issuedDate, {
          lowercaseSuffix: true,
          superscript: false,
          monthTitleCase: true,
        }),
        { text: " at Barangay Lagab, Compostela, Davao de Oro, Philippines." },
      ],
    },
  );

  return paragraphs;
};

/* Page geometry (A4, mm). */
const MARGIN_LEFT = 22;
const CONTENT_WIDTH = 166;
const PAGE_CENTER = 105;
const SIGNATURE_CENTER = 152;
const SEAL = { x: 28, y: 10, size: 28 };
/** Bagong Pilipinas logo; its image is 572 x 476 px. */
const BAGONG_PILIPINAS = { x: 158, y: 7, width: 32, height: (32 * 476) / 572 };
const HEADER_INK: [number, number, number] = [45, 45, 45];
const TITLE_INK: [number, number, number] = [40, 40, 40];

const draw = (
  pdf: jsPDF,
  details: DocumentDetails,
  images: DocumentImages,
): void => {
  drawImage(pdf, images.seal, SEAL.x, SEAL.y, SEAL.size, SEAL.size);
  drawImage(
    pdf,
    images.bagongPilipinas,
    BAGONG_PILIPINAS.x,
    BAGONG_PILIPINAS.y,
    BAGONG_PILIPINAS.width,
    BAGONG_PILIPINAS.height,
  );

  const headerStyle = { sizePt: 12, color: HEADER_INK };
  drawCenteredText(pdf, "REPUBLIC OF THE PHILIPPINES", PAGE_CENTER, 16, headerStyle);
  drawCenteredText(pdf, "PROVINCE OF DAVAO DE ORO", PAGE_CENTER, 20.8, headerStyle);
  drawCenteredText(pdf, "MUNICIPALITY OF COMPOSTELA", PAGE_CENTER, 25.6, headerStyle);
  drawCenteredText(pdf, "BARANGAY LAGAB", PAGE_CENTER, 30.6, {
    sizePt: 12.5,
    style: "bold",
    color: HEADER_INK,
  });

  drawCenteredText(pdf, "=OFFICE OF THE PUNONG BARANGAY=", PAGE_CENTER, 42, {
    sizePt: 13,
    style: "bold",
    charSpace: 0.15,
    color: HEADER_INK,
  });

  drawCenteredText(pdf, "CERTIFICATE OF INDIGENCY", PAGE_CENTER, 56, {
    sizePt: 23,
    style: "bold",
    charSpace: 0.25,
    color: TITLE_INK,
  });

  drawTextAt(pdf, "TO WHOM IT MAY CONCERN;", MARGIN_LEFT, 73.5, {
    sizePt: 14,
    style: "bold",
  });

  const bodyEnd = drawParagraphs(pdf, buildParagraphs(details), 86, {
    left: MARGIN_LEFT,
    width: CONTENT_WIDTH,
    firstLineIndent: INDENT.request,
    fontSizePt: 14,
    lineHeight: 1.35,
    paragraphGap: 3.5,
  });

  // Signature block, right of centre.
  const signatureStyle = { sizePt: 13.5 };
  const officialStyle = { sizePt: 13.5, style: "bold" as const, underline: true };
  let y = bodyEnd + 13;
  drawCenteredText(pdf, "By authority of the Punong Barangay:", SIGNATURE_CENTER, y, signatureStyle);
  y += 7.3;
  drawCenteredText(pdf, PUNONG_BARANGAY, SIGNATURE_CENTER, y, officialStyle);
  y += 7.3;
  drawCenteredText(pdf, "Punong Barangay", SIGNATURE_CENTER, y, signatureStyle);
  y += 31;
  drawCenteredText(
    pdf,
    clean(details.sbMember) || DEFAULT_SB_MEMBER,
    SIGNATURE_CENTER,
    y,
    officialStyle,
  );
  y += 7;
  drawCenteredText(pdf, "Sangguniang Barangay Member", SIGNATURE_CENTER, y, signatureStyle);
};

export const certificateOfIndigencyTemplate: OfficialDocumentTemplate = {
  documentTitle: "Certificate of Indigency",
  matches: (documentName) =>
    documentName.trim().toLowerCase().includes("indigency"),
  fields: [
    { name: "residentName", label: "Resident name", hint: "e.g. MECHIE S. ALMILLA" },
    { name: "ageDescription", label: "Age", hint: "e.g. of legal age" },
    { name: "nationality", label: "Nationality", hint: "e.g. Filipino" },
    { name: "residentPurok", label: "Purok", hint: "e.g. Purok-1" },
    {
      name: "assistancePurpose",
      label: "Purpose of the certificate",
      hint: "Printed in bold, e.g. DSWD ASSISTANCE",
      wide: true,
    },
    {
      name: "relationship",
      label: "Relationship (optional)",
      hint: "e.g. wife, husband, son, daughter",
    },
    {
      name: "relatedPersonName",
      label: "Related person (optional)",
      hint: "e.g. GERARDO L. ALMILLA",
    },
    {
      name: "clinic",
      label: "Seen and examined at (optional)",
      hint: "e.g. LEAL CLINIC COMPOSTELA, DAVAO DE ORO. Adds the Medical Certificate line.",
      wide: true,
    },
    { name: "issuedDate", label: "Date issued", type: "date" },
    {
      name: "sbMember",
      label: "SB Member (signatory)",
      hint: `e.g. ${DEFAULT_SB_MEMBER}`,
    },
  ],
  getDefaults: (record) => ({
    residentName: formatResidentName(record),
    ageDescription: describeAge(record.date_of_birth),
    nationality: clean(record.nationality) || "Filipino",
    residentPurok: toCertificatePurok(record.purok),
    assistancePurpose: clean(record.purpose).toUpperCase(),
    relationship: "",
    relatedPersonName: "",
    clinic: "",
    issuedDate: todayIsoDate(),
    sbMember: DEFAULT_SB_MEMBER,
  }),
  blankDetails: {
    residentName: BLANK_LINE,
    ageDescription: "of legal age",
    nationality: "Filipino",
    residentPurok: "Purok-____",
    assistancePurpose: BLANK_LINE,
    relationship: "",
    relatedPersonName: "",
    clinic: "",
    issuedDate: "",
    sbMember: DEFAULT_SB_MEMBER,
  },
  draw,
};
