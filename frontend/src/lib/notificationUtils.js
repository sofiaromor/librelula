function cleanText(value) {
  return String(value || "").trim();
}

function normalizeAvatar(value) {
  const path = cleanText(value);
  if (!path || path === "default.jpg") return "/images/avatar/avatar1.png";
  if (/^(https?:|data:|blob:|\/)/i.test(path)) return path;
  return `/${path.replace(/^\.\//, "")}`;
}

export function isMissingNotificationsError(error) {
  const code = String(error?.code || "");
  const message = cleanText(error?.message).toLowerCase();

  return ["42p01", "pgrst205", "pgrst204"].includes(code)
    || (message.includes("notification") && (
      message.includes("does not exist")
      || message.includes("not found")
      || message.includes("could not find")
      || message.includes("schema cache")
      || message.includes("relation")
    ));
}

export function normalizeNotification(row) {
  if (!row?.id) return null;

  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
    ? row.payload
    : {};

  return {
    id: String(row.id),
    recipient_id: row.recipient_id ? String(row.recipient_id) : "",
    actor_id: row.actor_id ? String(row.actor_id) : "",
    type: ["reply", "like", "follow"].includes(row.type) ? row.type : "like",
    actor_name: cleanText(row.actor_name) || "Alguien",
    actor_avatar: normalizeAvatar(row.actor_avatar),
    activity_key: cleanText(row.activity_key),
    comment_preview: cleanText(row.comment_preview),
    payload,
    read_at: row.read_at || null,
    created_at: row.created_at || null,
  };
}
