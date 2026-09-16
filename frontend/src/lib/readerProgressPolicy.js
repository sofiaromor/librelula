import { clampReaderProgress } from "./readerUtils.js";

export const READER_SAVE_MODES = {
  MANUAL: "manual",
  AUTO: "auto",
};

export const READER_AUTO_SAVE_PAGE_INTERVAL = 5;

export function shouldAutoSaveReaderProgress({
  mode,
  pendingPageTurns,
  interval = READER_AUTO_SAVE_PAGE_INTERVAL,
} = {}) {
  if (mode !== READER_SAVE_MODES.AUTO) return false;

  const turns = Number(pendingPageTurns);
  const threshold = Math.max(1, Math.floor(Number(interval) || READER_AUTO_SAVE_PAGE_INTERVAL));
  return Number.isFinite(turns) && turns >= threshold;
}

export function mergeReaderProgress(manualProgress, automaticProgress) {
  const automatic = clampReaderProgress(automaticProgress);

  if (manualProgress === null || manualProgress === undefined) {
    return automatic;
  }

  return Math.max(clampReaderProgress(manualProgress), automatic);
}

export function resolveReaderSessionProgress({
  manualProgress = null,
  documentProgress = 0,
  documentProgressIsAuthoritative = false,
} = {}) {
  if (documentProgressIsAuthoritative) {
    return clampReaderProgress(documentProgress);
  }

  return mergeReaderProgress(manualProgress, documentProgress);
}

export function isReaderDocumentProgressAuthoritative({
  manualProgress = null,
  documentProgress = 0,
  progressIsPrecise = false,
  manualProgressApplied = false,
  userNavigationOccurred = false,
} = {}) {
  if (!progressIsPrecise) return false;
  if (manualProgress === null || manualProgress === undefined) return true;
  if (manualProgressApplied || userNavigationOccurred) return true;
  return clampReaderProgress(documentProgress) >= clampReaderProgress(manualProgress);
}
