import { loadDominantCoverColor } from "./lib/book3dPalette.js";

export const FALLBACK_HERO_COLOR = "#4A4A52";
export const LUMINANCE_THRESHOLD = 140;
export const DARKEN_AMOUNT = 0.35;

export function isValidHeroColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "").trim());
}

function luminance({ r, g, b }) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function darken({ r, g, b }, amount) {
  return {
    r: Math.round(r * (1 - amount)),
    g: Math.round(g * (1 - amount)),
    b: Math.round(b * (1 - amount)),
  };
}

function toHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function normalizeHeroColor(value) {
  return isValidHeroColor(value)
    ? String(value).toUpperCase()
    : FALLBACK_HERO_COLOR;
}

export function lighten(hex, amount) {
  const normalized = normalizeHeroColor(hex);
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);

  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);

  return toHex({ r: lr, g: lg, b: lb });
}

export async function extractHeroColor(imageSource) {
  return heroColorFromDominant(await loadDominantCoverColor(imageSource));
}

// Keep the predominant hue, adjusting only brightness for the light hero text.
// A pale cover must not suddenly become the unrelated grey fallback.
export function heroColorFromDominant(color) {
  if (!isValidHeroColor(color)) return FALLBACK_HERO_COLOR;
  let rgb = {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
  };
  const brightness = luminance(rgb);
  if (brightness > LUMINANCE_THRESHOLD) {
    rgb = darken(rgb, 1 - LUMINANCE_THRESHOLD / brightness);
  }
  return toHex(rgb).toUpperCase();
}

export async function extractHeroColorFromFile(file) {
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return FALLBACK_HERO_COLOR;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    return await extractHeroColor(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
