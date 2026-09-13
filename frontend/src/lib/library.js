import { supabase } from "./supabase.js";
import { attachLibraryVisuals } from "./bookVisualsApi.js";
import {
  buildSpineStoragePath,
  LIBRARY_SPINE_BUCKET,
  normalizePersonalSpineShowText,
  validateSpineImageFile,
} from "./librarySpineMedia.js";

const SPINE_SIGNED_URL_SECONDS = 60 * 60 * 6;

export const LIBRARY_STATUS_LABELS = {
  all: "Todos",
  reading: "Leyendo",
  rereading: "Releyendo",
  paused: "Pausados",
  completed: "Leídos",
  planned: "Pendientes",
  dropped: "Abandonados",
};

export const LIBRARY_STATUS_BADGES = {
  completed: ["Leído", "is-completed"],
  reading: ["Leyendo", "is-reading"],
  rereading: ["Releyendo", "is-rereading"],
  paused: ["Pausado", "is-paused"],
  planned: ["Pendiente", "is-planned"],
  dropped: ["Abandonado", "is-dropped"],
};

function normalizeCrop(crop = {}) {
  const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };

  return {
    x: clamp(crop.x, 0, 100, 50),
    y: clamp(crop.y, 0, 100, 50),
    zoom: clamp(crop.zoom, 1, 3, 1),
  };
}

export function getLibraryStatus(status) {
  return LIBRARY_STATUS_BADGES[status] || ["Sin estado", ""];
}

export async function getCurrentProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, legacy_id, username, avatar, bio, is_admin")
    .eq("id", user.id)
    .single();

  if (error) throw error;

  return data;
}

async function attachPersonalSpines(items) {
  const bookIds = [...new Set((items || []).map((item) => item.book_id).filter(Boolean))];

  if (!bookIds.length) return items || [];

  try {
    const { data: rows, error } = await supabase
      .from("user_book_spines")
      .select("book_id, storage_path, crop_x, crop_y, crop_zoom, show_text")
      .in("book_id", bookIds);

    if (error || !rows?.length) {
      return (items || []).map((item) => ({
        ...item,
        personal_spine_path: "",
        personal_spine_url: "",
        personal_spine_crop: normalizeCrop(),
        personal_spine_show_text: false,
      }));
    }

    const signedEntries = await Promise.all(
      rows.map(async (row) => {
        const path = String(row.storage_path || "").trim();
        const crop = normalizeCrop({
          x: row.crop_x,
          y: row.crop_y,
          zoom: row.crop_zoom,
        });
        const showText = normalizePersonalSpineShowText(row.show_text);
        if (!path) return [String(row.book_id), { path: "", url: "", crop, showText }];

        const { data, error: signedError } = await supabase.storage
          .from(LIBRARY_SPINE_BUCKET)
          .createSignedUrl(path, SPINE_SIGNED_URL_SECONDS);

        return [
          String(row.book_id),
          {
            path,
            url: signedError ? "" : data?.signedUrl || "",
            crop,
            showText,
          },
        ];
      }),
    );

    const spineByBookId = new Map(signedEntries);

    return (items || []).map((item) => {
      const spine = spineByBookId.get(String(item.book_id));
      return {
        ...item,
        personal_spine_path: spine?.path || "",
        personal_spine_url: spine?.url || "",
        personal_spine_crop: spine?.crop || normalizeCrop(),
        personal_spine_show_text: spine?.showText || false,
      };
    });
  } catch {
    return (items || []).map((item) => ({
      ...item,
      personal_spine_path: "",
      personal_spine_url: "",
      personal_spine_crop: normalizeCrop(),
      personal_spine_show_text: false,
    }));
  }
}

export async function getMyLibrary() {
  const profile = await getCurrentProfile();

  if (!profile?.legacy_id) {
    return {
      profile,
      items: [],
      counts: buildLibraryCounts([]),
    };
  }

  const { data, error } = await supabase
    .from("user_books")
    .select(`
      id,
      legacy_user_id,
      book_id,
      status,
      progress,
      score,
      notes,
      started_at,
      finished_at,
      added_at,
      books (
        id,
        title,
        author,
        cover,
        synopsis,
        pages,
        isbn,
        hero_color,
        genre,
        year
      )
    `)
    .eq("legacy_user_id", profile.legacy_id)
    .order("id", { ascending: false });

  if (error) throw error;

  const baseItems = (data || []).map((item) => ({
    ...item,
    book: item.books,
  }));
  const [personal, visuals] = await Promise.all([
    attachPersonalSpines(baseItems),
    attachLibraryVisuals(baseItems),
  ]);
  const items = personal.map((item, i) => ({ ...visuals.items[i], ...item, editions: visuals.items[i].editions, visual_edition: visuals.items[i].visual_edition }));

  return {
    profile,
    items,
    counts: buildLibraryCounts(items),
    visualsWarning: visuals.warning,
  };
}

