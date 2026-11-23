/**
 * Travel Pass, following the paper travel pass issued by the Office of the
 * Punong Barangay of Barangay Lagab: a resident (e.g. a guardian) travelling
 * with a child. When no child is entered, the pass certifies the resident's
 * own travel.
 */
import type { jsPDF } from "jspdf";
import {
  BLANK_LINE,
  PUNONG_BARANGAY,
  clean,
  describeAge,
  drawCenteredText,
  drawCondensedCenteredText,
  drawImage,
  drawParagraphs,
  drawTextAt,
  formatLongDate,
  formatResidentName,
  getPurokNumber,
  issuedDateRuns,
  parseIsoDate,
  todayIsoDate,
  type DocumentDetails,
  type DocumentImages,
  type OfficialDocumentTemplate,
  type Paragraph,
  type TextRun,
} from "./shared";

const DEFAULT_SB_MEMBER = "HON. MARY PAULE O. BATICULA";
const DEFAULT_APPLICANT_ROLE = "GUARDIAN";
const HOMETOWN = "Lagab, Compostela, Davao de Oro";

/** "Purok - 5" -> "P-5" (the short form used on the pass). */
const toShortPurok = (purok: string | null | undefined): string => {
  const number = getPurokNumber(purok);
  return number ? `P-${number}` : clean(purok);
};

const NUMBER_WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
  "Twenty",
];

/** 5 -> "Five (5)"; numbers above twenty are written as digits only. */
const numberInWords = (value: number): string =>
  NUMBER_WORDS[value] ? `${NUMBER_WORDS[value]} (${value})` : String(value);

/** "Five (5) year old" (or "Eight (8) month old" under one year), measured
 *  on the issue date; "" when the birth date is missing or in the future. */
const describeChildAge = (birthDate: string, issuedDate: string): string => {
  const birth = parseIsoDate(birthDate);
  if (!birth) return "";
  const onDate = parseIsoDate(issuedDate) ?? new Date();

  let months =
    (onDate.getFullYear() - birth.getFullYear()) * 12 +
    (onDate.getMonth() - birth.getMonth());
  if (onDate.getDate() < birth.getDate()) months -= 1;
  if (months < 0) return "";

  if (months < 12) return `${numberInWords(months)} month old`;
  return `${numberInWords(Math.floor(months / 12))} year old`;
};

/** Destination without a trailing period (the sentence adds one). */
const cleanDestination = (value: string): string =>
  clean(value).replace(/[.\s]+$/, "");

const SERIF = "times" as const;

