import { supabase } from "./supabase.js";
import {
  isValidVerificationCode,
  normalizeAuthEmail,
  normalizeVerificationCode,
} from "./authUtils.js";

export const EMPTY_SUPABASE_SESSION = {
  authenticated: false,
  is_admin: false,
  user: null,
};

const SESSION_PROFILE_CACHE_TTL = 30_000;
const PERSISTED_SESSION_CACHE_TTL = 5 * 60_000;
const SESSION_PROFILE_STORAGE_KEY = "librelula:app-session:v1";
const DEFAULT_AUTH_SITE_URL = "https://librelula.vercel.app";
const HOME_STORAGE_KEYS = [
  "librelula:home-dashboard:v1",
  "librelula:home-reading:v1",
];

let sessionProfileCache = null;

function clearHomeSnapshots() {
  if (typeof window === "undefined") return;
  try {
    HOME_STORAGE_KEYS.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // La limpieza de caché no debe bloquear el cierre o apertura de sesión.
  }
}

function clearPersistedSessionProfile() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_PROFILE_STORAGE_KEY);
  } catch {
    // Sin efecto funcional.
  }
}

function clearSessionProfileCache({ persisted = true, home = false } = {}) {
  sessionProfileCache = null;
  if (persisted) clearPersistedSessionProfile();
  if (home) clearHomeSnapshots();
}

function cachedSessionFor(userId) {
  if (!sessionProfileCache || sessionProfileCache.userId !== userId) return null;
  if (Date.now() - sessionProfileCache.savedAt > SESSION_PROFILE_CACHE_TTL) {
    sessionProfileCache = null;
    return null;
  }
  return sessionProfileCache.value;
}

function persistedSessionFor(userId) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(SESSION_PROFILE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (String(parsed?.userId || "") !== String(userId || "")) return null;
    if (!parsed?.savedAt || !parsed?.value?.authenticated) return null;

    if (Date.now() - Number(parsed.savedAt) > PERSISTED_SESSION_CACHE_TTL) {
      clearPersistedSessionProfile();
      return null;
    }

    sessionProfileCache = {
      userId: parsed.userId,
      savedAt: Date.now(),
      value: parsed.value,
    };
    return parsed.value;
  } catch {
    return null;
  }
}

function storeSessionProfile(userId, value) {
  sessionProfileCache = {
    userId,
    savedAt: Date.now(),
    value,
  };

  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      SESSION_PROFILE_STORAGE_KEY,
      JSON.stringify({ userId, savedAt: Date.now(), value }),
    );
  } catch {
    // Seguimos con la caché en memoria si sessionStorage no está disponible.
  }
}

export async function getSupabaseAppSession() {
  // getSession obtiene localmente la sesión persistida por Supabase. A partir de ahí
  // podemos reutilizar durante unos minutos el perfil ya validado y evitar una ida
  // y vuelta de red antes de pintar Inicio.
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  const user = session?.user || null;
  if (sessionError || !user) {
    clearSessionProfileCache({ persisted: true, home: true });
    return EMPTY_SUPABASE_SESSION;
  }

  const cached = cachedSessionFor(user.id);
  if (cached) return cached;

  const persisted = persistedSessionFor(user.id);
  if (persisted) return persisted;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, legacy_id, username, avatar, bio, is_admin")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw profileError;
  }

  const value = {
    authenticated: true,
    is_admin: Boolean(profile?.is_admin),
    user: {
      id: user.id,
      email: user.email,
      legacy_id: profile?.legacy_id || null,
      username: profile?.username || user.email || "Mi perfil",
      avatar: profile?.avatar || "",
      bio: profile?.bio || "",
    },
  };

  storeSessionProfile(user.id, value);
  return value;
}

