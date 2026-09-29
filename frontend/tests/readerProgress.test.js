import test from "node:test";
import assert from "node:assert/strict";

import {
  clampReaderProgress,
  normalizeReaderLocator,
  readerFileFormat,
  readerProgressFromEpub,
  readerProgressFromPdf,
  readerProgressFromPdfPosition,
  readerPdfResumeLocation,
  safeReaderPathSegment,
  validateReaderFile,
} from "../src/lib/readerUtils.js";

test("detecta los formatos admitidos por nombre y MIME", () => {
  assert.equal(readerFileFormat({ name: "El nombre del viento.epub", type: "" }), "epub");
  assert.equal(readerFileFormat({ name: "lectura.bin", type: "application/pdf" }), "pdf");
  assert.equal(readerFileFormat("imagen.jpg"), "");
});

test("valida tamaño, extensión y archivos vacíos", () => {
  assert.deepEqual(validateReaderFile({ name: "libro.epub", type: "", size: 10 }), { valid: true, format: "epub" });
  assert.equal(validateReaderFile({ name: "libro.pdf", type: "", size: 0 }).valid, false);
  assert.equal(validateReaderFile({ name: "libro.txt", type: "text/plain", size: 10 }).valid, false);
  assert.equal(validateReaderFile({ name: "libro.pdf", type: "", size: 100 * 1024 * 1024 + 1 }).valid, false);
});

test("calcula el progreso del PDF y del ePub dentro de 0-100", () => {
  assert.equal(readerProgressFromPdf(1, 4), 25);
  assert.equal(readerProgressFromPdf(5, 4), 100);
  assert.equal(readerProgressFromEpub(0.42), 42);
  assert.equal(clampReaderProgress(-4), 0);
  assert.equal(clampReaderProgress(104), 100);
});

test("calcula el progreso continuo del PDF dentro de la página visible", () => {
  assert.equal(readerProgressFromPdfPosition(1, 4, 0), 0);
  assert.equal(readerProgressFromPdfPosition(1, 4, 1), 25);
  assert.equal(readerProgressFromPdfPosition(2, 4, 0.5), 38);
  assert.equal(readerProgressFromPdfPosition(4, 4, 1), 100);
  assert.equal(readerProgressFromPdfPosition(8, 4, 2), 100);
});

test("reanuda PDFs antiguos y nuevos sin adelantar ni perder el progreso", () => {
  assert.deepEqual(readerPdfResumeLocation({ current_page: 3, progress: 75 }, 4), { page: 3, offset: 1 });
  assert.deepEqual(readerPdfResumeLocation({ progress: 35 }, 10), { page: 4, offset: 0.5 });
  assert.deepEqual(readerPdfResumeLocation({ locator: { page: 4, offset: 0.25 }, progress: 81 }, 5), { page: 4, offset: 0.25 });
  assert.deepEqual(readerPdfResumeLocation(null, 4), { page: 1, offset: 0 });
});

test("limpia locators y mantiene rutas de Storage seguras", () => {
  assert.deepEqual(normalizeReaderLocator({ cfi: "epubcfi(/6/2)", empty: "", page: 4, extra: null }), {
    cfi: "epubcfi(/6/2)",
    page: 4,
  });
  assert.equal(safeReaderPathSegment("El nombre del viento / tomo 1"), "El-nombre-del-viento-tomo-1");
  assert.equal(safeReaderPathSegment("///"), "book");
});
