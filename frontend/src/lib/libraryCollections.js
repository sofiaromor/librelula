import { supabase } from "./supabase.js";

export const COLLECTION_ACCENT_OPTIONS = Object.freeze([
  "#b8896a",
  "#c97d60",
  "#9c7658",
  "#7f8f74",
  "#8798a5",
  "#a88ba8",
  "#c3a668",
  "#8f6b62",
]);

export class CollectionUnavailableError extends Error {
  constructor(message = "Las colecciones todavía no están activadas en Librélula.", options = {}) {
    super(message, options);
    this.name = "CollectionUnavailableError";
    this.code = "COLLECTIONS_UNAVAILABLE";
    this.unavailable = true;
  }
}

function text(value) {
  return String(value ?? "").trim();
}

function collectionUnavailable(error) {
  if (error instanceof CollectionUnavailableError || error?.unavailable === true) return true;

  const code = text(error?.code);
  const message = text(error?.message).toLowerCase();
  const mentionsCollectionObject = [
    "library_collections",
    "library_collection_books",
    "library_collection_follows",
    "get_library_collection_follower_counts",
    "set_library_collection_books",
  ].some((objectName) => message.includes(objectName));

  return (
    code === "42P01" ||
    code === "PGRST202" ||
    code === "PGRST205" ||
    (mentionsCollectionObject && message.includes("does not exist")) ||
    (mentionsCollectionObject && message.includes("schema cache"))
  );
}

export function isCollectionUnavailableError(error) {
  return collectionUnavailable(error);
}

function normalizeAccent(value) {
  const clean = text(value).toLowerCase();
  return COLLECTION_ACCENT_OPTIONS.find((color) => color.toLowerCase() === clean)
    || COLLECTION_ACCENT_OPTIONS[0];
}

function normalizeBookIds(bookIds) {
  return [...new Set((bookIds || []).map((value) => text(value)).filter(Boolean))].slice(0, 200);
}

function normalizeDraft(draft = {}) {
  const name = text(draft.name).slice(0, 80);
  const description = text(draft.description).slice(0, 280);
  const visibility = draft.visibility === "public" ? "public" : "private";

  if (!name) throw new Error("Ponle un nombre a la colección.");

  return {
    name,
    description,
    visibility,
    accent_color: normalizeAccent(draft.accentColor || draft.accent_color),
    bookIds: normalizeBookIds(draft.bookIds),
  };
}

async function getViewer() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) throw error;
  return session?.user || null;
}

async function loadCollectionBooks(collectionIds) {
  if (!collectionIds.length) return new Map();

  const { data, error } = await supabase
    .from("library_collection_books")
    .select(`
      collection_id,
      book_id,
      sort_order,
      added_at,
      books (
        id,
        title,
        author,
        cover
      )
    `)
    .in("collection_id", collectionIds)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  const map = new Map();
  for (const row of data || []) {
    const key = String(row.collection_id);
    const list = map.get(key) || [];
    list.push({
      ...(row.books || {}),
      collection_id: row.collection_id,
      book_id: row.book_id,
      sort_order: row.sort_order,
      added_at: row.added_at,
    });
    map.set(key, list);
  }

  return map;
}

async function loadFollowerCounts(collectionIds) {
  if (!collectionIds.length) return new Map();

  const { data, error } = await supabase.rpc(
    "get_library_collection_follower_counts",
    { target_collection_ids: collectionIds },
  );

  if (error) throw error;

  return new Map(
    (data || []).map((row) => [String(row.collection_id), Number(row.follower_count || 0)]),
  );
}

async function loadViewerFollows(collectionIds, viewerId) {
  if (!viewerId || !collectionIds.length) return new Set();

  const { data, error } = await supabase
    .from("library_collection_follows")
    .select("collection_id")
    .eq("user_id", viewerId)
    .in("collection_id", collectionIds);

  if (error) throw error;
  return new Set((data || []).map((row) => String(row.collection_id)));
}

