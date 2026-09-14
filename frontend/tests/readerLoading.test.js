import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/ReaderPage.jsx", import.meta.url), "utf8");

test("mantiene la carga estática del lector ePub", () => {
  assert.match(source, /^import ePub from "epubjs";$/m);
  assert.match(source, /book\.ready/);
  assert.match(source, /book\.locations\.generate\(1600\)/);
});

test("muestra la primera página antes de generar el mapa ePub", () => {
  const readyIndex = source.indexOf("book.ready");
  const displayIndex = source.indexOf("rendition.display(cfi)", readyIndex);
  const scheduleIndex = source.indexOf("scheduleLocations();", displayIndex);

  assert.ok(readyIndex >= 0);
  assert.ok(displayIndex > readyIndex);
  assert.ok(scheduleIndex > displayIndex);
  assert.match(source, /requestIdleCallback/);
});

test("no bloquea la primera página esperando la navegación", () => {
  const readyIndex = source.indexOf("book.ready");
  const displayIndex = source.indexOf("rendition.display(cfi)", readyIndex);
  const navigationIndex = source.indexOf("book.loaded.navigation", displayIndex);

  assert.ok(navigationIndex > displayIndex);
  assert.match(source, /withStartupTimeout\(\s*book\.ready/);
  assert.match(source, /EPUB_STARTUP_TIMEOUT_MS = 15_000/);
});

test("conserva el progreso manual del catálogo", () => {
  assert.match(source, /getCatalogUserBooks\(\{ bookId \}\)/);
  assert.match(source, /const manualProgress = catalogReading/);
  assert.match(source, /Math\.max\(manualProgress, automaticProgress\)/);
});
