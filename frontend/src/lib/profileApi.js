import * as fullProfile from "./profileApiImpl.js";
import { getHomeReadingProfileOverview, invalidateHomeDataCaches } from "./homeDashboardFastApi.js";

const HOME_READING_SNAPSHOT_KEY = "librelula:home-reading:v1";
const HOME_READING_SNAPSHOT_MAX_AGE = 2 * 60_000;
let homeReadingSnapshot = null;

function readStoredSnapshot() {
  if (homeReadingSnapshot && Date.now() - homeReadingSnapshot.savedAt < HOME_READING_SNAPSHOT_MAX_AGE) {
    return homeReadingSnapshot.data;
  }

  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(HOME_READING_SNAPSHOT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.savedAt) return null;
    if (Date.now() - Number(parsed.savedAt) >= HOME_READING_SNAPSHOT_MAX_AGE) {
      window.sessionStorage.removeItem(HOME_READING_SNAPSHOT_KEY);
      return null;
    }

    homeReadingSnapshot = parsed;
    return parsed.data;
  } catch {
    return null;
  }
}

function storeSnapshot(data) {
  const snapshot = { savedAt: Date.now(), data };
  homeReadingSnapshot = snapshot;

  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(HOME_READING_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // La caché es una mejora de rendimiento; si el navegador la bloquea, seguimos sin ella.
  }
}

export function invalidateHomeReadingSnapshot() {
  invalidateHomeDataCaches();
  homeReadingSnapshot = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(HOME_READING_SNAPSHOT_KEY);
  } catch {
    // Sin efecto funcional.
  }
}

async function fetchHomeReadingOverview() {
  const data = await getHomeReadingProfileOverview();
  storeSnapshot(data);
  return data;
}

export async function getProfileOverview(profileId) {
  if (profileId === undefined) {
    const cached = readStoredSnapshot();
    if (cached) return cached;
    return fetchHomeReadingOverview();
  }
  return fullProfile.getProfileOverview(profileId);
}

export async function prewarmHomeReadingProfile() {
  const cached = readStoredSnapshot();
  if (cached) return cached;
  return fetchHomeReadingOverview();
}

export const invalidateProfileOverview = fullProfile.invalidateProfileOverview;
export const uploadProfileCover = fullProfile.uploadProfileCover;
export const uploadProfileAvatar = fullProfile.uploadProfileAvatar;
export const updateProfileAvatar = fullProfile.updateProfileAvatar;
export const updateProfileBio = fullProfile.updateProfileBio;
export const updateProfileVisualSettings = fullProfile.updateProfileVisualSettings;
export const normalizeProfileVisualSettings = fullProfile.normalizeProfileVisualSettings;
export const updateFeaturedCollection = fullProfile.updateFeaturedCollection;
export const updateFeaturedBooks = fullProfile.updateFeaturedBooks;
export const updateFavoriteBooks = fullProfile.updateFavoriteBooks;
export const updateFavoriteAuthors = fullProfile.updateFavoriteAuthors;
