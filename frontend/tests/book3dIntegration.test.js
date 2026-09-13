import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("both shelf surfaces keep only covers/spines and wire the shared 3D inspector", async () => {
  const library = await readFile(new URL("../src/MiBibliotecaImpl.jsx", import.meta.url), "utf8");
  const showcase = await readFile(new URL("../src/LibraryShelfShowcase.jsx", import.meta.url), "utf8");
  assert.match(library, /onInspectItem=\{setInspectedItem\}/);
  assert.match(library, /<Book3DInspector/);
  assert.match(showcase, /<SpineRowBooks[^>]*onInspectItem=\{onInspectItem\}/);
  assert.equal((showcase.match(/aria-label="Ver portadas"/g) || []).length, 1);
  assert.equal((showcase.match(/aria-label="Ver lomos"/g) || []).length, 1);
  assert.match(library, /handleSpineFileSelected/);
  assert.match(library, /handleEditCrop/);
});

test("mobile book/editor dialogs stay in the top layer with bounded dynamic viewport and safe-area footers", async () => {
  for (const name of ["Book3DInspector", "BookProductFaceEditor"]) {
    const [jsx, css] = await Promise.all([
      readFile(new URL(`../src/${name}.jsx`, import.meta.url), "utf8"),
      readFile(new URL(`../src/${name}.css`, import.meta.url), "utf8"),
    ]);
    assert.match(jsx, /<dialog/);
    assert.match(jsx, /showModal\(\)/);
    assert.match(jsx, /onCancel=/);
    assert.match(css, /100dvh/);
    assert.match(css, /safe-area-inset-bottom/);
    assert.match(css, /position: sticky; bottom: 0/);
  }
});

test("rectified cover is an in-flow grid item so it cannot obscure showcase stars or collapse its height", async () => {
  const css = await readFile(new URL("../src/LibraryBook3D.css", import.meta.url), "utf8");
  assert.match(css, /\.library-showcase-cover-visual > \.book-face-texture \{[^}]*position: relative;[^}]*aspect-ratio: 2 \/ 3;/);
});
