-- Librélula · Clubes de lectura V4
-- Endurecimiento de roles/RLS, invitaciones privadas, calendario y almacenamiento.
-- Ejecutar DESPUÉS de reading-clubs.sql, reading-clubs-v2.sql y reading-clubs-v3.sql.
-- Idempotente. No borra clubes, miembros, conversaciones ni eventos existentes.

begin;

-- ---------------------------------------------------------------------------
-- 1. Helpers RLS: impedir que un cliente consulte por RPC el rol/progreso
--    de una persona arbitraria fuera de un club que administra.
-- ---------------------------------------------------------------------------

create or replace function public.is_reading_club_admin(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id is null or auth.uid() is null then
    return false;
  end if;

  -- Esta función solo debe responder por la identidad autenticada.
  if p_user_id is distinct from auth.uid() then
    return false;
  end if;

  return exists (
    select 1
    from public.reading_club_members m
    where m.club_id = p_club_id
      and m.user_id = p_user_id
      and m.status = 'active'
      and m.role in ('owner', 'moderator')
  );
end;
$$;

create or replace function public.is_reading_club_member(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if p_user_id is null or v_actor is null then
    return false;
  end if;

  -- Un administrador del propio club sí puede consultar si otra persona
  -- pertenece al club (lo necesitan las operaciones seguras de moderación).
  if p_user_id is distinct from v_actor and not exists (
    select 1
    from public.reading_club_members actor
    where actor.club_id = p_club_id
      and actor.user_id = v_actor
      and actor.status = 'active'
      and actor.role in ('owner', 'moderator')
  ) then
    return false;
  end if;

  return exists (
    select 1
    from public.reading_club_members m
    where m.club_id = p_club_id
      and m.user_id = p_user_id
      and m.status = 'active'
  );
end;
$$;

create or replace function public.reading_club_can_access_chapter(
  p_club_id bigint,
  p_chapter integer,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_current integer := 1;
  v_unlocked integer := 1;
begin
  if v_actor is null or p_user_id is null or p_chapter is null then
    return false;
  end if;

  if p_user_id is distinct from v_actor and not exists (
    select 1
    from public.reading_club_members actor
    where actor.club_id = p_club_id
      and actor.user_id = v_actor
      and actor.status = 'active'
      and actor.role in ('owner', 'moderator')
  ) then
    return false;
  end if;

  select m.role, greatest(1, m.current_chapter)
  into v_role, v_current
  from public.reading_club_members m
  where m.club_id = p_club_id
    and m.user_id = p_user_id
    and m.status = 'active';

  if not found then return false; end if;
  if v_role in ('owner', 'moderator') then return true; end if;

  v_unlocked := public.reading_club_unlocked_chapter(p_club_id, now());
  return p_chapter <= least(v_current, v_unlocked);
end;
$$;

-- PostgreSQL concede EXECUTE a PUBLIC por defecto al crear funciones.
-- Se revoca y se vuelven a conceder solo los accesos que necesita Librélula.
revoke execute on function public.is_reading_club_member(bigint, uuid) from public;
revoke execute on function public.is_reading_club_admin(bigint, uuid) from public, anon;
grant execute on function public.is_reading_club_member(bigint, uuid) to anon, authenticated;
grant execute on function public.is_reading_club_admin(bigint, uuid) to authenticated;

revoke execute on function public.reading_club_unlocked_chapter(bigint, timestamptz) from public, anon;
revoke execute on function public.reading_club_can_access_chapter(bigint, integer, uuid) from public, anon;
grant execute on function public.reading_club_unlocked_chapter(bigint, timestamptz) to authenticated;
grant execute on function public.reading_club_can_access_chapter(bigint, integer, uuid) to authenticated;

-- La V1 dejó una sobrecarga antigua de progreso de tres argumentos.
-- V2/V3 introdujeron la versión de cuatro argumentos, pero en PostgreSQL eso
-- crea otra función en lugar de sustituir la firma anterior.
drop function if exists public.update_reading_club_progress(bigint, integer, integer);

-- ---------------------------------------------------------------------------
-- 2. Roles y expulsiones: todas las mutaciones pasan por RPC seguras.
-- ---------------------------------------------------------------------------

drop policy if exists reading_club_members_update on public.reading_club_members;
drop policy if exists reading_club_members_delete on public.reading_club_members;

revoke update, delete on public.reading_club_members from authenticated;


-- Los detalles de progreso/rol de un club público dejan de ser consultables
-- por personas que no pertenecen al club. El hub obtiene únicamente el recuento.
drop policy if exists reading_club_members_select on public.reading_club_members;
create policy reading_club_members_select
on public.reading_club_members for select
to authenticated
using (public.is_reading_club_member(club_id, auth.uid()));

create or replace function public.reading_club_member_counts(p_club_ids bigint[])
returns table (club_id bigint, member_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as club_id,
    count(m.user_id)::bigint as member_count
  from public.reading_clubs c
  left join public.reading_club_members m
    on m.club_id = c.id
   and m.status = 'active'
  where c.id = any(coalesce(p_club_ids, array[]::bigint[]))
    and (
      c.visibility = 'public'
      or c.owner_id = auth.uid()
      or exists (
        select 1
        from public.reading_club_members self_membership
        where self_membership.club_id = c.id
          and self_membership.user_id = auth.uid()
          and self_membership.status = 'active'
      )
    )
  group by c.id
  order by c.id;
$$;

-- Redefine la expulsión segura y, en clubes privados, invalida el código que
-- conocía la persona expulsada para que no pueda volver a entrar inmediatamente.
create or replace function public.remove_reading_club_member(
  p_club_id bigint,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_visibility text;
  v_actor_role text;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;

  select owner_id, visibility
  into v_owner, v_visibility
  from public.reading_clubs
  where id = p_club_id;

  if v_owner is null then raise exception 'El club no existe.'; end if;

  select role into v_actor_role
  from public.reading_club_members
  where club_id = p_club_id
    and user_id = auth.uid()
    and status = 'active';

  if v_actor_role not in ('owner', 'moderator') then
    raise exception 'No tienes permisos para retirar miembros.';
  end if;

  if p_user_id = v_owner then
    raise exception 'La creadora no puede ser expulsada del club.';
  end if;

  if v_actor_role = 'moderator' and exists (
    select 1
    from public.reading_club_members
    where club_id = p_club_id
      and user_id = p_user_id
      and status = 'active'
      and role = 'moderator'
  ) then
    raise exception 'Solo la creadora puede retirar a otra moderadora.';
  end if;

  delete from public.reading_club_members
  where club_id = p_club_id
    and user_id = p_user_id
    and role <> 'owner';

  if not found then
    raise exception 'La persona no pertenece al club.';
  end if;

  if v_visibility = 'private' then
    update public.reading_clubs
    set invite_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
        updated_at = now()
    where id = p_club_id;
  end if;

  return true;
end;
$$;

-- Si un club fue público, su código pudo ser visible mientras lo era.
-- Al convertirlo en privado se genera automáticamente un código nuevo.
create or replace function public.reading_club_rotate_invite_when_private()
returns trigger
language plpgsql
as $$
begin
  if new.visibility = 'private'
     and old.visibility is distinct from 'private' then
    new.invite_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  end if;
  return new;
end;
$$;

drop trigger if exists reading_club_rotate_invite_before_update on public.reading_clubs;
create trigger reading_club_rotate_invite_before_update
before update on public.reading_clubs
for each row execute function public.reading_club_rotate_invite_when_private();

-- ---------------------------------------------------------------------------
-- 3. Publicaciones y marcapáginas: evitar escrituras directas que esquivan
--    las RPC de moderación/validación.
-- ---------------------------------------------------------------------------

drop policy if exists reading_club_posts_update on public.reading_club_posts;
revoke update on public.reading_club_posts from authenticated;

drop policy if exists reading_club_achievements_manage on public.reading_club_member_achievements;
revoke insert, update, delete on public.reading_club_member_achievements from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Calendario: reading_clubs.next_meeting_at se mantiene sincronizado con
--    la tabla real de eventos para que el hub no muestre una cita obsoleta.
-- ---------------------------------------------------------------------------

create or replace function public.reading_club_sync_next_meeting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_club_id bigint;
  v_old_club_id bigint;
begin
  if tg_op <> 'DELETE' then
    v_new_club_id := new.club_id;
  end if;

  if tg_op <> 'INSERT' then
    v_old_club_id := old.club_id;
  end if;

  if v_new_club_id is not null then
    update public.reading_clubs c
    set next_meeting_at = (
      select min(m.starts_at)
      from public.reading_club_meetings m
      where m.club_id = v_new_club_id
        and coalesce(m.ends_at, m.starts_at) >= now()
    )
    where c.id = v_new_club_id;
  end if;

  if v_old_club_id is not null
     and v_old_club_id is distinct from v_new_club_id then
    update public.reading_clubs c
    set next_meeting_at = (
      select min(m.starts_at)
      from public.reading_club_meetings m
      where m.club_id = v_old_club_id
        and coalesce(m.ends_at, m.starts_at) >= now()
    )
    where c.id = v_old_club_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists reading_club_meetings_sync_next on public.reading_club_meetings;
create trigger reading_club_meetings_sync_next
after insert or update or delete on public.reading_club_meetings
for each row execute function public.reading_club_sync_next_meeting();

-- Backfill del dato derivado para clubes ya existentes.
update public.reading_clubs c
set next_meeting_at = (
  select min(m.starts_at)
  from public.reading_club_meetings m
  where m.club_id = c.id
    and coalesce(m.ends_at, m.starts_at) >= now()
);

-- ---------------------------------------------------------------------------
-- 5. Storage: las nuevas rutas incluyen club_id.
--    - imágenes del club: solo creadora/moderadora
--    - imágenes de mensajes: cualquier miembro activo
-- El bucket sigue siendo público en V4 para no romper URLs históricas.
-- ---------------------------------------------------------------------------

drop policy if exists club_media_insert on storage.objects;
create policy club_media_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'club-media'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] = 'clubs'
  and coalesce((storage.foldername(name))[3], '') ~ '^[0-9]+$'
  and (
    (
      (storage.foldername(name))[4] = 'posts'
      and public.is_reading_club_member(
        ((storage.foldername(name))[3])::bigint,
        auth.uid()
      )
    )
    or
    (
      coalesce((storage.foldername(name))[4], '') <> 'posts'
      and public.is_reading_club_admin(
        ((storage.foldername(name))[3])::bigint,
        auth.uid()
      )
    )
  )
);

drop policy if exists club_media_update on storage.objects;
create policy club_media_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'club-media'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] = 'clubs'
  and coalesce((storage.foldername(name))[3], '') ~ '^[0-9]+$'
  and (
    (
      (storage.foldername(name))[4] = 'posts'
      and public.is_reading_club_member(
        ((storage.foldername(name))[3])::bigint,
        auth.uid()
      )
    )
    or
    (
      coalesce((storage.foldername(name))[4], '') <> 'posts'
      and public.is_reading_club_admin(
        ((storage.foldername(name))[3])::bigint,
        auth.uid()
      )
    )
  )
)
with check (
  bucket_id = 'club-media'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] = 'clubs'
  and coalesce((storage.foldername(name))[3], '') ~ '^[0-9]+$'
  and (
    (
      (storage.foldername(name))[4] = 'posts'
      and public.is_reading_club_member(
        ((storage.foldername(name))[3])::bigint,
        auth.uid()
      )
    )
    or
    (
      coalesce((storage.foldername(name))[4], '') <> 'posts'
      and public.is_reading_club_admin(
        ((storage.foldername(name))[3])::bigint,
        auth.uid()
      )
    )
  )
);

