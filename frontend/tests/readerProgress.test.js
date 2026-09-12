import test from "node:test";
import assert from "node:assert/strict";

import {
  clampReaderProgress,
  normalizeReaderLocator,
  readerFileFormat,
  readerProgressFromEpub,
  readerProgressFromPdf,
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

test("limpia locators y mantiene rutas de Storage seguras", () => {
  assert.deepEqual(normalizeReaderLocator({ cfi: "epubcfi(/6/2)", empty: "", page: 4, extra: null }), {
    cfi: "epubcfi(/6/2)",
    page: 4,
  });
  assert.equal(safeReaderPathSegment("El nombre del viento / tomo 1"), "El-nombre-del-viento-tomo-1");
  assert.equal(safeReaderPathSegment("///"), "book");
});
