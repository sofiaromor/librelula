import { supabase } from "./supabase.js";
import { encodeReaderActivityBody, parseReaderActivityBody } from "./readerActivityMetadata.js";

const DEFAULT_WEEKLY_PAGE_GOAL = 150;

function apiError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanText(value) {
  return String(value || "").trim();
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampProgress(value) {
  return Math.max(0, Math.min(100, Math.round(asNumber(value))));
}

function normalizeAvatar(value) {
  const path = cleanText(value);
  if (!path || path === "default.jpg") return "/images/avatar/avatar1.png";
  if (/^(https?:|data:|blob:|\/)/i.test(path)) return path;
  return `/${path.replace(/^\.\//, "")}`;
}

function normalizeCover(value) {
  const path = cleanText(value);
  if (!path) return "";
  if (/^(https?:|data:|blob:|\/)/i.test(path)) return path;
  return `/${path.replace(/^\.\//, "")}`;
}

function mondayStart(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  return start;
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function dateValue(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}


function fileExtension(file) {
  const name = cleanText(file?.name);
  const match = name.match(/\.([a-z0-9]+)$/i);
  if (match) return match[1].toLowerCase();

  const byType = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  return byType[file?.type] || "jpg";
}

async function signedPostImages(paths) {
  const uniquePaths = [...new Set((paths || []).map(cleanText).filter(Boolean))];
  if (!uniquePaths.length) return new Map();

  const { data, error } = await supabase.storage
    .from("reader-post-images")
    .createSignedUrls(uniquePaths, 60 * 60);

  if (error) return new Map();

  return new Map(
    (data || [])
      .filter((item) => item?.path && item?.signedUrl)
      .map((item) => [String(item.path), item.signedUrl]),
  );
}

async function getCurrentContext() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw apiError("Inicia sesión para ver tu inicio lector.", 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, legacy_id, username, display_name, avatar")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.legacy_id) {
    throw apiError("No se pudo cargar tu perfil lector.");
  }

  return {
    authId: user.id,
    legacyId: Number(profile.legacy_id),
    username: cleanText(profile.display_name || profile.username || user.email || "Lectora"),
    avatar: normalizeAvatar(profile.avatar),
  };
}

async function getFollowingContext(authId) {
  const { data: follows, error: followsError } = await supabase
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", authId);

  if (followsError) {
    return {
      followingProfileIds: [],
      followingLegacyIds: [],
      profilesByAuthId: new Map(),
      profilesByLegacyId: new Map(),
    };
  }

  const followingProfileIds = [...new Set((follows || []).map((row) => row.following_id).filter(Boolean))];

  if (!followingProfileIds.length) {
    return {
      followingProfileIds: [],
      followingLegacyIds: [],
      profilesByAuthId: new Map(),
      profilesByLegacyId: new Map(),
    };
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, legacy_id, username, display_name, avatar")
    .in("id", followingProfileIds);

  if (profilesError) {
    return {
      followingProfileIds,
      followingLegacyIds: [],
      profilesByAuthId: new Map(),
      profilesByLegacyId: new Map(),
    };
  }

  const normalized = (profiles || []).map((profile) => ({
    id: profile.id,
    legacy_id: Number(profile.legacy_id),
    username: cleanText(profile.display_name || profile.username || "Lectora"),
    avatar: normalizeAvatar(profile.avatar),
  }));

  return {
    followingProfileIds,
    followingLegacyIds: normalized.map((profile) => profile.legacy_id).filter(Boolean),
    profilesByAuthId: new Map(normalized.map((profile) => [String(profile.id), profile])),
    profilesByLegacyId: new Map(normalized.map((profile) => [String(profile.legacy_id), profile])),
  };
}

async function getClubHomeSnapshot() {
  const { data, error } = await supabase.rpc("reading_club_home_snapshot");

  // El dashboard sigue siendo utilizable durante un despliegue escalonado:
  // si la RPC de Clubes aún no está aplicada, el resto de Inicio carga igual.
  if (error) {
    console.warn("No se pudo cargar el resumen de clubes:", error);
    return { total: 0, items: [], featured: null };
  }

  const items = (data || []).map((row) => {
    const meetingStart = cleanText(row.next_meeting_at);

    return {
      id: String(row.club_id),
      name: cleanText(row.club_name) || "Club de lectura",
      visibility: row.visibility === "private" ? "private" : "public",
      role: cleanText(row.role) || "member",
      current_chapter: Math.max(1, asNumber(row.current_chapter, 1)),
      current_page: Math.max(0, asNumber(row.current_page)),
      progress: clampProgress(row.progress),
      joined_at: row.joined_at || null,
      book: row.book_id
        ? {
            id: String(row.book_id),
            title: cleanText(row.book_title) || "Lectura del club",
            author: cleanText(row.book_author),
            cover: normalizeCover(row.book_cover),
            pages: Math.max(0, asNumber(row.book_pages)),
          }
        : null,
      meeting: meetingStart
        ? {
            id: row.next_meeting_id ? String(row.next_meeting_id) : null,
            title: cleanText(row.next_meeting_title) || "Reunión del club",
            starts_at: meetingStart,
            ends_at: row.next_meeting_ends_at || null,
            location: cleanText(row.next_meeting_location),
            event_type: cleanText(row.next_meeting_type) || "meeting",
          }
        : null,
      total: Math.max(0, asNumber(row.club_total)),
    };
  });

  return {
    total: items[0]?.total || items.length,
    items,
    featured: items[0] || null,
  };
}

async function getBooksMap(bookIds) {
  const ids = [...new Set((bookIds || []).map(String).filter(Boolean))];

  if (!ids.length) return new Map();

  const { data, error } = await supabase
    .from("books")
    .select("id, title, author, cover, pages, genre, year")
    .in("id", ids);

  if (error) return new Map();

  return new Map(
    (data || []).map((book) => [
      String(book.id),
      {
        ...book,
        cover: normalizeCover(book.cover),
        pages: asNumber(book.pages),
      },
    ]),
  );
}

async function getLatestBookUpdates(bookId, profileIds) {
  const cleanBookId = cleanText(bookId);
  const cleanProfileIds = [...new Set((profileIds || []).map(cleanText).filter(Boolean))];
  if (!cleanBookId || !cleanProfileIds.length) return new Map();

  const { data, error } = await supabase.rpc("reader_book_latest_updates", {
    p_book_id: cleanBookId,
    p_profile_ids: cleanProfileIds,
  });

  if (error) return new Map();

  return new Map(
    (data || []).map((row) => [
      String(row.profile_id),
      {
        id: cleanText(row.entry_id),
        source: cleanText(row.source) || "progress",
        body: cleanText(row.body),
        previous_progress: row.previous_progress === null ? null : clampProgress(row.previous_progress),
        progress: row.progress === null ? null : clampProgress(row.progress),
        pages_delta: Math.max(0, asNumber(row.pages_delta)),
        spoiler: Boolean(row.spoiler),
        created_at: row.created_at || null,
      },
    ]),
  );
}

async function getWeeklyReading(context) {
  const weekStart = mondayStart();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [{ data: goalRow }, { data: logs, error: logsError }] = await Promise.all([
    supabase
      .from("reading_weekly_goals")
      .select("page_goal")
      .eq("legacy_user_id", context.legacyId)
      .maybeSingle(),
    supabase
      .from("reading_progress_log")
      .select("id, book_id, pages_delta, created_at")
      .eq("legacy_user_id", context.legacyId)
      .gte("created_at", weekStart.toISOString())
      .lt("created_at", weekEnd.toISOString())
      .order("created_at", { ascending: true }),
  ]);

  const pageGoal = Math.max(1, asNumber(goalRow?.page_goal, DEFAULT_WEEKLY_PAGE_GOAL));
  const safeLogs = logsError ? [] : logs || [];
  const points = [];
  const pagesByDate = new Map();

  for (const log of safeLogs) {
    const key = String(log.created_at || "").slice(0, 10);
    pagesByDate.set(key, (pagesByDate.get(key) || 0) + Math.max(0, asNumber(log.pages_delta)));
  }

  for (let index = 0; index < 7; index += 1) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    const key = isoDay(date);
    points.push({
      date: key,
      label: date.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", ""),
      pages: pagesByDate.get(key) || 0,
    });
  }

  const pagesRead = points.reduce((total, day) => total + day.pages, 0);

  return {
    pageGoal,
    pagesRead,
    sessions: safeLogs.length,
    booksTouched: new Set(safeLogs.map((row) => String(row.book_id))).size,
    progress: Math.min(100, Math.round((pagesRead / pageGoal) * 100)),
    days: points,
  };
}

async function getFriendsReading(following) {
  if (!following.followingLegacyIds.length) return [];

  const { data: rows, error } = await supabase
    .from("user_books")
    .select("legacy_user_id, book_id, status, progress, started_at")
    .in("legacy_user_id", following.followingLegacyIds)
    .in("status", ["reading", "rereading"])
    .order("started_at", { ascending: false, nullsFirst: false });

  if (error || !rows?.length) return [];

  const booksById = await getBooksMap(rows.map((row) => row.book_id));
  const seen = new Set();
  const result = [];

  for (const row of rows) {
    const key = String(row.legacy_user_id);
    if (seen.has(key)) continue;

    const profile = following.profilesByLegacyId.get(key);
    const book = booksById.get(String(row.book_id));
    if (!profile || !book) continue;

    seen.add(key);
    result.push({
      profile,
      book,
      progress: clampProgress(row.progress),
      status: row.status,
      latest_update: null,
    });

    if (result.length >= 6) break;
  }

  const groups = new Map();
  for (const item of result) {
    const key = String(item.book.id);
    const current = groups.get(key) || [];
    current.push(item.profile.id);
    groups.set(key, current);
  }

  const latestByBook = new Map(
    await Promise.all(
      [...groups.entries()].map(async ([bookId, profileIds]) => [
        bookId,
        await getLatestBookUpdates(bookId, profileIds),
      ]),
    ),
  );

  return result.map((item) => ({
    ...item,
    latest_update: latestByBook.get(String(item.book.id))?.get(String(item.profile.id)) || null,
  }));
}

async function fetchProfiles({ authIds = [], legacyIds = [] } = {}) {
  const byAuthId = new Map();
  const byLegacyId = new Map();
  const queries = [];

  if (authIds.length) {
    queries.push(
      supabase
        .from("profiles")
        .select("id, legacy_id, username, display_name, avatar")
        .in("id", authIds),
    );
  }

  if (legacyIds.length) {
    queries.push(
      supabase
        .from("profiles")
        .select("id, legacy_id, username, display_name, avatar")
        .in("legacy_id", legacyIds),
    );
  }

  if (!queries.length) return { byAuthId, byLegacyId };

  const results = await Promise.all(queries);
  const rows = results.flatMap((result) => (result.error ? [] : result.data || []));

  for (const profile of rows) {
    const normalized = {
      id: profile.id,
      legacy_id: Number(profile.legacy_id),
      username: cleanText(profile.display_name || profile.username || "Lectora"),
      avatar: normalizeAvatar(profile.avatar),
    };
    byAuthId.set(String(normalized.id), normalized);
    byLegacyId.set(String(normalized.legacy_id), normalized);
  }

  return { byAuthId, byLegacyId };
}

function reviewDate(row) {
  return row.finished_at || row.started_at || row.paused_at || row.dropped_at || null;
}

function statusDate(row) {
  if (row.status === "completed") return row.finished_at || row.started_at || null;
  return row.started_at || row.finished_at || null;
}

function activityBase({ key, type, profile, book, createdAt, spoiler = false }) {
  return {
    key,
    type,
    profile,
    book,
    created_at: createdAt,
    spoiler,
    likes: 0,
    liked: false,
    comments: [],
    comments_count: 0,
  };
}

async function getFeed(context, following) {
  const [postsResult, progressResult, reviewResult, statusResult] = await Promise.all([
    supabase
      .from("reader_posts")
      .select("id, author_id, body, book_id, spoiler, image_path, created_at")
      .order("created_at", { ascending: false })
      .limit(45),
    supabase
      .from("reading_progress_log")
      .select("id, legacy_user_id, book_id, previous_progress, new_progress, pages_delta, note, spoiler, created_at")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("user_books")
      .select("id, legacy_user_id, book_id, score, notes, started_at, finished_at, paused_at, dropped_at")
      .not("notes", "is", null)
      .order("finished_at", { ascending: false, nullsFirst: false })
      .limit(45),
    supabase
      .from("user_books")
      .select("id, legacy_user_id, book_id, status, progress, started_at, finished_at")
      .in("status", ["reading", "rereading", "completed"])
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(60),
  ]);

  const posts = postsResult.error ? [] : postsResult.data || [];
  const progressRows = progressResult.error ? [] : progressResult.data || [];
  const reviewRows = reviewResult.error ? [] : reviewResult.data || [];
  const statusRows = statusResult.error ? [] : statusResult.data || [];

  const authIds = [...new Set(posts.map((row) => row.author_id).filter(Boolean))];
  const legacyIds = [
    ...new Set(
      [...progressRows, ...reviewRows, ...statusRows]
        .map((row) => Number(row.legacy_user_id))
        .filter(Boolean),
    ),
  ];
  const profiles = await fetchProfiles({ authIds, legacyIds });

  profiles.byAuthId.set(String(context.authId), {
    id: context.authId,
    legacy_id: context.legacyId,
    username: context.username,
    avatar: context.avatar,
  });
  profiles.byLegacyId.set(String(context.legacyId), profiles.byAuthId.get(String(context.authId)));

  const bookIds = [
    ...new Set(
      [...posts, ...progressRows, ...reviewRows, ...statusRows]
        .map((row) => row.book_id)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const booksById = await getBooksMap(bookIds);
  const postImages = await signedPostImages(posts.map((row) => row.image_path));
  const items = [];

  for (const row of posts) {
    const profile = profiles.byAuthId.get(String(row.author_id));
    if (!profile || !cleanText(row.body)) continue;
    const parsedActivity = parseReaderActivityBody(row.body);

    items.push({
      ...activityBase({
        key: `post:${row.id}`,
        type: "post",
        profile,
        book: booksById.get(String(row.book_id)) || null,
        createdAt: row.created_at,
        spoiler: Boolean(row.spoiler),
      }),
      body: parsedActivity.body,
      activity_title: parsedActivity.activityTitle,
      accent_color: parsedActivity.accentColor,
      annotation_kind: parsedActivity.annotationKind,
      is_reader_annotation: parsedActivity.isReaderAnnotation,
      image_url: postImages.get(String(row.image_path || "")) || "",
    });
  }

  for (const row of progressRows) {
    const profile = profiles.byLegacyId.get(String(row.legacy_user_id));
    const book = booksById.get(String(row.book_id));
    if (!profile || !book) continue;

    items.push({
      ...activityBase({
        key: `progress:${row.id}`,
        type: "progress",
        profile,
        book,
        createdAt: row.created_at,
        spoiler: Boolean(row.spoiler),
      }),
      previous_progress: clampProgress(row.previous_progress),
      progress: clampProgress(row.new_progress),
      pages_delta: Math.max(0, asNumber(row.pages_delta)),
      body: cleanText(row.note),
    });
  }

  for (const row of reviewRows) {
    const body = cleanText(row.notes);
    const createdAt = reviewDate(row);
    const profile = profiles.byLegacyId.get(String(row.legacy_user_id));
    const book = booksById.get(String(row.book_id));
    if (!body || !createdAt || !profile || !book) continue;

    items.push({
      ...activityBase({
        key: `review:${row.id}`,
        type: "review",
        profile,
        book,
        createdAt,
      }),
      body,
      score: Math.max(0, Math.min(5, asNumber(row.score))),
    });
  }

  for (const row of statusRows) {
    const createdAt = statusDate(row);
    const profile = profiles.byLegacyId.get(String(row.legacy_user_id));
    const book = booksById.get(String(row.book_id));
    if (!createdAt || !profile || !book) continue;

    items.push({
      ...activityBase({
        key: `status:${row.id}:${row.status}:${createdAt}`,
        type: row.status === "completed" ? "completed" : "started",
        profile,
        book,
        createdAt,
      }),
      progress: clampProgress(row.progress),
    });
  }

  const deduped = [];
  const seen = new Set();

  for (const item of items.sort((left, right) => dateValue(right.created_at) - dateValue(left.created_at))) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    deduped.push(item);
    if (deduped.length >= 60) break;
  }

  const activityKeys = deduped.map((item) => item.key);
  if (!activityKeys.length) return [];

  const [likesResult, commentsResult] = await Promise.all([
    supabase
      .from("reader_activity_likes")
      .select("activity_key, user_id")
      .in("activity_key", activityKeys),
    supabase
      .from("reader_activity_comments")
      .select("id, activity_key, user_id, body, created_at")
      .in("activity_key", activityKeys)
      .order("created_at", { ascending: true }),
  ]);

  const likes = likesResult.error ? [] : likesResult.data || [];
  const comments = commentsResult.error ? [] : commentsResult.data || [];
  const commentProfiles = await fetchProfiles({
    authIds: [...new Set(comments.map((comment) => comment.user_id).filter(Boolean))],
  });
  const likesByKey = new Map();
  const commentsByKey = new Map();

  for (const like of likes) {
    const list = likesByKey.get(like.activity_key) || [];
    list.push(like.user_id);
    likesByKey.set(like.activity_key, list);
  }

  for (const comment of comments) {
    const list = commentsByKey.get(comment.activity_key) || [];
    const profile = commentProfiles.byAuthId.get(String(comment.user_id));
    list.push({
      id: comment.id,
      body: cleanText(comment.body),
      created_at: comment.created_at,
      profile: profile || {
        id: comment.user_id,
        username: "Lectora",
        avatar: "/images/avatar/avatar1.png",
      },
    });
    commentsByKey.set(comment.activity_key, list);
  }

  const followingSet = new Set(following.followingProfileIds.map(String));

  return deduped.map((item) => {
    const itemLikes = likesByKey.get(item.key) || [];
    const itemComments = commentsByKey.get(item.key) || [];
    return {
      ...item,
      is_mine: String(item.profile.id) === String(context.authId),
      is_friend: followingSet.has(String(item.profile.id)),
      likes: itemLikes.length,
      liked: itemLikes.some((userId) => String(userId) === String(context.authId)),
      comments_count: itemComments.length,
      comments: itemComments.slice(-2),
    };
  });
}

export async function getHomeDashboardData() {
  const context = await getCurrentContext();
  const following = await getFollowingContext(context.authId);

  const [weekly, friendsReading, feed, clubs] = await Promise.all([
    getWeeklyReading(context),
    getFriendsReading(following),
    getFeed(context, following),
    getClubHomeSnapshot(),
  ]);

  return {
    context,
    weekly,
    friendsReading,
    feed,
    clubs,
  };
}

export async function saveWeeklyPageGoal(pageGoal) {
  const context = await getCurrentContext();
  const cleanGoal = Math.max(1, Math.min(10000, Math.round(asNumber(pageGoal, DEFAULT_WEEKLY_PAGE_GOAL))));

  const { data, error } = await supabase
    .from("reading_weekly_goals")
    .upsert(
      {
        legacy_user_id: context.legacyId,
        page_goal: cleanGoal,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "legacy_user_id" },
    )
    .select("page_goal")
    .single();

  if (error) throw apiError(error.message || "No se pudo guardar tu meta semanal.");
  return Math.max(1, asNumber(data?.page_goal, cleanGoal));
}

export async function recordReadingProgress({
  bookId,
  previousProgress,
  newProgress,
  totalPages,
  note = "",
  spoiler = false,
}) {
  const context = await getCurrentContext();
  const cleanBookId = cleanText(bookId);
  const pages = Math.max(0, asNumber(totalPages));
  const previous = clampProgress(previousProgress);
  const next = clampProgress(newProgress);
  const cleanNote = cleanText(note).slice(0, 1200);

  if (!cleanBookId || next === previous) return null;

  const previousPage = pages > 0 ? Math.round((pages * previous) / 100) : 0;
  const nextPage = pages > 0 ? Math.round((pages * next) / 100) : 0;
  const pagesDelta = Math.max(0, nextPage - previousPage);

  const { data, error } = await supabase
    .from("reading_progress_log")
    .insert({
      legacy_user_id: context.legacyId,
      book_id: cleanBookId,
      previous_progress: previous,
      new_progress: next,
      pages_delta: pagesDelta,
      note: cleanNote || null,
      spoiler: Boolean(spoiler),
    })
    .select("id")
    .single();

  if (error) {
    console.warn("No se pudo registrar la sesión de lectura:", error);
    return null;
  }

  return data;
}

export async function searchReaderPostBooks(search) {
  const cleanSearch = cleanText(search);
  if (cleanSearch.length < 2) return [];

  const { data, error } = await supabase.rpc("catalog_books_page", {
    p_page: 1,
    p_page_size: 8,
    p_search: cleanSearch,
    p_genres: [],
    p_genre_mode: "any",
    p_year: null,
    p_book_id: null,
  });

  if (error) throw apiError("No se pudieron buscar libros del catálogo.");

  const payload = typeof data === "string" ? JSON.parse(data) : data;
  return Array.isArray(payload?.books)
    ? payload.books.map((book) => ({ ...book, cover: normalizeCover(book.cover) }))
    : [];
}

export async function publishReaderPost({
  body,
  spoiler = false,
  bookId = null,
  imageFile = null,
  activityTitle = "",
  accentColor = "yellow",
  annotationKind = "postit",
}) {
  const context = await getCurrentContext();
  const cleanBody = cleanText(body);

  if (!cleanBody && !imageFile) {
    throw apiError("Escribe algo o añade una imagen antes de publicar.", 400);
  }

  const storedBody = activityTitle
    ? encodeReaderActivityBody({
        body: cleanBody,
        title: activityTitle,
        color: accentColor,
        annotationKind,
      })
    : cleanBody;

  let imagePath = null;

  if (imageFile) {
    if (!String(imageFile.type || "").startsWith("image/")) {
      throw apiError("El archivo elegido no es una imagen.", 400);
    }

    if (imageFile.size > 5 * 1024 * 1024) {
      throw apiError("La imagen debe pesar menos de 5 MB.", 400);
    }

    const uniqueId = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    imagePath = `${context.authId}/${uniqueId}.${fileExtension(imageFile)}`;

    const { error: uploadError } = await supabase.storage
      .from("reader-post-images")
      .upload(imagePath, imageFile, {
        cacheControl: "3600",
        contentType: imageFile.type,
        upsert: false,
      });

    if (uploadError) {
      throw apiError(uploadError.message || "No se pudo subir la imagen.");
    }
  }

  const { data, error } = await supabase
    .from("reader_posts")
    .insert({
      author_id: context.authId,
      body: storedBody.slice(0, 1200) || "Compartió una imagen.",
      spoiler: Boolean(spoiler),
      book_id: cleanText(bookId) || null,
      image_path: imagePath,
    })
    .select("id")
    .single();

  if (error) {
    if (imagePath) {
      await supabase.storage.from("reader-post-images").remove([imagePath]);
    }
    throw apiError(error.message || "No se pudo publicar tu actividad.");
  }

  return data;
}

export async function getBookProgressThread(bookId, profileId = null) {
  const context = await getCurrentContext();
  const cleanBookId = cleanText(bookId);
  const targetProfileId = cleanText(profileId) || context.authId;
  if (!cleanBookId) return [];

  const { data, error } = await supabase.rpc("reader_book_thread", {
    p_book_id: cleanBookId,
    p_profile_id: targetProfileId,
  });

  if (!error) {
    return (data || []).map((row) => {
      const parsedActivity = parseReaderActivityBody(row.body);
      return {
        id: cleanText(row.entry_id) || `${cleanText(row.source) || "update"}:${row.created_at}`,
        source: cleanText(row.source) || "progress",
        body: parsedActivity.body,
        activity_title: parsedActivity.activityTitle,
        accent_color: parsedActivity.accentColor,
        annotation_kind: parsedActivity.annotationKind,
        is_reader_annotation: parsedActivity.isReaderAnnotation,
        previous_progress: row.previous_progress === null ? null : clampProgress(row.previous_progress),
        new_progress: row.progress === null ? null : clampProgress(row.progress),
        pages_delta: Math.max(0, asNumber(row.pages_delta)),
        spoiler: Boolean(row.spoiler),
        created_at: row.created_at,
      };
    });
  }

  // Compatibilidad durante un despliegue escalonado: mientras V9 todavía no
  // esté aplicada en Supabase, el hilo propio sigue funcionando como antes.
  if (String(targetProfileId) !== String(context.authId)) {
    throw apiError("Este hilo todavía no está disponible. Aplica la migración de privacidad V9.");
  }

  const { data: legacyRows, error: legacyError } = await supabase
    .from("reading_progress_log")
    .select("id, previous_progress, new_progress, pages_delta, note, spoiler, created_at")
    .eq("legacy_user_id", context.legacyId)
    .eq("book_id", cleanBookId)
    .order("created_at", { ascending: false });

  if (legacyError) throw apiError("No se pudo cargar tu recorrido lector.");

  return (legacyRows || []).map((row) => ({
    id: `progress:${row.id}`,
    source: "progress",
    body: cleanText(row.note),
    previous_progress: clampProgress(row.previous_progress),
    new_progress: clampProgress(row.new_progress),
    pages_delta: Math.max(0, asNumber(row.pages_delta)),
    spoiler: Boolean(row.spoiler),
    created_at: row.created_at,
  }));
}

export async function toggleActivityLike(activityKey) {
  const context = await getCurrentContext();
  const key = cleanText(activityKey);
  if (!key) throw apiError("Falta la actividad.", 400);

  const { data: existing, error: existingError } = await supabase
    .from("reader_activity_likes")
    .select("activity_key")
    .eq("activity_key", key)
    .eq("user_id", context.authId)
    .maybeSingle();

  if (existingError) throw apiError(existingError.message || "No se pudo actualizar el me gusta.");

  if (existing) {
    const { error } = await supabase
      .from("reader_activity_likes")
      .delete()
      .eq("activity_key", key)
      .eq("user_id", context.authId);
    if (error) throw apiError(error.message || "No se pudo quitar el me gusta.");
    return false;
  }

  const { error } = await supabase.from("reader_activity_likes").insert({
    activity_key: key,
    user_id: context.authId,
  });

  if (error) throw apiError(error.message || "No se pudo dar me gusta.");
  return true;
}

export async function addActivityComment(activityKey, body) {
  const context = await getCurrentContext();
  const key = cleanText(activityKey);
  const cleanBody = cleanText(body);

  if (!key || !cleanBody) throw apiError("Escribe un comentario.", 400);

  const { data, error } = await supabase
    .from("reader_activity_comments")
    .insert({
      activity_key: key,
      user_id: context.authId,
      body: cleanBody.slice(0, 500),
    })
    .select("id")
    .single();

  if (error) throw apiError(error.message || "No se pudo publicar el comentario.");
  return data;
}
