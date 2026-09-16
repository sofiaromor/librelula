function cleanReaderHref(value) {
  return String(value || "")
    .split("#")[0]
    .replaceAll("\\", "/")
    .trim();
}

export function readerHrefPath(href) {
  const rawHref = cleanReaderHref(href);
  if (!rawHref) return "";

  try {
    return decodeURIComponent(rawHref)
      .replace(/^\.\//, "")
      .replace(/\/+/g, "/")
      .replace(/^\/+/, "");
  } catch {
    return rawHref
      .replace(/^\.\//, "")
      .replace(/\/+/g, "/")
      .replace(/^\/+/, "");
  }
}

export function readerHrefMatches(leftHref, rightHref) {
  const left = readerHrefPath(leftHref);
  const right = readerHrefPath(rightHref);
  if (!left || !right) return false;
  return left === right || left.endsWith(`/${right}`) || right.endsWith(`/${left}`);
}

export function readerSpineLength(book) {
  const spineItems = book?.spine?.spineItems;
  if (Array.isArray(spineItems) && spineItems.length > 0) return spineItems.length;

  const spineLength = Number(book?.spine?.length);
  return Number.isFinite(spineLength) && spineLength > 0 ? spineLength : 0;
}

export function readerSpineIndexForHref(book, href) {
  const rawHref = String(href || "");
  const hrefWithoutFragment = cleanReaderHref(rawHref);
  if (!hrefWithoutFragment) return null;

  const candidates = [...new Set([
    rawHref,
    hrefWithoutFragment,
    (() => {
      try {
        return decodeURI(hrefWithoutFragment);
      } catch {
        return hrefWithoutFragment;
      }
    })(),
    (() => {
      try {
        return encodeURI(hrefWithoutFragment);
      } catch {
        return hrefWithoutFragment;
      }
    })(),
  ])];

  for (const candidate of candidates) {
    const section = book?.spine?.get?.(candidate);
    const index = Number(section?.index);
    if (section && Number.isFinite(index) && index >= 0) return index;
  }

  const spineItems = Array.isArray(book?.spine?.spineItems) ? book.spine.spineItems : [];
  const matchingIndex = spineItems.findIndex((section) => (
    readerHrefMatches(section?.href, hrefWithoutFragment)
    || readerHrefMatches(section?.url, hrefWithoutFragment)
  ));
  return matchingIndex >= 0 ? matchingIndex : null;
}

function normalizeReaderTocItem(book, item, rootIndex) {
  if (!item || typeof item !== "object") return null;

  const nestedKey = Array.isArray(item.subitems)
    ? "subitems"
    : Array.isArray(item.children)
      ? "children"
      : "";
  const nestedItems = nestedKey
    ? item[nestedKey]
      .map((child) => normalizeReaderTocItem(book, child, rootIndex))
      .filter(Boolean)
    : null;

  return {
    ...item,
    rootIndex,
    spineIndex: readerSpineIndexForHref(book, item.href),
    ...(nestedKey ? { [nestedKey]: nestedItems } : {}),
  };
}

function flattenReaderTocItems(items, rootIndex, result) {
  if (!Array.isArray(items)) return;

  items.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const entry = {
      ...item,
      rootIndex,
    };
    result.push(entry);
    flattenReaderTocItems(item.subitems || item.children, rootIndex, result);
  });
}

export function createReaderTocModel(book, items) {
  const topLevel = Array.isArray(items)
    ? items
      .map((item, rootIndex) => normalizeReaderTocItem(book, item, rootIndex))
      .filter(Boolean)
    : [];
  const flat = [];

  topLevel.forEach((item) => {
    flat.push(item);
    flattenReaderTocItems(item.subitems || item.children, item.rootIndex, flat);
  });

  return { topLevel, flat };
}

