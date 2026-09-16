const READER_ACTIVITY_PREFIX = "[[librelula-reader-activity:";
const READER_ACTIVITY_SUFFIX = "]]";

export const READER_ACTIVITY_TITLE_OPTIONS = [
  "Reflexión",
  "Frase favorita",
  "Idea",
  "Teoría",
  "Emoción",
  "Personaje",
  "Momento clave",
];

export const READER_ACTIVITY_COLORS = new Set([
  "yellow",
  "pink",
  "blue",
  "green",
  "lilac",
]);

export function normalizeReaderActivityTitle(value, fallback = "Reflexión") {
  const printableValue = Array.from(String(value || ""), (character) => {
    const code = character.codePointAt(0) || 0;
    return code < 32 || code === 127 ? " " : character;
  }).join("");
  const cleanValue = printableValue
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 48);
  return cleanValue || fallback;
}

export function normalizeReaderActivityColor(value) {
  const color = String(value || "").trim().toLowerCase();
  return READER_ACTIVITY_COLORS.has(color) ? color : "yellow";
}

export function encodeReaderActivityBody({
  body = "",
  title = "Reflexión",
  color = "yellow",
  annotationKind = "postit",
} = {}) {
  const metadata = JSON.stringify({
    v: 1,
    title: normalizeReaderActivityTitle(title),
    color: normalizeReaderActivityColor(color),
    kind: ["highlight", "note", "postit", "bookmark"].includes(annotationKind)
      ? annotationKind
      : "postit",
  });
  const cleanBody = String(body || "").trim();
  return `${READER_ACTIVITY_PREFIX}${metadata}${READER_ACTIVITY_SUFFIX}${cleanBody ? `\n${cleanBody}` : ""}`;
}

export function parseReaderActivityBody(value) {
  const originalBody = String(value || "").trim();
  if (!originalBody.startsWith(READER_ACTIVITY_PREFIX)) {
    return {
      body: originalBody,
      activityTitle: "",
      accentColor: "",
      annotationKind: "",
      isReaderAnnotation: false,
    };
  }

  const metadataEnd = originalBody.indexOf(READER_ACTIVITY_SUFFIX, READER_ACTIVITY_PREFIX.length);
  if (metadataEnd < 0) {
    return {
      body: originalBody,
      activityTitle: "",
      accentColor: "",
      annotationKind: "",
      isReaderAnnotation: false,
    };
  }

  try {
    const metadata = JSON.parse(originalBody.slice(READER_ACTIVITY_PREFIX.length, metadataEnd));
    const body = originalBody.slice(metadataEnd + READER_ACTIVITY_SUFFIX.length).trim();
    return {
      body,
      activityTitle: normalizeReaderActivityTitle(metadata?.title),
      accentColor: normalizeReaderActivityColor(metadata?.color),
      annotationKind: ["highlight", "note", "postit", "bookmark"].includes(metadata?.kind)
        ? metadata.kind
        : "postit",
      isReaderAnnotation: true,
    };
  } catch {
    return {
      body: originalBody,
      activityTitle: "",
      accentColor: "",
      annotationKind: "",
      isReaderAnnotation: false,
    };
  }
}