drop policy if exists club_media_delete on storage.objects;
create policy club_media_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'club-media'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] = 'clubs'
  and coalesce((storage.foldername(name))[3], '') ~ '^[0-9]+$'
  and (
    (
      (storage.foldername(name))[4] = 'posts'
      and public.is_reading_club_member(
        ((storage.foldername(name))[3])::bigint,
        auth.uid()
      )
    )
    or
    (
      coalesce((storage.foldername(name))[4], '') <> 'posts'
      and public.is_reading_club_admin(
        ((storage.foldername(name))[3])::bigint,
        auth.uid()
      )
    )
  )
);

-- ---------------------------------------------------------------------------
-- 6. RPC públicas: quitar EXECUTE implícito de PUBLIC.
-- ---------------------------------------------------------------------------

revoke execute on function public.join_reading_club(bigint, text) from public, anon;
revoke execute on function public.join_reading_club_by_code(text) from public, anon;
revoke execute on function public.leave_reading_club(bigint) from public, anon;
revoke execute on function public.update_reading_club_progress(bigint, integer, integer, integer) from public, anon;
revoke execute on function public.set_reading_club_member_role(bigint, uuid, text) from public, anon;
revoke execute on function public.remove_reading_club_member(bigint, uuid) from public, anon;
revoke execute on function public.delete_reading_club(bigint) from public, anon;
revoke execute on function public.update_reading_club_settings(bigint, text, text, text, text, text, text[]) from public, anon;
revoke execute on function public.replace_reading_club_chapters(bigint, jsonb) from public, anon;
revoke execute on function public.update_reading_club_plan(bigint, boolean, integer, timestamptz, integer, integer) from public, anon;
revoke execute on function public.moderate_reading_club_post(bigint, text) from public, anon;
revoke execute on function public.award_reading_club_bookmark(bigint, uuid, text, text) from public, anon;
revoke execute on function public.revoke_reading_club_bookmark(bigint) from public, anon;
revoke execute on function public.reading_club_member_counts(bigint[]) from public, anon;

