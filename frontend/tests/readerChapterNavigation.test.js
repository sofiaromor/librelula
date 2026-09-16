import test from "node:test";
import assert from "node:assert/strict";

import {
  createReaderTocModel,
  readerAdjacentChapterHref,
  readerEpubChapterMetadata,
  readerHrefMatches,
  readerResolveEpubHref,
} from "../src/lib/readerChapterNavigation.js";

function createBook(hrefs) {
  const spineItems = hrefs.map((href, index) => ({ href, index }));
  spineItems.forEach((section, index) => {
    section.prev = () => spineItems[index - 1] || null;
    section.next = () => spineItems[index + 1] || null;
  });

  return {
    spine: {
      spineItems,
      get(target) {
        if (Number.isInteger(target)) return spineItems[target] || null;
        return spineItems.find((section) => section.href === target) || null;
      },
    },
  };
}

test("el capítulo visible usa el índice raíz del TOC, no el índice interno del EPUB", () => {
  const hrefs = Array.from({ length: 60 }, (_, index) => `Text/part-${String(index + 1).padStart(2, "0")}.xhtml`);
  const book = createBook(hrefs);
  const toc = Array.from({ length: 25 }, (_, index) => ({
    label: `Capítulo ${index + 1}`,
    href: hrefs[index === 14 ? 58 : index],
  }));
  const model = createReaderTocModel(book, toc);

  const metadata = readerEpubChapterMetadata(book, {
    start: {
      href: hrefs[58],
      index: 58,
      displayed: { page: 1, total: 8 },
    },
  }, model);

  assert.equal(metadata.chapterIndex, 15);
  assert.equal(metadata.chapterCount, 25);
  assert.equal(metadata.chapterTitle, "Capítulo 15");
});

test("normaliza subapartados y conserva el capítulo raíz al navegar entre ellos", () => {
  const book = createBook([
    "Text/intro.xhtml",
    "Text/chapter-01.xhtml",
    "Text/part0010_split_001.xhtml",
    "Text/chapter-02.xhtml",
  ]);
  const model = createReaderTocModel(book, [
    { label: "Capítulo 1", href: "Text/chapter-01.xhtml", subitems: [
      { label: "Parte 1", href: "Text/part0010_split_001.xhtml", children: [
        { label: "Detalle", href: "Text/part0010_split_001.xhtml#detail" },
      ] },
    ] },
    { label: "Capítulo 2", href: "Text/chapter-02.xhtml" },
  ]);

  const metadata = readerEpubChapterMetadata(book, {
    start: { href: "Text/part0010_split_001.xhtml", index: 2 },
  }, model);

  assert.equal(model.flat.length, 4);
  assert.equal(metadata.chapterIndex, 1);
  assert.equal(metadata.chapterCount, 2);
  assert.equal(readerAdjacentChapterHref(book, {
    start: { href: "Text/part0010_split_001.xhtml", index: 2 },
  }, model, "next"), "Text/chapter-02.xhtml");
});

test("resuelve hrefs relativos y conserva el fragmento al abrir un capítulo", () => {
  const book = createBook(["OEBPS/Text/chapter-01.xhtml"]);
  assert.equal(readerHrefMatches("./Text/chapter-01.xhtml#start", "OEBPS/Text/chapter-01.xhtml"), true);
  assert.equal(
    readerResolveEpubHref(book, "./Text/chapter-01.xhtml#start"),
    "OEBPS/Text/chapter-01.xhtml#start",
  );
});
