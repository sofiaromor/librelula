import { supabase } from "./supabase.js";
import {
  isMissingNotificationsError,
  normalizeNotification,
} from "./notificationUtils.js";

export { isMissingNotificationsError, normalizeNotification } from "./notificationUtils.js";

const NOTIFICATION_SELECT = "id, recipient_id, actor_id, type, actor_name, actor_avatar, activity_key, comment_preview, payload, read_at, created_at";
const NOTIFICATION_LIMIT = 40;

function cleanText(value) {
  return String(value || "").trim();
}

function apiError(message) {
  const error = new Error(message);
  error.status = 500;
  return error;
}

async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw apiError(error.message || "No se pudo comprobar tu sesión.");
  return user || null;
}

export async function getNotifications(limit = NOTIFICATION_LIMIT) {
  const user = await getCurrentUser();
  if (!user) {
    return { available: false, notifications: [], unreadCount: 0 };
  }

  const safeLimit = Math.max(1, Math.min(NOTIFICATION_LIMIT, Number(limit) || NOTIFICATION_LIMIT));
  const [notificationsResult, unreadResult] = await Promise.all([
    supabase
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(safeLimit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null),
  ]);

  if (isMissingNotificationsError(notificationsResult.error) || isMissingNotificationsError(unreadResult.error)) {
    return { available: false, notifications: [], unreadCount: 0 };
  }

  if (notificationsResult.error) {
    throw apiError(notificationsResult.error.message || "No se pudieron cargar las notificaciones.");
  }

  if (unreadResult.error) {
    throw apiError(unreadResult.error.message || "No se pudo contar lo que tienes pendiente.");
  }

  return {
    available: true,
    notifications: (notificationsResult.data || []).map(normalizeNotification).filter(Boolean),
    unreadCount: Number(unreadResult.count || 0),
  };
}

export async function markNotificationsRead(ids = []) {
  const user = await getCurrentUser();
  if (!user) return { available: false, count: 0 };

  const cleanIds = [...new Set((ids || []).map((id) => cleanText(id)).filter(Boolean))].slice(0, NOTIFICATION_LIMIT);
  let request = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (cleanIds.length) request = request.in("id", cleanIds);

  const { error } = await request;
  if (isMissingNotificationsError(error)) return { available: false, count: 0 };
  if (error) throw apiError(error.message || "No se pudieron marcar las notificaciones.");

  return { available: true, count: cleanIds.length };
}

export function subscribeToNotifications(userId, onInsert) {
  const cleanUserId = cleanText(userId);
  if (!cleanUserId || typeof onInsert !== "function") return () => {};

  const channel = supabase
    .channel(`notifications:${cleanUserId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${cleanUserId}`,
      },
      (payload) => onInsert(normalizeNotification(payload?.new)),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
