import { BasicPipeline, Vibrant as VibrantCore } from "@vibrant/core";
import { DefaultGenerator } from "@vibrant/generator-default";
import { BrowserImage } from "@vibrant/image-browser";
import { MMCQ } from "@vibrant/quantizer-mmcq";

const vibrantPipeline = new BasicPipeline()
  .filter.register(
    "default",
    (red, green, blue, alpha) => alpha >= 125 && !(red > 250 && green > 250 && blue > 250),
  )
  .quantizer.register("mmcq", MMCQ)
  .generator.register("default", DefaultGenerator);

VibrantCore.DefaultOpts.ImageClass = BrowserImage;
VibrantCore.DefaultOpts.quantizer = "mmcq";
VibrantCore.DefaultOpts.generators = ["default"];
VibrantCore.DefaultOpts.filters = ["default"];
VibrantCore["use"](vibrantPipeline);

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
  if (!imageSource) {
    return FALLBACK_HERO_COLOR;
  }

  try {
    const palette = await VibrantCore.from(imageSource).getPalette();
    const order = ["DarkVibrant", "DarkMuted", "Vibrant", "Muted"];
    const candidate = order
      .map((role) => palette[role])
      .find((swatch) => swatch != null);

    if (!candidate?.rgb) {
      return FALLBACK_HERO_COLOR;
    }

    let rgb = {
      r: Math.round(candidate.rgb[0]),
      g: Math.round(candidate.rgb[1]),
      b: Math.round(candidate.rgb[2]),
    };

    if (luminance(rgb) > LUMINANCE_THRESHOLD) {
      rgb = darken(rgb, DARKEN_AMOUNT);
    }

    if (luminance(rgb) > LUMINANCE_THRESHOLD) {
      return FALLBACK_HERO_COLOR;
    }

    return toHex(rgb).toUpperCase();
  } catch {
    return FALLBACK_HERO_COLOR;
  }
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
