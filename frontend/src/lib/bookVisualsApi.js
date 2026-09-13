import { supabase } from "./supabase.js";
import { normalizeBookVisual, pickVisualEdition } from "./book3dGeometry.js";

export function isVisualSchemaMissing(error) {
  return ["42P01", "PGRST205"].includes(error?.code)
    && /book_edition_visuals/i.test(error?.message || "");
}

export async function attachEditionVisuals(editions) {
  if (!editions?.length) return { editions: editions || [], warning: "" };
  const ids = editions.map((e) => e.id);
  const visuals = [];
  // Bounded IN queries; avoid an unbounded URL for large personal libraries.
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from("book_edition_visuals")
      .select("edition_id, product_image_url, image_gallery, front_quad, fore_edge_quad")
      .in("edition_id", ids.slice(i, i + 100));
    if (error) {
      if (isVisualSchemaMissing(error)) return { editions, warning: "" };
      return { editions, warning: "No se pudieron cargar las texturas de las ediciones. Puedes seguir usando los libros con sus portadas." };
    }
    visuals.push(...(data || []));
  }
  const byId = new Map(visuals.map((v) => [v.edition_id, normalizeBookVisual(v)]));
  return { editions: editions.map((e) => ({ ...e, visual: byId.get(e.id) || null })), warning: "" };
}

export async function attachLibraryVisuals(items) {
  const bookIds = [...new Set(items.map((i) => i.book_id).filter(Boolean))];
  if (!bookIds.length) return { items, warning: "" };
  const editions = [];
  for (let i = 0; i < bookIds.length; i += 100) {
    const { data, error } = await supabase.from("book_editions")
      .select("id, book_id, title, edition_label, binding, pages, isbn, cover, is_primary")
      .in("book_id", bookIds.slice(i, i + 100)).order("is_primary", { ascending: false }).order("created_at");
    if (error) return { items, warning: "No se pudieron cargar las ediciones. La estantería sigue disponible con las portadas actuales." };
    editions.push(...(data || []));
  }
  const attached = await attachEditionVisuals(editions);
  const byBook = new Map();
  attached.editions.forEach((e) => {
    if (!byBook.has(e.book_id)) byBook.set(e.book_id, []);
    byBook.get(e.book_id).push(e);
  });
  return {
    items: items.map((item) => {
      const candidates = byBook.get(item.book_id) || [];
      return { ...item, editions: candidates, visual_edition: pickVisualEdition(item.book, candidates) };
    }),
    warning: attached.warning,
  };
}

export async function saveEditionVisual(editionId, input) {
  const visual = normalizeBookVisual(input);
  if (!editionId || !visual.product_image_url) throw new Error("Elige una foto de producto HTTPS válida.");
  if (input.front_quad && !visual.front_quad || input.fore_edge_quad && !visual.fore_edge_quad) throw new Error("Revisa las cuatro esquinas: la selección no puede cruzarse ni quedar vacía.");
  const { data, error } = await supabase.from("book_edition_visuals")
    .upsert({ edition_id: editionId, ...visual, updated_at: new Date().toISOString() }, { onConflict: "edition_id" })
    .select("edition_id, product_image_url, image_gallery, front_quad, fore_edge_quad").single();
  if (error) {
    if (isVisualSchemaMissing(error)) throw new Error("Falta activar las texturas 3D en Supabase (book-edition-visuals-v1).");
    throw new Error(error.message || "No se pudieron guardar las texturas de esta edición.");
  }
  return normalizeBookVisual(data);
}
