import test from "node:test";
import assert from "node:assert/strict";

import { mergeReaderProgress } from "../src/lib/readerProgressPolicy.js";

test("el progreso manual no retrocede por el automático", () => {
  assert.equal(mergeReaderProgress(72, 0), 72);
  assert.equal(mergeReaderProgress(72, 40), 72);
  assert.equal(mergeReaderProgress(72, 90), 90);
  assert.equal(mergeReaderProgress(null, 35), 35);
});
