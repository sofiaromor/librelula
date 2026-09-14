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
  assert.match(source, /EPUB_STARTUP_TIMEOUT_MS = 10_000/);
});

test("el progreso manual no bloquea el arranque del lector", () => {
  const readerDataIndex = source.indexOf("const readerDataRequest = Promise.all([");
  const readerDataEnd = source.indexOf("]);", readerDataIndex);
  const catalogIndex = source.indexOf("const catalogProgressRequest", readerDataEnd);

  assert.ok(readerDataIndex >= 0);
  assert.ok(readerDataEnd > readerDataIndex);
  assert.ok(catalogIndex > readerDataEnd);
  assert.match(source, /CATALOG_PROGRESS_TIMEOUT_MS = 3_000/);
  assert.match(source, /Promise\.race\(\[catalogProgressRequest, catalogProgressFallback\]\)/);
});

test("la carga inicial del lector tiene un límite visible", () => {
  assert.match(source, /READER_DATA_TIMEOUT_MS = 12_000/);
  assert.match(source, /const readerDataFallback = new Promise/);
  assert.match(source, /Promise\.race\(\[readerDataRequest, readerDataFallback\]\)/);
  assert.match(source, /setCatalogProgressReady\(true\)/);
});

test("conserva el progreso manual del catálogo", () => {
  assert.match(source, /getCatalogUserBooks\(\{ bookId \}\)/);
  assert.match(source, /const manualProgress = catalogReading/);
  assert.match(source, /Math\.max\(manualProgress, automaticProgress\)/);
});
