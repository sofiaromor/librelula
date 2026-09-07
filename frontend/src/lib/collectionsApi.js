import { supabase } from "./supabase.js";

function apiError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanText(value) {
  return String(value || "").trim();
}

async function currentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw apiError("Inicia sesión para continuar.", 401);
  return user;
}

async function addCollectionDetails(collections, userId = null) {
  const rows = Array.isArray(collections) ? collections : [];
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [{ data: bookRows }, { data: likeRows }] = await Promise.all([
    supabase.from("reader_collection_books").select("collection_id, book_id, sort_order").in("collection_id", ids).order("sort_order", { ascending: true }),
    supabase.from("reader_collection_likes").select("collection_id, user_id").in("collection_id", ids),
  ]);

  const bookIds = [...new Set((bookRows || []).map((row) => cleanText(row.book_id)).filter(Boolean))];
  const { data: books } = bookIds.length
    ? await supabase.from("books").select("id, title, author, cover, genre, year, synopsis, saga_name, saga_number").in("id", bookIds)
    : { data: [] };
  const bookMap = new Map((books || []).map((book) => [String(book.id), book]));
  const booksByCollection = new Map();
  for (const row of bookRows || []) {
    if (!booksByCollection.has(row.collection_id)) booksByCollection.set(row.collection_id, []);
    const book = bookMap.get(String(row.book_id));
    if (book) booksByCollection.get(row.collection_id).push(book);
  }
  const likesByCollection = new Map();
  for (const row of likeRows || []) {
    if (!likesByCollection.has(row.collection_id)) likesByCollection.set(row.collection_id, []);
    likesByCollection.get(row.collection_id).push(row.user_id);
  }

  return rows.map((row) => {
    const likers = likesByCollection.get(row.id) || [];
    return {
      ...row,
      books: booksByCollection.get(row.id) || [],
      likes: likers.length,
      liked: Boolean(userId && likers.includes(userId)),
    };
  });
}

export async function getPublicCollections({ creatorId = null, limit = 12 } = {}) {
  let query = supabase
    .from("reader_collections")
    .select("id, creator_id, title, description, is_curated, created_at, updated_at")
    .eq("is_public", true)
    .order("is_curated", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.min(30, Math.max(1, Number(limit) || 12)));
  if (creatorId) query = query.eq("creator_id", creatorId);
  const { data, error } = await query;
  if (error) throw apiError("No se pudieron cargar las colecciones.");
  let userId = null;
  try { userId = (await supabase.auth.getUser()).data.user?.id || null; } catch { /* visitante */ }
  return addCollectionDetails(data || [], userId);
}

export async function toggleCollectionLike(collectionId, liked) {
  const user = await currentUser();
  const id = cleanText(collectionId);
  if (!id) throw apiError("Falta la colección.", 400);
  const result = liked
    ? await supabase.from("reader_collection_likes").insert({ collection_id: id, user_id: user.id })
    : await supabase.from("reader_collection_likes").delete().eq("collection_id", id).eq("user_id", user.id);
  if (result.error) throw apiError("No se pudo actualizar el me gusta.");
  return { liked: Boolean(liked) };
}

export async function createReaderCollection({ title, description, bookIds = [] }) {
  const user = await currentUser();
  const cleanTitle = cleanText(title);
  const cleanDescription = cleanText(description);
  const ids = [...new Set((Array.isArray(bookIds) ? bookIds : []).map(cleanText).filter(Boolean))].slice(0, 30);
  if (cleanTitle.length < 3) throw apiError("Pon un título un poco más descriptivo.", 400);
  const { data: collection, error } = await supabase
    .from("reader_collections")
    .insert({ creator_id: user.id, title: cleanTitle, description: cleanDescription, is_public: true })
    .select("id, creator_id, title, description, is_curated, created_at, updated_at")
    .single();
  if (error) throw apiError(error.message || "No se pudo crear la colección.");
  if (ids.length) {
    const { error: booksError } = await supabase.from("reader_collection_books").insert(ids.map((book_id, sort_order) => ({ collection_id: collection.id, book_id, sort_order })));
    if (booksError) throw apiError(booksError.message || "No se pudieron añadir los libros.");
  }
  return (await addCollectionDetails([collection], user.id))[0];
}
