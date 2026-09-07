import { supabase } from "./supabase.js";

const PROFILE_SELECT = "id, username, display_name, friend_code, avatar, bio";

function cleanFriendCode(value) {
return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "");
}

async function getCurrentUser() {
const {
    data: { user },
    error,
} = await supabase.auth.getUser();

if (error || !user) {
    throw new Error("Inicia sesión para añadir amigos.");
}

return user;
}

export async function getMySocialProfile() {
const user = await getCurrentUser();

const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .single();

if (error) {
    throw new Error(error.message || "No se pudo cargar tu perfil social.");
}

return data;
}

export async function searchProfileByFriendCode(friendCode) {
const user = await getCurrentUser();
const code = cleanFriendCode(friendCode);

if (!code) {
    throw new Error("Introduce un Código Librélula.");
}

const { data: profile, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("friend_code", code)
    .maybeSingle();

if (error) {
    throw new Error(error.message || "No se pudo buscar ese código.");
}

if (!profile) {
    return null;
}

const { data: follow } = await supabase
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", user.id)
    .eq("following_id", profile.id)
    .maybeSingle();

return {
    ...profile,
    is_self: profile.id === user.id,
    is_following: Boolean(follow),
};
}

export async function followProfile(profileId) {
const user = await getCurrentUser();

if (!profileId || profileId === user.id) {
    throw new Error("No puedes seguirte a ti misma.");
}

const { error } = await supabase
    .from("user_follows")
    .upsert(
    {
        follower_id: user.id,
        following_id: profileId,
    },
    {
        onConflict: "follower_id,following_id",
    },
    );

if (error) {
    throw new Error(error.message || "No se pudo añadir a esta persona.");
}

return true;
}

export async function unfollowProfile(profileId) {
const user = await getCurrentUser();

const { error } = await supabase
    .from("user_follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("following_id", profileId);

if (error) {
    throw new Error(error.message || "No se pudo dejar de seguir.");
}

return true;
}

export async function getFollowingProfiles() {
const user = await getCurrentUser();

const { data: follows, error: followsError } = await supabase
    .from("user_follows")
    .select("following_id, created_at")
    .eq("follower_id", user.id)
    .order("created_at", { ascending: false });

if (followsError) {
    throw new Error(followsError.message || "No se pudieron cargar tus amigos.");
}

const ids = (follows || []).map((item) => item.following_id);

if (!ids.length) {
    return [];
}

const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .in("id", ids);

if (profilesError) {
    throw new Error(profilesError.message || "No se pudieron cargar los perfiles.");
}

const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));

return follows
    .map((follow) => {
    const profile = profileMap.get(follow.following_id);

    return profile
        ? {
            ...profile,
            followed_at: follow.created_at,
        }
        : null;
    })
    .filter(Boolean);
}

export async function getProfileConnections(profileId, direction = "followers") {
    if (!profileId) return [];

    const cleanDirection = direction === "following" ? "following" : "followers";
    const { data, error } = await supabase.rpc("profile_social_connections", {
        p_profile_id: profileId,
        p_direction: cleanDirection,
    });

    if (error) {
        throw new Error(error.message || "No se pudieron cargar las conexiones.");
    }

    return Array.isArray(data) ? data : [];
}
