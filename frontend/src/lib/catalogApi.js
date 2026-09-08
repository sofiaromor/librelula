import { supabase } from "./supabase.js";
import { invalidateHomeReadingSnapshot } from "./profileApi.js";

const VALID_READING_STATUSES = [
  "planned",
  "reading",
  "paused",
  "completed",
  "dropped",
  "rereading",
];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function apiError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function getCurrentLegacyUserId() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("legacy_id")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw profileError;
  }

  return profile?.legacy_id || null;
}

export async function getCatalogBooks({
  page = 1,
  pageSize = 24,
  search = "",
  genres = [],
  genreMode = "any",
  year = "",
  bookId = "",
} = {}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePageSize = Math.min(60, Math.max(1, Number.parseInt(pageSize, 10) || 24));
  const cleanGenres = Array.isArray(genres)
    ? genres.map((genre) => String(genre || "").trim()).filter(Boolean).slice(0, 8)
    : [];

  const { data, error } = await supabase.rpc("catalog_books_page", {
    p_page: safePage,
    p_page_size: safePageSize,
    p_search: String(search || "").trim() || null,
    p_genres: cleanGenres,
    p_genre_mode: genreMode === "all" ? "all" : "any",
    p_year: String(year || "").trim() || null,
    p_book_id: String(bookId || "").trim() || null,
  });

  if (error) {
    console.error("Error cargando la página del catálogo:", error);
    const missingFunction = error.code === "42883" || /catalog_books_page/i.test(error.message || "");
    throw apiError(
      missingFunction
        ? "Falta activar la paginación del catálogo en Supabase."
        : "No se pudieron obtener los libros.",
    );
  }

  const books = Array.isArray(data?.books) ? data.books : [];
  const total = Math.max(0, Number(data?.total || 0));

  return {
    ok: true,
    books,
    page: safePage,
    page_size: safePageSize,
    total,
    total_pages: total > 0 ? Math.ceil(total / safePageSize) : 0,
  };
}

export async function getCatalogFilterOptions() {
  const { data, error } = await supabase.rpc("catalog_filter_options");

  if (error) {
    console.error("Error cargando filtros del catálogo:", error);
    const missingFunction = error.code === "42883" || /catalog_filter_options/i.test(error.message || "");
    throw apiError(
      missingFunction
        ? "Falta activar la paginación del catálogo en Supabase."
        : "No se pudieron obtener los filtros del catálogo.",
    );
  }

  return {
    ok: true,
    years: Array.isArray(data?.years) ? data.years : [],
    genre_counts: data?.genre_counts && typeof data.genre_counts === "object"
      ? data.genre_counts
      : {},
  };
}



export async function getCatalogSagaBooks({ sagaKey = "", sagaName = "" } = {}) {
  const cleanKey = String(sagaKey || "").trim();
  const cleanName = String(sagaName || "").trim();
  if (!cleanKey && !cleanName) return [];

  const fields = "id, title, author, cover, pages, genre, year, saga_name, saga_number, saga_key";
  const queryBooks = (filter) => {
    let query = supabase
      .from("books")
      .select(fields)
      .eq("review_status", "approved")
      .order("saga_number", { ascending: true, nullsFirst: false })
      .order("title", { ascending: true })
      .limit(200);

    return filter(query);
  };

  const escapeIlike = (value) => String(value || "").replace(/[\\%_]/g, "\\$&");
  const requests = [];

  if (cleanKey) {
    requests.push(queryBooks((query) => query.eq("saga_key", cleanKey)));
  }

  if (cleanName) {
    requests.push(queryBooks((query) => query.ilike("saga_name", escapeIlike(cleanName))));
  }

  const results = await Promise.all(requests);
  const failed = results.find(({ error }) => error);

  if (failed && results.every(({ error }) => error)) {
    throw apiError("No se pudieron cargar los libros de esta saga.");
  }

  const booksById = new Map();
  for (const result of results) {
    for (const book of result.data || []) {
      const key = String(book.id || "");
      if (key) booksById.set(key, book);
    }
  }

  return [...booksById.values()];
}

