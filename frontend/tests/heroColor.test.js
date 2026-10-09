import test from "node:test";
import assert from "node:assert/strict";
import { extractHeroColor, heroColorFromDominant, FALLBACK_HERO_COLOR } from "../src/heroColor.js";

test("pale cover preserves its hue instead of falling back to grey", () => {
  const color = heroColorFromDominant("#ffe0c0");
  assert.notEqual(color, FALLBACK_HERO_COLOR);
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  assert.ok(r > g && g > b);
  assert.ok(Math.abs(r / b - 255 / 192) < .02);
  assert.equal(heroColorFromDominant("#44345c"), "#44345C");
  assert.equal(heroColorFromDominant("#ffffff"), "#8C8C8C");
  assert.equal(heroColorFromDominant("invalid"), FALLBACK_HERO_COLOR);
});

test("hero follows predominant cover rather than bright lettering, supports uploads and retries failures", async () => {
  const oldImage = globalThis.Image, oldDocument = globalThis.document;
  let denyPixels = false;
  const data = Uint8ClampedArray.from(Array.from({ length: 100 }, (_, i) => i < 80
    ? [68, 52, 92, 255] : [240, 192, 32, 255]).flat());
  globalThis.Image = class {
    naturalWidth = 10;
    naturalHeight = 10;
    set src(value) {
      assert.ok(value.startsWith("https://") || value.startsWith("blob:"));
      queueMicrotask(() => this.onload?.());
    }
  };
  globalThis.document = { createElement: () => ({ getContext: () => ({
    drawImage() {},
    getImageData() {
      if (denyPixels) throw new Error("temporary failure");
      return { data, width: 10, height: 10 };
    },
  }) }) };
  try {
    assert.equal(await extractHeroColor("blob:cover-upload"), "#44345C");
    denyPixels = true;
    assert.equal(await extractHeroColor("https://images.example.test/hero-retry.jpg"), FALLBACK_HERO_COLOR);
    denyPixels = false;
    assert.equal(await extractHeroColor("https://images.example.test/hero-retry.jpg"), "#44345C");
  } finally {
    globalThis.Image = oldImage;
    globalThis.document = oldDocument;
  }
});
