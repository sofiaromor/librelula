import test from "node:test";
import assert from "node:assert/strict";

import {
  READER_AUTO_SAVE_PAGE_INTERVAL,
  READER_SAVE_MODES,
  mergeReaderProgress,
  shouldAutoSaveReaderProgress,
} from "../src/lib/readerProgressPolicy.js";

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
