// Texture coordinates are normalized to the ORIGINAL product photograph.
// Order: top-left, top-right, bottom-right, bottom-left of the visible face.
export const FULL_FACE = [[0, 0], [1, 0], [1, 1], [0, 1]];

export function normalizeFaceQuad(value) {
  if (!Array.isArray(value) || value.length !== 4) return null;
  if (value.some((p) => !Array.isArray(p) || p.length !== 2 || p.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1))) return null;
  const points = value.map((p) => [...p]);
  let area = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4];
    // Reject crossed, reversed, concave and collapsed polygons.
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) <= 0.00001) return null;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area > 0.002 ? points : null;
}

export function projectPoint(matrix, [x, y]) {
  const [a, b, c, d, e, f, g, h] = matrix;
  const denominator = g * x + h * y + 1;
  return [(a * x + b * y + c) / denominator, (d * x + e * y + f) / denominator];
}

export function faceHomography(quad) {
  const source = normalizeFaceQuad(quad);
  if (!source) return null;
  const equations = [];
  source.forEach(([x, y], i) => {
    const [u, v] = FULL_FACE[i];
    equations.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    equations.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  // Gaussian elimination with pivoting: maps the visible quadrilateral to a flat face.
  for (let col = 0; col < 8; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 8; row += 1) {
      if (Math.abs(equations[row][col]) > Math.abs(equations[pivot][col])) pivot = row;
    }
    [equations[col], equations[pivot]] = [equations[pivot], equations[col]];
    const divisor = equations[col][col];
    if (Math.abs(divisor) < 1e-10) return null;
    equations[col] = equations[col].map((n) => n / divisor);
    for (let row = 0; row < 8; row += 1) {
      if (row === col) continue;
      const factor = equations[row][col];
      equations[row] = equations[row].map((n, i) => n - factor * equations[col][i]);
    }
  }
  const result = equations.map((row) => row[8]);
  return result.every(Number.isFinite) ? result : null;
}

export function faceCssMatrix(quad, width, height) {
  const m = faceHomography(quad);
  if (!m || !(width > 0) || !(height > 0)) return "none";
  const [a, b, c, d, e, f, g, h] = m;
  return `matrix3d(${[a, d * height / width, 0, g / width, b * width / height, e, 0, h / height, 0, 0, 1, 0, c * width, f * height, 0, 1].join(",")})`;
}

export function safeProductImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function bookImageUrl(value) {
  const text = String(value || "").trim();
  if (!text || /^(?:[a-z]+:|\/\/)/i.test(text) && !/^https?:\/\//i.test(text)) return "";
  return /^https?:\/\//i.test(text) ? text : `/${text.replace(/^\/+/, "")}`;
}

export function normalizeBookVisual(value) {
  const input = value && typeof value === "object" ? value : {};
  const productImage = safeProductImageUrl(input.product_image_url || input.product_image);
  const gallery = Array.isArray(input.image_gallery) ? input.image_gallery : [];
  return {
    product_image_url: productImage,
    image_gallery: [...new Set(gallery.map(safeProductImageUrl).filter(Boolean))].slice(0, 8),
    front_quad: productImage ? normalizeFaceQuad(input.front_quad) : null,
    fore_edge_quad: productImage ? normalizeFaceQuad(input.fore_edge_quad) : null,
  };
}

export function pickVisualEdition(book, editions = []) {
  const isbn = String(book?.isbn || "").replace(/[^0-9X]/gi, "");
  // Do not borrow a special edition's painted edge for another ISBN.
  return editions.find((e) => isbn && String(e.isbn || "").replace(/[^0-9X]/gi, "") === isbn)
    || editions.find((e) => e.is_primary) || null;
}

export function bookThicknessRatio(pages) {
  const count = Number(pages);
  const safe = Number.isFinite(count) && count > 0 ? count : 320;
  return Math.min(0.30, Math.max(0.12, 0.075 + safe / 3800));
}

export function bookClothColor(book) {
  if (/^#[0-9a-f]{6}$/i.test(book?.hero_color || "")) return book.hero_color;
  const palette = ["#31534d", "#6c3f4d", "#314e6b", "#77522f", "#57476b"];
  const hash = [...String(book?.id || book?.title || "")].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return palette[hash % palette.length];
}
