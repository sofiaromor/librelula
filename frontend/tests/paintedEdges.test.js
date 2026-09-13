import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { detectPaintedEdges, paintedEdgeReviewMessage, discardStaleFaceSelection } from "../src/lib/paintedEdges.js";
import { VERIFIED_PAINTED_EDGE_PRESETS } from "../src/lib/paintedEdgePresets.js";
import { FULL_FACE, normalizeFaceQuad, resolveBookVisual, resolveImportedBookVisual, faceHomography, projectPoint } from "../src/lib/book3dGeometry.js";

const cases = JSON.parse(await readFile(new URL("./fixtures/painted-edges.json", import.meta.url), "utf8"));
for (const c of cases) test(`painted candidate: ${c.name}`, () => {
  const result = detectPaintedEdges(c.item);
  assert.equal(result.status, c.status);
  assert.equal(result.reason, c.reason);
  assert.equal(Boolean(paintedEdgeReviewMessage(result)), c.status !== "none");
  assert.equal(resolveBookVisual({ ...c.item, cover: "https://example.test/not-verified.jpg" }).fore_edge_quad, null);
});

test("all verified faces are valid, isolated by ISBN and rectified independently", () => {
  assert.equal(new Set(VERIFIED_PAINTED_EDGE_PRESETS.map((p) => p.isbn)).size, VERIFIED_PAINTED_EDGE_PRESETS.length);
  assert.equal(VERIFIED_PAINTED_EDGE_PRESETS.length, 43);
  for (const p of VERIFIED_PAINTED_EDGE_PRESETS) {
    for (const cover of p.cover_urls) {
      const v = resolveBookVisual({ isbn: p.isbn, cover });
      assert.ok(v.fore_edge_quad, p.isbn);
      assert.notDeepEqual(v.front_quad, v.fore_edge_quad);
      for (const quad of [v.front_quad, v.fore_edge_quad]) {
        assert.ok(normalizeFaceQuad(quad), p.isbn);
        const m = faceHomography(quad);
        quad.forEach((point, i) => projectPoint(m, point).forEach((n, j) => assert.ok(Math.abs(n - FULL_FACE[i][j]) < 1e-8)));
      }
      const otherIsbn = p.isbn === "9788491058090" ? "9791388108112" : "9788491058090";
      assert.equal(resolveBookVisual({ isbn: otherIsbn, cover }).fore_edge_quad, null);
      assert.equal(resolveBookVisual({ isbn: p.isbn, cover: "https://example.test/new-photo.jpg" }).fore_edge_quad, null);
      assert.equal(resolveBookVisual({ isbn: p.isbn, cover }, { isbn: "", cover }).fore_edge_quad, null);
      const disabled = { ...v, fore_edge_quad: null };
      assert.equal(resolveBookVisual({ isbn: p.isbn, cover }, { isbn: p.isbn, cover, visual: disabled }).fore_edge_quad, null);
      v.fore_edge_quad[0][0] = 0;
      assert.notEqual(resolveBookVisual({ isbn: p.isbn, cover }).fore_edge_quad[0][0], 0);
    }
  }
});

test("technical special-binding metadata finds the two missed editions", () => {
  for (const [isbn, cover] of [
    ["9791387901813", "https://imagessl3.casadellibro.com/a/l/s5/13/9791387901813.webp"],
    ["9788410399341", "https://imagessl1.casadellibro.com/a/l/s5/41/9788410399341.webp"],
  ]) {
    const visual = resolveBookVisual({ isbn, cover });
    assert.ok(visual.front_quad, isbn);
    assert.ok(visual.fore_edge_quad, isbn);
    assert.notDeepEqual(visual.front_quad, visual.fore_edge_quad);
  }
});

test("import and existing-book review recalculate candidates without auto-cropping text", async () => {
  const source = await readFile(new URL("../src/CatalogJsonImport.jsx", import.meta.url), "utf8");
  assert.match(source, /paintedEdges: detectPaintedEdges\(item\)/);
  assert.match(source, /visibleItems\.map/);
  assert.match(source, /Revisar foto del canto/);
  assert.match(source, /aria-pressed=\{onlyPaintedCandidates\}/);
  const inspector = await readFile(new URL("../src/Book3DInspector.jsx", import.meta.url), "utf8");
  assert.match(inspector, /detectPaintedEdges\(edition \|\| book\)/);
  assert.match(inspector, /isAdmin && !exactEdge/);
});

test("editing ISBN or original photograph clears the previous face selection", () => {
  const item = { isbn:"9788491058090", cover:"https://example.test/one.jpg", visual:{ fore_edge_quad:FULL_FACE } };
  assert.equal(discardStaleFaceSelection(item, { isbn:"9791388108112" }).visual, null);
  assert.equal(discardStaleFaceSelection(item, { cover:"https://example.test/two.jpg" }).visual, null);
  assert.equal(Object.hasOwn(discardStaleFaceSelection(item, { title:"Updated title" }), "visual"), false);
  assert.equal(Object.hasOwn(discardStaleFaceSelection(item, { isbn:item.isbn }), "visual"), false);
});

test("imports prepare only verified ISBN/photo pairs and preserve deliberate crop choices", () => {
  for (const preset of VERIFIED_PAINTED_EDGE_PRESETS) {
    const item = { isbn:preset.isbn, cover:preset.cover_urls[0] };
    assert.ok(resolveImportedBookVisual(item).fore_edge_quad);
    assert.ok(resolveImportedBookVisual({ ...item, product_image_url:preset.product_image_url }).fore_edge_quad);
    assert.equal(resolveImportedBookVisual({ ...item, product_image_url:"https://example.test/another.jpg" }).fore_edge_quad, null);
    assert.equal(resolveImportedBookVisual({ ...item, isbn:"", product_image_url:preset.product_image_url }).fore_edge_quad, null);
    assert.equal(resolveImportedBookVisual({ ...item, visual:{product_image_url:preset.product_image_url,front_quad:FULL_FACE,fore_edge_quad:null} }).fore_edge_quad, null);
  }
});
