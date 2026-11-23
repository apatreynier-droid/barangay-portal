/**
 * Shared engine for the official Barangay Lagab documents (Business Permit,
 * Certificate of Residency, ...).
 *
 * Every document is drawn once, with jsPDF, on an A4 page measured in
 * millimetres. Preview, Print and "Save PDF" all use that same PDF, so the
 * printed copy always matches the downloaded file.
 */
import type { jsPDF } from "jspdf";
import barangaySealUrl from "../../../assets/logo-256.png";
import bagongPilipinasUrl from "../../../assets/bagong-pilipinas.png";
import compostelaSealUrl from "../../../assets/compostela-seal.png";
import davaoDeOroSealUrl from "../../../assets/davao-de-oro-seal.png";
import type { AdminRequestHistoryEntry } from "../../../Types/Admin/AdminRequestHistoryType";

/* ------------------------------------------------------------------------ */
/* Constants                                                                 */
/* ------------------------------------------------------------------------ */

/** Signs every document. Update after an election. */
export const PUNONG_BARANGAY = "HON. SALVADOR L. ALMILLA";
export const BARANGAY_ADDRESS = "Barangay Lagab, Compostela, Davao de Oro";
export const PAGE = { width: 210, height: 297 };
export const PT_TO_MM = 25.4 / 72;
export const BLANK_LINE = "______________________";

/* ------------------------------------------------------------------------ */
/* Template contract                                                         */
/* ------------------------------------------------------------------------ */

export type DocumentDetails = Record<string, string>;

export type DetailField = {
  name: string;
  label: string;
  hint?: string;
  type?: "text" | "date" | "select";
  /** Choices for a "select" field; "" shows as "Not specified". */
  options?: string[];
  wide?: boolean;
  /** Printing is blocked while a required field is empty. */
  required?: boolean;
};

export type DocumentImages = {
  /** Barangay Lagab official seal (data URL, "" if it failed to load). */
  seal: string;
  /** Bagong Pilipinas logo (data URL, "" if it failed to load). */
  bagongPilipinas: string;
  /** Municipality of Compostela seal (data URL, "" if it failed to load). */
  compostelaSeal: string;
  /** Province of Davao de Oro seal (data URL, "" if it failed to load). */
  davaoDeOroSeal: string;
};

export type OfficialDocumentTemplate = {
  /** e.g. "Business Permit"; used for titles and file names. */
  documentTitle: string;
  matches: (documentName: string) => boolean;
  /** Editable details shown to the admin before printing. */
  fields: DetailField[];
  getDefaults: (record: AdminRequestHistoryEntry) => DocumentDetails;
  /** Values used by the Document Management "Preview" button. */
  blankDetails: DocumentDetails;
  draw: (pdf: jsPDF, details: DocumentDetails, images: DocumentImages) => void;
};

/* ------------------------------------------------------------------------ */
/* Default values from the resident's profile                                */
/* ------------------------------------------------------------------------ */

export const clean = (value: string | number | null | undefined): string =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** "Purok - 3" -> "3"; returns "" when the value has no purok number. */
export const getPurokNumber = (purok: string | null | undefined): string =>
  /^purok\s*-?\s*(\d+)$/i.exec(clean(purok))?.[1] ?? "";

