import { supabase } from "./supabase.js";

const PROFILE_FIELDS = "id, legacy_id, username, display_name, avatar";
const BOOK_FIELDS = "id, title, author, cover, pages, genre, year, saga_name, saga_number";
const CLUB_FIELDS = `
  id,
  owner_id,
  name,
  description,
  visibility,
  current_book_id,
  banner_url,
  icon_url,
  accent_color,
  invite_code,
  next_meeting_at,
  meeting_label,
  rules,
  reading_plan_enabled,
  reading_plan_unlocked_chapter,
  reading_plan_next_unlock_at,
  reading_plan_interval_days,
  reading_plan_chapters_per_period,
  created_at,
  updated_at
`;

function unique(values) {
  return [...new Set((values || []).map((value) => String(value || "")).filter(Boolean))];
}

function mapById(rows) {
  return new Map((rows || []).map((row) => [String(row.id), row]));
}

function isPlaceholderAvatar(value) {
  const clean = String(value || "").trim().toLowerCase();
  return (
    !clean ||
    clean === "default.jpg" ||
    clean === "default.png" ||
    clean === "images/avatar/default.jpg" ||
    clean === "images/avatar/avatar1.png"
  );
}

async function mergeLegacyProfileData(profiles) {
  const rows = profiles || [];
  const legacyIds = unique(rows.map((profile) => profile?.legacy_id));
  if (!legacyIds.length) return rows;

  const { data: legacyRows, error } = await supabase
    .from("legacy_users")
    .select("legacy_id, username, avatar, bio")
    .in("legacy_id", legacyIds);

  // Los perfiles siguen funcionando aunque una instalación antigua no permita
  // consultar legacy_users. En ese caso usamos los datos de profiles tal cual.
  if (error) return rows;

  const legacyMap = new Map(
    (legacyRows || []).map((legacy) => [String(legacy.legacy_id), legacy]),
  );

  return rows.map((profile) => {
    const legacy = legacyMap.get(String(profile?.legacy_id || ""));
    const profileAvatar = String(profile?.avatar || "").trim();
    const legacyAvatar = String(legacy?.avatar || "").trim();
    const avatar =
      isPlaceholderAvatar(profileAvatar) && !isPlaceholderAvatar(legacyAvatar)
        ? legacyAvatar
        : profileAvatar || legacyAvatar || "images/avatar/avatar1.png";

    return {
      ...profile,
      username: profile?.username || legacy?.username || "lectora",
      avatar,
    };
  });
}

function cleanSearch(value) {
  return String(value || "")
    .trim()
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}


function clubMediaObjectPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const clean = raw.split("?")[0];
  const markers = [
    "/storage/v1/object/public/club-media/",
    "/storage/v1/object/sign/club-media/",
    "/storage/v1/object/authenticated/club-media/",
  ];

  for (const marker of markers) {
    const index = clean.indexOf(marker);
    if (index >= 0) {
      return clean.slice(index + marker.length).replace(/^\/+/, "");
    }
  }

  if (/^https?:\/\//i.test(clean)) return "";
  return clean.replace(/^\/+/, "");
}

async function resolveClubMediaAsset(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const path = clubMediaObjectPath(raw);

  // URL externa que no pertenece a club-media.
  if (!path && /^https?:\/\//i.test(raw)) return raw;
  if (!path) return raw;

  // Si el bucket es privado (V7), esta será la URL válida.
  const { data: signedData, error: signedError } = await supabase.storage
    .from("club-media")
    .createSignedUrl(path, 60 * 60);

  if (!signedError && signedData?.signedUrl) {
    return signedData.signedUrl;
  }

  // Compatibilidad con instalaciones donde club-media sigue siendo público.
  const publicUrl = supabase.storage.from("club-media").getPublicUrl(path).data.publicUrl || "";
  return publicUrl || raw;
}

async function withResolvedClubMedia(club) {
  if (!club) return club;

  const [bannerAssetUrl, iconAssetUrl] = await Promise.all([
    resolveClubMediaAsset(club.banner_url),
    resolveClubMediaAsset(club.icon_url),
  ]);

  return {
    ...club,
    banner_asset_url: bannerAssetUrl,
    icon_asset_url: iconAssetUrl,
  };
}

async function currentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Inicia sesión para entrar en los clubes de lectura.");
  }

  return user;
}