export async function getProfileCollections(profileId) {
  const viewer = await getViewer();
  const ownerId = text(profileId) || viewer?.id || "";

  if (!ownerId) {
    return { available: true, collections: [], viewerId: "" };
  }

  try {
    const { data, error } = await supabase
      .from("library_collections")
      .select("id, owner_id, name, description, accent_color, visibility, created_at, updated_at")
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const rows = data || [];
    const ids = rows.map((row) => row.id);
    const [booksById, followerCounts, followedIds] = await Promise.all([
      loadCollectionBooks(ids),
      loadFollowerCounts(ids),
      loadViewerFollows(ids, viewer?.id || ""),
    ]);

    return {
      available: true,
      viewerId: viewer?.id || "",
      collections: rows.map((row) => ({
        ...row,
        books: booksById.get(String(row.id)) || [],
        follower_count: followerCounts.get(String(row.id)) || 0,
        followed_by_viewer: followedIds.has(String(row.id)),
        is_owner: Boolean(viewer?.id && row.owner_id === viewer.id),
      })),
    };
  } catch (error) {
    if (collectionUnavailable(error)) {
      return {
        available: false,
        unavailable: true,
        collections: [],
        viewerId: viewer?.id || "",
      };
    }
    throw error;
  }
}

async function replaceCollectionBooks(collectionId, bookIds) {
  const { error } = await supabase.rpc("set_library_collection_books", {
    target_collection_id: collectionId,
    target_book_ids: normalizeBookIds(bookIds),
  });

  if (error) throw error;
}

export async function saveLibraryCollection(draft) {
  const viewer = await getViewer();
  if (!viewer) throw new Error("Inicia sesión para guardar una colección.");

  const clean = normalizeDraft(draft);
  const collectionId = text(draft?.id);

  try {
    let savedId = collectionId;

    if (collectionId) {
      const { data, error } = await supabase
        .from("library_collections")
        .update({
          name: clean.name,
          description: clean.description,
          accent_color: clean.accent_color,
          visibility: clean.visibility,
          updated_at: new Date().toISOString(),
        })
        .eq("id", collectionId)
        .select("id")
        .single();

      if (error) throw error;
      savedId = data.id;
    } else {
      const { data, error } = await supabase
        .from("library_collections")
        .insert({
          owner_id: viewer.id,
          name: clean.name,
          description: clean.description,
          accent_color: clean.accent_color,
          visibility: clean.visibility,
        })
        .select("id")
        .single();

      if (error) throw error;
      savedId = data.id;
    }

    try {
      await replaceCollectionBooks(savedId, clean.bookIds);
    } catch (bookError) {
      if (!collectionId) {
        await supabase.from("library_collections").delete().eq("id", savedId);
      }
      throw bookError;
    }

    return savedId;
  } catch (error) {
    if (collectionUnavailable(error)) {
      throw new CollectionUnavailableError(undefined, { cause: error });
    }
    if (text(error?.code) === "23505") {
      throw new Error("Ya tienes una colección con ese nombre.", { cause: error });
    }
    throw new Error(error?.message || "No se pudo guardar la colección.", { cause: error });
  }
}

export async function deleteLibraryCollection(collectionId) {
  const id = text(collectionId);
  if (!id) return;

  const { error } = await supabase
    .from("library_collections")
    .delete()
    .eq("id", id);

  if (error) {
    if (collectionUnavailable(error)) {
      throw new CollectionUnavailableError(undefined, {
        cause: error,
      });
    }

    throw new Error("No se pudo eliminar la colección.", {
      cause: error,
    });
  }
}

export async function setCollectionFollow(collectionId, shouldFollow) {
  const viewer = await getViewer();

  if (!viewer) throw new Error("Inicia sesión para seguir colecciones.");

  const id = text(collectionId);

  if (!id) throw new Error("No se pudo identificar la colección.");

  const request = shouldFollow
    ? supabase
        .from("library_collection_follows")
        .insert({ collection_id: id, user_id: viewer.id })
    : supabase
        .from("library_collection_follows")
        .delete()
        .eq("collection_id", id)
        .eq("user_id", viewer.id);

  const { error } = await request;

  if (error) {
    if (collectionUnavailable(error)) {
      throw new CollectionUnavailableError(undefined, {
        cause: error,
      });
    }

    throw new Error(
      shouldFollow
        ? "No se pudo seguir la colección."
        : "No se pudo dejar de seguir la colección.",
      {
        cause: error,
      },
    );
  }
}
