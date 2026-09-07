import { supabase } from "./supabase.js";

const DEFAULT_WEEKLY_PAGE_GOAL = 150;
const CONTEXT_TTL = 60_000;
const FOLLOWING_TTL = 45_000;
const DASHBOARD_TTL = 15_000;
const READING_TTL = 15_000;
const BOOK_TTL = 5 * 60_000;

let contextCache = null;
let contextInflight = null;
const followingCache = new Map();
const followingInflight = new Map();
const dashboardCache = new Map();
const dashboardInflight = new Map();
const readingCache = new Map();
const readingInflight = new Map();
const bookCache = new Map();

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
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  return start;
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function dateValue(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
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

function fresh(entry, ttl) {
  return Boolean(entry && Date.now() - entry.savedAt < ttl);
}

export function invalidateHomeDataCaches() {
  dashboardCache.clear();
  dashboardInflight.clear();
  readingCache.clear();
  readingInflight.clear();
}

export async function getHomeContext() {
  if (fresh(contextCache, CONTEXT_TTL)) return contextCache.data;
  if (contextInflight) return contextInflight;

  contextInflight = (async () => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    const user = session?.user || null;
    if (sessionError || !user) {
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

    const data = {
      authId: user.id,
      legacyId: Number(profile.legacy_id),
      username: cleanText(profile.display_name || profile.username || user.email || "Lectora"),
      profileUsername: cleanText(profile.username || profile.display_name || user.email || "Lectora"),
      email: user.email || "",
      avatar: normalizeAvatar(profile.avatar),
    };

    contextCache = { savedAt: Date.now(), data };
    return data;
  })().finally(() => {
    contextInflight = null;
  });

  return contextInflight;
}

async function getFollowingContext(authId) {
  const key = String(authId);
  const cached = followingCache.get(key);
  if (fresh(cached, FOLLOWING_TTL)) return cached.data;
  if (followingInflight.has(key)) return followingInflight.get(key);

  const request = (async () => {
    const { data: follows, error: followsError } = await supabase
      .from("user_follows")
      .select("following_id")
      .eq("follower_id", authId);

    const empty = {
      followingProfileIds: [],
      followingLegacyIds: [],
      profilesByAuthId: new Map(),
      profilesByLegacyId: new Map(),
    };

    if (followsError) return empty;

    const followingProfileIds = [...new Set((follows || []).map((row) => row.following_id).filter(Boolean))];
    if (!followingProfileIds.length) return empty;

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, legacy_id, username, display_name, avatar")
      .in("id", followingProfileIds);

    if (profilesError) return { ...empty, followingProfileIds };

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
  })()
    .then((data) => {
      followingCache.set(key, { savedAt: Date.now(), data });
      return data;
    })
    .finally(() => followingInflight.delete(key));

  followingInflight.set(key, request);
  return request;
}

async function getBooksMap(bookIds) {
  const ids = [...new Set((bookIds || []).map(String).filter(Boolean))];
  if (!ids.length) return new Map();

  const result = new Map();
  const missing = [];

  for (const id of ids) {
    const cached = bookCache.get(id);
    if (fresh(cached, BOOK_TTL)) result.set(id, cached.data);
    else missing.push(id);
  }

  if (missing.length) {
    const { data, error } = await supabase
      .from("books")
      .select("id, title, author, cover, pages, genre, year, saga_name, saga_number")
      .in("id", missing);

    if (!error) {
      for (const book of data || []) {
        const normalized = {
          ...book,
          cover: normalizeCover(book.cover),
          pages: asNumber(book.pages),
        };
        const id = String(book.id);
        result.set(id, normalized);
        bookCache.set(id, { savedAt: Date.now(), data: normalized });
      }
    }
  }

  return result;
}

export async function getHomeReadingProfileOverview() {
  const context = await getHomeContext();
  const key = String(context.authId);
  const cached = readingCache.get(key);
  if (fresh(cached, READING_TTL)) return cached.data;
  if (readingInflight.has(key)) return readingInflight.get(key);

  const request = (async () => {
    const { data: rows, error } = await supabase
      .from("user_books")
      .select("id, book_id, status, progress, progress_mode, total_minutes, minutes_read, total_chapters, current_chapter, started_at, finished_at, read_count, added_at")
      .eq("legacy_user_id", context.legacyId)
      .in("status", ["reading", "rereading"])
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(8);

    if (error) throw apiError("No se pudieron cargar tus lecturas actuales.");

    const safeRows = rows || [];
    const booksById = await getBooksMap(safeRows.map((row) => row.book_id));
    const currentReadingBooks = safeRows
      .map((row) => {
        const book = booksById.get(String(row.book_id));
        if (!book) return null;
        return {
          ...book,
          user_book_id: row.id,
          status: row.status,
          progress: clampProgress(row.progress),
          progress_mode: row.progress_mode || "percentage",
          total_minutes: Math.max(0, asNumber(row.total_minutes)),
          minutes_read: Math.max(0, asNumber(row.minutes_read)),
          total_chapters: Math.max(0, asNumber(row.total_chapters)),
          current_chapter: Math.max(0, asNumber(row.current_chapter)),
          started_at: row.started_at || null,
          finished_at: row.finished_at || null,
          read_count: asNumber(row.read_count, 1),
          added_at: row.added_at || null,
        };
      })
      .filter(Boolean);

    return {
      authenticated: true,
      profile: {
        id: context.authId,
        legacy_id: context.legacyId,
        username: context.profileUsername,
        display_name: context.username,
        email: context.email,
        avatar: context.avatar,
      },
      currentReadingBooks,
    };
  })()
    .then((data) => {
      readingCache.set(key, { savedAt: Date.now(), data });
      return data;
    })
    .finally(() => readingInflight.delete(key));

  readingInflight.set(key, request);
  return request;
}

async function getClubHomeSnapshot() {
  const { data, error } = await supabase.rpc("reading_club_home_snapshot");
  if (error) return { total: 0, items: [], featured: null };

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

  return { total: items[0]?.total || items.length, items, featured: items[0] || null };
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
  const pagesByDate = new Map();

  for (const log of safeLogs) {
    const key = String(log.created_at || "").slice(0, 10);
    pagesByDate.set(key, (pagesByDate.get(key) || 0) + Math.max(0, asNumber(log.pages_delta)));
  }

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    const key = isoDay(date);
    return {
      date: key,
      label: date.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", ""),
      pages: pagesByDate.get(key) || 0,
    };
  });

  const pagesRead = days.reduce((total, day) => total + day.pages, 0);
  return {
    pageGoal,
    pagesRead,
    sessions: safeLogs.length,
    booksTouched: new Set(safeLogs.map((row) => String(row.book_id))).size,
    progress: Math.min(100, Math.round((pagesRead / pageGoal) * 100)),
    days,
  };
}

