import test from "node:test";
import assert from "node:assert/strict";
import { buildReadingStreak, localDayKey } from "../src/lib/readingStreak.js";

function localDate(year, month, day, hour = 12) {
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

test("a saved progress update marks that local reading day", () => {
  const result = buildReadingStreak({
    now: localDate(2026, 9, 28),
    historyDays: 7,
    progressLogs: [{ created_at: localDate(2026, 9, 27, 22).toISOString() }],
  });

  const yesterday = result.activityDays.find((day) => day.date === "2026-09-27");
  assert.equal(yesterday?.points, 1);
  assert.equal(result.streak, 1);
});

test("the current streak remains active until the end of today", () => {
  const result = buildReadingStreak({
    now: localDate(2026, 9, 28),
    historyDays: 7,
    progressLogs: [
      { created_at: localDate(2026, 9, 26).toISOString() },
      { created_at: localDate(2026, 9, 27).toISOString() },
    ],
  });

  assert.equal(result.streak, 2);
  assert.equal(result.activityDays.at(-1)?.points, 0);
});

test("today extends the streak and a real missed day breaks it", () => {
  const active = buildReadingStreak({
    now: localDate(2026, 9, 28),
    historyDays: 7,
    libraryDates: ["2026-09-27"],
    progressLogs: [{ created_at: localDate(2026, 9, 28).toISOString() }],
  });
  const broken = buildReadingStreak({
    now: localDate(2026, 9, 28),
    historyDays: 7,
    progressLogs: [{ created_at: localDate(2026, 9, 26).toISOString() }],
  });

  assert.equal(active.streak, 2);
  assert.equal(broken.streak, 0);
});

test("calendar dates and timestamps use the reader's local day", () => {
  const lateNight = localDate(2026, 9, 28, 0);

  assert.equal(localDayKey("2026-09-28"), "2026-09-28");
  assert.equal(localDayKey(lateNight.toISOString()), "2026-09-28");
});