/** "Janet Cruz Juban" -> "JANET C. JUBAN" */
export function formatResidentName(record: AdminRequestHistoryEntry): string {
  const first = clean(record.resident_first_name);
  const last = clean(record.resident_last_name);

  if (!first && !last) return clean(record.resident_name).toUpperCase();

  const middle = clean(record.resident_middle_name);
  const middleInitial = middle ? `${middle.charAt(0)}.` : "";
  const suffix = clean(record.resident_suffix);

  return [first, middleInitial, last, suffix]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

/** Age in whole years, or null when the birth date is unknown. */
export function getAge(dateOfBirth: string | null | undefined): number | null {
  const value = clean(dateOfBirth);
  const birth = value ? new Date(`${value.slice(0, 10)}T00:00:00`) : null;
  if (!birth || Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hadBirthday =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() &&
      today.getDate() >= birth.getDate());
  if (!hadBirthday) age -= 1;

  return age >= 0 ? age : null;
}

/** "of legal age" for adults (or unknown age), otherwise "15 years old". */
export function describeAge(dateOfBirth: string | null | undefined): string {
  const age = getAge(dateOfBirth);
  return age === null || age >= 18 ? "of legal age" : `${age} years old`;
}

export function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/* ------------------------------------------------------------------------ */
/* Rich text                                                                 */
/* ------------------------------------------------------------------------ */

export type TextRun = {
  text: string;
  bold?: boolean;
  sup?: boolean;
  /** Overrides the paragraph font for this run (e.g. serif names in a
   *  sans-serif paragraph). */
  font?: FontFamily;
};
export type Paragraph = TextRun[];
/** A paragraph with its own first-line indent (mm), overriding the layout's. */
export type IndentedParagraph = { runs: Paragraph; indent: number };

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

const ordinalSuffix = (day: number): string => {
  const lastTwo = day % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return "TH";
  return ["TH", "ST", "ND", "RD"][day % 10] ?? "TH";
};

/**
 * "1ST day of OCTOBER, 2026" as styled runs: the day number and its
 * superscript suffix in bold, the month and year in bold.
 *   - `boldDayWord` also bolds the word "day" (Certificate of Residency).
 *   - `lowercaseSuffix` prints "20th" instead of "20TH" (Travel Pass).
 *   - `superscript: false` keeps the suffix on the line ("12th").
 *   - `monthTitleCase` prints "November" instead of "NOVEMBER".
 *   - `boldFont` sets the font of the bold parts.
 * A blank date prints underscores to be filled in by hand.
 */
export function issuedDateRuns(
  issuedDate: string,
  {
    boldDayWord = false,
    lowercaseSuffix = false,
    superscript = true,
    monthTitleCase = false,
    boldFont,
  }: {
    boldDayWord?: boolean;
    lowercaseSuffix?: boolean;
    superscript?: boolean;
    monthTitleCase?: boolean;
    boldFont?: FontFamily;
  } = {},
): TextRun[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(issuedDate));

  if (!match) return [{ text: "______ day of ____________________" }];

  const day = Number(match[3]);
  const upperMonth = MONTHS[Number(match[2]) - 1] ?? "";
  const month = monthTitleCase
    ? `${upperMonth.charAt(0)}${upperMonth.slice(1).toLowerCase()}`
    : upperMonth;
  const suffix = ordinalSuffix(day);

  return [
    { text: String(day), bold: true, font: boldFont },
    {
      text: lowercaseSuffix ? suffix.toLowerCase() : suffix,
      bold: true,
      sup: superscript,
      font: boldFont,
    },
    { text: " day", bold: boldDayWord, font: boldDayWord ? boldFont : undefined },
    { text: " of " },
    { text: `${month}, ${match[1]}`, bold: true, font: boldFont },
  ];
}

