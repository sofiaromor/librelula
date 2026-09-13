import { bestBookImageUrl, normalizeFaceQuad } from "./book3dGeometry.js";

const colorCache = new Map();
const MAX_CACHE_SIZE = 256;

function isWhite(r, g, b) {
  return Math.min(r, g, b) >= 235 && Math.max(r, g, b) - Math.min(r, g, b) < 20;
}

function insideQuad(x, y, quad) {
  return quad.every(([ax, ay], index) => {
    const [bx, by] = quad[(index + 1) % 4];
    return (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= -1e-8;
  });
}

// Most populated RGB bucket, not the most saturated palette swatch. Sample
// only the photographed front when its coordinates are known.
export function dominantCoverColor({ data, width, height } = {}, frontQuad) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || !data || data.length < width * height * 4) return "";
  const quad = normalizeFaceQuad(frontQuad);
  let left = 0, top = 0, right = width - 1, bottom = height - 1;
  if (!quad) {
    // Trim exterior white margins; do not discard white inside a white cover.
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 125 || isWhite(data[i], data[i + 1], data[i + 2])) continue;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
    if (maxX >= minX) { left = minX; top = minY; right = maxX; bottom = maxY; }
  }
  const buckets = new Map();
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 125 || quad && !insideQuad((x + .5) / width, (y + .5) / height, quad)) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
      const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
      bucket.count += 1; bucket.r += r; bucket.g += g; bucket.b += b;
      buckets.set(key, bucket);
    }
  }
  let winner;
  for (const bucket of buckets.values()) {
    if (!winner || bucket.count > winner.count) winner = bucket;
  }
  if (!winner) return "";
  return `#${[winner.r, winner.g, winner.b].map((sum) => Math.round(sum / winner.count).toString(16).padStart(2, "0")).join("")}`;
}

export function bookInkColor(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color || "")) return "#fff4df";
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  const luminance = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  return luminance > .4 ? "#2b231f" : "#fff4df";
}

export function loadDominantCoverColor(source, frontQuad) {
  const url = bestBookImageUrl(source);
  if (!url || typeof Image === "undefined" || typeof document === "undefined") return Promise.resolve("");
  const quad = normalizeFaceQuad(frontQuad);
  const key = `${url}|${JSON.stringify(quad)}`;
  if (colorCache.has(key)) return colorCache.get(key);
  const promise = new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (color) => {
      if (settled) return;
      settled = true; clearTimeout(timeout);
      image.onload = null; image.onerror = null;
      resolve(color);
    };
    const timeout = setTimeout(() => finish(""), 10000);
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onerror = () => finish("");
    image.onload = () => {
      try {
        const scale = Math.min(1, 96 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) { finish(""); return; }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        finish(dominantCoverColor(context.getImageData(0, 0, canvas.width, canvas.height), quad));
      } catch { finish(""); } // CORS failures do not break the book texture.
    };
    image.src = url;
  });
  if (colorCache.size >= MAX_CACHE_SIZE) colorCache.delete(colorCache.keys().next().value);
  colorCache.set(key, promise);
  return promise;
}
