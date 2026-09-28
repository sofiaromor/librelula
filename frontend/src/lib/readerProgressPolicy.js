import { clampReaderProgress } from "./readerUtils.js";

export function mergeReaderProgress(manualProgress, automaticProgress) {
  const automatic = clampReaderProgress(automaticProgress);

  if (manualProgress === null || manualProgress === undefined) {
    return automatic;
  }

  return Math.max(clampReaderProgress(manualProgress), automatic);
}