async function currentProfile() {
  const user = await currentUser();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("id", user.id)
    .single();

  if (error) {
    throw new Error(error.message || "No se pudo cargar tu perfil lector.");
  }

  const [profile] = await mergeLegacyProfileData([data]);
  return profile || data;
}

async function booksByIds(ids) {
  const cleanIds = unique(ids);
  if (!cleanIds.length) return [];

  const { data, error } = await supabase
    .from("books")
    .select(BOOK_FIELDS)
    .in("id", cleanIds);

  if (error) throw error;
  return data || [];
}

async function profilesByIds(ids) {
  const cleanIds = unique(ids);
  if (!cleanIds.length) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
    .in("id", cleanIds);

  if (error) throw error;
  return mergeLegacyProfileData(data || []);
}

async function latestBookUpdates(bookId, profileIds) {
  const cleanBookId = String(bookId || "").trim();
  const cleanProfileIds = unique(profileIds);
  if (!cleanBookId || !cleanProfileIds.length) return new Map();

  const { data, error } = await supabase.rpc("reader_book_latest_updates", {
    p_book_id: cleanBookId,
    p_profile_ids: cleanProfileIds,
  });

  // Despliegue escalonado: Clubes sigue funcionando aunque el frontend llegue
  // unos minutos antes que la migración V9.
  if (error) {
    console.warn("No se pudieron cargar las últimas actualizaciones lectoras:", error);
    return new Map();
  }

  return new Map(
    (data || []).map((row) => [
      String(row.profile_id),
      {
        id: String(row.entry_id || ""),
        source: String(row.source || "progress"),
        body: String(row.body || "").trim(),
        previous_progress: row.previous_progress === null ? null : Math.max(0, Math.min(100, Number(row.previous_progress) || 0)),
        progress: row.progress === null ? null : Math.max(0, Math.min(100, Number(row.progress) || 0)),
        pages_delta: Math.max(0, Number(row.pages_delta) || 0),
        spoiler: Boolean(row.spoiler),
        created_at: row.created_at || null,
      },
    ]),
  );
}

function decorateClubs(clubs, memberships, books, memberCounts, profile) {
  const bookMap = mapById(books);
  const membershipMap = new Map(
    (memberships || []).map((membership) => [String(membership.club_id), membership]),
  );
  const counts = new Map(
    (memberCounts || []).map((row) => [
      String(row.club_id),
      Math.max(0, Number(row.member_count) || 0),
    ]),
  );

  return (clubs || []).map((club) => {
    const membership = membershipMap.get(String(club.id)) || null;
    return {
      ...club,
      book: club.current_book_id ? bookMap.get(String(club.current_book_id)) || null : null,
      membership,
      member_count: counts.get(String(club.id)) || 0,
      is_member: Boolean(membership?.status === "active"),
      is_owner: club.owner_id === profile?.id || membership?.role === "owner",
    };
  });
}

