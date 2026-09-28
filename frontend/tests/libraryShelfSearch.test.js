import test from "node:test";
import assert from "node:assert/strict";

import {
  filterShelfItems,
  formatShelfScore,
  getShelfScoreGroup,
  groupShelfItemsByScore,
  normalizeShelfScore,
  shelfStarFills,
  composeSpineRow,
} from "../src/lib/libraryShelfSearch.js";

const ITEMS = [
  { book_id: "1", score: 5, book: { title: "Los diablos", author: "Joe Abercrombie" } },
  { book_id: "2", score: 4, book: { title: "La paciente silenciosa", author: "Alex Michaelides" } },
  { book_id: "4", score: 4.5, book: { title: "Nuestra parte de noche", author: "Mariana Enríquez" } },
  { book_id: "3", score: 0, book: { title: "Circe", author: "Madeline Miller" } },
];

test("shelf search matches title or author without accents or case sensitivity", () => {
  assert.deepEqual(
    filterShelfItems(ITEMS, { query: "DIABLOS" }).map((item) => item.book_id),
    ["1"],
  );
  assert.deepEqual(
    filterShelfItems(ITEMS, { query: "paciente silenciosa" }).map((item) => item.book_id),
    ["2"],
  );
  assert.deepEqual(
    filterShelfItems(ITEMS, { query: "michaelides" }).map((item) => item.book_id),
    ["2"],
  );
});

test("shelf score filter supports exact ratings and unrated books", () => {
  assert.deepEqual(
    filterShelfItems(ITEMS, { score: "5" }).map((item) => item.book_id),
    ["1"],
  );
  assert.deepEqual(
    filterShelfItems(ITEMS, { score: "4" }).map((item) => item.book_id),
    ["2", "4"],
  );
  assert.deepEqual(
    filterShelfItems(ITEMS, { score: "unrated" }).map((item) => item.book_id),
    ["3"],
  );
});

test("shelf search and score filter combine without changing source order", () => {
  assert.deepEqual(
    filterShelfItems(ITEMS, { query: "paciente", score: "4" }).map((item) => item.book_id),
    ["2"],
  );
});

test("shelf score labels fail safely for missing or invalid ratings", () => {
  assert.equal(normalizeShelfScore(5), 5);
  assert.equal(normalizeShelfScore("3"), 3);
  assert.equal(normalizeShelfScore(4.5), 4.5);
  assert.equal(normalizeShelfScore(7), 0);
  assert.equal(formatShelfScore(4), "4/5");
  assert.equal(formatShelfScore(4.5), "4,5/5");
  assert.equal(formatShelfScore(null), "Sin puntuar");
});

test("photo shelves group half-star ratings with their lower whole-star band", () => {
  assert.equal(getShelfScoreGroup(4.5), 4);
  assert.equal(getShelfScoreGroup(4), 4);
  assert.equal(getShelfScoreGroup(null), 0);

  assert.deepEqual(
    groupShelfItemsByScore(ITEMS).map((group) => ({
      score: group.score,
      label: group.label,
      ids: group.items.map((item) => item.book_id),
    })),
    [
      { score: 5, label: "5 estrellas", ids: ["1"] },
      { score: 4, label: "4–4,5 estrellas", ids: ["2", "4"] },
      { score: 0, label: "Sin puntuar", ids: ["3"] },
    ],
  );
});

test("five stars preserve half ratings and missing scores", () => {
  assert.deepEqual(shelfStarFills(4.5), [1, 1, 1, 1, 0.5]);
  assert.deepEqual(shelfStarFills(4), [1, 1, 1, 1, 0]);
  assert.deepEqual(shelfStarFills(1.5), [1, 0.5, 0, 0, 0]);
  for (const score of [null, undefined, 0, NaN, -1, 6]) {
    assert.deepEqual(shelfStarFills(score), [0, 0, 0, 0, 0]);
  }
});

test("spine composition keeps every book upright without losing, duplicating or reordering", () => {
  for (const size of [0, 1, 3, 7, 8, 10, 12, 15, 20]) {
    const items = Object.freeze(Array.from({ length: size }, (_, id) => ({ book_id: id })));
    const { upright, stack } = composeSpineRow(items);
    assert.deepEqual(upright, items);
    assert.deepEqual(stack, []);
    assert.deepEqual(composeSpineRow(items), { upright, stack });
  }
});
