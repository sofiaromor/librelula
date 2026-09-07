import { supabase } from "./supabase.js";

const EMPTY_PROFILE_DATA = {
  authenticated: false,
  profile: null,
  stats: { completed: 0, favorites: 0, pages_read: 0 },
  shelfCounts: { completed: 0, reading: 0, planned: 0, dropped: 0 },
  shelfBooks: [],
  latestAdditions: [],
  favoriteBooks: [],
  favoriteAuthors: [],
  currentReadingBooks: [],
  recentActivity: [],
  recentReviews: [],
  favoriteGenres: [],
  activityDays: [],
  readerCircle: [],
  social: { followers: 0, following: 0 },
  featuredCollection: "favorites",
  featuredBooks: [],
  streak: 0,
  clubAchievements: [],
  isOwner: true,
};

const PROFILE_CACHE_TTL = 45_000;
const profileOverviewCache = new Map();
const profileOverviewInflight = new Map();
const bookCache = new Map();

function apiError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asText(value) {
  return String(value || "").trim();
}

function parseDateValue(value) {
  const text = asText(value);
  if (!text) return 0;
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? time : 0;
}

function parseGenres(value) {
  const text = asText(value);
  if (!text || text === "[]") return [];

  if (text.startsWith("[")) {
    try {
      const decoded = JSON.parse(text);
      if (Array.isArray(decoded)) {
        return [...new Set(decoded.map(asText).filter(Boolean))];
      }
    } catch {
      return [];
    }
  }

  return [...new Set(text.split(/[,;|]+/).map(asText).filter(Boolean))];
}

function profileInitial(username) {
  const clean = asText(username);
  return clean ? clean.slice(0, 1).toUpperCase() : "L";
}

function activityDateFor(row) {
  const status = asText(row?.status);
  if (status === "completed") return row.finished_at || row.added_at || row.started_at || "";
  if (status === "paused") return row.paused_at || row.added_at || row.started_at || "";
  if (status === "dropped") return row.dropped_at || row.added_at || row.started_at || "";
  return row.added_at || row.started_at || row.finished_at || "";
}

function activityActionFor(row) {
  const status = asText(row?.status);
  const progress = asNumber(row?.progress);
  if (status === "completed") return "Terminaste";
  if (status === "reading") return progress > 0 ? "Actualizaste tu progreso en" : "Empezaste a leer";
  if (status === "rereading") return progress > 0 ? "Actualizaste tu relectura de" : "Empezaste a releer";
  if (status === "paused") return "Pausaste";
  if (status === "planned") return "Añadiste a pendientes";
  if (status === "dropped") return "Marcaste como abandonado";
  return "Actualizaste";
}

function buildBookMap(books) {
  return new Map((books || []).map((book) => [String(book.id), book]));
}