const buildParagraphs = (details: DocumentDetails): Paragraph[] => {
  const applicant = clean(details.applicantName) || BLANK_LINE;
  const childName = clean(details.childName);
  const role = clean(details.applicantRole);
  const applicantLabel =
    childName && role ? `${applicant} (${role.toUpperCase()}),` : `${applicant},`;
  const origin = [clean(details.residentPurok), HOMETOWN]
    .filter(Boolean)
    .join(" ");
  const destination = cleanDestination(details.destination) || BLANK_LINE;

  let travel: TextRun[];
  if (childName) {
    const birthDate = formatLongDate(details.childBirthDate);
    const age = describeChildAge(details.childBirthDate, details.issuedDate);
    const childWord = clean(details.childSex) || "child";
    const birthClause = [
      birthDate ? `was born on ${birthDate}` : "",
      age ? `a ${age} ${childWord}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    travel = [
      {
        text: "This is to certify further that the above-mentioned name has to travel the child name ",
      },
      { text: childName.toUpperCase(), bold: true, font: SERIF },
      {
        text: `, ${birthClause ? `${birthClause} ` : ""}from ${origin} to ${destination}.`,
      },
    ];
  } else {
    travel = [
      {
        text: `This is to certify further that the above-mentioned name has to travel from ${origin} to ${destination}.`,
      },
    ];
  }

  return [
    [
      { text: "This is to certify that " },
      { text: applicantLabel, bold: true, font: SERIF },
      {
        text: ` ${clean(details.ageDescription) || "of legal age"}, and a bonafide resident of ${origin}.`,
      },
    ],
    travel,
    [
      {
        text: "This certification is being issued upon the request of the above-named person for whatever any legal purposes it may serve best.",
      },
    ],
    [
      { text: "Issued this " },
      ...issuedDateRuns(details.issuedDate, {
        lowercaseSuffix: true,
        boldFont: SERIF,
      }),
      { text: " at Barangay Lagab, Compostela, Davao de Oro, Philippines." },
    ],
  ];
};

/* Page geometry (A4, mm). The header lines sit right of centre, between the
 * seal and the Bagong Pilipinas logo, as on the paper pass. */
const MARGIN_LEFT = 22;
const CONTENT_WIDTH = 163;
const HEADER_CENTER = 121;
const PAGE_CENTER = 105;
const TITLE_CENTER = 100;
const SIGNATURE_CENTER = 150;
const SEAL = { x: 17, y: 10, size: 30 };
/** Bagong Pilipinas logo; its image is 572 x 476 px. */
const BAGONG_PILIPINAS = { x: 157, y: 9, width: 32, height: (32 * 476) / 572 };
const HEADER_INK: [number, number, number] = [55, 55, 55];

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
  drawCenteredText(pdf, "REPUBLIC OF THE PHILIPPINES", HEADER_CENTER, 17, headerStyle);
  drawCenteredText(pdf, "PROVINCE OF DAVAO DE ORO", HEADER_CENTER, 22, headerStyle);
  drawCenteredText(pdf, "MUNICIPALITY OF COMPOSTELA", HEADER_CENTER, 27, headerStyle);
  drawCenteredText(pdf, "BARANGAY LAGAB", HEADER_CENTER, 34, {
    sizePt: 13,
    style: "bold",
    charSpace: 0.3,
    color: HEADER_INK,
  });

  drawCenteredText(pdf, "= OFFICE OF THE PUNONG BARANGAY =", PAGE_CENTER, 47, {
    sizePt: 13,
    charSpace: 0.25,
    color: HEADER_INK,
  });

  drawCondensedCenteredText(
    pdf,
    "TRAVEL PASS",
    TITLE_CENTER,
    68,
    { font: "helvetica", style: "bold", sizePt: 28, color: [34, 34, 34] },
    0.85,
  );

  drawTextAt(pdf, "TO WHOM IT MAY CONCERN;", MARGIN_LEFT, 83, {
    font: "helvetica",
    style: "bold",
    sizePt: 13,
  });

  const fontSizePt = 14;
  const lineHeight = 1.4;
  const bodyEnd = drawParagraphs(pdf, buildParagraphs(details), 99, {
    font: "helvetica",
    left: MARGIN_LEFT,
    width: CONTENT_WIDTH,
    firstLineIndent: 12.7,
    fontSizePt,
    lineHeight,
    paragraphGap: 8,
  });

  // Signature block: the Punong Barangay signs first, then the SB Member
  // "by authority of the Punong Barangay".
  let y = bodyEnd + 30;
  drawCenteredText(pdf, PUNONG_BARANGAY, SIGNATURE_CENTER, y, {
    font: "helvetica",
    style: "bold",
    sizePt: 12.5,
    underline: true,
  });
  y += 7;
  drawCenteredText(pdf, "Punong Barangay", SIGNATURE_CENTER, y, {
    font: "helvetica",
    sizePt: 12.5,
  });
  y += 11.5;
  drawCenteredText(
    pdf,
    "By authority of the Punong Barangay:",
    SIGNATURE_CENTER - 6,
    y,
    { font: "helvetica", sizePt: 12.5 },
  );
  y += 17;
  drawCenteredText(
    pdf,
    clean(details.sbMember) || DEFAULT_SB_MEMBER,
    SIGNATURE_CENTER,
    y,
    { sizePt: 11, style: "bold", charSpace: 0.2, underline: true },
  );
  y += 5.5;
  drawCenteredText(pdf, "SB MEMBER", SIGNATURE_CENTER, y, {
    sizePt: 11,
    style: "bold",
    charSpace: 0.2,
  });
};

export const travelPassTemplate: OfficialDocumentTemplate = {
  documentTitle: "Travel Pass",
  matches: (documentName) =>
    documentName.trim().toLowerCase().includes("travel pass"),
  fields: [
    {
      name: "applicantName",
      label: "Applicant name",
      hint: "e.g. MELANIE P. RODIO",
    },
    {
      name: "applicantRole",
      label: "Applicant's role",
      hint: "Shown after the name when travelling with a child",
    },
    { name: "ageDescription", label: "Applicant's age", hint: "e.g. of legal age" },
    { name: "residentPurok", label: "Purok", hint: "e.g. P-5" },
    {
      name: "childName",
      label: "Child's name",
      hint: "Leave empty if the applicant travels alone",
      wide: true,
    },
    { name: "childBirthDate", label: "Child's birth date", type: "date" },
    {
      name: "childSex",
      label: "Child is a",
      type: "select",
      options: ["", "girl", "boy"],
    },
    {
      name: "destination",
      label: "Destination",
      hint: "e.g. PASIG CITY, MANILA PHILIPPINES",
      wide: true,
      required: true,
    },
    { name: "issuedDate", label: "Date issued", type: "date" },
    {
      name: "sbMember",
      label: "SB Member (signatory)",
      hint: `e.g. ${DEFAULT_SB_MEMBER}`,
    },
  ],
  getDefaults: (record) => ({
    applicantName: formatResidentName(record),
    applicantRole: DEFAULT_APPLICANT_ROLE,
    ageDescription: describeAge(record.date_of_birth),
    residentPurok: toShortPurok(record.purok),
    childName: "",
    childBirthDate: "",
    childSex: "",
    destination: "",
    issuedDate: todayIsoDate(),
    sbMember: DEFAULT_SB_MEMBER,
  }),
  blankDetails: {
    applicantName: BLANK_LINE,
    applicantRole: DEFAULT_APPLICANT_ROLE,
    ageDescription: "of legal age",
    residentPurok: "P-___",
    childName: BLANK_LINE,
    childBirthDate: "",
    childSex: "",
    destination: BLANK_LINE,
    issuedDate: "",
    sbMember: DEFAULT_SB_MEMBER,
  },
  draw,
};
