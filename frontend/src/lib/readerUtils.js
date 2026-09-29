export const READER_DOCUMENT_BUCKET = "reader-documents";

export const READER_FORMATS = {
  epub: "ePub",
  pdf: "PDF",
};

export const READER_MAX_FILE_SIZE = 100 * 1024 * 1024;

const FORMAT_BY_MIME = {
  "application/epub+zip": "epub",
  "application/pdf": "pdf",
};

function cleanText(value) {
  return String(value || "").trim();
}

export function readerFileFormat(fileOrName) {
  const mime = cleanText(fileOrName?.type || fileOrName).toLowerCase();
  if (FORMAT_BY_MIME[mime]) return FORMAT_BY_MIME[mime];

  const name = cleanText(fileOrName?.name || fileOrName).toLowerCase();
  if (name.endsWith(".epub")) return "epub";
  if (name.endsWith(".pdf")) return "pdf";
  return "";
}

export function readerMimeType(format) {
  return format === "pdf" ? "application/pdf" : "application/epub+zip";
}

export function validateReaderFile(file) {
  const format = readerFileFormat(file);

  if (!format) {
    return {
      valid: false,
      error: "Elige un archivo ePub (.epub) o PDF (.pdf).",
    };
  }

  if (Number(file?.size || 0) <= 0) {
    return {
      valid: false,
      error: "El archivo está vacío.",
    };
  }

  if (Number(file.size) > READER_MAX_FILE_SIZE) {
    return {
      valid: false,
      error: "El archivo debe pesar menos de 100 MB.",
    };
  }

  return { valid: true, format };
}

export function clampReaderProgress(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function normalizeReaderLocator(locator = {}) {
  if (!locator || typeof locator !== "object" || Array.isArray(locator)) return {};

  return Object.fromEntries(
    Object.entries(locator)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .slice(0, 12),
  );
}

export function readerProgressFromPdf(page, totalPages) {
  const safePage = Math.max(1, Math.round(Number(page) || 1));
  const safeTotal = Math.max(1, Math.round(Number(totalPages) || 1));

  return clampReaderProgress((safePage / safeTotal) * 100);
}

export function readerProgressFromPdfPosition(page, totalPages, pageOffset = 0) {
  const safeTotal = Math.max(1, Math.round(Number(totalPages) || 1));
  const safePage = Math.min(safeTotal, Math.max(1, Math.round(Number(page) || 1)));
  const numericOffset = Number(pageOffset);
  const safeOffset = Number.isFinite(numericOffset)
    ? Math.max(0, Math.min(1, numericOffset))
    : 0;

  return clampReaderProgress(((safePage - 1 + safeOffset) / safeTotal) * 100);
}

export function readerPdfResumeLocation(savedProgress, totalPages) {
  const pages = Math.max(1, Math.round(Number(totalPages) || 1));
  const progress = clampReaderProgress(savedProgress?.progress);
  const storedPage = Number(savedProgress?.current_page || savedProgress?.locator?.page || 0);
  const page = Math.min(pages, Math.max(1,
    storedPage > 0 ? Math.round(storedPage) : Math.ceil(pages * progress / 100),
  ));
  const storedOffset = savedProgress?.locator?.offset;
  const offset = storedOffset === undefined
    ? Math.max(0, Math.min(1, pages * progress / 100 - (page - 1)))
    : Math.max(0, Math.min(1, Number(storedOffset) || 0));

  return { page, offset };
}

export function readerProgressFromEpub(percentage) {
  return clampReaderProgress(Number(percentage || 0) * 100);
}

export function readerProgressLabel(progress) {
  return `${clampReaderProgress(progress)}%`;
}

export function safeReaderPathSegment(value, fallback = "book") {
  const segment = cleanText(value)
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return segment || fallback;
}
