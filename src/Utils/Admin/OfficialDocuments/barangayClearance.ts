/**
 * Barangay Clearance, following the paper clearance form issued by the Office
 * of the Punong Barangay of Barangay Lagab: a bordered form with a green side
 * column, gray title and footer bands, and a list of labelled fields.
 */
import type { jsPDF } from "jspdf";
import {
  PUNONG_BARANGAY,
  clean,
  drawCenteredText,
  drawImage,
  drawTextAt,
  formatLongDate,
  getPurokNumber,
  parseIsoDate,
  todayIsoDate,
  type DocumentDetails,
  type DocumentImages,
  type OfficialDocumentTemplate,
  type TextStyle,
} from "./shared";

const DEFAULT_SB_MEMBER = "HON. CHARLZENN B. EJAGO";
const DEFAULT_REMARKS = "NO DEROGATORY RECORDS";

const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

const upper = (value: string | null | undefined): string =>
  clean(value).toUpperCase();

/** "REQ-2026-000152" -> "2026-152"; other formats are kept as they are. */
const toClearanceNumber = (requestNumber: string): string => {
  const match = /(\d{4})-0*(\d+)$/.exec(clean(requestNumber));
  return match ? `${match[1]}-${match[2]}` : clean(requestNumber);
};

/** "Purok - 3" -> "PUROK-3 LAGAB, COMPOSTELA, DAVAO DE ORO" */
const toAddress = (purok: string | null | undefined): string => {
  const number = getPurokNumber(purok);
  const purokLabel = number ? `PUROK-${number}` : upper(purok);
  return [purokLabel, "LAGAB, COMPOSTELA, DAVAO DE ORO"]
    .filter(Boolean)
    .join(" ");
};

