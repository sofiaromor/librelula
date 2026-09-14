import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/ReaderPage.jsx", import.meta.url), "utf8");

test("mantiene la carga estable del lector ePub", () => {
  assert.match(source, /^import ePub from "epubjs";$/m);
  assert.match(source, /book\.ready/);
  assert.match(source, /book\.locations\.generate\(1600\)/);
});
