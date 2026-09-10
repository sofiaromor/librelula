import test from "node:test";
import assert from "node:assert/strict";

import {
  isMissingNotificationsError,
  normalizeNotification,
} from "../src/lib/notificationUtils.js";

test("notification rows are normalized without exposing invalid avatar paths", () => {
  assert.deepEqual(
    normalizeNotification({
      id: 42,
      recipient_id: "owner",
      actor_id: "actor",
      type: "reply",
      actor_name: "  Otra lectora ",
      actor_avatar: "images/avatar/avatar2.png",
      activity_key: "post:abc",
      comment_preview: "  Qué bonito  ",
      payload: { comment_id: "comment-1" },
      read_at: null,
      created_at: "2026-09-10T10:00:00.000Z",
    }),
    {
      id: "42",
      recipient_id: "owner",
      actor_id: "actor",
      type: "reply",
      actor_name: "Otra lectora",
      actor_avatar: "/images/avatar/avatar2.png",
      activity_key: "post:abc",
      comment_preview: "Qué bonito",
      payload: { comment_id: "comment-1" },
      read_at: null,
      created_at: "2026-09-10T10:00:00.000Z",
    },
  );
});

test("notification API distinguishes a migration that is not applied yet", () => {
  assert.equal(isMissingNotificationsError({ code: "PGRST205", message: "Could not find the table notifications" }), true);
  assert.equal(isMissingNotificationsError({ code: "42501", message: "permission denied for table notifications" }), false);
  assert.equal(isMissingNotificationsError({ code: "PGRST116", message: "The result contains 0 rows" }), false);
});
