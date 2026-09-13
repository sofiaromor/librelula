import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("both shelf surfaces keep only covers/spines and wire the shared 3D inspector", async () => {
  const library = await readFile(new URL("../src/MiBibliotecaImpl.jsx", import.meta.url), "utf8");
  const showcase = await readFile(new URL("../src/LibraryShelfShowcase.jsx", import.meta.url), "utf8");
  assert.match(library, /onInspectItem=\{setInspectedItem\}/);
  assert.match(library, /<Book3DInspector/);
  assert.match(library, /<InteractiveLibraryBook3D item=\{item\}/);
  assert.match(library, /<LibrarySpineStatic item=\{item\}/);
  assert.match(showcase, /<SpineRowBooks[^>]*onInspectItem=\{onInspectItem\}/);
  assert.match(showcase, /<InteractiveLibraryBook3D item=\{item\}/);
  assert.match(showcase, /<LibrarySpineStatic item=\{item\}/);
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
  const [showcaseCss, bookCss] = await Promise.all([
    readFile(new URL("../src/LibraryShelfShowcase.css", import.meta.url), "utf8"),
    readFile(new URL("../src/LibraryBook3D.css", import.meta.url), "utf8"),
  ]);
  assert.match(showcaseCss, /\.library-showcase-cover-visual > \.book3d-interactive \{[^}]*aspect-ratio: 2 \/ 3;/);
  assert.match(bookCss, /repeating-linear-gradient\(90deg,/);
});

test("the special Villain Assistant edition keeps the photographed painted edge tied to its ISBN", async () => {
  const migration = await readFile(new URL("../../supabase/migrations/20260913040421_seed_asistente_del_villano_visual.sql", import.meta.url), "utf8");
  assert.match(migration, /9791388108112/);
  assert.match(migration, /edition_label = 'Edición especial limitada'/);
  assert.match(migration, /front_quad[\s\S]*\[\[0\.25,0\.14\],\[0\.716,0\.122\],\[0\.716,0\.843\],\[0\.25,0\.855\]\]/);
  assert.match(migration, /fore_edge_quad[\s\S]*\[\[0\.716,0\.122\],\[0\.777,0\.135\],\[0\.777,0\.856\],\[0\.716,0\.843\]\]/);
});

test("the book detail uses the same draggable preview and inspector entry point", async () => {
  const detail = await readFile(new URL("../src/BookDetailImpl.jsx", import.meta.url), "utf8");
  assert.match(detail, /<InteractiveLibraryBook3D item=\{book3dPreviewItem\}/);
  assert.match(detail, /className="book-detail-cover-3d"/);
  assert.match(detail, /<Book3DInspector/);
});