/** Parses a yyyy-mm-dd value into a local Date, or null. */
export function parseIsoDate(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(clean(value));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "2021-04-19" -> "April 19, 2021" (or "" when the value is not a date). */
export function formatLongDate(value: string | null | undefined): string {
  const date = parseIsoDate(value);
  if (!date) return "";
  const month = MONTHS[date.getMonth()];
  return `${month.charAt(0)}${month.slice(1).toLowerCase()} ${date.getDate()}, ${date.getFullYear()}`;
}

/* ------------------------------------------------------------------------ */
/* PDF drawing helpers                                                       */
/* ------------------------------------------------------------------------ */

export type FontFamily = "times" | "helvetica";
export type FontStyle = "normal" | "bold" | "italic" | "bolditalic";

export type TextStyle = {
  font?: FontFamily;
  style?: FontStyle;
  sizePt: number;
  /** Extra space between letters, in mm. */
  charSpace?: number;
  /** RGB colour; black when omitted. */
  color?: [number, number, number];
  underline?: boolean;
};

const applyTextStyle = (pdf: jsPDF, textStyle: TextStyle): void => {
  pdf.setFont(textStyle.font ?? "times", textStyle.style ?? "normal");
  pdf.setFontSize(textStyle.sizePt);
  pdf.setTextColor(...(textStyle.color ?? [0, 0, 0]));
};

/**
 * Width of `text` in the current font, in mm. jsPDF's getTextWidth applies
 * kerning but pdf.text() draws without it, so measuring with kerning makes
 * words look squeezed together (e.g. "CITY,MANILA"). Measure unkerned.
 */
const textWidth = (pdf: jsPDF, text: string): number =>
  (pdf.getStringUnitWidth(text, { doKerning: false, charSpace: 0 }) *
    pdf.getFontSize()) /
  pdf.internal.scaleFactor;

/** Width of a single line in mm, including any letter spacing. */
export function measureText(
  pdf: jsPDF,
  text: string,
  textStyle: TextStyle,
): number {
  applyTextStyle(pdf, textStyle);
  const charSpace = textStyle.charSpace ?? 0;
  return textWidth(pdf, text) + charSpace * Math.max(text.length - 1, 0);
}

/** Draws one line of text whose left edge is at `x`. */
export function drawTextAt(
  pdf: jsPDF,
  text: string,
  x: number,
  baseline: number,
  textStyle: TextStyle,
): void {
  const width = measureText(pdf, text, textStyle);
  applyTextStyle(pdf, textStyle);
  // charSpace is always passed so a previous letter spacing never carries over.
  pdf.text(text, x, baseline, { charSpace: textStyle.charSpace ?? 0 });

  if (textStyle.underline) {
    pdf.setDrawColor(...(textStyle.color ?? [0, 0, 0]));
    pdf.setLineWidth(0.3);
    pdf.line(x, baseline + 0.9, x + width, baseline + 0.9);
  }
}

/** Draws one line of text centred on `centerX`. */
export function drawCenteredText(
  pdf: jsPDF,
  text: string,
  centerX: number,
  baseline: number,
  textStyle: TextStyle,
): void {
  const width = measureText(pdf, text, textStyle);
  drawTextAt(pdf, text, centerX - width / 2, baseline, textStyle);
}

/**
 * Draws a line horizontally condensed by `scale` (for tall, narrow titles).
 * jsPDF never resets the scale it sets, so it is scoped to a saved state.
 */
export function drawCondensedCenteredText(
  pdf: jsPDF,
  text: string,
  centerX: number,
  baseline: number,
  textStyle: TextStyle,
  scale: number,
): void {
  const width = measureText(pdf, text, textStyle) * scale;
  applyTextStyle(pdf, textStyle);
  pdf.saveGraphicsState();
  pdf.text(text, centerX - width / 2, baseline, {
    horizontalScale: scale,
    charSpace: 0,
  });
  pdf.restoreGraphicsState();
}

export type ParagraphLayout = {
  /** Paragraph font; "times" when omitted. Runs may override it. */
  font?: FontFamily;
  left: number;
  width: number;
  firstLineIndent: number;
  fontSizePt: number;
  lineHeight: number;
  /** Extra space between paragraphs, in mm. */
  paragraphGap: number;
};

type WordPiece = {
  text: string;
  bold: boolean;
  sup: boolean;
  font: FontFamily;
  width: number;
};
type Word = {
  pieces: WordPiece[];
  width: number;
  /** No space before the next word (the two halves of a hyphenated word). */
  joinNext: boolean;
};

const SUP_SCALE = 0.62;

const setBodyFont = (
  pdf: jsPDF,
  layout: ParagraphLayout,
  bold: boolean,
  sup = false,
  font: FontFamily = layout.font ?? "times",
): void => {
  pdf.setFont(font, bold ? "bold" : "normal");
  pdf.setFontSize(layout.fontSizePt * (sup ? SUP_SCALE : 1));
  pdf.setTextColor(0, 0, 0);
};

/**
 * Splits styled runs into words. Runs without a space between them stay in
 * one word (e.g. "8" + superscript "TH"). A hyphen followed by a letter is a
 * break opportunity: "above-mentioned" becomes "above-" + "mentioned" with
 * `joinNext` set, so the line may break after the hyphen.
 */
const toWords = (
  pdf: jsPDF,
  paragraph: Paragraph,
  layout: ParagraphLayout,
): Word[] => {
  const words: Word[] = [];
  let current: WordPiece[] = [];

  const flush = (joinNext: boolean) => {
    if (current.length) {
      words.push({
        pieces: current,
        width: current.reduce((total, piece) => total + piece.width, 0),
        joinNext,
      });
      current = [];
    }
  };

  for (const run of paragraph) {
    for (const part of run.text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        flush(false);
        continue;
      }
      const font = run.font ?? layout.font ?? "times";
      setBodyFont(pdf, layout, Boolean(run.bold), Boolean(run.sup), font);

      part.split(/(?<=[A-Za-z]-)(?=[A-Za-z])/).forEach((fragment, index) => {
        if (index > 0) flush(true);
        current.push({
          text: fragment,
          bold: Boolean(run.bold),
          sup: Boolean(run.sup),
          font,
          width: textWidth(pdf, fragment),
        });
      });
    }
  }
  flush(false);

  return words;
};

