-- Librélula: obras principales y ediciones
-- Ejecutar una sola vez en Supabase SQL Editor antes de desplegar el frontend.
-- Es idempotente: puede volver a ejecutarse sin duplicar las ediciones principales.

create extension if not exists pgcrypto;

-- Compatibilidad con instalaciones antiguas del esquema base.
alter table public.books add column if not exists provider text;
alter table public.books add column if not exists source_id text;

create table if not exists public.book_editions (
  id uuid primary key default gen_random_uuid(),
  book_id text not null references public.books(id) on delete cascade,
  title text not null default '',
  edition_label text,
  binding text,
  publisher text,
  publication_date text,
  year text,
  pages integer,
  language text not null default 'es',
  isbn text,
  cover text,
  provider text,
  source_id text,
  source_url text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.book_editions add column if not exists title text not null default '';
alter table public.book_editions add column if not exists edition_label text;
alter table public.book_editions add column if not exists binding text;
alter table public.book_editions add column if not exists publisher text;
alter table public.book_editions add column if not exists publication_date text;
alter table public.book_editions add column if not exists year text;
alter table public.book_editions add column if not exists pages integer;
alter table public.book_editions add column if not exists language text not null default 'es';
alter table public.book_editions add column if not exists isbn text;
alter table public.book_editions add column if not exists cover text;
alter table public.book_editions add column if not exists provider text;
alter table public.book_editions add column if not exists source_id text;
alter table public.book_editions add column if not exists source_url text;
alter table public.book_editions add column if not exists is_primary boolean not null default false;
alter table public.book_editions add column if not exists created_at timestamptz not null default now();
alter table public.book_editions add column if not exists updated_at timestamptz not null default now();

create index if not exists book_editions_book_idx
  on public.book_editions (book_id, is_primary desc, created_at);

create unique index if not exists book_editions_one_primary_idx
  on public.book_editions (book_id)
  where is_primary = true;

create unique index if not exists book_editions_isbn_unique_idx
  on public.book_editions (isbn)
  where isbn is not null and isbn <> '';

create unique index if not exists book_editions_external_source_unique_idx
  on public.book_editions (provider, source_id)
  where provider is not null and provider <> ''
    and source_id is not null and source_id <> '';

create unique index if not exists book_editions_fallback_unique_idx
  on public.book_editions (
    book_id,
    lower(coalesce(binding, '')),
    lower(coalesce(publisher, '')),
    coalesce(year, ''),
    coalesce(pages, 0)
  )
  where (isbn is null or isbn = '')
    and (source_id is null or source_id = '')
    and (
      coalesce(binding, '') <> ''
      or coalesce(publisher, '') <> ''
      or year is not null
      or pages is not null
    );

create or replace function public.touch_book_edition_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists book_editions_touch_updated_at on public.book_editions;
create trigger book_editions_touch_updated_at
before update on public.book_editions
for each row execute function public.touch_book_edition_updated_at();

-- Cada libro existente se conserva como obra y recibe una edición principal.
-- Si dos registros antiguos contienen el mismo ISBN normalizado o la misma fuente,
-- la edición no se pierde: solo se deja vacío ese identificador dudoso.
with existing_books as (
  select
    books.*,
    nullif(
      regexp_replace(upper(coalesce(books.isbn, '')), '[^0-9X]', '', 'g'),
      ''
    ) as normalized_isbn,
    count(*) over (
      partition by nullif(
        regexp_replace(upper(coalesce(books.isbn, '')), '[^0-9X]', '', 'g'),
        ''
      )
    ) as normalized_isbn_count,
    count(*) over (
      partition by nullif(lower(trim(books.provider)), ''), nullif(trim(books.source_id), '')
    ) as external_source_count
  from public.books books
)
insert into public.book_editions (
  book_id,
  title,
  edition_label,
  publisher,
  year,
  pages,
  language,
  isbn,
  cover,
  provider,
  source_id,
  is_primary
)
select
  books.id,
  books.title,
  'Edición principal',
  nullif(books.publisher, ''),
  books.year::text,
  books.pages,
  coalesce(nullif(books.language, ''), 'es'),
  case
    when books.normalized_isbn is not null and books.normalized_isbn_count = 1
      then books.normalized_isbn
    else null
  end,
  nullif(books.cover, ''),
  case
    when nullif(trim(books.provider), '') is not null
      and nullif(trim(books.source_id), '') is not null
      and books.external_source_count = 1
      then trim(books.provider)
    else null
  end,
  case
    when nullif(trim(books.provider), '') is not null
      and nullif(trim(books.source_id), '') is not null
      and books.external_source_count = 1
      then trim(books.source_id)
    else null
  end,
  true
from existing_books books
where not exists (
  select 1
  from public.book_editions editions
  where editions.book_id = books.id
)
on conflict do nothing;

alter table public.book_editions enable row level security;

create or replace function public.book_editions_current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(
    (
      select profiles.is_admin
      from public.profiles
      where profiles.id = auth.uid()
      limit 1
    ),
    false
  );
$function$;

create or replace function public.can_manage_book_editions(target_book_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  result boolean := false;
  current_user_id uuid := auth.uid();
begin
  if public.book_editions_current_user_is_admin() then
    return true;
  end if;

  if current_user_id is null then
    return false;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'books'
      and column_name = 'created_by'
      and data_type = 'uuid'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'books'
      and column_name = 'review_status'
  ) then
    execute $query$
      select exists (
        select 1
        from public.books
        where books.id = $1
          and books.created_by = $2
          and books.review_status = 'pending'
      )
    $query$
    into result
    using target_book_id, current_user_id;
  end if;

  return coalesce(result, false);
end;
$function$;

create or replace function public.can_read_book_editions(target_book_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  result boolean := false;
  current_user_id uuid := auth.uid();
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'books'
      and column_name = 'review_status'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'books'
      and column_name = 'created_by'
      and data_type = 'uuid'
  ) then
    execute $query$
      select exists (
        select 1
        from public.books
        where books.id = $1
          and (
            books.review_status = 'approved'
            or books.created_by = $2
            or public.book_editions_current_user_is_admin()
          )
      )
    $query$
    into result
    using target_book_id, current_user_id;

    return coalesce(result, false);
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'books'
      and column_name = 'review_status'
  ) then
    execute $query$
      select exists (
        select 1
        from public.books
        where books.id = $1
          and (
            books.review_status = 'approved'
            or public.book_editions_current_user_is_admin()
          )
      )
    $query$
    into result
    using target_book_id;

    return coalesce(result, false);
  end if;

  return exists (
    select 1
    from public.books
    where books.id = target_book_id
  );
