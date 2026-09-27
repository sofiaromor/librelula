import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";

const stylesheet = (name) => postcss.parse(readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8"));

test("mobile showcase hides only the copy, never the cover or its stars", () => {
  const css = stylesheet("LibraryShelfShowcase.css");
  const hidden = [];
  css.walkAtRules("media", (media) => {
    media.walkRules((rule) => {
      rule.walkDecls("display", (declaration) => {
        if (declaration.value === "none") hidden.push(rule.selector);
      });
    });
  });
  assert.ok(hidden.includes(".library-showcase-cover-copy"));
  assert.ok(hidden.every((selector) => !/cover-card\s*>\s*span|cover-visual|photo-score/.test(selector)));
});

test("cover star rails default to columns; only group headings are horizontal", () => {
  for (const [file, selector] of [
    ["LibraryShelfShowcase.css", ".library-showcase-photo-score"],
    ["MiBibliotecaV2.css", ".library-v2-score"],
  ]) {
    const directions = [];
    stylesheet(file).walkRules(selector, (rule) => {
      rule.walkDecls("flex-direction", (declaration) => directions.push(declaration.value));
    });
    assert.deepEqual(directions, ["column"]);
  }
});

test("library avatar styles cannot leak into the reader profile", () => {
  const selectors = [];
  stylesheet("MiBiblioteca.css").walkRules((rule) => {
    if (rule.selector?.includes("profile-avatar-wrap")) selectors.push(rule.selector);
  });

  assert.ok(selectors.length > 0);
  assert.ok(selectors.every((selector) => selector.startsWith(".library-page ")));
});