/** "2026-10-29" -> "10/29/2026" */
const toSlashDate = (value: string): string => {
  const date = parseIsoDate(value);
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}/${date.getFullYear()}`;
};

/** "Issued this 29TH day of OCTOBER, 2026 at" (blanks when no date). */
const issuedLine = (value: string): string => {
  const date = parseIsoDate(value);
  if (!date) return "Issued this ______ day of ________________ at";

  const day = date.getDate();
  const lastTwo = day % 100;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13
      ? "TH"
      : (["TH", "ST", "ND", "RD"][day % 10] ?? "TH");

  return `Issued this ${day}${suffix} day of ${MONTHS[date.getMonth()]}, ${date.getFullYear()} at`;
};

/* Page geometry (A4, mm), measured from the paper form. */
const FRAME = { left: 15, top: 15, right: 195, bottom: 248.3 };
const DIVIDER_X = 61.2;
const TITLE_BAND = { top: 46.5, bottom: 55.5, darkStrip: 2 };
const FOOTER_BAND_TOP = 243.3;
const BODY_LEFT = 62.5;
const COLON_X = 98.2;
const VALUE_X = 100.3;
const FOOTER_COLON_X = 95.4;
const FOOTER_VALUE_X = 102.5;
const HEADER_CENTER = 102.2;
const TITLE_CENTER = 103.5;
const ISSUED_CENTER = 123.5;
const SIGNATURE_CENTER = 154;

const GREEN: [number, number, number] = [155, 197, 47];
const BAND_GRAY: [number, number, number] = [166, 166, 166];
const BAND_DARK: [number, number, number] = [128, 128, 128];
const HEADER_INK: [number, number, number] = [45, 45, 45];

const SANS: TextStyle = { font: "helvetica", sizePt: 9.5 };
const SANS_BOLD: TextStyle = { font: "helvetica", sizePt: 9.5, style: "bold" };

const fillRect = (
  pdf: jsPDF,
  color: [number, number, number],
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  pdf.setFillColor(...color);
  pdf.rect(x, y, width, height, "F");
};

const draw = (
  pdf: jsPDF,
  details: DocumentDetails,
  images: DocumentImages,
): void => {
  const frameWidth = FRAME.right - FRAME.left;

  // Coloured areas first, then the frame lines on top.
  fillRect(
    pdf,
    BAND_GRAY,
    FRAME.left,
    TITLE_BAND.top,
    frameWidth,
    TITLE_BAND.bottom - TITLE_BAND.top,
  );
  fillRect(pdf, BAND_DARK, FRAME.left, TITLE_BAND.top, frameWidth, TITLE_BAND.darkStrip);
  fillRect(
    pdf,
    GREEN,
    FRAME.left,
    TITLE_BAND.bottom,
    DIVIDER_X - FRAME.left,
    FOOTER_BAND_TOP - TITLE_BAND.bottom,
  );
  fillRect(
    pdf,
    BAND_GRAY,
    FRAME.left,
    FOOTER_BAND_TOP,
    frameWidth,
    FRAME.bottom - FOOTER_BAND_TOP,
  );

  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.4);
  pdf.rect(FRAME.left, FRAME.top, frameWidth, FRAME.bottom - FRAME.top, "S");
  pdf.line(DIVIDER_X, FRAME.top, DIVIDER_X, TITLE_BAND.top);
  pdf.setLineWidth(0.25);
  pdf.line(DIVIDER_X, TITLE_BAND.bottom, DIVIDER_X, FOOTER_BAND_TOP);

  // Seals: barangay on the left; municipality and province on the right.
  drawImage(pdf, images.seal, 25.5, 19, 24, 24);
  drawImage(pdf, images.compostelaSeal, 137.5, 21.5, 22, 22);
  drawImage(pdf, images.davaoDeOroSeal, 163, 21.5, 23, 23);

  const headerStyle: TextStyle = { font: "helvetica", sizePt: 9, color: HEADER_INK };
  drawCenteredText(pdf, "REPUBLIC OF THE PHILIPPINES", HEADER_CENTER, 20.3, headerStyle);
  drawCenteredText(pdf, "PROVINCE OF DAVAO DE ORO", HEADER_CENTER, 24.9, headerStyle);
  drawCenteredText(pdf, "MUNICIPALITY OF COMPOSTELA", HEADER_CENTER, 31, headerStyle);
  drawCenteredText(pdf, "BARANGAY LAGAB", HEADER_CENTER, 36.2, {
    font: "helvetica",
    sizePt: 11,
    style: "bold",
    color: HEADER_INK,
  });
  drawTextAt(pdf, "OFFICE OF THE PUNONG BARANGAY", BODY_LEFT, 44.6, {
    sizePt: 12.5,
    color: HEADER_INK,
  });

  drawCenteredText(pdf, "BARANGAY CLEARANCE", TITLE_CENTER, 53.7, {
    sizePt: 20,
    style: "bold",
    charSpace: 0.5,
    color: [25, 25, 25],
  });

  // Intro (two lines, broken as on the paper form).
  drawTextAt(
    pdf,
    "This is to certify that the person whose name and picture appearing",
    BODY_LEFT,
    60.2,
    SANS,
  );
  drawTextAt(
    pdf,
    "below requested for a clearance and the result are as follows:",
    BODY_LEFT,
    65.4,
    SANS,
  );

  // Labelled fields.
  const rows: Array<[string, string]> = [
    ["CLEARANCE NO", details.clearanceNo],
    ["FAMILY NAME", upper(details.lastName)],
    ["FIRST NAME", upper(details.firstName)],
    ["MIDDLE NAME", upper(details.middleName)],
    ["BIRTHDATE", formatLongDate(details.birthDate)],
    ["PLACE OF BIRTH", upper(details.placeOfBirth)],
    ["ADDRESS", upper(details.address)],
    ["CIVIL STATUS", upper(details.civilStatus)],
    ["GENDER", upper(details.gender)],
    ["PURPOSE", upper(details.purpose)],
    ["REMARKS", upper(details.remarks)],
  ];
  rows.forEach(([label, value], index) => {
    const y = 75.8 + index * 5.55;
    drawTextAt(pdf, label, BODY_LEFT, y, SANS);
    drawTextAt(pdf, ":", COLON_X, y, SANS);
    drawTextAt(pdf, clean(value), VALUE_X, y, SANS);
  });

  drawCenteredText(pdf, issuedLine(details.issuedDate), ISSUED_CENTER, 147.7, SANS_BOLD);
  drawCenteredText(
    pdf,
    "Lagab, Compostela, Davao De Oro, Philippines.",
    ISSUED_CENTER,
    152.4,
    SANS_BOLD,
  );

  // Signature block.
  drawCenteredText(pdf, "In the absence of Punong Barangay;", SIGNATURE_CENTER, 163.9, SANS);
  const officialStyle: TextStyle = { sizePt: 10, style: "bold", underline: true };
  drawCenteredText(pdf, PUNONG_BARANGAY, SIGNATURE_CENTER, 172.2, officialStyle);
  drawCenteredText(pdf, "Punong Barangay", SIGNATURE_CENTER, 177.5, { sizePt: 9.5 });
  drawCenteredText(
    pdf,
    clean(details.sbMember) || DEFAULT_SB_MEMBER,
    SIGNATURE_CENTER,
    186.6,
    officialStyle,
  );
  drawCenteredText(pdf, "SB MEMBER", SIGNATURE_CENTER, 192.3, { sizePt: 9 });

  // Payment and community tax certificate details.
  const footerRows: Array<[string, string]> = [
    ["Official Receipt No.", details.officialReceiptNo],
    ["Amount Paid", details.amountPaid],
    ["Transaction Date", toSlashDate(details.transactionDate)],
    ["CTC/CEDULA No.", details.ctcNo],
    ["CTC Place Issued", details.ctcPlaceIssued],
  ];
  const footerBaselines = [212.6, 218.3, 223.4, 230.4, 235.5];
  footerRows.forEach(([label, value], index) => {
    const y = footerBaselines[index];
    drawTextAt(pdf, label, BODY_LEFT, y, SANS);
    drawTextAt(pdf, ":", FOOTER_COLON_X, y, SANS);
    drawTextAt(pdf, clean(value), FOOTER_VALUE_X, y, SANS);
  });
};

export const barangayClearanceTemplate: OfficialDocumentTemplate = {
  documentTitle: "Barangay Clearance",
  matches: (documentName) =>
    documentName.trim().toLowerCase().includes("clearance"),
  fields: [
    { name: "clearanceNo", label: "Clearance no.", hint: "e.g. 2026-152" },
    { name: "issuedDate", label: "Date issued", type: "date" },
    { name: "lastName", label: "Family name" },
    { name: "firstName", label: "First name" },
    { name: "middleName", label: "Middle name" },
    { name: "birthDate", label: "Birthdate", type: "date" },
    { name: "placeOfBirth", label: "Place of birth", hint: "e.g. MONTEVISTA, DDO" },
    { name: "civilStatus", label: "Civil status", hint: "e.g. MARRIED" },
    { name: "gender", label: "Gender", type: "select", options: ["", "FEMALE", "MALE"] },
    {
      name: "address",
      label: "Address",
      hint: "e.g. PUROK-3 LAGAB, COMPOSTELA, DAVAO DE ORO",
      wide: true,
    },
    {
      name: "purpose",
      label: "Purpose",
      hint: "e.g. FOR MOTORCYCLE APPLICATION PURPOSES",
      wide: true,
      required: true,
    },
    { name: "remarks", label: "Remarks", hint: `e.g. ${DEFAULT_REMARKS}`, wide: true },
    { name: "officialReceiptNo", label: "Official receipt no." },
    { name: "amountPaid", label: "Amount paid", hint: "e.g. 100.00" },
    { name: "transactionDate", label: "Transaction date", type: "date" },
    { name: "ctcNo", label: "CTC/Cedula no." },
    { name: "ctcPlaceIssued", label: "CTC place issued" },
    {
      name: "sbMember",
      label: "SB Member (signatory)",
      hint: `e.g. ${DEFAULT_SB_MEMBER}`,
    },
  ],
  getDefaults: (record) => {
    const today = todayIsoDate();
    const sex = upper(record.sex);

    return {
      clearanceNo: toClearanceNumber(record.request_number),
      issuedDate: today,
      lastName: upper(record.resident_last_name),
      firstName: upper(record.resident_first_name),
      middleName: upper(record.resident_middle_name),
      birthDate: clean(record.date_of_birth).slice(0, 10),
      placeOfBirth: upper(record.place_of_birth),
      civilStatus: upper(record.civil_status),
      gender: sex === "MALE" || sex === "FEMALE" ? sex : "",
      address: toAddress(record.purok),
      purpose: upper(record.purpose),
      remarks: DEFAULT_REMARKS,
      officialReceiptNo: "",
      amountPaid:
        typeof record.fee === "number" ? record.fee.toFixed(2) : "",
      transactionDate: today,
      ctcNo: "",
      ctcPlaceIssued: "",
      sbMember: DEFAULT_SB_MEMBER,
    };
  },
  blankDetails: {
    clearanceNo: "",
    issuedDate: "",
    lastName: "",
    firstName: "",
    middleName: "",
    birthDate: "",
    placeOfBirth: "",
    civilStatus: "",
    gender: "",
    address: "",
    purpose: "",
    remarks: "",
    officialReceiptNo: "",
    amountPaid: "",
    transactionDate: "",
    ctcNo: "",
    ctcPlaceIssued: "",
    sbMember: DEFAULT_SB_MEMBER,
  },
  draw,
};