async function getCurrentProfile() {
  // getSession usa la sesión persistida del cliente y evita una verificación de red
  // redundante; las consultas posteriores siguen protegidas por RLS en Supabase.
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  const user = session?.user || null;
  if (sessionError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, legacy_id, username, display_name, friend_code, avatar, bio, cover_image, featured_collection, is_admin, created_at")
    .eq("id", user.id)
    .single();

  if (profileError) throw profileError;

  return {
    ...profile,
    auth_id: user.id,
    email: user.email || "",
    legacy_id: profile?.legacy_id || null,
    username: profile?.username || user.email || "Mi perfil",
    display_name: profile?.display_name || profile?.username || user.email || "Mi perfil",
    avatar: profile?.avatar || "images/avatar/avatar1.png",
    bio: profile?.bio || "",
    cover_image: profile?.cover_image || "",
    featured_collection: profile?.featured_collection || "favorites",
    initial: profileInitial(profile?.display_name || profile?.username || user.email || "L"),
  };
}

async function getProfileById(profileId) {
  const viewer = await getCurrentProfile();
  if (!viewer) return { viewer: null, profile: null };

  const cleanId = asText(profileId);
  if (!cleanId || cleanId === viewer.id) {
    return { viewer, profile: viewer };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, legacy_id, username, display_name, friend_code, avatar, bio, cover_image, featured_collection, is_admin, created_at")
    .eq("id", cleanId)
    .single();

  if (error) throw apiError("No se pudo abrir este perfil lector.", 404);

  return {
    viewer,
    profile: {
      ...data,
      auth_id: data.id,
      email: "",
      legacy_id: data?.legacy_id || null,
      username: data?.username || "Lectora de Librélula",
      display_name: data?.display_name || data?.username || "Lectora de Librélula",
      avatar: data?.avatar || "images/avatar/avatar1.png",
      bio: data?.bio || "",
      cover_image: data?.cover_image || "",
      featured_collection: data?.featured_collection || "favorites",
      initial: profileInitial(data?.display_name || data?.username || "L"),
    },
  };
}

async function getClubAchievements(profileId) {
  try {
    const { data: rows, error } = await supabase
      .from("reading_club_member_achievements")
      .select("id, club_id, badge_key, label, description, image_url, awarded_at")
      .eq("user_id", profileId)
      .order("awarded_at", { ascending: false })
      .limit(12);

    if (error || !rows?.length) return [];

    const clubIds = [...new Set(rows.map((row) => row.club_id).filter(Boolean))];
    if (!clubIds.length) return rows;

    const { data: clubs } = await supabase
      .from("reading_clubs")
      .select("id, name, icon_url")
      .in("id", clubIds);

    const clubMap = new Map((clubs || []).map((club) => [String(club.id), club]));
    return rows.map((row) => ({ ...row, club: clubMap.get(String(row.club_id)) || null }));
  } catch {
    return [];
  }
}

async function getUserBooks(legacyUserId) {
  const { data, error } = await supabase
    .from("user_books")
    .select(`
      id,
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
      added_at
    `)
    .eq("legacy_user_id", legacyUserId)
    .order("added_at", { ascending: false });

  if (error) throw apiError("No se pudo cargar tu actividad de lectura.");
  return data || [];
}

async function getBooksByIds(bookIds) {
  const uniqueIds = [...new Set((bookIds || []).map(String).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const cached = [];
  const missingIds = [];

  for (const id of uniqueIds) {
    const book = bookCache.get(id);
    if (book) cached.push(book);
    else missingIds.push(id);
  }

  if (!missingIds.length) return cached;

  const { data, error } = await supabase
    .from("books")
    .select("id, title, author, synopsis, cover, genre, year, pages, saga_name, saga_number, created_at")
    .in("id", missingIds);

  if (error) throw apiError("No se pudieron cargar los libros del perfil.");

  for (const book of data || []) {
    bookCache.set(String(book.id), book);
  }

  return [...cached, ...(data || [])];
}

async function getFavoriteBookRows(legacyUserId) {
  const { data, error } = await supabase
    .from("profile_favorite_books")
    .select("book_id, sort_order")
    .eq("legacy_user_id", legacyUserId)
    .order("sort_order", { ascending: true });

  return error ? [] : data || [];
}

async function getFavoriteAuthors(legacyUserId) {
  const { data, error } = await supabase
    .from("profile_favorite_authors")
    .select("author_name, sort_order")
    .eq("legacy_user_id", legacyUserId)
    .order("sort_order", { ascending: true });

  if (error) return [];
  return (data || []).map((row) => asText(row.author_name)).filter(Boolean).slice(0, 10);
}

async function getSocialCounts(profileId) {
  const [followersResult, followingResult] = await Promise.all([
    supabase.from("user_follows").select("follower_id", { count: "exact", head: true }).eq("following_id", profileId),
    supabase.from("user_follows").select("following_id", { count: "exact", head: true }).eq("follower_id", profileId),
  ]);

  return {
    followers: followersResult.error ? 0 : followersResult.count || 0,
    following: followingResult.error ? 0 : followingResult.count || 0,
  };
}

async function getReaderCircle(profileId) {
  const { data: follows, error: followsError } = await supabase
    .from("user_follows")
    .select("following_id, created_at")
    .eq("follower_id", profileId)
    .order("created_at", { ascending: false })
    .limit(6);

  if (followsError || !follows?.length) return [];
  const ids = follows.map((follow) => follow.following_id).filter(Boolean);
  if (!ids.length) return [];

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, legacy_id, username, display_name, avatar")
    .in("id", ids);

  if (profileError || !profiles?.length) return [];
  const legacyIds = profiles.map((profile) => profile.legacy_id).filter(Boolean);

  const { data: readingRows } = legacyIds.length
    ? await supabase
        .from("user_books")
        .select("legacy_user_id, book_id, progress, status, started_at, added_at")
        .in("legacy_user_id", legacyIds)
        .in("status", ["reading", "rereading"])
        .order("started_at", { ascending: false })
    : { data: [] };

  const books = await getBooksByIds((readingRows || []).map((row) => row.book_id));
  const booksById = buildBookMap(books);
  const readingByLegacyId = new Map();

  for (const row of readingRows || []) {
    if (readingByLegacyId.has(String(row.legacy_user_id))) continue;
    const book = booksById.get(String(row.book_id));
    if (!book) continue;
    readingByLegacyId.set(String(row.legacy_user_id), {
      ...book,
      progress: asNumber(row.progress),
      status: row.status,
    });
  }

  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  return follows
    .map((follow) => profileMap.get(follow.following_id))
    .filter(Boolean)
    .map((profile) => ({
      ...profile,
      current_book: readingByLegacyId.get(String(profile.legacy_id)) || null,
    }));
}

function mapShelfBooks(userBooks, booksById) {
  return (userBooks || [])
    .map((row) => {
      const book = booksById.get(String(row.book_id));
      if (!book) return null;
      return {
        ...book,
        user_book_id: row.id,
        status: row.status || "planned",
        progress: asNumber(row.progress),
        score: row.score || null,
        notes: row.notes || "",
        started_at: row.started_at || null,
        finished_at: row.finished_at || null,
        paused_at: row.paused_at || null,
        dropped_at: row.dropped_at || null,
        added_at: row.added_at || activityDateFor(row) || null,
        activity_date: activityDateFor(row),
      };
    })
    .filter(Boolean)
    .sort((left, right) => parseDateValue(right.added_at) - parseDateValue(left.added_at));
}

function buildShelfCounts(userBooks) {
  const counts = { completed: 0, reading: 0, planned: 0, dropped: 0 };
  for (const row of userBooks || []) {
    const status = asText(row.status);
    if (status === "completed") counts.completed += 1;
    else if (["reading", "rereading", "paused"].includes(status)) counts.reading += 1;
    else if (status === "planned") counts.planned += 1;
    else if (status === "dropped") counts.dropped += 1;
  }
  return counts;
}

function buildStats(userBooks, booksById) {
  let completed = 0;
  let favorites = 0;
  let pagesRead = 0;

  for (const row of userBooks || []) {
    if (row.status === "completed") {
      completed += 1;
      pagesRead += asNumber(booksById.get(String(row.book_id))?.pages);
    }
    if (asNumber(row.score) === 5) favorites += 1;
  }

  return { completed, favorites, pages_read: pagesRead };
}

function buildCurrentReadingBooks(shelfBooks) {
  return (shelfBooks || [])
    .filter((book) => ["reading", "rereading"].includes(asText(book.status)))
    .sort((left, right) => parseDateValue(right.started_at || right.added_at) - parseDateValue(left.started_at || left.added_at))
    .slice(0, 6);
}

function buildRecentActivity(shelfBooks) {
  return (shelfBooks || [])
    .map((book) => ({
      ...book,
      book_id: book.id,
      date: book.activity_date || book.added_at,
      action: activityActionFor(book),
    }))
    .filter((row) => row.date)
    .sort((left, right) => parseDateValue(right.date) - parseDateValue(left.date))
    .slice(0, 20);
}

function buildRecentReviews(userBooks, booksById) {
  return (userBooks || [])
    .filter((row) => asText(row.notes) || asNumber(row.score) > 0)
    .map((row) => ({
      id: row.id,
      book: booksById.get(String(row.book_id)),
      score: asNumber(row.score),
      review: asText(row.notes),
      date: activityDateFor(row),
    }))
    .filter((review) => review.book)
    .sort((left, right) => parseDateValue(right.date) - parseDateValue(left.date))
    .slice(0, 6);
}

function buildFavoriteGenres(userBooks, booksById) {
  const counts = new Map();
  for (const row of userBooks || []) {
    if (row.status !== "completed" && asNumber(row.score) < 4) continue;
    const book = booksById.get(String(row.book_id));
    for (const genre of parseGenres(book?.genre)) {
      counts.set(genre, (counts.get(genre) || 0) + 1);
    }
  }

  const entries = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "es"))
    .slice(0, 7);
  const max = Math.max(1, ...entries.map((entry) => entry.count));
  return entries.map((entry) => ({ ...entry, share: Math.round((entry.count / max) * 100) }));
}

function buildActivityDays(userBooks) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const firstDay = new Date(today);
  firstDay.setDate(firstDay.getDate() - 181);
  const pointsByDate = new Map();

  for (const row of userBooks || []) {
    const rawDate = activityDateFor(row);
    if (!rawDate) continue;
    const date = new Date(rawDate);
    if (!Number.isFinite(date.getTime())) continue;
    const key = date.toISOString().slice(0, 10);
    pointsByDate.set(key, (pointsByDate.get(key) || 0) + 1);
  }

  const days = [];
  const cursor = new Date(firstDay);
  while (cursor <= today) {
    const key = cursor.toISOString().slice(0, 10);
    const points = pointsByDate.get(key) || 0;
    days.push({
      date: key,
      label: cursor.toLocaleDateString("es-ES"),
      points,
      level: points <= 0 ? 0 : points === 1 ? 1 : points <= 3 ? 2 : 3,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  let streak = 0;
  const streakCursor = new Date(today);
  while (true) {
    const key = streakCursor.toISOString().slice(0, 10);
    if ((pointsByDate.get(key) || 0) <= 0) break;
    streak += 1;
    streakCursor.setDate(streakCursor.getDate() - 1);
  }

  return { activityDays: days, streak };
}

function pickFavoriteBooks(rows, booksById) {
  return (rows || [])
    .map((row) => booksById.get(String(row.book_id)))
    .filter(Boolean)
    .slice(0, 9);
}

function pickFeaturedBooks(profile, shelfBooks, favoriteBooks) {
  const collection = asText(profile?.featured_collection) || "favorites";
  if (collection === "favorites") return favoriteBooks.slice(0, 6);
  if (collection === "reading") {
    return shelfBooks.filter((book) => ["reading", "rereading", "paused"].includes(book.status)).slice(0, 6);
  }
  return shelfBooks.filter((book) => book.status === collection).slice(0, 6);
}

async function buildProfileOverview(viewer, profile) {
  const isOwner = viewer.id === profile.id;

  // Todo lo independiente arranca en la misma tanda. Antes Perfil esperaba a que
  // social/círculo/logros terminasen para empezar a consultar la biblioteca.
  const socialPromise = getSocialCounts(profile.id);
  const readerCirclePromise = getReaderCircle(profile.id);
  const clubAchievementsPromise = getClubAchievements(profile.id);

  if (!profile.legacy_id) {
    const [social, readerCircle, clubAchievements] = await Promise.all([
      socialPromise,
      readerCirclePromise,
      clubAchievementsPromise,
    ]);

    return {
      ...EMPTY_PROFILE_DATA,
      authenticated: true,
      profile,
      social,
      readerCircle,
      clubAchievements,
      isOwner,
    };
  }

  const legacyUserId = profile.legacy_id;
  const userBooksPromise = getUserBooks(legacyUserId);
  const favoriteRowsPromise = getFavoriteBookRows(legacyUserId);
  const favoriteAuthorsPromise = getFavoriteAuthors(legacyUserId);

  const [social, readerCircle, clubAchievements, userBooks, favoriteRows, favoriteAuthors] = await Promise.all([
    socialPromise,
    readerCirclePromise,
    clubAchievementsPromise,
    userBooksPromise,
    favoriteRowsPromise,
    favoriteAuthorsPromise,
  ]);

  // Una sola consulta de books abastece estantería y favoritos.
  const books = await getBooksByIds([
    ...userBooks.map((row) => row.book_id),
    ...favoriteRows.map((row) => row.book_id),
  ]);
  const booksById = buildBookMap(books);
  const shelfBooks = mapShelfBooks(userBooks, booksById);
  const favoriteBooks = pickFavoriteBooks(favoriteRows, booksById);
  const activity = buildActivityDays(userBooks);

  return {
    authenticated: true,
    profile,
    stats: buildStats(userBooks, booksById),
    shelfCounts: buildShelfCounts(userBooks),
    shelfBooks,
    latestAdditions: shelfBooks.slice(0, 6),
    favoriteBooks,
    featuredCollection: asText(profile.featured_collection) || "favorites",
    featuredBooks: pickFeaturedBooks(profile, shelfBooks, favoriteBooks),
    favoriteAuthors,
    currentReadingBooks: buildCurrentReadingBooks(shelfBooks),
    recentActivity: buildRecentActivity(shelfBooks),
    recentReviews: buildRecentReviews(userBooks, booksById),
    favoriteGenres: buildFavoriteGenres(userBooks, booksById),
    activityDays: activity.activityDays,
    readerCircle,
    social,
    streak: activity.streak,
    clubAchievements,
    isOwner,
  };
}

export async function getProfileOverview(profileId = null) {
  const { viewer, profile } = await getProfileById(profileId);
  if (!viewer || !profile) return EMPTY_PROFILE_DATA;

  const cacheKey = String(profile.id);
  const cached = profileOverviewCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < PROFILE_CACHE_TTL) {
    return cached.data;
  }

  const inflight = profileOverviewInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = buildProfileOverview(viewer, profile)
    .then((data) => {
      profileOverviewCache.set(cacheKey, { savedAt: Date.now(), data });
      return data;
    })
    .finally(() => {
      profileOverviewInflight.delete(cacheKey);
    });

  profileOverviewInflight.set(cacheKey, request);
  return request;
}

export function invalidateProfileOverview(profileId = null) {
  if (profileId) {
    profileOverviewCache.delete(String(profileId));
    return;
  }
  profileOverviewCache.clear();
}

export async function uploadProfileCover(file) {
  if (!(file instanceof File)) {
    throw apiError("Selecciona una imagen válida.", 400);
  }

  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowedTypes.has(file.type)) {
    throw apiError("La portada debe ser JPG, PNG o WebP.", 400);
  }

  if (file.size > 8 * 1024 * 1024) {
    throw apiError("La portada no puede superar los 8 MB.", 400);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw apiError("Inicia sesión para cambiar tu portada.", 401);
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/cover-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("profile-covers")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (uploadError) {
    throw apiError(uploadError.message || "No se pudo subir la portada.");
  }

  const { data: publicData } = supabase.storage.from("profile-covers").getPublicUrl(path);
  const publicUrlValue = publicData?.publicUrl || "";
  if (!publicUrlValue) throw apiError("No se pudo obtener la URL de la portada.");

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ cover_image: publicUrlValue })
    .eq("id", user.id);

  if (updateError) {
    await supabase.storage.from("profile-covers").remove([path]);
    throw apiError(updateError.message || "No se pudo guardar la portada en tu perfil.");
  }

  invalidateProfileOverview(user.id);
  return publicUrlValue;
}

export async function uploadProfileAvatar(file) {
  if (!(file instanceof File)) {
    throw apiError("Selecciona una imagen válida.", 400);
  }

  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowedTypes.has(file.type)) {
    throw apiError("El icono debe ser JPG, PNG o WebP.", 400);
  }

  if (file.size > 5 * 1024 * 1024) {
    throw apiError("El icono no puede superar los 5 MB.", 400);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw apiError("Inicia sesión para cambiar tu icono.", 401);
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/avatar-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("profile-covers")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (uploadError) {
    throw apiError(uploadError.message || "No se pudo subir el icono.");
  }

  const { data: publicData } = supabase.storage.from("profile-covers").getPublicUrl(path);
  const publicUrlValue = publicData?.publicUrl || "";
  if (!publicUrlValue) throw apiError("No se pudo obtener la URL del icono.");

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar: publicUrlValue })
    .eq("id", user.id);

  if (updateError) {
    await supabase.storage.from("profile-covers").remove([path]);
    throw apiError(updateError.message || "No se pudo guardar el icono en tu perfil.");
  }

  invalidateProfileOverview(user.id);
  return publicUrlValue;
}

export async function updateProfileAvatar(avatar) {
  const value = asText(avatar);
  const allowed = new Set([
    "images/avatar/avatar1.png",
    "images/avatar/avatar2.png",
    "images/avatar/avatar3.png",
    "images/avatar/avatar4.png",
    "images/avatar/avatar5.png",
    "images/avatar/avatar6.png",
  ]);
  if (!allowed.has(value)) throw apiError("Ese icono no está disponible.", 400);

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw apiError("Inicia sesión para cambiar tu icono.", 401);

  const { error } = await supabase
    .from("profiles")
    .update({ avatar: value })
    .eq("id", user.id);

  if (error) throw apiError(error.message || "No se pudo guardar el icono.");
  invalidateProfileOverview(user.id);
  return value;
}

export async function updateFeaturedCollection(collection) {
  const allowed = new Set(["favorites", "completed", "reading", "planned"]);
  const value = allowed.has(collection) ? collection : "favorites";
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) throw apiError("Inicia sesión para elegir tu colección.", 401);

  const { error } = await supabase
    .from("profiles")
    .update({ featured_collection: value })
    .eq("id", user.id);

  if (error) throw apiError(error.message || "No se pudo guardar la colección destacada.");
  invalidateProfileOverview(user.id);
  return value;
}