end;
$function$;

revoke execute on function public.book_editions_current_user_is_admin() from public;
grant execute on function public.book_editions_current_user_is_admin() to anon, authenticated;
revoke execute on function public.can_manage_book_editions(text) from public, anon;
grant execute on function public.can_manage_book_editions(text) to authenticated;
revoke execute on function public.can_read_book_editions(text) from public;
grant execute on function public.can_read_book_editions(text) to anon, authenticated;

drop policy if exists book_editions_select_moderated on public.book_editions;
create policy book_editions_select_moderated
on public.book_editions
for select
to public
using (public.can_read_book_editions(book_id));

drop policy if exists book_editions_insert_managed on public.book_editions;
create policy book_editions_insert_managed
on public.book_editions
for insert
to authenticated
with check (public.can_manage_book_editions(book_id));

drop policy if exists book_editions_update_managed on public.book_editions;
create policy book_editions_update_managed
on public.book_editions
for update
to authenticated
using (public.can_manage_book_editions(book_id))
with check (public.can_manage_book_editions(book_id));

drop policy if exists book_editions_delete_managed on public.book_editions;
create policy book_editions_delete_managed
on public.book_editions
for delete
to authenticated
using (public.can_manage_book_editions(book_id));

grant select on public.book_editions to anon, authenticated;
grant insert, update, delete on public.book_editions to authenticated;

-- Comprobación final visible en el SQL Editor.
select
  (select count(*) from public.books) as obras_actuales,
  (select count(*) from public.book_editions) as ediciones_actuales,
  (
    select count(*)
    from public.books books
    where not exists (
      select 1 from public.book_editions editions where editions.book_id = books.id
    )
  ) as obras_sin_edicion;