const DISCOVERY_BOOK_FIELDS = `
  id,
  title,
  author,
  synopsis,
  cover,
  genre,
  year,
  pages,
  publisher,
  language,
  isbn,
  saga_name,
  saga_number,
  saga_key,
  hero_color,
  review_status,
  created_at
`;

function cleanBookList(rows) {
  return Array.isArray(rows) ? rows.filter((row) => row?.id) : [];
}

function genreValues(value) {
  return String(value || "")
    .replace(/^\[|\]$/g, "")
    .split(/\s*,\s*|\s*\|\s*/)
    .map((item) => item.replace(/^['"]|['"]$/g, "").trim())
    .filter(Boolean);
}

function normalizedDiscoveryValue(value) {
  return String(value || "").trim().toLocaleLowerCase("es-ES");
}

function parseEditionReleaseDate(value) {
  const cleanValue = String(value || "").trim();
  let match = cleanValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (match) {
    const [, day, month, year] = match;
    const date = new Date(`${year}-${month}-${day}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  match = cleanValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const date = new Date(`${cleanValue}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

async function getApprovedBooksByIds(ids) {
  const cleanIds = [...new Set((ids || []).map(String).filter(Boolean))];
  if (!cleanIds.length) return [];

  const { data, error } = await supabase
    .from("books")
    .select(DISCOVERY_BOOK_FIELDS)
    .in("id", cleanIds)
    .eq("review_status", "approved");

  if (error) throw error;
  return cleanBookList(data);
}

async function getCatalogRecommendations() {
  const legacyUserId = await getCurrentLegacyUserId();
  if (!legacyUserId) {
    return { authenticated: false, recommendations: [], profile_ready: false };
  }

  const { data: userRows, error: userRowsError } = await supabase
    .from("user_books")
    .select("book_id, score, status")
    .eq("legacy_user_id", legacyUserId);

  if (userRowsError) throw userRowsError;

  const ownedIds = [...new Set((userRows || []).map((row) => String(row.book_id || "")).filter(Boolean))];
  const likedIds = [...new Set((userRows || [])
    .filter((row) => Number(row.score || 0) >= 4)
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
    .map((row) => String(row.book_id || ""))
    .filter(Boolean))]
    .slice(0, 30);

  if (!likedIds.length) {
    return { authenticated: true, recommendations: [], profile_ready: false };
  }

  const [{ data: likedBooks, error: likedBooksError }, { data: candidateRows, error: candidatesError }] = await Promise.all([
    supabase
      .from("books")
      .select(DISCOVERY_BOOK_FIELDS)
      .in("id", likedIds)
      .eq("review_status", "approved"),
    supabase
      .from("books")
      .select(DISCOVERY_BOOK_FIELDS)
      .eq("review_status", "approved")
      .order("created_at", { ascending: false })
      .limit(180),
  ]);

  if (likedBooksError) throw likedBooksError;
  if (candidatesError) throw candidatesError;

  const candidates = cleanBookList(candidateRows)
    .filter((book) => !ownedIds.includes(String(book.id)));
  const allTaxonomyIds = [...new Set([
    ...cleanBookList(likedBooks).map((book) => String(book.id)),
    ...candidates.map((book) => String(book.id)),
  ])];

  let taxonomyRows = [];
  if (allTaxonomyIds.length) {
    const { data, error } = await supabase
      .from("book_taxonomy")
      .select("book_id, kind, value")
      .in("book_id", allTaxonomyIds);

    if (!error) taxonomyRows = data || [];
  }

  const taxonomyByBook = new Map();
  for (const row of taxonomyRows) {
    const key = String(row.book_id || "");
    if (!taxonomyByBook.has(key)) taxonomyByBook.set(key, []);
    taxonomyByBook.get(key).push(normalizedDiscoveryValue(row.value));
  }

  const likedGenreCounts = new Map();
  const likedTaxonomyCounts = new Map();
  const likedAuthors = new Set();
  const likedTitles = new Map();

  for (const book of cleanBookList(likedBooks)) {
    likedAuthors.add(normalizedDiscoveryValue(book.author));
    likedTitles.set(String(book.id), book.title);

    for (const genre of genreValues(book.genre)) {
      const key = normalizedDiscoveryValue(genre);
      likedGenreCounts.set(key, (likedGenreCounts.get(key) || 0) + 1);
    }

    for (const value of taxonomyByBook.get(String(book.id)) || []) {
      likedTaxonomyCounts.set(value, (likedTaxonomyCounts.get(value) || 0) + 1);
    }
  }

  const ranked = candidates.map((book) => {
    let score = 0;
    let matchedGenre = "";
    let matchedTaxonomy = "";

    for (const genre of genreValues(book.genre)) {
      const key = normalizedDiscoveryValue(genre);
      const weight = likedGenreCounts.get(key) || 0;
      if (weight > 0) {
        score += 5 + Math.min(weight, 3);
        matchedGenre ||= genre;
      }
    }

    for (const value of taxonomyByBook.get(String(book.id)) || []) {
      const weight = likedTaxonomyCounts.get(value) || 0;
      if (weight > 0) {
        score += 3 + Math.min(weight, 2);
        matchedTaxonomy ||= value;
      }
    }

    const sameAuthor = likedAuthors.has(normalizedDiscoveryValue(book.author));
    if (sameAuthor) score += 6;

    let reason = "Encaja con tus lecturas mejor valoradas";
    if (sameAuthor) reason = `Más de ${book.author}`;
    else if (matchedTaxonomy) reason = `Por la vibra «${matchedTaxonomy}»`;
    else if (matchedGenre) reason = `Porque disfrutas ${matchedGenre}`;

    return { ...book, recommendation_score: score, recommendation_reason: reason };
  })
    .filter((book) => book.recommendation_score > 0)
    .sort((left, right) => (
      right.recommendation_score - left.recommendation_score
      || String(right.created_at || "").localeCompare(String(left.created_at || ""))
    ))
    .slice(0, 4);

  return {
    authenticated: true,
    recommendations: ranked,
    profile_ready: ranked.length > 0,
    liked_book_title: likedTitles.get(likedIds[0]) || "",
  };
}

export async function getCatalogDiscovery() {
  const weekAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString();

  const [{ data: latestRows, error: latestError }, { data: reviewRows, error: reviewsError }, recommendations] = await Promise.all([
    supabase
      .from("books")
      .select(DISCOVERY_BOOK_FIELDS)
      .eq("review_status", "approved")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("book_reviews")
      .select("book_id, rating, created_at")
      .gte("created_at", weekAgo)
      .limit(1000),
    getCatalogRecommendations(),
  ]);

  if (latestError) throw apiError("No se pudieron cargar los últimos libros añadidos.");
  if (reviewsError) console.error("No se pudo calcular el escaparate semanal:", reviewsError);

  const latest = cleanBookList(latestRows);
  const weeklyScore = new Map();
  for (const row of reviewRows || []) {
    const key = String(row.book_id || "");
    if (!key) continue;
    weeklyScore.set(key, (weeklyScore.get(key) || 0) + 2 + Math.max(0, Number(row.rating || 0) / 5));
  }

  const weeklyIds = [...weeklyScore.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([bookId]) => bookId)
    .slice(0, 8);

  let weeklyBooks = [];
  if (weeklyIds.length) {
    try {
      const rows = await getApprovedBooksByIds(weeklyIds);
      const rowMap = new Map(rows.map((book) => [String(book.id), book]));
      weeklyBooks = weeklyIds
        .map((id) => rowMap.get(String(id)))
        .filter(Boolean)
        .map((book) => ({ ...book, weekly_score: weeklyScore.get(String(book.id)) || 0 }));
    } catch (weeklyError) {
      console.error("No se pudieron cargar los libros del escaparate:", weeklyError);
    }
  }

  for (const book of latest) {
    if (weeklyBooks.length >= 5) break;
    if (!weeklyBooks.some((item) => String(item.id) === String(book.id))) {
      weeklyBooks.push({ ...book, weekly_score: 0 });
    }
  }

  let upcoming = [];
  try {
    const { data: editionRows, error: editionsError } = await supabase
      .from("book_editions")
      .select(`
        id,
        book_id,
        title,
        edition_label,
        binding,
        publication_date,
        cover,
        source_url
      `)
      .not("publication_date", "is", null)
      .neq("publication_date", "")
      .limit(700);

    if (editionsError) throw editionsError;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureEditions = (editionRows || [])
      .map((edition) => ({ edition, releaseDate: parseEditionReleaseDate(edition.publication_date) }))
      .filter(({ releaseDate }) => releaseDate && releaseDate >= today)
      .sort((left, right) => left.releaseDate - right.releaseDate);

    const futureBookIds = [...new Set(futureEditions.map(({ edition }) => String(edition.book_id || "")).filter(Boolean))];
    const futureBooks = await getApprovedBooksByIds(futureBookIds);
    const futureBookMap = new Map(futureBooks.map((book) => [String(book.id), book]));
    const seenBooks = new Set();

    upcoming = futureEditions
      .map(({ edition, releaseDate }) => {
        const book = futureBookMap.get(String(edition.book_id));
        if (!book || seenBooks.has(String(book.id))) return null;
        seenBooks.add(String(book.id));
        return {
          ...book,
          cover: edition.cover || book.cover,
          edition_id: edition.id,
          edition_title: edition.title,
          edition_label: edition.edition_label,
          binding: edition.binding,
          source_url: edition.source_url,
          publication_date: releaseDate.toISOString().slice(0, 10),
          publication_date_label: edition.publication_date,
        };
      })
      .filter(Boolean)
      .slice(0, 10);
  } catch (upcomingError) {
    console.error("No se pudieron cargar los próximos lanzamientos:", upcomingError);
  }

  return {
    ok: true,
    latest,
    weekly: weeklyBooks.slice(0, 5),
    upcoming,
    recommendations: recommendations.recommendations || [],
    recommendations_authenticated: Boolean(recommendations.authenticated),
    recommendations_ready: Boolean(recommendations.profile_ready),
  };
}

export async function getCatalogReleaseAlerts() {
  const legacyUserId = await getCurrentLegacyUserId();
  if (!legacyUserId) {
    return { authenticated: false, edition_ids: [] };
  }

  const { data, error } = await supabase
    .from("book_release_alerts")
    .select("edition_id")
    .eq("legacy_user_id", legacyUserId);

  if (error) {
    const missingTable = error.code === "42P01" || /book_release_alerts/i.test(error.message || "");
    throw apiError(
      missingTable
        ? "Falta activar los libros esperados en Supabase."
        : "No se pudieron consultar tus libros esperados.",
    );
  }

  return {
    authenticated: true,
    edition_ids: (data || []).map((row) => String(row.edition_id || "")).filter(Boolean),
  };
}

export async function setCatalogReleaseAlert({ editionId, active }) {
  const legacyUserId = await getCurrentLegacyUserId();
  if (!legacyUserId) {
    throw apiError("Inicia sesión para guardar este lanzamiento en Esperados.", 401);
  }

  const cleanEditionId = String(editionId || "").trim();
  if (!cleanEditionId) throw apiError("Falta la edición del lanzamiento.", 400);

  if (active) {
    const { error } = await supabase
      .from("book_release_alerts")
      .upsert(
        { legacy_user_id: legacyUserId, edition_id: cleanEditionId },
        { onConflict: "legacy_user_id,edition_id" },
      );
    if (error) throw apiError("No se pudo activar el aviso de lanzamiento.");
  } else {
    const { error } = await supabase
      .from("book_release_alerts")
      .delete()
      .eq("legacy_user_id", legacyUserId)
      .eq("edition_id", cleanEditionId);
    if (error) throw apiError("No se pudo quitar el libro de Esperados.");
  }

  return { ok: true, active: Boolean(active), edition_id: cleanEditionId };
}

function mapUserBookRow(row) {
  if (!row) return null;

  return {
    book_id: row.book_id,
    status: row.status,
    progress: row.progress || 0,
    score: row.score || null,
    notes: row.notes || null,
    started_at: row.started_at || null,
    finished_at: row.finished_at || null,
    read_count: row.read_count || 0,
    progress_mode: row.progress_mode || "percentage",
    total_minutes: row.total_minutes || 0,
    minutes_read: row.minutes_read || 0,
    total_chapters: row.total_chapters || 0,
    current_chapter: row.current_chapter || 0,
    paused_at: row.paused_at || null,
    dropped_at: row.dropped_at || null,
  };
}

export async function getCatalogUserBooks({ bookId = "" } = {}) {
  const legacyUserId = await getCurrentLegacyUserId();

  if (!legacyUserId) {
    return {
      authenticated: false,
      item: null,
      items: {},
    };
  }

  let query = supabase
    .from("user_books")
    .select(`
      book_id,
      status,
      progress,
      score,
      notes,
      started_at,
      finished_at,
      read_count,
      paused_at,
      dropped_at,
      progress_mode,
      total_minutes,
      minutes_read,
      total_chapters,
      current_chapter
    `)
    .eq("legacy_user_id", legacyUserId)
    .order("id", { ascending: false });

  if (bookId) {
    query = query.eq("book_id", String(bookId));
  }

  const { data, error } = await query;

  if (error) {
    throw apiError("No se pudo consultar tu biblioteca.");
  }

  if (bookId) {
    return {
      authenticated: true,
      item: mapUserBookRow(data?.[0] || null),
    };
  }

  const items = {};

  for (const row of data || []) {
    const key = String(row.book_id || "");

    if (key && !items[key]) {
      items[key] = mapUserBookRow(row);
    }
  }

  return {
    authenticated: true,
    items,
  };
}

function buildStatusPatch(existing, status) {
  const today = todayIsoDate();
  const previousStatus = existing?.status || "";
  let progress = Math.max(0, Math.min(100, Number(existing?.progress || 0)));
  let startedAt = existing?.started_at || null;
  let finishedAt = existing?.finished_at || null;
  let pausedAt = existing?.paused_at || null;
  let droppedAt = existing?.dropped_at || null;
  let readCount = Math.max(0, Number(existing?.read_count || 0));

  if (status === "planned") {
    progress = 0;
    startedAt = null;
    finishedAt = null;
    pausedAt = null;
    droppedAt = null;
  }

  if (status === "reading") {
    if (progress >= 100 || ["completed", "rereading"].includes(previousStatus)) {
      progress = 0;
    }

    startedAt = startedAt || today;
    finishedAt = null;
    pausedAt = null;
    droppedAt = null;
  }

  if (status === "paused") {
    startedAt = startedAt || today;
    finishedAt = null;
    pausedAt = today;
    droppedAt = null;
  }

  if (status === "rereading") {
    progress = 0;
    startedAt = today;
    finishedAt = null;
    pausedAt = null;
    droppedAt = null;

    if (previousStatus !== "rereading") {
      readCount = Math.max(1, readCount) + 1;
    }
  }

  if (status === "completed") {
    progress = 100;
    startedAt = startedAt || today;
    finishedAt = today;
    pausedAt = null;
    droppedAt = null;

    if (previousStatus !== "completed") {
      readCount = Math.max(1, readCount);
    }
  }

  if (status === "dropped") {
    finishedAt = null;
    pausedAt = null;
    droppedAt = today;
  }

  return {
    status,
    progress,
    started_at: startedAt,
    finished_at: finishedAt,
    read_count: readCount,
    paused_at: pausedAt,
    dropped_at: droppedAt,
  };
}

export async function saveCatalogUserBookStatus({ book_id: bookId, status }) {
  const legacyUserId = await getCurrentLegacyUserId();

  if (!legacyUserId) {
    throw apiError("Inicia sesión para guardar libros en tu biblioteca.", 401);
  }

  const cleanBookId = String(bookId || "").trim();
  const cleanStatus = String(status || "").trim();

  if (!cleanBookId) {
    throw apiError("Falta el libro.", 400);
  }

  // Compatibilidad con el flujo anterior: "remove" no es un estado que se
  // guarde en user_books, sino una orden para eliminar la relación del usuario.
  if (cleanStatus === "remove") {
    return removeCatalogUserBook({ book_id: cleanBookId });
  }

  if (!VALID_READING_STATUSES.includes(cleanStatus)) {
    throw apiError("El estado seleccionado no es válido.", 400);
  }

  const { data: bookExists, error: bookError } = await supabase
    .from("books")
    .select("id")
    .eq("id", cleanBookId)
    .maybeSingle();

  if (bookError) {
    throw apiError("No se pudo comprobar el libro.", 500);
  }

  if (!bookExists) {
    throw apiError("El libro no existe en el catálogo.", 404);
  }

  const { data: existing, error: existingError } = await supabase
    .from("user_books")
    .select(`
      id,
      status,
      progress,
      started_at,
      finished_at,
      read_count,
      paused_at,
      dropped_at
    `)
    .eq("legacy_user_id", legacyUserId)
    .eq("book_id", cleanBookId)
    .maybeSingle();

  if (existingError) {
    throw apiError("No se pudo consultar tu biblioteca.", 500);
  }

  const patch = buildStatusPatch(existing, cleanStatus);

  let saved;
  let saveError;

  if (existing?.id) {
    const result = await supabase
      .from("user_books")
      .update(patch)
      .eq("id", existing.id)
      .select(`
        book_id,
        status,
        progress,
        score,
        notes,
        started_at,
        finished_at,
        read_count,
        paused_at,
        dropped_at
      `)
      .single();

    saved = result.data;
    saveError = result.error;
  } else {
    const result = await supabase
      .from("user_books")
      .insert({
        legacy_user_id: legacyUserId,
        book_id: cleanBookId,
        ...patch,
      })
      .select(`
        book_id,
        status,
        progress,
        score,
        notes,
        started_at,
        finished_at,
        read_count,
        paused_at,
        dropped_at
      `)
      .single();

    saved = result.data;
    saveError = result.error;
  }

  if (saveError) {
    throw apiError("No se pudo guardar el estado del libro.", 500);
  }

  invalidateHomeReadingSnapshot();

  return {
    ok: true,
    item: mapUserBookRow(saved),
  };
}

function clampProgressValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export async function saveCatalogUserBookProgress({
  book_id: bookId,
  progress,
  progress_mode: progressMode = "percentage",
  total_minutes: totalMinutes = 0,
  minutes_read: minutesRead = 0,
  total_chapters: totalChapters = 0,
  current_chapter: currentChapter = 0,
}) {
  const legacyUserId = await getCurrentLegacyUserId();

  if (!legacyUserId) {
    throw apiError("Inicia sesión para guardar tu progreso.", 401);
  }

  const cleanBookId = String(bookId || "").trim();
  const cleanMode = ["percentage", "minutes", "chapters"].includes(progressMode) ? progressMode : "percentage";
  const cleanTotalMinutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const cleanMinutesRead = Math.max(0, Math.min(cleanTotalMinutes || Number.MAX_SAFE_INTEGER, Math.round(Number(minutesRead) || 0)));
  const cleanTotalChapters = Math.max(0, Math.round(Number(totalChapters) || 0));
  const cleanCurrentChapter = Math.max(0, Math.min(cleanTotalChapters || Number.MAX_SAFE_INTEGER, Math.round(Number(currentChapter) || 0)));
  const derivedProgress = cleanMode === "minutes" && cleanTotalMinutes > 0
    ? (cleanMinutesRead / cleanTotalMinutes) * 100
    : cleanMode === "chapters" && cleanTotalChapters > 0
      ? (cleanCurrentChapter / cleanTotalChapters) * 100
      : progress;
  const cleanProgress = clampProgressValue(derivedProgress);

  if (!cleanBookId) {
    throw apiError("Falta el libro.", 400);
  }

  const { data: existing, error: existingError } = await supabase
    .from("user_books")
    .select(`
      id,
      status,
      progress,
      started_at,
      finished_at,
      read_count,
      paused_at,
      dropped_at
    `)
    .eq("legacy_user_id", legacyUserId)
    .eq("book_id", cleanBookId)
    .maybeSingle();

  if (existingError) {
    console.error("Error consultando progreso lector:", existingError);
    throw apiError(existingError.message || "No se pudo consultar tu biblioteca.", 500);
  }

  const today = todayIsoDate();
  const currentStatus = String(existing?.status || "").trim();
  const previousReadCount = Math.max(0, Number(existing?.read_count || 0));
  const isFinished = cleanProgress >= 100;

  const patch = {
    legacy_user_id: legacyUserId,
    book_id: cleanBookId,
    status: isFinished
      ? "completed"
      : ["reading", "rereading"].includes(currentStatus)
        ? currentStatus
        : "reading",
    progress: cleanProgress,
    started_at: existing?.started_at || today,
    finished_at: isFinished ? today : null,
    read_count:
      isFinished && currentStatus !== "completed"
        ? Math.max(1, previousReadCount)
        : previousReadCount,
    paused_at: null,
    dropped_at: null,
    progress_mode: cleanMode,
    total_minutes: cleanTotalMinutes || null,
    minutes_read: cleanMode === "minutes" ? cleanMinutesRead : null,
    total_chapters: cleanTotalChapters || null,
    current_chapter: cleanMode === "chapters" ? cleanCurrentChapter : null,
  };

  const { data: saved, error: saveError } = await supabase
    .from("user_books")
    .upsert(patch, { onConflict: "legacy_user_id,book_id" })
    .select(`
      book_id,
      status,
      progress,
      score,
      notes,
      started_at,
      finished_at,
      read_count,
      paused_at,
      dropped_at,
      progress_mode,
      total_minutes,
      minutes_read,
      total_chapters,
      current_chapter
    `)
    .single();

  if (saveError) {
    console.error("Error guardando progreso lector:", saveError);
    throw apiError(saveError.message || "No se pudo guardar tu progreso.", 500);
  }

  if (cleanMode === "chapters" && cleanTotalChapters > 0) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error: metadataError } = await supabase
      .from("book_reading_metadata")
      .upsert({
        book_id: cleanBookId,
        total_chapters: cleanTotalChapters,
        updated_by: user?.id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "book_id" });
    if (metadataError) {
      console.error("Error guardando capítulos del libro:", metadataError);
      throw apiError("El progreso se guardó, pero no se pudo guardar el total de capítulos.", 500);
    }
  }

  invalidateHomeReadingSnapshot();

  return {
    ok: true,
    item: mapUserBookRow(saved),
  };
}

export async function removeCatalogUserBook({ book_id: bookId }) {
  const legacyUserId = await getCurrentLegacyUserId();
  const cleanBookId = String(bookId || "").trim();
  if (!legacyUserId) throw apiError("Inicia sesión para gestionar tu biblioteca.", 401);
  if (!cleanBookId) throw apiError("Falta el libro.", 400);

  const { error } = await supabase
    .from("user_books")
    .delete()
    .eq("legacy_user_id", legacyUserId)
    .eq("book_id", cleanBookId);

  if (error) throw apiError(error.message || "No se pudo quitar el libro de tu biblioteca.", 500);
  invalidateHomeReadingSnapshot();
  return { ok: true, book_id: cleanBookId };
}