grant execute on function public.join_reading_club(bigint, text) to authenticated;
grant execute on function public.join_reading_club_by_code(text) to authenticated;
grant execute on function public.leave_reading_club(bigint) to authenticated;
grant execute on function public.update_reading_club_progress(bigint, integer, integer, integer) to authenticated;
grant execute on function public.set_reading_club_member_role(bigint, uuid, text) to authenticated;
grant execute on function public.remove_reading_club_member(bigint, uuid) to authenticated;
grant execute on function public.delete_reading_club(bigint) to authenticated;
grant execute on function public.update_reading_club_settings(bigint, text, text, text, text, text, text[]) to authenticated;
grant execute on function public.replace_reading_club_chapters(bigint, jsonb) to authenticated;
grant execute on function public.update_reading_club_plan(bigint, boolean, integer, timestamptz, integer, integer) to authenticated;
grant execute on function public.moderate_reading_club_post(bigint, text) to authenticated;
grant execute on function public.award_reading_club_bookmark(bigint, uuid, text, text) to authenticated;
grant execute on function public.revoke_reading_club_bookmark(bigint) to authenticated;
grant execute on function public.reading_club_member_counts(bigint[]) to authenticated;

commit;

-- Verificación rápida.
select
  not has_table_privilege('authenticated', 'public.reading_club_members', 'UPDATE') as miembros_sin_update_directo,
  not has_table_privilege('authenticated', 'public.reading_club_members', 'DELETE') as miembros_sin_delete_directo,
  not has_table_privilege('authenticated', 'public.reading_club_posts', 'UPDATE') as mensajes_sin_update_directo,
  to_regprocedure('public.update_reading_club_progress(bigint,integer,integer)') is null as progreso_v1_eliminado,
  to_regprocedure('public.remove_reading_club_member(bigint,uuid)') is not null as expulsion_segura,
  exists (
    select 1 from pg_trigger
    where tgname = 'reading_club_meetings_sync_next'
      and not tgisinternal
  ) as calendario_sincronizado;
