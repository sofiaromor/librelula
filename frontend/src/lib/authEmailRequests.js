import { normalizeAuthEmail } from "./authUtils.js";

// Supabase's production SMTP configuration requires 60 seconds between emails
// to the same user. This is a UX guard; Supabase still enforces its own limits.
const EMAIL_INTERVAL_MS = 60_000;
const STORAGE_PREFIX = "librelula:auth-email-retry:";

export function createAuthEmailRequests({
  now = Date.now,
  getStorage = () => (typeof window === "undefined" ? null : window.sessionStorage),
} = {}) {
  const retryAt = new Map();
  const inFlight = new Set();

  function getRetrySeconds(email) {
    const address = normalizeAuthEmail(email);
    if (!address) return 0;
    let deadline = retryAt.get(address) || 0;
    try {
      deadline = Math.max(deadline, Number(getStorage()?.getItem(STORAGE_PREFIX + address)) || 0);
    } catch {
      // Private browsing or unavailable storage must not block authentication.
    }
    const seconds = Math.max(0, Math.ceil((deadline - now()) / 1000));
    return seconds;
  }

  function startCooldown(address, seconds = EMAIL_INTERVAL_MS / 1000) {
    const deadline = now() + seconds * 1000;
    retryAt.set(address, deadline);
    try {
      getStorage()?.setItem(STORAGE_PREFIX + address, String(deadline));
    } catch {
      // Continue with the in-memory guard.
    }
  }

  async function send(email, request, { shouldStartCooldown = () => true } = {}) {
    const address = normalizeAuthEmail(email);
    const seconds = getRetrySeconds(address);
    if (seconds || inFlight.has(address)) {
      const error = new Error("Espera antes de solicitar otro correo.");
      error.code = "email_request_pending";
      error.retryAfter = seconds;
      throw error;
    }

    inFlight.add(address);
    try {
      const result = await request();
      if (result?.error) throw result.error;
      if (shouldStartCooldown(result)) startCooldown(address);
      return result;
    } catch (error) {
      // Supabase can return the remaining per-user interval after a reload or
      // a request on another device. Do not treat SMTP failures as successful sends.
      const interval = String(error?.message || "").match(/after (\d+) seconds?/i);
      if (interval && Number(error?.status) === 429) {
        startCooldown(address, Number(interval[1]));
      }
      throw error;
    } finally {
      inFlight.delete(address);
    }
  }

  return { send, getRetrySeconds };
}

const emailRequests = createAuthEmailRequests();
export const sendAuthEmailRequest = emailRequests.send;
export const getAuthEmailRetrySeconds = emailRequests.getRetrySeconds;
