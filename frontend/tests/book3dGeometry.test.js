import test from "node:test";
import assert from "node:assert/strict";
import { FULL_FACE, normalizeFaceQuad, faceHomography, projectPoint, faceCssMatrix, normalizeBookVisual, resolveBookVisual, pickVisualEdition, bookThicknessRatio, safeProductImageUrl, bookImageUrl } from "../src/lib/book3dGeometry.js";

const photographedEdition = {
  isbn: "979-1-388108-11-2",
  cover: "https://imagessl2.casadellibro.com/a/l/s5/12/9791388108112.webp",
};

test("product face rectification maps all photographed corners exactly to a rectangle", () => {
  for (const quad of [FULL_FACE, [[.14,.05],[.77,.10],[.77,.95],[.14,.88]], [[.77,.10],[.91,.04],[.91,.89],[.77,.95]]]) {
    const matrix = faceHomography(quad);
    assert.ok(matrix);
    quad.forEach((p, i) => {
      const mapped = projectPoint(matrix, p);
      assert.ok(Math.abs(mapped[0] - FULL_FACE[i][0]) < 1e-8);
      assert.ok(Math.abs(mapped[1] - FULL_FACE[i][1]) < 1e-8);
    });
  }
});

test("reject malformed, crossed, inverted, concave, tiny and out-of-image quads", () => {
  for (const quad of [null, [], [[0,0],[1,1],[1,0],[0,1]], [[0,0],[0,1],[1,1],[1,0]], [[0,0],[1,0],[.2,.2],[0,1]], [[0,0],[.001,0],[.001,.001],[0,.001]], [[-1,0],[1,0],[1,1],[0,1]], [["0",0],[1,0],[1,1],[0,1]], [[0,0],[Infinity,0],[1,1],[0,1]]]) assert.equal(normalizeFaceQuad(quad), null);
});

test("CSS matrix includes correct perspective and handles an unmeasured face safely", () => {
  assert.equal(faceCssMatrix(FULL_FACE, 0, 100), "none");
  assert.equal(faceCssMatrix(null, 120, 180), "none");
  assert.equal(faceCssMatrix(FULL_FACE, 120, 180), "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)");
});

test("a product photo does not imply a photographed edge or hidden faces", () => {
  const visual = normalizeBookVisual({ product_image_url: "https://images.example.test/book.jpg" });
  assert.equal(visual.front_quad, null);
  assert.equal(visual.fore_edge_quad, null);
  assert.equal(normalizeBookVisual({ fore_edge_quad: FULL_FACE }).fore_edge_quad, null);
});

test("textures are chosen by ISBN and never borrowed from an unrelated special edition", () => {
  const primary = { id:"normal", isbn:"111", is_primary:true };
  const special = { id:"painted", isbn:"222", is_primary:false };
  assert.equal(pickVisualEdition({ isbn:"2-22" }, [primary,special]).id, "painted");
  assert.equal(pickVisualEdition({ isbn:"333" }, [special,primary]).id, "normal");
  assert.equal(pickVisualEdition({}, [special]), null);
});

test("thickness stays bounded with malformed and extremely long page counts", () => {
  assert.ok(bookThicknessRatio(800) > bookThicknessRatio(100));
  assert.equal(bookThicknessRatio(99999), .30);
  assert.equal(bookThicknessRatio(-5), bookThicknessRatio(320));
  assert.equal(bookThicknessRatio(NaN), bookThicknessRatio(320));
});

test("only safe HTTPS product images persist; existing local covers remain supported", () => {
  for (const url of ["javascript:alert(1)", "data:image/png;base64,xx", "http://example.test/x", "https://user:pass@example.test/x"]) assert.equal(safeProductImageUrl(url), "");
  assert.equal(bookImageUrl("images/book.webp"), "/images/book.webp");
  assert.equal(bookImageUrl("//evil.test/x"), "");
  const v = normalizeBookVisual({ image_gallery: Array.from({length:20}, (_,i) => `https://images.example.test/${i}.jpg`) });
  assert.equal(v.image_gallery.length, 8);
});

test("verified product photo has separate rectified front and painted edge without a visual seed", () => {
  const visual = resolveBookVisual(photographedEdition);
  assert.equal(visual.product_image_url, "https://imagessl2.casadellibro.com/a/l/s7/12/9791388108112.webp");
  assert.notDeepEqual(visual.front_quad, FULL_FACE);
  assert.notDeepEqual(visual.front_quad, visual.fore_edge_quad);
  for (const quad of [visual.front_quad, visual.fore_edge_quad]) {
    const matrix = faceHomography(quad);
    assert.ok(matrix);
    quad.forEach((point, i) => {
      const projected = projectPoint(matrix, point);
      assert.ok(Math.abs(projected[0] - FULL_FACE[i][0]) < 1e-8);
      assert.ok(Math.abs(projected[1] - FULL_FACE[i][1]) < 1e-8);
    });
  }
  assert.deepEqual(resolveBookVisual({}, photographedEdition), visual);
  assert.deepEqual(resolveBookVisual({ ...photographedEdition, cover: visual.product_image_url }), visual);
});

test("verified coordinates are never borrowed for another ISBN, photograph or unknown selected edition", () => {
  for (const [book, edition] of [
    [{ ...photographedEdition, isbn: "9781234567897" }],
    [{ ...photographedEdition, cover: "https://images.example.test/another-photo.jpg" }],
    [{ ...photographedEdition, isbn: "", title: "Asistente del villano" }],
    [photographedEdition, { isbn: "9781234567897", cover: photographedEdition.cover }],
    [photographedEdition, { cover: photographedEdition.cover }],
  ]) {
    const visual = resolveBookVisual(book, edition);
    assert.equal(visual.front_quad, null);
    assert.equal(visual.fore_edge_quad, null);
  }
});

test("saved edition visual wins over the preset, including an explicitly disabled painted edge", () => {
  const saved = {
    product_image_url: photographedEdition.cover,
    front_quad: FULL_FACE,
    fore_edge_quad: null,
  };
  const visual = resolveBookVisual(photographedEdition, { ...photographedEdition, visual: saved });
  assert.deepEqual(visual, normalizeBookVisual(saved));
  assert.equal(visual.fore_edge_quad, null);
});

test("resolving a preset does not expose mutable shared texture coordinates", () => {
  const before = resolveBookVisual(photographedEdition);
  const mutated = resolveBookVisual(photographedEdition);
  mutated.front_quad[0][0] = 0;
  mutated.fore_edge_quad[0][0] = 0;
  mutated.image_gallery.length = 0;
  assert.deepEqual(resolveBookVisual(photographedEdition), before);
});