async function getFriendsReading(following) {
  if (!following.followingLegacyIds.length) return [];

  const { data: rows, error } = await supabase
    .from("user_books")
    .select("legacy_user_id, book_id, status, progress, started_at")
    .in("legacy_user_id", following.followingLegacyIds)
    .in("status", ["reading", "rereading"])
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(30);

  if (error || !rows?.length) return [];

  const booksById = await getBooksMap(rows.map((row) => row.book_id));
  const seen = new Set();
  const result = [];

  for (const row of rows) {
    const profileKey = String(row.legacy_user_id);
    if (seen.has(profileKey)) continue;

    const profile = following.profilesByLegacyId.get(profileKey);
    const book = booksById.get(String(row.book_id));
    if (!profile || !book) continue;

    seen.add(profileKey);
    result.push({
      profile,
      book,
      progress: clampProgress(row.progress),
      status: row.status,
      latest_update: null,
    });
    if (result.length >= 6) break;
  }

  return result;
}

async function fetchProfiles({ authIds = [], legacyIds = [] } = {}) {
  const byAuthId = new Map();
  const byLegacyId = new Map();
  const queries = [];

  const uniqueAuthIds = [...new Set(authIds.map(String).filter(Boolean))];
  const uniqueLegacyIds = [...new Set(legacyIds.map(Number).filter(Boolean))];

  if (uniqueAuthIds.length) {
    queries.push(
      supabase
        .from("profiles")
        .select("id, legacy_id, username, display_name, avatar")
        .in("id", uniqueAuthIds),
    );
  }
  if (uniqueLegacyIds.length) {
    queries.push(
      supabase
        .from("profiles")
        .select("id, legacy_id, username, display_name, avatar")
        .in("legacy_id", uniqueLegacyIds),
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

async function getFeed(context, followingPromise) {
  const [postsResult, progressResult, reviewResult, statusResult] = await Promise.all([
    supabase
      .from("reader_posts")
      .select("id, author_id, body, book_id, spoiler, image_path, created_at")
      .order("created_at", { ascending: false })
      .limit(24),
    supabase
      .from("reading_progress_log")
      .select("id, legacy_user_id, book_id, previous_progress, new_progress, pages_delta, note, spoiler, created_at")
      .order("created_at", { ascending: false })
      .limit(32),
    supabase
      .from("user_books")
      .select("id, legacy_user_id, book_id, score, notes, started_at, finished_at, paused_at, dropped_at")
      .not("notes", "is", null)
      .order("finished_at", { ascending: false, nullsFirst: false })
      .limit(24),
    supabase
      .from("user_books")
      .select("id, legacy_user_id, book_id, status, progress, started_at, finished_at")
      .in("status", ["reading", "rereading", "completed"])
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(32),
  ]);

  const posts = postsResult.error ? [] : postsResult.data || [];
  const progressRows = progressResult.error ? [] : progressResult.data || [];
  const reviewRows = reviewResult.error ? [] : reviewResult.data || [];
  const statusRows = statusResult.error ? [] : statusResult.data || [];

  const authIds = [...new Set(posts.map((row) => row.author_id).filter(Boolean))];
  const legacyIds = [...new Set(
    [...progressRows, ...reviewRows, ...statusRows]
      .map((row) => Number(row.legacy_user_id))
      .filter(Boolean),
  )];
  const bookIds = [...new Set(
    [...posts, ...progressRows, ...reviewRows, ...statusRows]
      .map((row) => row.book_id)
      .filter(Boolean)
      .map(String),
  )];

  const [profiles, booksById, postImages] = await Promise.all([
    fetchProfiles({ authIds, legacyIds }),
    getBooksMap(bookIds),
    signedPostImages(posts.map((row) => row.image_path)),
  ]);

  const currentProfile = {
    id: context.authId,
    legacy_id: context.legacyId,
    username: context.username,
    avatar: context.avatar,
  };
  profiles.byAuthId.set(String(context.authId), currentProfile);
  profiles.byLegacyId.set(String(context.legacyId), currentProfile);

  const items = [];

  for (const row of posts) {
    const profile = profiles.byAuthId.get(String(row.author_id));
    if (!profile || !cleanText(row.body)) continue;
    items.push({
      ...activityBase({
        key: `post:${row.id}`,
        type: "post",
        profile,
        book: booksById.get(String(row.book_id)) || null,
        createdAt: row.created_at,
        spoiler: Boolean(row.spoiler),
      }),
      body: cleanText(row.body),
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
    if (deduped.length >= 32) break;
  }

  if (!deduped.length) return [];
  const activityKeys = deduped.map((item) => item.key);

  const [likesResult, commentsResult, following] = await Promise.all([
    supabase
      .from("reader_activity_likes")
      .select("activity_key, user_id")
      .in("activity_key", activityKeys),
    supabase
      .from("reader_activity_comments")
      .select("id, activity_key, user_id, body, created_at")
      .in("activity_key", activityKeys)
      .order("created_at", { ascending: true }),
    followingPromise,
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
  const context = await getHomeContext();
  const key = String(context.authId);
  const cached = dashboardCache.get(key);
  if (fresh(cached, DASHBOARD_TTL)) return cached.data;
  if (dashboardInflight.has(key)) return dashboardInflight.get(key);

  const request = (async () => {
    const followingPromise = getFollowingContext(context.authId);
    const weeklyPromise = getWeeklyReading(context);
    const clubsPromise = getClubHomeSnapshot();
    const friendsPromise = followingPromise.then(getFriendsReading);
    const feedPromise = getFeed(context, followingPromise);

    const [weekly, friendsReading, feed, clubs] = await Promise.all([
      weeklyPromise,
      friendsPromise,
      feedPromise,
      clubsPromise,
    ]);

    return { context, weekly, friendsReading, feed, clubs };
  })()
    .then((data) => {
      dashboardCache.set(key, { savedAt: Date.now(), data });
      return data;
    })
    .finally(() => dashboardInflight.delete(key));

  dashboardInflight.set(key, request);
  return request;
}