export async function getClubsHub() {
  const profile = await currentProfile();

  const [{ data: memberships, error: membershipsError }, { data: publicClubs, error: publicError }] =
    await Promise.all([
      supabase
        .from("reading_club_members")
        .select("club_id, role, status, current_chapter, current_page, progress, joined_at")
        .eq("user_id", profile.id)
        .eq("status", "active")
        .order("joined_at", { ascending: false }),
      supabase
        .from("reading_clubs")
        .select(CLUB_FIELDS)
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(18),
    ]);

  if (membershipsError) throw membershipsError;
  if (publicError) throw publicError;

  const membershipIds = unique((memberships || []).map((item) => item.club_id));
  let memberClubs = [];

  if (membershipIds.length) {
    const { data, error } = await supabase
      .from("reading_clubs")
      .select(CLUB_FIELDS)
      .in("id", membershipIds);
    if (error) throw error;
    memberClubs = data || [];
  }

  const allClubMap = new Map();
  [...memberClubs, ...(publicClubs || [])].forEach((club) => {
    allClubMap.set(String(club.id), club);
  });
  const allClubs = [...allClubMap.values()];
  const bookIds = unique(allClubs.map((club) => club.current_book_id));
  const clubIds = unique(allClubs.map((club) => club.id));

  const [books, memberCountsResult, nextMeetingsResult] = await Promise.all([
    booksByIds(bookIds),
    clubIds.length
      ? supabase.rpc("reading_club_member_counts", {
          p_club_ids: clubIds.map((id) => Number(id)),
        })
      : Promise.resolve({ data: [], error: null }),
    clubIds.length
      ? supabase.rpc("reading_club_next_meetings", {
          p_club_ids: clubIds.map((id) => Number(id)),
        })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (memberCountsResult.error) throw memberCountsResult.error;
  if (nextMeetingsResult.error) {
    console.warn("No se pudo recalcular la próxima cita de los clubes:", nextMeetingsResult.error);
  }

  const nextMeetingMap = new Map(
    (nextMeetingsResult.data || []).map((row) => [
      String(row.club_id),
      row.next_meeting_at || null,
    ]),
  );
  const clubsWithLiveMeetings = allClubs.map((club) => ({
    ...club,
    next_meeting_at: nextMeetingMap.has(String(club.id))
      ? nextMeetingMap.get(String(club.id))
      : club.next_meeting_at,
  }));

  const decorated = decorateClubs(
    clubsWithLiveMeetings,
    memberships,
    books,
    memberCountsResult.data || [],
    profile,
  );
  const decoratedWithMedia = await Promise.all(decorated.map(withResolvedClubMedia));
  const decoratedMap = new Map(decoratedWithMedia.map((club) => [String(club.id), club]));

  return {
    profile,
    myClubs: membershipIds.map((id) => decoratedMap.get(String(id))).filter(Boolean),
    discoverClubs: (publicClubs || [])
      .map((club) => decoratedMap.get(String(club.id)))
      .filter((club) => club && !club.is_member),
  };
}

export async function searchClubBooks(search = "") {
  const clean = cleanSearch(search);
  let query = supabase
    .from("books")
    .select(BOOK_FIELDS)
    .eq("review_status", "approved")
    .order("title", { ascending: true })
    .limit(12);

  if (clean) {
    query = query.or(`title.ilike.%${clean}%,author.ilike.%${clean}%,isbn.ilike.%${clean}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createReadingClub({
  name,
  description = "",
  visibility = "public",
  bookId,
  chapterCount = 10,
  nextMeetingAt = null,
}) {
  const profile = await currentProfile();
  const cleanName = String(name || "").trim();
  const safeChapters = Math.min(80, Math.max(1, Number.parseInt(chapterCount, 10) || 10));

  if (cleanName.length < 3) {
    throw new Error("El nombre del club debe tener al menos 3 caracteres.");
  }
  if (!bookId) {
    throw new Error("Escoge el libro con el que empezará el club.");
  }

  const { data: club, error } = await supabase
    .from("reading_clubs")
    .insert({
      owner_id: profile.id,
      name: cleanName,
      description: String(description || "").trim(),
      visibility: visibility === "private" ? "private" : "public",
      current_book_id: String(bookId).trim(),
      next_meeting_at: nextMeetingAt || null,
    })
    .select(CLUB_FIELDS)
    .single();

  if (error) {
    throw new Error(error.message || "No se pudo crear el club.");
  }

  const chapters = Array.from({ length: safeChapters }, (_, index) => ({
    title: `Capítulo ${index + 1}`,
    end_page: null,
  }));

  try {
    await replaceClubChapters(club.id, chapters);
  } catch (chaptersError) {
    await supabase.from("reading_clubs").delete().eq("id", club.id);
    throw new Error(chaptersError.message || "No se pudieron preparar los capítulos.", { cause: chaptersError });
  }

  if (nextMeetingAt) {
    await supabase.from("reading_club_meetings").insert({
      club_id: club.id,
      title: "Primera reunión",
      starts_at: nextMeetingAt,
      created_by: profile.id,
    });
  }

  return club;
}

export async function joinReadingClub(clubId, inviteCode = "") {
  const { error } = await supabase.rpc("join_reading_club", {
    p_club_id: Number(clubId),
    p_invite_code: String(inviteCode || "").trim() || null,
  });

  if (error) {
    throw new Error(error.message || "No se pudo entrar en el club.");
  }

  return true;
}

export async function joinReadingClubByCode(inviteCode) {
  const cleanCode = String(inviteCode || "").trim().toUpperCase();
  if (!cleanCode) throw new Error("Introduce el código de invitación.");

  const { data, error } = await supabase.rpc("join_reading_club_by_code", {
    p_invite_code: cleanCode,
  });
  if (error) throw new Error(error.message || "No se pudo usar la invitación.");
  return Number(data);
}

export async function leaveReadingClub(clubId) {
  const { error } = await supabase.rpc("leave_reading_club", {
    p_club_id: Number(clubId),
  });
  if (error) throw new Error(error.message || "No se pudo abandonar el club.");
  return true;
}

export async function updateClubProgress(clubId, currentChapter, currentPage, progress = 0) {
  const { error } = await supabase.rpc("update_reading_club_progress", {
    p_club_id: Number(clubId),
    p_current_chapter: Math.max(1, Number.parseInt(currentChapter, 10) || 1),
    p_current_page: Math.max(0, Number.parseInt(currentPage, 10) || 0),
    p_progress: Math.max(0, Math.min(100, Number.parseInt(progress, 10) || 0)),
  });
  if (error) throw new Error(error.message || "No se pudo guardar tu progreso.");
  return true;
}

export async function finishClubReading({ clubId, nextBookId = null, chapterCount = 10 }) {
  const cleanBookId = String(nextBookId || "").trim() || null;
  const safeChapters = Math.min(160, Math.max(1, Number.parseInt(chapterCount, 10) || 10));
  const chapters = cleanBookId
    ? Array.from({ length: safeChapters }, (_, index) => ({
        title: `Capítulo ${index + 1}`,
        end_page: null,
      }))
    : [];

  const { data, error } = await supabase.rpc("finish_reading_club_book", {
    p_club_id: Number(clubId),
    p_next_book_id: cleanBookId,
    p_next_chapters: chapters,
  });

  if (error) {
    throw new Error(error.message || "No se pudo cerrar la lectura del club.");
  }

  return Number(data);
}

export async function startClubReading({ clubId, bookId, chapterCount = 10 }) {
  const cleanBookId = String(bookId || "").trim();
  const safeChapters = Math.min(160, Math.max(1, Number.parseInt(chapterCount, 10) || 10));

  if (!cleanBookId) throw new Error("Elige el libro con el que empezará la nueva lectura.");

  const chapters = Array.from({ length: safeChapters }, (_, index) => ({
    title: `Capítulo ${index + 1}`,
    end_page: null,
  }));

  const { data, error } = await supabase.rpc("start_reading_club_book", {
    p_club_id: Number(clubId),
    p_book_id: cleanBookId,
    p_chapters: chapters,
  });

  if (error) {
    throw new Error(error.message || "No se pudo empezar la nueva lectura del club.");
  }

  return Number(data);
}

export async function uploadClubAsset(clubId, file, kind = "banner") {
  if (!file) return "";
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type || "")) {
    throw new Error("La imagen debe ser JPG, PNG, WebP o GIF.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("La imagen no puede superar los 5 MB.");
  }

  const user = await currentUser();
  const extension = String(file.name || "image.jpg").split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/clubs/${clubId}/${kind}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("club-media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(error.message || "No se pudo subir la imagen del club.");
  return path;
}

export async function updateClubSettings({
  clubId,
  name,
  description,
  visibility,
  bannerUrl,
  iconUrl,
  rules,
}) {
  const cleanRules = (rules || []).map((rule) => String(rule || "").trim()).filter(Boolean).slice(0, 12);
  const { error } = await supabase.rpc("update_reading_club_settings", {
    p_club_id: Number(clubId),
    p_name: String(name || "").trim(),
    p_description: String(description || "").trim(),
    p_visibility: visibility === "private" ? "private" : "public",
    p_banner_url: String(bannerUrl || "").trim(),
    p_icon_url: String(iconUrl || "").trim(),
    p_rules: cleanRules,
  });
  if (error) throw new Error(error.message || "No se pudieron guardar los ajustes del club.");
  return true;
}

export async function replaceClubChapters(clubId, chapters = []) {
  const cleanRows = (chapters || [])
    .map((item, index) => {
      const row = typeof item === "string" ? { title: item } : item || {};
      const title = String(row.title || `Capítulo ${index + 1}`).trim();
      const rawEndPage = row.endPage ?? row.end_page ?? null;
      const parsedEndPage = rawEndPage === "" || rawEndPage === null
        ? null
        : Math.max(1, Number.parseInt(rawEndPage, 10) || 0);
      return { title, end_page: parsedEndPage };
    })
    .filter((item) => item.title)
    .slice(0, 160);

  if (!cleanRows.length) throw new Error("Añade al menos un capítulo.");

  let previousPage = 0;
  for (const row of cleanRows) {
    if (row.end_page !== null && row.end_page <= previousPage) {
      throw new Error("Las páginas finales deben crecer de un capítulo al siguiente.");
    }
    if (row.end_page !== null) previousPage = row.end_page;
  }

  const { error } = await supabase.rpc("replace_reading_club_chapters", {
    p_club_id: Number(clubId),
    p_chapters: cleanRows,
  });
  if (error) throw new Error(error.message || "No se pudieron guardar los capítulos.");
  return true;
}

export async function updateClubReadingPlan({
  clubId,
  enabled,
  unlockedChapter,
  nextUnlockAt,
  intervalDays,
  chaptersPerPeriod,
}) {
  const { error } = await supabase.rpc("update_reading_club_plan", {
    p_club_id: Number(clubId),
    p_enabled: Boolean(enabled),
    p_unlocked_chapter: Math.max(1, Number.parseInt(unlockedChapter, 10) || 1),
    p_next_unlock_at: nextUnlockAt || null,
    p_interval_days: Math.max(1, Number.parseInt(intervalDays, 10) || 7),
    p_chapters_per_period: Math.max(1, Number.parseInt(chaptersPerPeriod, 10) || 1),
  });
  if (error) throw new Error(error.message || "No se pudo guardar el plan de lectura.");
  return true;
}

export async function createClubMeeting({ clubId, title, startsAt, endsAt = null, location = "", description = "", eventType = "meeting" }) {
  const profile = await currentProfile();
  const { data, error } = await supabase
    .from("reading_club_meetings")
    .insert({
      club_id: Number(clubId),
      title: String(title || "Reunión del club").trim(),
      starts_at: startsAt,
      ends_at: endsAt || null,
      location: String(location || "").trim(),
      description: String(description || "").trim(),
      event_type: ["meeting", "reading", "debate", "deadline", "other"].includes(eventType) ? eventType : "meeting",
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message || "No se pudo crear el evento.");
  return data;
}

export async function updateClubMeeting(meetingId, values) {
  const { error } = await supabase
    .from("reading_club_meetings")
    .update({
      title: String(values.title || "Reunión del club").trim(),
      starts_at: values.startsAt,
      ends_at: values.endsAt || null,
      location: String(values.location || "").trim(),
      description: String(values.description || "").trim(),
      event_type: ["meeting", "reading", "debate", "deadline", "other"].includes(values.eventType) ? values.eventType : "meeting",
    })
    .eq("id", Number(meetingId));
  if (error) throw new Error(error.message || "No se pudo editar el evento.");
  return true;
}

export async function deleteClubMeeting(meetingId) {
  const { error } = await supabase.from("reading_club_meetings").delete().eq("id", Number(meetingId));
  if (error) throw new Error(error.message || "No se pudo eliminar el evento.");
  return true;
}

export async function setClubMemberRole(clubId, userId, role) {
  const { error } = await supabase.rpc("set_reading_club_member_role", {
    p_club_id: Number(clubId),
    p_user_id: userId,
    p_role: role === "moderator" ? "moderator" : "member",
  });
  if (error) throw new Error(error.message || "No se pudo cambiar el rol.");
  return true;
}

export async function removeClubMember(clubId, userId) {
  const { error } = await supabase.rpc("remove_reading_club_member", {
    p_club_id: Number(clubId),
    p_user_id: userId,
  });
  if (error) throw new Error(error.message || "No se pudo retirar a la persona del club.");
  return true;
}

export async function deleteReadingClub(clubId) {
  const { error } = await supabase.rpc("delete_reading_club", { p_club_id: Number(clubId) });
  if (error) throw new Error(error.message || "No se pudo eliminar el club.");
  return true;
}

export async function uploadClubPostImage(clubId, file) {
  if (!file) return "";
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type || "")) {
    throw new Error("La imagen debe ser JPG, PNG, WebP o GIF.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("La imagen no puede superar los 5 MB.");
  }

  const user = await currentUser();
  const extension = String(file.name || "image.jpg").split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/clubs/${Number(clubId)}/posts/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("club-media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(error.message || "No se pudo subir la imagen.");
  return path;
}

export function clubMediaUrl(path) {
  const clean = String(path || "").trim();
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;
  return supabase.storage.from("club-media").getPublicUrl(clean).data.publicUrl || "";
}

export async function createClubPost({
  clubId,
  channel = "general",
  chapterNumber = null,
  parentPostId = null,
  content = "",
  quoteText = "",
  imageFile = null,
  containsSpoilers = false,
}) {
  const profile = await currentProfile();
  const isChapter = channel === "chapter";
  const cleanParentPostId = parentPostId ? Number.parseInt(parentPostId, 10) : null;
  const cleanContent = String(content || "").trim();
  const cleanQuote = String(quoteText || "").trim();

  if (!cleanContent && !cleanQuote && !imageFile) {
    throw new Error("Escribe algo, añade una cita o escoge una imagen.");
  }

  if (parentPostId && !Number.isInteger(cleanParentPostId)) {
    throw new Error("No se ha podido identificar el mensaje al que respondes.");
  }

  if (cleanParentPostId) {
    const { data: parentPost, error: parentError } = await supabase
      .from("reading_club_posts")
      .select("id, club_id, channel, chapter_number")
      .eq("id", cleanParentPostId)
      .maybeSingle();

    if (parentError) throw parentError;
    const sameConversation = parentPost
      && String(parentPost.club_id) === String(clubId)
      && parentPost.channel === (isChapter ? "chapter" : "general")
      && (!isChapter || Number(parentPost.chapter_number) === Math.max(1, Number.parseInt(chapterNumber, 10) || 1));
    if (!sameConversation) {
      throw new Error("Ese mensaje ya no pertenece a esta conversación.");
    }
  }

  const imagePath = imageFile ? await uploadClubPostImage(clubId, imageFile) : "";
  const { data, error } = await supabase
    .from("reading_club_posts")
    .insert({
      club_id: Number(clubId),
      user_id: profile.id,
      channel: isChapter ? "chapter" : "general",
      chapter_number: isChapter ? Math.max(1, Number.parseInt(chapterNumber, 10) || 1) : null,
      parent_post_id: cleanParentPostId,
      content: cleanContent,
      quote_text: cleanQuote,
      image_path: imagePath,
      contains_spoilers: Boolean(containsSpoilers),
    })
    .select("id")
    .single();

  if (error) {
    if (imagePath) await supabase.storage.from("club-media").remove([imagePath]);
    throw new Error(error.message || "No se pudo publicar el mensaje.");
  }

  return data;
}

export async function toggleClubPostReaction(postId, reaction = "heart") {
  const profile = await currentProfile();
  const safeReaction = reaction === "leaf" ? "leaf" : "heart";
  const { data: existing, error: findError } = await supabase
    .from("reading_club_post_reactions")
    .select("post_id")
    .eq("post_id", Number(postId))
    .eq("user_id", profile.id)
    .eq("reaction", safeReaction)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase
      .from("reading_club_post_reactions")
      .delete()
      .eq("post_id", Number(postId))
      .eq("user_id", profile.id)
      .eq("reaction", safeReaction);
    if (error) throw error;
    return false;
  }

  const { error } = await supabase.from("reading_club_post_reactions").insert({
    post_id: Number(postId),
    user_id: profile.id,
    reaction: safeReaction,
  });
  if (error) throw error;
  return true;
}

export async function moderateClubPost(postId, action) {
  const safeAction = ["delete", "spoiler", "safe"].includes(action) ? action : "spoiler";
  const { error } = await supabase.rpc("moderate_reading_club_post", {
    p_post_id: Number(postId),
    p_action: safeAction,
  });
  if (error) throw new Error(error.message || "No se pudo moderar el mensaje.");
  return true;
}

export async function awardClubBookmark(clubId, userId, label, description = "") {
  const { data, error } = await supabase.rpc("award_reading_club_bookmark", {
    p_club_id: Number(clubId),
    p_user_id: userId,
    p_label: String(label || "").trim(),
    p_description: String(description || "").trim(),
  });
  if (error) throw new Error(error.message || "No se pudo conceder el marcapáginas.");
  return Number(data);
}

export async function revokeClubBookmark(achievementId) {
  const { error } = await supabase.rpc("revoke_reading_club_bookmark", {
    p_achievement_id: Number(achievementId),
  });
  if (error) throw new Error(error.message || "No se pudo retirar el marcapáginas.");
  return true;
}

export async function getClubDetail(clubId) {
  const profile = await currentProfile();
  const id = Number(clubId);

  const [{ data: club, error: clubError }, { data: membership, error: membershipError }] =
    await Promise.all([
      supabase.from("reading_clubs").select(CLUB_FIELDS).eq("id", id).single(),
      supabase
        .from("reading_club_members")
        .select("club_id, user_id, role, status, current_chapter, current_page, progress, joined_at, last_general_chat_read_at")
        .eq("club_id", id)
        .eq("user_id", profile.id)
        .maybeSingle(),
    ]);

  if (clubError) throw new Error(clubError.message || "No se pudo abrir el club.");
  if (membershipError) throw membershipError;

  const clubWithMedia = await withResolvedClubMedia(club);

  if (!membership || membership.status !== "active") {
    return {
      club: { ...clubWithMedia, book: (await booksByIds([club.current_book_id]))[0] || null },
      membership: null,
      profile,
      members: [],
      chapters: [],
      posts: [],
      meetings: [],
    };
  }

  const [bookRows, membersResult, chaptersResult, postsResult, meetingsResult, achievementsResult, unlockedResult, shelfResult, unreadResult] = await Promise.all([
    booksByIds([club.current_book_id]),
    supabase
      .from("reading_club_members")
      .select("club_id, user_id, role, status, current_chapter, current_page, progress, joined_at, last_general_chat_read_at")
      .eq("club_id", id)
      .eq("status", "active")
      .order("joined_at", { ascending: true }),
    supabase
      .from("reading_club_chapters")
      .select("id, club_id, chapter_number, title, end_page")
      .eq("club_id", id)
      .order("chapter_number", { ascending: true }),
    supabase
      .from("reading_club_posts")
      .select("id, club_id, reading_id, user_id, channel, chapter_number, content, quote_text, image_path, contains_spoilers, parent_post_id, created_at")
      .eq("club_id", id)
      .order("created_at", { ascending: false })
      .limit(240),
    supabase
      .from("reading_club_meetings")
      .select("id, club_id, title, starts_at, ends_at, location, description, event_type, created_at, updated_at")
      .eq("club_id", id)
      .order("starts_at", { ascending: true })
      .limit(120),
    supabase
      .from("reading_club_member_achievements")
      .select("id, club_id, user_id, badge_key, label, description, image_url, awarded_at")
      .eq("club_id", id)
      .order("awarded_at", { ascending: false }),
    supabase.rpc("reading_club_unlocked_chapter", { p_club_id: id }),
    supabase.rpc("reading_club_bookshelf", { p_club_id: id }),
    supabase.rpc("reading_club_general_unread_count", { p_club_id: id }),
  ]);

  for (const result of [membersResult, chaptersResult, postsResult, meetingsResult, achievementsResult, shelfResult]) {
    if (result.error) throw result.error;
  }
  if (unreadResult.error) throw unreadResult.error;

  const shelfRows = shelfResult.data || [];
  const currentReading = shelfRows.find((row) => row.reading_status === "current") || null;
  const members = membersResult.data || [];
  const posts = [...(postsResult.data || [])]
    .filter((post) => currentReading
      ? String(post.reading_id) === String(currentReading.reading_id)
      : post.reading_id === null)
    .slice(0, 150)
    .reverse();
  const shelfReviewerIds = shelfRows.flatMap((row) =>
    Array.isArray(row.reviews) ? row.reviews.map((review) => review.profile_id) : [],
  );
  const profileIds = unique([
    ...members.map((member) => member.user_id),
    ...posts.map((post) => post.user_id),
    ...shelfReviewerIds,
  ]);
  const postIds = posts.map((post) => post.id);

  const [profiles, reactionsResult, latestUpdates] = await Promise.all([
    profilesByIds(profileIds),
    postIds.length
      ? supabase
          .from("reading_club_post_reactions")
          .select("post_id, user_id, reaction")
          .in("post_id", postIds)
      : Promise.resolve({ data: [], error: null }),
    latestBookUpdates(club.current_book_id, members.map((member) => member.user_id)),
  ]);

  if (reactionsResult.error) throw reactionsResult.error;
  const profileMap = mapById(profiles);
  const reactionsByPost = new Map();

  (reactionsResult.data || []).forEach((reaction) => {
    const key = String(reaction.post_id);
    const current = reactionsByPost.get(key) || [];
    current.push(reaction);
    reactionsByPost.set(key, current);
  });

  const library = shelfRows.map((row) => ({
    id: Number(row.reading_id),
    status: row.reading_status,
    started_at: row.started_at || null,
    finished_at: row.finished_at || null,
    participant_count: Math.max(0, Number(row.participant_count) || 0),
    rating_count: Math.max(0, Number(row.rating_count) || 0),
    review_count: Math.max(0, Number(row.review_count) || 0),
    avg_rating: row.avg_rating === null ? null : Number(row.avg_rating),
    book: {
      id: row.book_id,
      title: row.book_title || "Libro del club",
      author: row.book_author || "",
      cover: row.book_cover || "",
      pages: Number(row.book_pages) || null,
    },
    reviews: (Array.isArray(row.reviews) ? row.reviews : []).map((review) => ({
      ...review,
      score: review.score === null ? null : Number(review.score),
      profile: profileMap.get(String(review.profile_id)) || null,
    })),
  }));

  return {
    profile,
    club: {
      ...clubWithMedia,
      book: bookRows[0] || null,
      unlocked_chapter: unlockedResult.error
        ? Math.max(1, Number(club.reading_plan_unlocked_chapter) || 1)
        : Math.max(1, Number(unlockedResult.data) || 1),
    },
    membership,
    members: members.map((member) => ({
      ...member,
      profile: profileMap.get(String(member.user_id)) || null,
      latest_book_update: latestUpdates.get(String(member.user_id)) || null,
    })),
    chapters: chaptersResult.data || [],
    posts: posts.map((post) => {
      const reactions = reactionsByPost.get(String(post.id)) || [];
      return {
        ...post,
        profile: profileMap.get(String(post.user_id)) || null,
        image_url: clubMediaUrl(post.image_path),
        reactions,
        heart_count: reactions.filter((item) => item.reaction === "heart").length,
        leaf_count: reactions.filter((item) => item.reaction === "leaf").length,
        liked_by_me: reactions.some(
          (item) => item.reaction === "heart" && item.user_id === profile.id,
        ),
        leafed_by_me: reactions.some(
          (item) => item.reaction === "leaf" && item.user_id === profile.id,
        ),
      };
    }),
    meetings: meetingsResult.data || [],
    achievements: achievementsResult.data || [],
    library,
    generalUnreadCount: Math.max(0, Number(unreadResult.data) || 0),
  };
}

export async function markClubGeneralChatRead(clubId) {
  const { error } = await supabase.rpc("mark_reading_club_general_chat_read", {
    p_club_id: Number(clubId),
  });
  if (error) throw new Error(error.message || "No se pudo marcar el chat como leído.");
  return true;
}
