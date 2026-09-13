import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/ReaderPage.jsx", import.meta.url), "utf8");

test("carga el motor del lector bajo demanda", () => {
  assert.doesNotMatch(source, /^import ePub from "epubjs";$/m);
  assert.doesNotMatch(source, /^import \{ getDocument, GlobalWorkerOptions, TextLayer \} from "pdfjs-dist";$/m);
  assert.match(source, /import\("epubjs"\)/);
  assert.match(source, /import\("pdfjs-dist"\)/);
  assert.match(source, /import\("pdfjs-dist\/build\/pdf\.worker\.min\.mjs\?url"\)/);
});

test("el ePub muestra la primera página antes del mapa de posiciones", () => {
  const display = source.indexOf("await rendition.display(cfi)");
  const schedule = source.indexOf("scheduleLocations();", display);
  assert.ok(display >= 0 && schedule > display);
  assert.match(source, /requestIdleCallback/);
});

test("evita consultas innecesarias al abrir un lector con archivo de catálogo", () => {
  assert.match(source, /const assetsPromise = bookEpubFile \|\| bookPdfFile/);
});
