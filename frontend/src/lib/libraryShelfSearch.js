function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function normalizeShelfScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 1 || score > 5) return 0;
  return Math.round(score * 2) / 2;
}

export function formatShelfScore(value) {
  const score = normalizeShelfScore(value);
  return score ? `${String(score).replace(".", ",")}/5` : "Sin puntuar";
}

export function shelfStarFills(value) {
  const score = normalizeShelfScore(value);
  return [0, 1, 2, 3, 4].map((index) => Math.max(0, Math.min(1, score - index)));
}

// Keep every book upright, once and in source order, including short/filter-result rows.
export function composeSpineRow(items) {
  return {
    upright: items,
    stack: [],
  };
}

export function getShelfScoreGroup(value) {
  const score = normalizeShelfScore(value);
  return score ? Math.floor(score) : 0;
}

const SCORE_GROUP_LABELS = {
  5: "5 estrellas",
  4: "4–4,5 estrellas",
  3: "3–3,5 estrellas",
  2: "2–2,5 estrellas",
  1: "1–1,5 estrellas",
  0: "Sin puntuar",
};

export function groupShelfItemsByScore(items) {
  const groups = new Map([5, 4, 3, 2, 1, 0].map((score) => [score, []]));

  for (const item of items || []) {
    groups.get(getShelfScoreGroup(item?.score)).push(item);
  }

  return [...groups.entries()]
    .filter(([, groupItems]) => groupItems.length > 0)
    .map(([score, groupItems]) => ({
      score,
      label: SCORE_GROUP_LABELS[score],
      items: groupItems,
    }));
}

export function filterShelfItems(items, { query = "", score = "all" } = {}) {
  const normalizedQuery = normalizeText(query);
  const normalizedFilter = ["all", "unrated", "1", "2", "3", "4", "5"].includes(String(score))
    ? String(score)
    : "all";

  return (items || []).filter((item) => {
    const book = item?.book || {};
    const searchableText = normalizeText(`${book.title || ""} ${book.author || ""}`);
    const itemScore = normalizeShelfScore(item?.score);

    if (normalizedQuery && !searchableText.includes(normalizedQuery)) return false;
    if (normalizedFilter === "unrated") return itemScore === 0;
    if (normalizedFilter !== "all") return getShelfScoreGroup(itemScore) === Number(normalizedFilter);
    return true;
  });
}