export function readerResolveEpubHref(book, href) {
  const rawHref = String(href || "");
  const spineIndex = readerSpineIndexForHref(book, rawHref);
  const section = Number.isFinite(spineIndex) ? book?.spine?.get?.(spineIndex) : null;
  if (!section?.href) return rawHref;

  const fragment = rawHref.split("#")[1];
  return fragment ? `${section.href}#${fragment}` : section.href;
}

function readerTocModelFromValue(value) {
  if (Array.isArray(value)) return { topLevel: value, flat: value };
  return {
    topLevel: Array.isArray(value?.topLevel) ? value.topLevel : [],
    flat: Array.isArray(value?.flat) ? value.flat : [],
  };
}

export function readerEpubChapterMetadata(book, location, tocValue = {}) {
  const tocModel = readerTocModelFromValue(tocValue);
  const topLevel = tocModel.topLevel;
  const flat = tocModel.flat;
  const href = location?.start?.href || "";
  const spineIndex = Number(location?.start?.index);

  let chapterIndex = null;
  const exactSpineMatch = (item) => (
    Number.isFinite(spineIndex)
    && Number.isFinite(Number(item?.spineIndex))
    && Number(item.spineIndex) === spineIndex
  );
  const matchingTocItem = topLevel.find(exactSpineMatch)
    || flat.find(exactSpineMatch)
    || topLevel.find((item) => readerHrefMatches(item?.href, href))
    || flat.find((item) => readerHrefMatches(item?.href, href));

  if (matchingTocItem && Number.isFinite(Number(matchingTocItem.rootIndex))) {
    chapterIndex = Number(matchingTocItem.rootIndex) + 1;
  }

  if (chapterIndex === null && Number.isFinite(spineIndex) && topLevel.length > 0) {
    const chaptersWithKnownStart = topLevel
      .map((item, index) => ({ index, spineIndex: Number(item?.spineIndex) }))
      .filter((item) => Number.isFinite(item.spineIndex));
    const containingChapter = chaptersWithKnownStart
      .filter((item) => item.spineIndex <= spineIndex)
      .slice(-1)[0];
    if (containingChapter) chapterIndex = containingChapter.index + 1;
  }

  if (chapterIndex === null && Number.isFinite(spineIndex) && spineIndex >= 0) {
    chapterIndex = spineIndex + 1;
  }

  const chapterCount = topLevel.length || readerSpineLength(book);
  const chapterItem = chapterIndex && topLevel[chapterIndex - 1];
  const displayedPage = Number(location?.start?.displayed?.page);
  const displayedTotal = Number(location?.start?.displayed?.total);
  const chapterProgress = Number.isFinite(displayedPage)
    && Number.isFinite(displayedTotal)
    && displayedTotal > 0
    ? Math.max(0, Math.min(100, Math.round((displayedPage / displayedTotal) * 100)))
    : null;

  return {
    chapterTitle: String(chapterItem?.label || matchingTocItem?.label || "").trim()
      || (chapterIndex ? `Capítulo ${chapterIndex}` : "Lectura"),
    chapterIndex,
    chapterCount: chapterCount > 0 ? chapterCount : null,
    chapterProgress,
  };
}

export function readerAdjacentChapterHref(book, location, tocValue, direction) {
  const tocModel = readerTocModelFromValue(tocValue);
  const metadata = readerEpubChapterMetadata(book, location, tocModel);
  const currentChapterIndex = Number(metadata.chapterIndex);
  const step = direction === "previous" ? -1 : 1;
  const targetItem = Number.isFinite(currentChapterIndex)
    && currentChapterIndex > 0
    ? tocModel.topLevel[currentChapterIndex - 1 + step]
    : null;

  if (targetItem?.href) return readerResolveEpubHref(book, targetItem.href);

  const currentSpineIndex = Number(location?.start?.index);
  const currentSection = Number.isFinite(currentSpineIndex) ? book?.spine?.get?.(currentSpineIndex) : null;
  const adjacentSection = direction === "previous"
    ? currentSection?.prev?.()
    : currentSection?.next?.();
  return adjacentSection?.href || "";
}
