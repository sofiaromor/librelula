export function normalizeAuthEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function normalizeVerificationCode(token) {
  return String(token || "").replace(/\s+/g, "");
}

export function isValidVerificationCode(token) {
  return /^\d{6}$/.test(normalizeVerificationCode(token));
}
