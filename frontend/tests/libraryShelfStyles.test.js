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

test("generated cover spines give titles an editorial contrast plate", () => {
  const declarations = new Map();
  stylesheet("LibraryBook3D.css").walkRules(
    ".library-spine-static.is-generated .library-spine-static-title",
    (rule) => rule.walkDecls((declaration) => declarations.set(declaration.prop, declaration.value)),
  );

  assert.match(declarations.get("background") ?? "", /rgba\(31,\s*20,\s*14/);
  assert.match(declarations.get("border") ?? "", /rgba\(255,\s*239,\s*216/);
  assert.match(declarations.get("box-shadow") ?? "", /rgba\(24,\s*14,\s*9/);
  assert.equal(declarations.get("color"), "#fffaf3");
  assert.equal(declarations.get("text-shadow"), "0 1px 2px rgba(0,0,0,.9)");
});