export function buildLibraryCounts(items) {
  const counts = {
    all: 0,
    reading: 0,
    rereading: 0,
    paused: 0,
    completed: 0,
    planned: 0,
    dropped: 0,
  };

  for (const item of items || []) {
    const status = item?.status || "planned";
    counts.all += 1;
    if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
  }

  return counts;
}

export async function updateLibraryScore({ legacyUserId, bookId, score }) {
  const safeScore = Number(score);

  if (!legacyUserId || !bookId || safeScore < 1 || safeScore > 5) {
    throw new Error("No se pudo guardar la puntuación.");
  }

  const { error } = await supabase
    .from("user_books")
    .update({ score: safeScore })
    .eq("legacy_user_id", legacyUserId)
    .eq("book_id", bookId);

  if (error) throw error;
}

export async function uploadPersonalSpine({ bookId, file, crop, showText = false }) {
  const cleanBookId = String(bookId || "").trim();
  if (!cleanBookId) throw new Error("No se pudo identificar el libro.");

  const validation = validateSpineImageFile(file);
  if (!validation.valid) throw new Error(validation.error);
  const safeCrop = normalizeCrop(crop);
  const safeShowText = normalizePersonalSpineShowText(showText);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) throw new Error("Inicia sesión para guardar un lomo personal.");

  const { data: existing, error: existingError } = await supabase
    .from("user_book_spines")
    .select("storage_path")
    .eq("book_id", cleanBookId)
    .maybeSingle();

  if (existingError) throw new Error("Los lomos personales todavía no están disponibles.");

  const storagePath = buildSpineStoragePath({
    userId: user.id,
    bookId: cleanBookId,
    fileType: file.type,
  });

  const { error: uploadError } = await supabase.storage
    .from(LIBRARY_SPINE_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) throw new Error("No se pudo subir la foto del lomo.");

  const { error: saveError } = await supabase
    .from("user_book_spines")
    .upsert(
      {
        user_id: user.id,
        book_id: cleanBookId,
        storage_path: storagePath,
        crop_x: safeCrop.x,
        crop_y: safeCrop.y,
        crop_zoom: safeCrop.zoom,
        show_text: safeShowText,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,book_id" },
    );

  if (saveError) {
    await supabase.storage.from(LIBRARY_SPINE_BUCKET).remove([storagePath]);
    throw new Error("No se pudo asociar la foto a este libro.");
  }

  const oldPath = String(existing?.storage_path || "").trim();
  if (oldPath && oldPath !== storagePath) {
    await supabase.storage.from(LIBRARY_SPINE_BUCKET).remove([oldPath]);
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(LIBRARY_SPINE_BUCKET)
    .createSignedUrl(storagePath, SPINE_SIGNED_URL_SECONDS);

  if (signedError || !signed?.signedUrl) {
    throw new Error("La foto se guardó, pero no se pudo mostrar todavía.");
  }

  return {
    path: storagePath,
    url: signed.signedUrl,
    crop: safeCrop,
    showText: safeShowText,
  };
}

export async function updatePersonalSpineCrop({ bookId, crop, showText = false }) {
  const cleanBookId = String(bookId || "").trim();
  if (!cleanBookId) throw new Error("No se pudo identificar el libro.");
  const safeCrop = normalizeCrop(crop);
  const safeShowText = normalizePersonalSpineShowText(showText);

  const { data, error } = await supabase
    .from("user_book_spines")
    .update({
      crop_x: safeCrop.x,
      crop_y: safeCrop.y,
      crop_zoom: safeCrop.zoom,
      show_text: safeShowText,
      updated_at: new Date().toISOString(),
    })
    .eq("book_id", cleanBookId)
    .select("book_id")
    .maybeSingle();

  if (error) throw new Error("No se pudo guardar el recorte del lomo.");
  if (!data) throw new Error("No se encontró el lomo personal que querías editar.");
  return { crop: safeCrop, showText: safeShowText };
}

export async function removePersonalSpine({ bookId }) {
  const cleanBookId = String(bookId || "").trim();
  if (!cleanBookId) throw new Error("No se pudo identificar el libro.");

  const { data: existing, error: existingError } = await supabase
    .from("user_book_spines")
    .select("storage_path")
    .eq("book_id", cleanBookId)
    .maybeSingle();

  if (existingError) throw new Error("No se pudo comprobar la foto del lomo.");
  if (!existing) return;

  const path = String(existing.storage_path || "").trim();
  if (path) {
    const { error: storageError } = await supabase.storage
      .from(LIBRARY_SPINE_BUCKET)
      .remove([path]);

    if (storageError) throw new Error("No se pudo borrar la foto privada del lomo.");
  }

  const { error: deleteError } = await supabase
    .from("user_book_spines")
    .delete()
    .eq("book_id", cleanBookId);

  if (deleteError) {
    throw new Error("La foto se borró, pero no se pudo limpiar el registro del lomo.");
  }
}
