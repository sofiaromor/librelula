-- Librélula: colección destacada y conexiones sociales públicas.
-- Ejecutar después de friends.sql en el SQL Editor de Supabase.

alter table public.profiles
  add column if not exists featured_collection text not null default 'favorites';

alter table public.profiles
  drop constraint if exists profiles_featured_collection_check;

alter table public.profiles
  add constraint profiles_featured_collection_check
  check (featured_collection in ('favorites', 'completed', 'reading', 'planned'));

create or replace function public.profile_social_connections(
  p_profile_id uuid,
  p_direction text
)
returns table (
  id uuid,
  username text,
  display_name text,
  friend_code text,
  avatar text,
  bio text,
  followed_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.friend_code,
    p.avatar,
    p.bio,
    f.created_at as followed_at
  from public.user_follows f
  join public.profiles p
    on p.id = case
      when p_direction = 'followers' then f.follower_id
      else f.following_id
    end
  where case
    when p_direction = 'followers' then f.following_id
    else f.follower_id
  end = p_profile_id
  order by f.created_at desc
  limit 100;
$$;

revoke execute on function public.profile_social_connections(uuid, text) from public;
revoke execute on function public.profile_social_connections(uuid, text) from anon;
grant execute on function public.profile_social_connections(uuid, text) to authenticated;
