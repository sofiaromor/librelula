-- Librélula: libros elegidos manualmente para el expositor del perfil.

create table if not exists public.profile_featured_books (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  book_id text not null references public.books(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0 and sort_order < 6),
  created_at timestamptz not null default now(),
  primary key (profile_id, book_id),
  unique (profile_id, sort_order)
);

create index if not exists profile_featured_books_profile_idx
  on public.profile_featured_books (profile_id, sort_order);

alter table public.profiles
  drop constraint if exists profiles_featured_collection_check;

alter table public.profiles
  add constraint profiles_featured_collection_check
  check (featured_collection in ('favorites', 'completed', 'reading', 'planned', 'custom'));

alter table public.profile_featured_books enable row level security;

drop policy if exists profile_featured_books_public_read on public.profile_featured_books;
create policy profile_featured_books_public_read
on public.profile_featured_books
for select to public
using (true);

drop policy if exists profile_featured_books_owner_insert on public.profile_featured_books;
create policy profile_featured_books_owner_insert
on public.profile_featured_books
for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    join public.user_books ub on ub.legacy_user_id = p.legacy_id
    where p.id = profile_id
      and ub.book_id = profile_featured_books.book_id
  )
);

drop policy if exists profile_featured_books_owner_update on public.profile_featured_books;
create policy profile_featured_books_owner_update
on public.profile_featured_books
for update to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

drop policy if exists profile_featured_books_owner_delete on public.profile_featured_books;
create policy profile_featured_books_owner_delete
on public.profile_featured_books
for delete to authenticated
using (profile_id = (select auth.uid()));

grant select on public.profile_featured_books to anon, authenticated;
grant insert, update, delete on public.profile_featured_books to authenticated;

select
  to_regclass('public.profile_featured_books') is not null as featured_books_table,
  exists (
    select 1 from pg_constraint
    where conname = 'profiles_featured_collection_check'
      and pg_get_constraintdef(oid) like '%custom%'
  ) as custom_collection_enabled;
