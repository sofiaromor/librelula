import test from "node:test";
import assert from "node:assert/strict";

import {
  encodeReaderActivityBody,
  normalizeReaderActivityTitle,
  parseReaderActivityBody,
} from "../src/lib/readerActivityMetadata.js";

test("conserva título personalizado y color sin mostrarlos dentro del texto", () => {
  const stored = encodeReaderActivityBody({
    body: "Esta pista cambia el capítulo.",
    title: "Pista importante",
    color: "blue",
    annotationKind: "highlight",
  });
  const parsed = parseReaderActivityBody(stored);

  assert.equal(parsed.body, "Esta pista cambia el capítulo.");
  assert.equal(parsed.activityTitle, "Pista importante");
  assert.equal(parsed.accentColor, "blue");
  assert.equal(parsed.annotationKind, "highlight");
  assert.equal(parsed.isReaderAnnotation, true);
});

test("las publicaciones antiguas siguen siendo texto normal", () => {
  assert.deepEqual(parseReaderActivityBody("Una publicación normal"), {
    body: "Una publicación normal",
    activityTitle: "",
    accentColor: "",
    annotationKind: "",
    isReaderAnnotation: false,
  });
});

test("sanea los títulos libres y aplica un límite estable", () => {
  assert.equal(normalizeReaderActivityTitle("  Mi\n pista   favorita  "), "Mi pista favorita");
  assert.equal(normalizeReaderActivityTitle("x".repeat(80)).length, 48);
});
