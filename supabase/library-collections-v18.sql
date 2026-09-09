-- Librélula · Colecciones públicas/privadas
-- Propuesta versionada. NO ejecutar en producción sin aprobación humana explícita.

begin;

create table if not exists public.library_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  accent_color text not null default '#b8896a',
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_collections_name_length
    check (char_length(trim(name)) between 1 and 80),
  constraint library_collections_description_length
    check (char_length(description) <= 280),
  constraint library_collections_visibility
    check (visibility in ('private', 'public')),
  constraint library_collections_accent_palette
    check (accent_color in (
      '#b8896a', '#c97d60', '#9c7658', '#7f8f74',
      '#8798a5', '#a88ba8', '#c3a668', '#8f6b62'
    ))
);

do $$
begin
  if exists (
    select owner_id, lower(trim(name))
    from public.library_collections
    group by owner_id, lower(trim(name))
    having count(*) > 1
  ) then
    raise exception using
      message = 'library_collections contiene nombres duplicados por propietario',
      detail = 'Resuelve los duplicados antes de crear el índice único library_collections_owner_name_uidx.';
  end if;
end $$;

drop index if exists public.library_collections_owner_name_uidx;
create unique index library_collections_owner_name_uidx
  on public.library_collections(owner_id, lower(trim(name)));
create index if not exists library_collections_owner_updated_idx
  on public.library_collections(owner_id, updated_at desc);

create table if not exists public.library_collection_books (
  collection_id uuid not null references public.library_collections(id) on delete cascade,
  book_id text not null references public.books(id) on delete cascade,
  sort_order integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (collection_id, book_id),
  constraint library_collection_books_sort_order check (sort_order >= 0)
);

create index if not exists library_collection_books_order_idx
  on public.library_collection_books(collection_id, sort_order, added_at);
create index if not exists library_collection_books_book_idx
  on public.library_collection_books(book_id);

create table if not exists public.library_collection_follows (
  collection_id uuid not null references public.library_collections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, user_id)
);

create index if not exists library_collection_follows_collection_idx
  on public.library_collection_follows(collection_id, created_at desc);
create index if not exists library_collection_follows_user_idx
  on public.library_collection_follows(user_id);

alter table public.library_collections enable row level security;
alter table public.library_collection_books enable row level security;
alter table public.library_collection_follows enable row level security;

revoke all on table public.library_collections from public, anon, authenticated;
revoke all on table public.library_collection_books from public, anon, authenticated;
revoke all on table public.library_collection_follows from public, anon, authenticated;

grant select on public.library_collections to anon, authenticated;
grant insert, update, delete on public.library_collections to authenticated;
grant select on public.library_collection_books to anon, authenticated;
grant select, insert, delete on public.library_collection_follows to authenticated;

-- Se recrean las políticas con nombres conocidos para corregir también una versión
-- anterior demasiado permisiva. Otras políticas no pertenecientes a esta migración
-- deben auditarse por separado antes del rollout.
drop policy if exists library_collections_read_visible on public.library_collections;
drop policy if exists library_collections_insert_own on public.library_collections;
drop policy if exists library_collections_update_own on public.library_collections;
drop policy if exists library_collections_delete_own on public.library_collections;
drop policy if exists library_collection_books_read_visible on public.library_collection_books;
drop policy if exists library_collection_follows_read_self on public.library_collection_follows;
drop policy if exists library_collection_follows_insert_self_public on public.library_collection_follows;
drop policy if exists library_collection_follows_delete_self on public.library_collection_follows;

create policy library_collections_read_visible
on public.library_collections
for select
to anon, authenticated
using (visibility = 'public' or owner_id = (select auth.uid()));

create policy library_collections_insert_own
on public.library_collections
for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy library_collections_update_own
on public.library_collections
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy library_collections_delete_own
on public.library_collections
for delete
to authenticated
using (owner_id = (select auth.uid()));

