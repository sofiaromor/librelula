import { supabase } from "./supabase.js";

const PROFILE_FEED_TTL = 30_000;
const PROFILE_FEED_MAX_ITEMS = 120;
const feedCache = new Map();

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

function normalizeAsset(value, fallback = "") {
  const path = cleanText(value);
  if (!path) return fallback;
  if (/^(https?:|data:|blob:|\/)/i.test(path)) return path;
  return `/${path.replace(/^\.\//, "")}`;
}

function dateValue(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

function reviewDate(row) {
  return row.finished_at || row.started_at || row.paused_at || row.dropped_at || row.added_at || null;
}

function statusDate(row) {
  if (row.status === "completed") return row.finished_at || row.added_at || row.started_at || null;
  if (row.status === "paused") return row.paused_at || row.added_at || row.started_at || null;
  if (row.status === "dropped") return row.dropped_at || row.added_at || row.started_at || null;
  return row.started_at || row.added_at || row.finished_at || null;
}

function normalizeProfile(profile) {
  return {
    id: profile?.id || null,
    legacy_id: Number(profile?.legacy_id) || null,
    username: cleanText(profile?.username || "lectora"),
    display_name: cleanText(profile?.display_name || profile?.username || "Lectora"),
    avatar: normalizeAsset(profile?.avatar, "/images/avatar/avatar1.png"),
  };
}

async function fetchBooks(bookIds) {
  const ids = [...new Set((bookIds || []).map(String).filter(Boolean))];
  if (!ids.length) return new Map();

  const { data, error } = await supabase
    .from("books")
    .select("id, title, author, cover, pages, genre, year")
    .in("id", ids);

  if (error) return new Map();
  return new Map((data || []).map((book) => [String(book.id), {
    ...book,
    cover: normalizeAsset(book.cover),
    pages: asNumber(book.pages),
  }]));
}

async function fetchProfiles(profileIds) {
  const ids = [...new Set((profileIds || []).map(String).filter(Boolean))];
  if (!ids.length) return new Map();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, legacy_id, username, display_name, avatar")
    .in("id", ids);

  if (error) return new Map();
  return new Map((data || []).map((profile) => [String(profile.id), normalizeProfile(profile)]));
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

function chunks(values, size = 40) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function fetchInteractions(activityKeys, viewerId) {
  if (!activityKeys.length) return { likesByKey: new Map(), commentsByKey: new Map() };

  const batches = await Promise.all(chunks(activityKeys).map(async (keys) => {
    const [likesResult, commentsResult] = await Promise.all([
      supabase
        .from("reader_activity_likes")
        .select("activity_key, user_id")
        .in("activity_key", keys),
      supabase
        .from("reader_activity_comments")
        .select("id, activity_key, user_id, body, created_at")
        .in("activity_key", keys)
        .order("created_at", { ascending: true }),
    ]);

    return {
      likes: likesResult.error ? [] : likesResult.data || [],
      comments: commentsResult.error ? [] : commentsResult.data || [],
    };
  }));

  const likes = batches.flatMap((batch) => batch.likes);
  const comments = batches.flatMap((batch) => batch.comments);
  const commenterProfiles = await fetchProfiles(comments.map((comment) => comment.user_id));
  const likesByKey = new Map();
  const commentsByKey = new Map();

  for (const like of likes) {
    const key = String(like.activity_key || "");
    if (!key) continue;
    const current = likesByKey.get(key) || [];
    current.push(String(like.user_id || ""));
    likesByKey.set(key, current);
  }

  for (const comment of comments) {
    const key = String(comment.activity_key || "");
    if (!key || !cleanText(comment.body)) continue;
    const current = commentsByKey.get(key) || [];
    current.push({
      id: comment.id,
      body: cleanText(comment.body),
      created_at: comment.created_at,
      profile: commenterProfiles.get(String(comment.user_id)) || {
        id: comment.user_id,
        username: "lectora",
        display_name: "Lectora",
        avatar: "/images/avatar/avatar1.png",
      },
    });
    commentsByKey.set(key, current);
  }

  return {
    likesByKey: new Map([...likesByKey.entries()].map(([key, userIds]) => [key, {
      count: userIds.length,
      liked: userIds.some((userId) => String(userId) === String(viewerId || "")),
    }])),
    commentsByKey,
  };
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
    comments_count: 0,
    comments: [],
  };
}

export function invalidateProfileFeed(profileId = null) {
  if (profileId) feedCache.delete(String(profileId));
  else feedCache.clear();
}

export async function getProfileActivityFeed(profile) {
  const target = normalizeProfile(profile);
  if (!target.id || !target.legacy_id) return [];

  const cacheKey = String(target.id);
  const cached = feedCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < PROFILE_FEED_TTL) return cached.data;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const viewerId = session?.user?.id || null;

  const [postsResult, progressResult, reviewResult, statusResult] = await Promise.all([
    supabase
      .from("reader_posts")
      .select("id, author_id, body, book_id, spoiler, image_path, created_at")
      .eq("author_id", target.id)
      .order("created_at", { ascending: false })
      .limit(PROFILE_FEED_MAX_ITEMS),
    supabase
      .from("reading_progress_log")
      .select("id, legacy_user_id, book_id, previous_progress, new_progress, pages_delta, note, spoiler, created_at")
      .eq("legacy_user_id", target.legacy_id)
      .order("created_at", { ascending: false })
      .limit(PROFILE_FEED_MAX_ITEMS),
    supabase
      .from("user_books")
      .select("id, legacy_user_id, book_id, score, notes, started_at, finished_at, paused_at, dropped_at, added_at")
      .eq("legacy_user_id", target.legacy_id)
      .not("notes", "is", null)
      .limit(PROFILE_FEED_MAX_ITEMS),
    supabase
      .from("user_books")
      .select("id, legacy_user_id, book_id, status, progress, started_at, finished_at, paused_at, dropped_at, added_at")
      .eq("legacy_user_id", target.legacy_id)
      .limit(PROFILE_FEED_MAX_ITEMS),
  ]);

  const posts = postsResult.error ? [] : postsResult.data || [];
  const progressRows = progressResult.error ? [] : progressResult.data || [];
  const reviewRows = reviewResult.error ? [] : reviewResult.data || [];
  const statusRows = statusResult.error ? [] : statusResult.data || [];
  const bookIds = [...posts, ...progressRows, ...reviewRows, ...statusRows]
    .map((row) => row.book_id)
    .filter(Boolean);

  const [booksById, postImages] = await Promise.all([
    fetchBooks(bookIds),
    signedPostImages(posts.map((row) => row.image_path)),
  ]);

  const items = [];

  for (const row of posts) {
    const body = cleanText(row.body);
    if (!body || !row.created_at) continue;
    items.push({
      ...activityBase({
        key: `post:${row.id}`,
        type: "post",
        profile: target,
        book: booksById.get(String(row.book_id)) || null,
        createdAt: row.created_at,
        spoiler: Boolean(row.spoiler),
      }),
      body,
      image_url: postImages.get(String(row.image_path || "")) || "",
    });
  }

  for (const row of progressRows) {
    const book = booksById.get(String(row.book_id));
    if (!book || !row.created_at) continue;
    items.push({
      ...activityBase({
        key: `progress:${row.id}`,
        type: "progress",
        profile: target,
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
    const book = booksById.get(String(row.book_id));
    if (!body || !createdAt || !book) continue;
    items.push({
      ...activityBase({
        key: `review:${row.id}`,
        type: "review",
        profile: target,
        book,
        createdAt,
      }),
      body,
      score: Math.max(0, Math.min(5, asNumber(row.score))),
    });
  }

  for (const row of statusRows) {
    const createdAt = statusDate(row);
    const book = booksById.get(String(row.book_id));
    if (!createdAt || !book) continue;
    const status = cleanText(row.status) || "planned";
    items.push({
      ...activityBase({
        key: `status:${row.id}:${status}:${createdAt}`,
        type: status === "completed" ? "completed" : status === "reading" || status === "rereading" ? "started" : status,
        profile: target,
        book,
        createdAt,
      }),
      status,
      progress: clampProgress(row.progress),
    });
  }

  const deduped = [];
  const seen = new Set();
  for (const item of items.sort((left, right) => dateValue(right.created_at) - dateValue(left.created_at))) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    deduped.push(item);
    if (deduped.length >= PROFILE_FEED_MAX_ITEMS) break;
  }

  const activityKeys = deduped.map((item) => item.key);
  const { likesByKey, commentsByKey } = await fetchInteractions(activityKeys, viewerId);
  const enriched = deduped.map((item) => {
    const likes = likesByKey.get(item.key) || { count: 0, liked: false };
    const comments = commentsByKey.get(item.key) || [];
    return {
      ...item,
      is_mine: String(target.id) === String(viewerId || ""),
      likes: likes.count,
      liked: likes.liked,
      comments_count: comments.length,
      comments,
    };
  });

  feedCache.set(cacheKey, { savedAt: Date.now(), data: enriched });
  return enriched;
}
