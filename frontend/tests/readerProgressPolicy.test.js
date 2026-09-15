import test from "node:test";
import assert from "node:assert/strict";

import {
  READER_AUTO_SAVE_PAGE_INTERVAL,
  READER_SAVE_MODES,
  mergeReaderProgress,
  resolveReaderSessionProgress,
  shouldAutoSaveReaderProgress,
} from "../src/lib/readerProgressPolicy.js";
import { readerTouchAction } from "../src/lib/readerUtils.js";

test("el progreso manual no retrocede por el automático", () => {
  assert.equal(mergeReaderProgress(72, 0), 72);
  assert.equal(mergeReaderProgress(72, 40), 72);
  assert.equal(mergeReaderProgress(72, 90), 90);
  assert.equal(mergeReaderProgress(null, 35), 35);
});

test("el guardado automático solo se activa cada cinco páginas", () => {
  assert.equal(READER_AUTO_SAVE_PAGE_INTERVAL, 5);
  assert.equal(shouldAutoSaveReaderProgress({
    mode: READER_SAVE_MODES.MANUAL,
    pendingPageTurns: 5,
  }), false);
  assert.equal(shouldAutoSaveReaderProgress({
    mode: READER_SAVE_MODES.AUTO,
    pendingPageTurns: 4,
  }), false);
  assert.equal(shouldAutoSaveReaderProgress({
    mode: READER_SAVE_MODES.AUTO,
    pendingPageTurns: 5,
  }), true);
  assert.equal(shouldAutoSaveReaderProgress({
    mode: READER_SAVE_MODES.AUTO,
    pendingPageTurns: 8,
  }), true);
});

test("el progreso exacto del archivo sustituye al manual solo cuando ya es autoritativo", () => {
  assert.equal(resolveReaderSessionProgress({
    manualProgress: 72,
    documentProgress: 35,
    documentProgressIsAuthoritative: false,
  }), 72);
  assert.equal(resolveReaderSessionProgress({
    manualProgress: 72,
    documentProgress: 35,
    documentProgressIsAuthoritative: true,
  }), 35);
  assert.equal(resolveReaderSessionProgress({
    manualProgress: null,
    documentProgress: 64,
    documentProgressIsAuthoritative: true,
  }), 64);
});

test("un scroll vertical en cascada nunca se convierte en cambio de capítulo", () => {
  assert.equal(readerTouchAction({ readingMode: "cascade", deltaX: 2, deltaY: -90 }), "");
  assert.equal(readerTouchAction({ readingMode: "cascade", deltaX: -80, deltaY: 3 }), "");
  assert.equal(readerTouchAction({ readingMode: "cascade", deltaX: 1, deltaY: 2 }), "center");
  assert.equal(readerTouchAction({ readingMode: "paged", deltaX: -70, deltaY: 4 }), "next");
  assert.equal(readerTouchAction({ readingMode: "paged", deltaX: 70, deltaY: 4 }), "previous");
  assert.equal(readerTouchAction({ readingMode: "paged", deltaX: 2, deltaY: 80 }), "");
});