export function onSupabaseAuthChange(callback) {
  let active = true;

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event) => {
    if (["SIGNED_OUT", "USER_UPDATED", "PASSWORD_RECOVERY"].includes(event)) {
      clearSessionProfileCache({ persisted: true, home: event === "SIGNED_OUT" });
    }

    window.setTimeout(async () => {
      try {
        const session = await getSupabaseAppSession();

        if (active) {
          callback(session);
        }
      } catch {
        if (active) {
          callback(EMPTY_SUPABASE_SESSION);
        }
      }
    }, 0);
  });

  return () => {
    active = false;
    subscription.unsubscribe();
  };
}

export function getAuthRedirectUrl() {
  if (typeof window !== "undefined") {
    const currentOrigin = String(window.location.origin || "").replace(/\/+$/, "");
    if (/^https?:\/\//i.test(currentOrigin)) {
      return currentOrigin;
    }
  }

  const configuredSiteUrl = String(import.meta.env.VITE_SITE_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }

  return DEFAULT_AUTH_SITE_URL;
}

export async function signInSupabase({ email, password }) {
  clearSessionProfileCache({ persisted: true, home: true });
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return getSupabaseAppSession();
}

export async function signUpSupabase({ email, password, username }) {
  const cleanEmail = normalizeAuthEmail(email);
  const cleanUsername = String(username || "").trim();

  if (!cleanEmail) {
    throw new Error("Escribe tu correo electrónico.");
  }

  if (!cleanUsername) {
    throw new Error("Elige un nombre de usuario.");
  }

  if (!password || password.length < 6) {
    throw new Error("La contraseña debe tener al menos 6 caracteres.");
  }

  clearSessionProfileCache({ persisted: true, home: true });
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        username: cleanUsername,
      },
      emailRedirectTo: getAuthRedirectUrl(),
    },
  });

  if (error) {
    throw error;
  }

  if (data?.session) {
    return getSupabaseAppSession();
  }

  return {
    authenticated: false,
    needsEmailConfirmation: true,
    email: cleanEmail,
  };
}

export async function resendSignupConfirmation(email) {
  const cleanEmail = normalizeAuthEmail(email);

  if (!cleanEmail) {
    throw new Error("Escribe el correo electrónico de tu cuenta.");
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: cleanEmail,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
    },
  });

  if (error) {
    throw error;
  }
}

export async function verifySignupCode(email, token) {
  const session = await verifyEmailOtp(email, token);
  return session ? getSupabaseAppSession() : session;
}

export async function requestSignInCode(email) {
  const cleanEmail = normalizeAuthEmail(email);

  if (!cleanEmail) {
    throw new Error("Escribe el correo electrónico de tu cuenta.");
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: getAuthRedirectUrl(),
    },
  });

  if (error) {
    throw error;
  }
}

export async function verifySignInCode(email, token) {
  clearSessionProfileCache({ persisted: true, home: true });
  return verifyEmailOtp(email, token);
}

export async function requestPasswordRecovery(email) {
  const cleanEmail = normalizeAuthEmail(email);

  if (!cleanEmail) {
    throw new Error("Escribe el correo electrónico de tu cuenta.");
  }

  const recoveryUrl = new URL(getAuthRedirectUrl());
  recoveryUrl.searchParams.set("auth", "recovery");

  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: recoveryUrl.toString(),
  });

  if (error) {
    throw error;
  }
}

export async function verifyPasswordRecoveryCode(email, token) {
  return verifyEmailOtp(email, token, "recovery");
}

async function verifyEmailOtp(email, token, type = "email") {
  const cleanEmail = normalizeAuthEmail(email);
  const cleanToken = normalizeVerificationCode(token);

  if (!cleanEmail) {
    throw new Error("Escribe el correo electrónico de tu cuenta.");
  }

  if (!isValidVerificationCode(cleanToken)) {
    throw new Error("El código debe tener 6 cifras.");
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: cleanEmail,
    token: cleanToken,
    type,
  });

  if (error) {
    throw error;
  }

  return data?.session || null;
}

export async function signOutSupabase() {
  clearSessionProfileCache({ persisted: true, home: true });
  await supabase.auth.signOut();
}
