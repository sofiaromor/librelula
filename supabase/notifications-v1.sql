-- Librélula · Notificaciones sociales V1
--
-- Genera notificaciones para las acciones sociales que ya existen en la app:
--   * alguien marca una actualización con «me gusta»;
--   * alguien comenta una actualización;
--   * alguien empieza a seguirte.
--
-- Las notificaciones se crean en Postgres, no desde el navegador. Así no se
-- pierden si la persona receptora está desconectada y los clientes no pueden
-- falsear notificaciones para otra cuenta.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.user_follows') is null
     or to_regclass('public.reader_posts') is null
     or to_regclass('public.reader_activity_likes') is null
     or to_regclass('public.reader_activity_comments') is null
     or to_regclass('public.reading_progress_log') is null
     or to_regclass('public.user_books') is null then
    raise exception using
      errcode = '42P01',
      message = 'notifications-v1 requires the Librélula social schema to be applied first';
  end if;
end;
$$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('reply', 'like', 'follow')),
  actor_name text not null default 'Lectora'
    check (char_length(trim(actor_name)) between 1 and 120),
  actor_avatar text,
  activity_key text,
  comment_preview text
    check (comment_preview is null or char_length(comment_preview) <= 180),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
  on public.notifications(recipient_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications(recipient_id, read_at, created_at desc)
  where read_at is null;

create index if not exists notifications_actor_idx
  on public.notifications(actor_id);

alter table public.notifications enable row level security;

revoke all on table public.notifications from public, anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using ((select auth.uid()) = recipient_id);

drop policy if exists notifications_update_own_read_at on public.notifications;
create policy notifications_update_own_read_at
  on public.notifications
  for update
  to authenticated
  using ((select auth.uid()) = recipient_id)
  with check ((select auth.uid()) = recipient_id);

-- Resuelve quién es la autora de cualquier actividad que aparezca en el feed.
-- No se expone a los clientes: solo lo usan los triggers de abajo.
create or replace function public.reader_activity_author(p_activity_key text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key text := btrim(coalesce(p_activity_key, ''));
  v_identifier text;
  v_author_id uuid;
begin
  if v_key = '' then
    return null;
  end if;

  if v_key like 'post:%' then
    v_identifier := split_part(v_key, ':', 2);
    if v_identifier !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      return null;
    end if;

    select post.author_id
      into v_author_id
      from public.reader_posts post
     where post.id = v_identifier::uuid;

    return v_author_id;
  end if;

  if v_key like 'progress:%' then
    v_identifier := split_part(v_key, ':', 2);
    if v_identifier !~ '^[0-9]+$' then
      return null;
    end if;

    select profile.id
      into v_author_id
      from public.reading_progress_log progress
      join public.profiles profile
        on profile.legacy_id = progress.legacy_user_id
     where progress.id = v_identifier::bigint;

    return v_author_id;
  end if;

  if v_key like 'review:%' or v_key like 'status:%' then
    v_identifier := split_part(v_key, ':', 2);
    if v_identifier !~ '^[0-9]+$' then
      return null;
    end if;

    select profile.id
      into v_author_id
      from public.user_books user_book
      join public.profiles profile
        on profile.legacy_id = user_book.legacy_user_id
     where user_book.id = v_identifier::bigint;

    return v_author_id;
  end if;

  return null;
end;
$$;

-- Centraliza el snapshot mínimo que necesita la interfaz. Guardar el nombre y
-- avatar del momento evita joins públicos innecesarios y mantiene legible la
-- notificación aunque la cuenta que actuó cambie su perfil después.
create or replace function public.create_social_notification(
  p_recipient_id uuid,
  p_actor_id uuid,
  p_type text,
  p_activity_key text,
  p_comment_preview text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
  v_actor_avatar text;
begin
  if p_recipient_id is null
     or p_actor_id is null
     or p_recipient_id = p_actor_id
     or p_type not in ('reply', 'like', 'follow') then
    return;
  end if;

  select coalesce(
           nullif(btrim(profile.display_name), ''),
           nullif(btrim(profile.username), ''),
           'Lectora'
         ),
         profile.avatar
    into v_actor_name, v_actor_avatar
    from public.profiles profile
   where profile.id = p_actor_id;

  if v_actor_name is null then
    return;
  end if;

  insert into public.notifications (
    recipient_id,
    actor_id,
    type,
    actor_name,
    actor_avatar,
    activity_key,
    comment_preview,
    payload
  )
  values (
    p_recipient_id,
    p_actor_id,
    p_type,
    left(v_actor_name, 120),
    nullif(btrim(v_actor_avatar), ''),
    nullif(btrim(p_activity_key), ''),
    nullif(left(btrim(p_comment_preview), 180), ''),
    case
      when p_payload is null or jsonb_typeof(p_payload) <> 'object' then '{}'::jsonb
      else p_payload
    end
  );
end;
$$;

create or replace function public.notify_reader_activity_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_id uuid;
begin
  v_recipient_id := public.reader_activity_author(new.activity_key);

  perform public.create_social_notification(
    v_recipient_id,
    new.user_id,
    'like',
    new.activity_key,
    null,
    jsonb_build_object('activity_key', new.activity_key)
  );

  return new;
end;
$$;

create or replace function public.notify_reader_activity_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_id uuid;
begin
  v_recipient_id := public.reader_activity_author(new.activity_key);

  perform public.create_social_notification(
    v_recipient_id,
    new.user_id,
    'reply',
    new.activity_key,
    regexp_replace(btrim(new.body), '\s+', ' ', 'g'),
    jsonb_build_object(
      'activity_key', new.activity_key,
      'comment_id', new.id::text
    )
  );

  return new;
end;
$$;

create or replace function public.notify_user_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_social_notification(
    new.following_id,
    new.follower_id,
    'follow',
    null,
    null,
    jsonb_build_object('profile_id', new.follower_id::text)
  );

  return new;
end;
$$;

drop trigger if exists reader_activity_like_notification on public.reader_activity_likes;
create trigger reader_activity_like_notification
after insert on public.reader_activity_likes
for each row
execute function public.notify_reader_activity_like();

drop trigger if exists reader_activity_comment_notification on public.reader_activity_comments;
create trigger reader_activity_comment_notification
after insert on public.reader_activity_comments
for each row
execute function public.notify_reader_activity_comment();

drop trigger if exists user_follow_notification on public.user_follows;
create trigger user_follow_notification
after insert on public.user_follows
for each row
execute function public.notify_user_follow();

-- Los endpoints internos solo deben poder invocarse por los triggers.
revoke all on function public.reader_activity_author(text) from public, anon, authenticated;
revoke all on function public.create_social_notification(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.notify_reader_activity_like() from public, anon, authenticated;
revoke all on function public.notify_reader_activity_comment() from public, anon, authenticated;
revoke all on function public.notify_user_follow() from public, anon, authenticated;

-- La campanita recibe nuevas filas en tiempo real. La comprobación evita que
-- una segunda ejecución falle si la publicación ya contiene la tabla.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication publication
       join pg_publication_rel publication_table
         on publication_table.prpubid = publication.oid
       where publication.pubname = 'supabase_realtime'
         and publication_table.prrelid = 'public.notifications'::regclass
     ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end;
$$;

commit;

select
  to_regclass('public.notifications') is not null as notifications_table_ready,
  to_regprocedure('public.reader_activity_author(text)') is not null as activity_resolver_ready,
  to_regprocedure('public.notify_reader_activity_like()') is not null as like_trigger_ready,
  to_regprocedure('public.notify_reader_activity_comment()') is not null as reply_trigger_ready,
  to_regprocedure('public.notify_user_follow()') is not null as follow_trigger_ready;
