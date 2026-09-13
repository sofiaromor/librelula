import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveBookVisual } from "../src/lib/book3dGeometry.js";

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
  assert.match(bookCss, /\.book3d-face\.is-top > \.book3d-paper-lines,\s*\.book3d-face\.is-bottom > \.book3d-paper-lines \{[^}]*repeating-linear-gradient\(0deg,/);
});

test("the special Villain Assistant edition keeps the photographed painted edge tied to its ISBN", async () => {
  const migration = await readFile(new URL("../../supabase/migrations/20260913040421_seed_asistente_del_villano_visual.sql", import.meta.url), "utf8");
  assert.match(migration, /9791388108112/);
  assert.match(migration, /edition_label = 'Edición especial limitada'/);
  const preset = resolveBookVisual({ isbn: "9791388108112", cover: "https://imagessl2.casadellibro.com/a/l/s5/12/9791388108112.webp" });
  const seededQuads = [...migration.matchAll(/'(\[\[.*?\]\])'::jsonb/g)].map(([, json]) => JSON.parse(json));
  assert.deepEqual(seededQuads, [preset.front_quad, preset.fore_edge_quad]);
  assert.ok(migration.includes(preset.product_image_url));
});

test("the book detail uses the same draggable preview and inspector entry point", async () => {
  const detail = await readFile(new URL("../src/BookDetailImpl.jsx", import.meta.url), "utf8");
  assert.match(detail, /<InteractiveLibraryBook3D item=\{book3dPreviewItem\}/);
  assert.match(detail, /className="book-detail-cover-3d"/);
  assert.match(detail, /<Book3DInspector/);
});

test("the detail preview has no rectangular frame or clipping and reserves room for rotation", async () => {
  const css = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
  const rules = [...css.matchAll(/\.book-detail-cover-wrap\s*\{([^}]*)\}/g)].map(([, declarations]) => declarations);
  assert.ok(rules.length > 0);
  assert.match(rules[0], /margin:\s*24px 12px;/);
  assert.match(rules[0], /overflow:\s*visible;/);
  assert.match(rules[0], /background:\s*transparent;/);
  assert.match(rules[0], /box-shadow:\s*none;/);
  assert.match(rules[0], /aspect-ratio:\s*2 \/ 3;/);
  for (const rule of rules) {
    assert.doesNotMatch(rule, /overflow(?:-x|-y)?:\s*(?:hidden|clip|auto|scroll)/);
    assert.doesNotMatch(rule, /(?:background|box-shadow):\s*(?!transparent\s*;|none\s*;)\S/);
  }
  assert.match(css, /\.book-detail-cover-3d\s*\{[^}]*overflow:\s*visible;/);
  assert.match(css, /\.book-detail-cover-3d:focus-visible\s*\{[^}]*outline:\s*3px solid/);
  // Face-level clipping is still needed to discard the product photo outside each quad.
  const faces = await readFile(new URL("../src/LibraryBook3D.css", import.meta.url), "utf8");
  assert.match(faces, /\.book-face-texture\s*\{[^}]*overflow:\s*hidden;/);
});

test("3D faces, inspector note and face editor use the same effective edition visual", async () => {
  for (const name of ["LibraryBook3D", "Book3DInspector", "BookProductFaceEditor"]) {
    const jsx = await readFile(new URL(`../src/${name}.jsx`, import.meta.url), "utf8");
    assert.match(jsx, /resolveBookVisual\(/);
  }
});

test("painted caps continue the visible edge while unpainted caps retain horizontal paper", async () => {
  const [jsx, inspector, css] = await Promise.all(["LibraryBook3D.jsx", "Book3DInspector.jsx", "LibraryBook3D.css"].map((name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8")));
  assert.equal((jsx.match(/className="book3d-painted-cap"/g) || []).length, 2);
  assert.match(jsx, /const painted = !compact && Boolean\(visual.fore_edge_quad\)/);
  assert.match(jsx, /is-top[^\n]*quad=\{visual.fore_edge_quad\}[^\n]*book3d-paper-lines/);
  assert.match(jsx, /is-bottom[^\n]*quad=\{visual.fore_edge_quad\}[^\n]*book3d-paper-lines/);
  assert.match(css, /\.book3d-painted-cap \{[^}]*rotate\(-90deg\)/);
  assert.match(inspector, /continuación aproximada/);
});

test("generated spines and backs expose the shared dominant color instead of blurred cover overlays", async () => {
  for (const name of ["LibraryBook3D", "LibrarySpineStatic"]) {
    const jsx = await readFile(new URL(`../src/${name}.jsx`, import.meta.url), "utf8");
    assert.match(jsx, /useBook3DColor\(book,/);
    assert.match(jsx, /"--book-cloth": cloth/);
    assert.doesNotMatch(jsx, /blurred=/);
  }
  const texture = await readFile(new URL("../src/BookFaceTexture.jsx", import.meta.url), "utf8");
  assert.match(texture, /width: natural.width/);
  assert.match(texture, /naturalWidth/);
  assert.match(texture, /naturalHeight/);
});