/**
 * Draws justified paragraphs (first-line indent, last line left-aligned).
 * Returns the baseline of the last line drawn.
 */
export function drawParagraphs(
  pdf: jsPDF,
  paragraphs: Array<Paragraph | IndentedParagraph>,
  firstBaseline: number,
  layout: ParagraphLayout,
): number {
  const lineStep = layout.fontSizePt * layout.lineHeight * PT_TO_MM;
  let baseline = firstBaseline;
  let lastBaseline = firstBaseline;

  for (const entry of paragraphs) {
    const paragraph = Array.isArray(entry) ? entry : entry.runs;
    const firstLineIndent = Array.isArray(entry)
      ? layout.firstLineIndent
      : entry.indent;
    const words = toWords(pdf, paragraph, layout);
    setBodyFont(pdf, layout, false);
    const spaceWidth = textWidth(pdf, " ");

    const lines: Word[][] = [];
    let line: Word[] = [];
    let lineWidth = 0;

    for (const word of words) {
      const available =
        layout.width - (lines.length === 0 ? firstLineIndent : 0);
      const previous = line[line.length - 1];
      const separator = previous && !previous.joinNext ? spaceWidth : 0;
      const nextWidth = line.length
        ? lineWidth + separator + word.width
        : word.width;

      if (line.length && nextWidth > available) {
        lines.push(line);
        line = [word];
        lineWidth = word.width;
      } else {
        line.push(word);
        lineWidth = nextWidth;
      }
    }
    if (line.length) lines.push(line);

    lines.forEach((lineWords, index) => {
      const indent = index === 0 ? firstLineIndent : 0;
      const available = layout.width - indent;
      const wordsWidth = lineWords.reduce(
        (total, word) => total + word.width,
        0,
      );
      const isLastLine = index === lines.length - 1;
      // Only real spaces stretch; hyphenated halves stay joined.
      const gapCount = lineWords
        .slice(0, -1)
        .filter((word) => !word.joinNext).length;
      const gap =
        !isLastLine && gapCount > 0
          ? (available - wordsWidth) / gapCount
          : spaceWidth;

      let x = layout.left + indent;
      for (const word of lineWords) {
        for (const piece of word.pieces) {
          setBodyFont(pdf, layout, piece.bold, piece.sup, piece.font);
          const y = piece.sup
            ? baseline - layout.fontSizePt * PT_TO_MM * 0.38
            : baseline;
          pdf.text(piece.text, x, y, { charSpace: 0 });
          x += piece.width;
        }
        if (!word.joinNext) x += gap;
      }

      lastBaseline = baseline;
      baseline += lineStep;
    });

    baseline += layout.paragraphGap;
  }

  return lastBaseline;
}

