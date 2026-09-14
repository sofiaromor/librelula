import test from "node:test";
import assert from "node:assert/strict";
import { createAuthEmailRequests } from "../src/lib/authEmailRequests.js";

test("double clicks do not issue a second email while the first is pending", async () => {
  const requests = createAuthEmailRequests({ getStorage: () => null });
  let finish;
  let calls = 0;
  const pending = requests.send(" Reader@Example.com ", () => {
    calls += 1;
    return new Promise((resolve) => { finish = resolve; });
  });
  await assert.rejects(requests.send("reader@example.com", () => { calls += 1; }), { code: "email_request_pending" });
  assert.equal(calls, 1);
  finish({ error: null });
  await pending;
});

test("confirmation, OTP and recovery share the per-user SMTP interval", async () => {
  let time = 0;
  const requests = createAuthEmailRequests({ now: () => time, getStorage: () => null });
  await requests.send("reader@example.com", async () => ({ error: null }));
  assert.equal(requests.getRetrySeconds("Reader@example.com"), 60);
  time = 59_001;
  await assert.rejects(requests.send("reader@example.com", async () => ({ error: null })), { retryAfter: 1 });
  // Another address and an expired interval remain usable.
  await requests.send("other@example.com", async () => ({ error: null }));
  time = 60_000;
  await requests.send("reader@example.com", async () => ({ error: null }));
});

test("failed SMTP calls release the request and do not claim a successful send", async () => {
  const requests = createAuthEmailRequests({ getStorage: () => null });
  const smtpError = { code: "unexpected_failure", status: 500 };
  await assert.rejects(requests.send("reader@example.com", async () => ({ error: smtpError })), (error) => error === smtpError);
  assert.equal(requests.getRetrySeconds("reader@example.com"), 0);
  await requests.send("reader@example.com", async () => ({ error: null }));
});

test("reloading preserves only the remaining interval", async () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  let time = 0;
  const options = { now: () => time, getStorage: () => storage };
  await createAuthEmailRequests(options).send("reader@example.com", async () => ({ error: null }));
  time = 20_000;
  const reloaded = createAuthEmailRequests(options);
  assert.equal(reloaded.getRetrySeconds("reader@example.com"), 40);
  time = 60_000;
  assert.equal(reloaded.getRetrySeconds("reader@example.com"), 0);
});

test("blocked session storage does not prevent requests or the in-memory cooldown", async () => {
  const requests = createAuthEmailRequests({ getStorage: () => { throw new Error("Storage blocked"); } });
  await requests.send("reader@example.com", async () => ({ error: null }));
  assert.equal(requests.getRetrySeconds("reader@example.com"), 60);
});

test("a server per-user limit restores the precise remaining interval", async () => {
  const requests = createAuthEmailRequests({ getStorage: () => null });
  const error = { status: 429, message: "For security purposes, you can only request this after 37 seconds." };
  await assert.rejects(requests.send("reader@example.com", async () => ({ error })), (value) => value === error);
  assert.equal(requests.getRetrySeconds("reader@example.com"), 37);
});

test("responses that did not send email can skip the cooldown", async () => {
  const requests = createAuthEmailRequests({ getStorage: () => null });
  await requests.send("reader@example.com", async () => ({ data: { session: {} }, error: null }), { shouldStartCooldown: () => false });
  assert.equal(requests.getRetrySeconds("reader@example.com"), 0);
});
