const DEFAULT_HISTORY_DAYS = 182;

function padDayPart(value) {
  return String(value).padStart(2, "0");
}

function parseLocalDate(value) {
  if (value instanceof Date) return new Date(value.getTime());

  const text = String(value || "").trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }

  return new Date(text);
}

export function localDayKey(value) {
  const date = parseLocalDate(value);
  if (!Number.isFinite(date.getTime())) return "";

  return [
    date.getFullYear(),
    padDayPart(date.getMonth() + 1),
    padDayPart(date.getDate()),
  ].join("-");
}

export function buildReadingStreak({
  libraryDates = [],
  progressLogs = [],
  now = new Date(),
  historyDays = DEFAULT_HISTORY_DAYS,
} = {}) {
  const current = parseLocalDate(now);
  const today = Number.isFinite(current.getTime()) ? current : new Date();
  today.setHours(0, 0, 0, 0);

  const safeHistoryDays = Math.max(1, Math.round(Number(historyDays) || DEFAULT_HISTORY_DAYS));
  const firstDay = new Date(today);
  firstDay.setDate(firstDay.getDate() - (safeHistoryDays - 1));

  const pointsByDate = new Map();
  const activityDates = [
    ...(libraryDates || []),
    ...(progressLogs || []).map((row) => row?.created_at),
  ];

  for (const value of activityDates) {
    const key = localDayKey(value);
    if (!key) continue;
    pointsByDate.set(key, (pointsByDate.get(key) || 0) + 1);
  }

  const activityDays = Array.from({ length: safeHistoryDays }, (_, index) => {
    const date = new Date(firstDay);
    date.setDate(date.getDate() + index);
    const key = localDayKey(date);
    const points = pointsByDate.get(key) || 0;

    return {
      date: key,
      label: date.toLocaleDateString("es-ES"),
      points,
      level: points <= 0 ? 0 : points === 1 ? 1 : points <= 3 ? 2 : 3,
    };
  });

  // La racha sigue vigente durante el día actual: si hoy aún no hay actividad,
  // se cuenta desde ayer y no se rompe hasta que termine hoy.
  const streakCursor = new Date(today);
  if ((pointsByDate.get(localDayKey(streakCursor)) || 0) <= 0) {
    streakCursor.setDate(streakCursor.getDate() - 1);
  }

  let streak = 0;
  while ((pointsByDate.get(localDayKey(streakCursor)) || 0) > 0) {
    streak += 1;
    streakCursor.setDate(streakCursor.getDate() - 1);
  }

  return { activityDays, streak };
}
