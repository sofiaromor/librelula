import test from "node:test";
import assert from "node:assert/strict";
import { dominantCoverColor, bookInkColor, loadDominantCoverColor } from "../src/lib/book3dPalette.js";

function pixels(width, height, colorAt) {
  return { width, height, data: Uint8ClampedArray.from(Array.from({ length: width * height }, (_, i) => colorAt(i % width, Math.floor(i / width))).flat()) };
}

test("dominant color follows population, not a saturated title or bright accent", () => {
  const image = pixels(10, 10, (x) => x < 8 ? [68, 52, 92, 255] : [240, 192, 32, 255]);
  assert.equal(dominantCoverColor(image), "#44345c");
});

test("photographed front mask excludes white product margins and another-color painted edge", () => {
  const image = pixels(10, 10, (x, y) => x >= 2 && x < 6 && y >= 1 && y < 9 ? [68, 52, 92, 255] : x >= 6 && x < 8 ? [240, 192, 32, 255] : [255, 255, 255, 255]);
  const front = [[.2, .1], [.6, .1], [.6, .9], [.2, .9]];
  assert.equal(dominantCoverColor(image, front), "#44345c");
});

test("white within a white cover stays white; malformed and transparent images are safe", () => {
  assert.equal(dominantCoverColor(pixels(4, 4, () => [255, 255, 255, 255])), "#ffffff");
  assert.equal(dominantCoverColor(pixels(4, 4, () => [255, 255, 255, 0])), "");
  assert.equal(dominantCoverColor({ data: [], width: 4, height: 4 }), "");
  assert.equal(dominantCoverColor(), "");
});

test("copy contrast adapts to light and dark cover colors", () => {
  assert.equal(bookInkColor("#ffedc0"), "#2b231f");
  assert.equal(bookInkColor("#44345c"), "#fff4df");
});

test("cover/quad color work is shared and pixel-access errors fall back without rejection", async () => {
  const oldImage = globalThis.Image, oldDocument = globalThis.document;
  let requests = 0, denyPixels = false;
  const imageData = pixels(4, 4, () => [68, 52, 92, 255]);
  globalThis.Image = class {
    naturalWidth = 4;
    naturalHeight = 4;
    set src(value) {
      assert.ok(value.startsWith("https://"));
      assert.equal(this.crossOrigin, "anonymous");
      requests += 1;
      queueMicrotask(() => this.onload?.());
    }
  };
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData() { if (denyPixels) throw new Error("Blocked pixel access"); return imageData; } }) }) };
  try {
    const source = "https://images.example.test/palette-shared.jpg";
    const a = loadDominantCoverColor(source), b = loadDominantCoverColor(source);
    assert.equal(a, b);
    assert.equal(await a, "#44345c");
    assert.equal(requests, 1);
    denyPixels = true;
    assert.equal(await loadDominantCoverColor("https://images.example.test/palette-denied.jpg"), "");
  } finally { globalThis.Image = oldImage; globalThis.document = oldDocument; }
});