create policy library_collection_books_read_visible
on public.library_collection_books
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.library_collections c
    where c.id = library_collection_books.collection_id
      and (c.visibility = 'public' or c.owner_id = (select auth.uid()))
  )
);

alter table public.library_collections
  alter column visibility set default 'private';

create policy library_collection_follows_read_self
on public.library_collection_follows
for select
to authenticated
using (user_id = (select auth.uid()));

create policy library_collection_follows_insert_self_public
on public.library_collection_follows
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.library_collections c
    where c.id = library_collection_follows.collection_id
      and c.visibility = 'public'
      and c.owner_id <> (select auth.uid())
  )
);

create policy library_collection_follows_delete_self
on public.library_collection_follows
for delete
to authenticated
using (user_id = (select auth.uid()));

-- Decisión de privacidad: al privatizar una colección se eliminan todos sus
-- follows. Si vuelve a ser pública, cada persona debe seguirla de nuevo.
delete from public.library_collection_follows f
using public.library_collections c
where c.id = f.collection_id
  and c.visibility = 'private';

create or replace function public.library_collections_cleanup_private_follows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.visibility = 'public' and new.visibility = 'private' then
    delete from public.library_collection_follows
    where collection_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.library_collections_cleanup_private_follows() from public, anon, authenticated;
drop trigger if exists library_collections_cleanup_private_follows_trigger
  on public.library_collections;
create trigger library_collections_cleanup_private_follows_trigger
after update of visibility on public.library_collections
for each row
when (old.visibility is distinct from new.visibility)
execute function public.library_collections_cleanup_private_follows();

-- Reemplaza la lista completa de libros de una colección en una sola transacción.
-- Solo acepta libros que ya pertenezcan a la biblioteca del propietario.
create or replace function public.set_library_collection_books(
  target_collection_id uuid,
  target_book_ids text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := (select auth.uid());
  requested_count integer := coalesce(array_length(target_book_ids, 1), 0);
begin
  if viewer_id is null then
    raise exception 'authentication required';
  end if;

  if requested_count > 200 then
    raise exception 'collection book limit exceeded';
  end if;

  if not exists (
    select 1
    from public.library_collections c
    where c.id = target_collection_id
      and c.owner_id = viewer_id
  ) then
    raise exception 'collection not found';
  end if;

  if exists (
    select 1
    from unnest(coalesce(target_book_ids, array[]::text[])) as requested(book_id)
    where not exists (
      select 1
      from public.profiles p
      join public.user_books ub on ub.legacy_user_id = p.legacy_id
      where p.id = viewer_id
        and ub.book_id = requested.book_id
    )
  ) then
    raise exception 'book is not in owner library';
  end if;

  delete from public.library_collection_books
  where collection_id = target_collection_id;

  insert into public.library_collection_books(collection_id, book_id, sort_order)
  select target_collection_id, requested.book_id, requested.ordinality - 1
  from unnest(coalesce(target_book_ids, array[]::text[])) with ordinality
    as requested(book_id, ordinality)
    on conflict (collection_id, book_id) do nothing;

  update public.library_collections
  set updated_at = now()
  where id = target_collection_id;
end;
$$;

revoke all on function public.set_library_collection_books(uuid, text[]) from public, anon, authenticated;
grant execute on function public.set_library_collection_books(uuid, text[]) to authenticated;

-- Devuelve solo conteos agregados. No expone la identidad de las personas que siguen una colección.
create or replace function public.get_library_collection_follower_counts(
  target_collection_ids uuid[]
)
returns table(collection_id uuid, follower_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select f.collection_id, count(*)::bigint
  from public.library_collection_follows f
  join public.library_collections c on c.id = f.collection_id
  where f.collection_id = any(coalesce(target_collection_ids, array[]::uuid[]))
    and (c.visibility = 'public' or c.owner_id = (select auth.uid()))
  group by f.collection_id;
$$;

revoke all on function public.get_library_collection_follower_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.get_library_collection_follower_counts(uuid[]) to anon, authenticated;

commit;