/** Adds an image (data URL) if it loaded; silently skips a missing one. */
export function drawImage(
  pdf: jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (!dataUrl) return;
  pdf.addImage(dataUrl, "PNG", x, y, width, height);
}

/* ------------------------------------------------------------------------ */
/* Images                                                                    */
/* ------------------------------------------------------------------------ */

const imageCache = new Map<string, Promise<string>>();

const loadImageDataUrl = (url: string): Promise<string> => {
  let promise = imageCache.get(url);

  if (!promise) {
    promise = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ${url}`);
        return response.blob();
      })
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          }),
      )
      .catch((error: unknown) => {
        imageCache.delete(url);
        throw error;
      });
    imageCache.set(url, promise);
  }

  return promise;
};

export async function loadDocumentImages(): Promise<DocumentImages> {
  const [seal, bagongPilipinas, compostelaSeal, davaoDeOroSeal] =
    await Promise.all(
      [barangaySealUrl, bagongPilipinasUrl, compostelaSealUrl, davaoDeOroSealUrl].map(
        (url) => loadImageDataUrl(url).catch(() => ""),
      ),
    );
  return { seal, bagongPilipinas, compostelaSeal, davaoDeOroSeal };
}

/* ------------------------------------------------------------------------ */
/* Output: preview, print, save                                              */
/* ------------------------------------------------------------------------ */

export async function createDocumentPdf(
  template: OfficialDocumentTemplate,
  details: DocumentDetails,
  referenceNumber?: string,
): Promise<jsPDF> {
  const [{ jsPDF: JsPdf }, images] = await Promise.all([
    import("jspdf"),
    loadDocumentImages(),
  ]);
  const pdf = new JsPdf({ unit: "mm", format: "a4" });

  template.draw(pdf, details, images);

  pdf.setProperties({
    title: referenceNumber
      ? `${template.documentTitle} - ${referenceNumber}`
      : template.documentTitle,
    subject: template.documentTitle,
    author: "Barangay Lagab",
  });

  return pdf;
}

/**
 * Opens the document in a new tab. The tab is opened right away (so pop-up
 * blockers allow it) and shows the PDF once it is generated. With
 * `autoPrint` the browser's print dialog opens on top of it.
 */
export function openDocumentInNewTab(
  template: OfficialDocumentTemplate,
  details: DocumentDetails,
  { autoPrint, referenceNumber }: { autoPrint: boolean; referenceNumber?: string },
): void {
  const tab = window.open("", "_blank");

  if (!tab) {
    window.alert(
      "Please allow pop-ups for this site to open the printable document.",
    );
    return;
  }

  tab.document.title = template.documentTitle;
  tab.document.body.innerHTML = `<p style="font-family:sans-serif;padding:24px">Preparing the ${template.documentTitle}…</p>`;

  createDocumentPdf(template, details, referenceNumber)
    .then((pdf) => {
      if (autoPrint) pdf.autoPrint();
      tab.location.href = String(pdf.output("bloburl"));
    })
    .catch((error: unknown) => {
      console.error(`Failed to generate the ${template.documentTitle}`, error);
      tab.close();
      window.alert("Unable to generate the document. Please try again.");
    });
}

const toSafeFileName = (value: string): string =>
  value
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "_")
    .replace(/^_+|_+$/g, "") || "document";

export async function saveDocumentPdf(
  template: OfficialDocumentTemplate,
  details: DocumentDetails,
  referenceNumber: string,
): Promise<void> {
  try {
    const pdf = await createDocumentPdf(template, details, referenceNumber);
    pdf.save(
      `${toSafeFileName(referenceNumber)}_${toSafeFileName(template.documentTitle)}.pdf`,
    );
  } catch (error) {
    console.error(`Failed to generate the ${template.documentTitle} PDF`, error);
    window.alert("Unable to generate the PDF. Please try again.");
  }
}
