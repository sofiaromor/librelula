-- Progreso lector flexible: porcentaje, minutos o capítulos.
-- Seguro para ejecutar varias veces.

alter table public.user_books
  add column if not exists progress_mode text not null default 'percentage',
  add column if not exists total_minutes integer,
  add column if not exists minutes_read integer,
  add column if not exists total_chapters integer,
  add column if not exists current_chapter integer;

alter table public.user_books
  drop constraint if exists user_books_progress_mode_check;
alter table public.user_books
  add constraint user_books_progress_mode_check
  check (progress_mode in ('percentage', 'minutes', 'chapters'));

alter table public.user_books
  drop constraint if exists user_books_total_minutes_check;
alter table public.user_books
  add constraint user_books_total_minutes_check
  check (total_minutes is null or total_minutes >= 0);

alter table public.user_books
  drop constraint if exists user_books_minutes_read_check;
alter table public.user_books
  add constraint user_books_minutes_read_check
  check (minutes_read is null or minutes_read >= 0);

alter table public.user_books
  drop constraint if exists user_books_total_chapters_check;
alter table public.user_books
  add constraint user_books_total_chapters_check
  check (total_chapters is null or total_chapters >= 0);

alter table public.user_books
  drop constraint if exists user_books_current_chapter_check;
alter table public.user_books
  add constraint user_books_current_chapter_check
  check (current_chapter is null or current_chapter >= 0);

create index if not exists user_books_chapters_idx
  on public.user_books (book_id, total_chapters)
  where total_chapters is not null and total_chapters > 0;

create table if not exists public.book_reading_metadata (
  book_id text primary key references public.books(id) on delete cascade,
  total_chapters integer,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint book_reading_metadata_total_chapters_check check (total_chapters is null or total_chapters > 0)
);

alter table public.book_reading_metadata enable row level security;
drop policy if exists book_reading_metadata_select on public.book_reading_metadata;
create policy book_reading_metadata_select on public.book_reading_metadata
  for select to anon, authenticated using (true);
drop policy if exists book_reading_metadata_write on public.book_reading_metadata;
create policy book_reading_metadata_write on public.book_reading_metadata
  for insert to authenticated
  with check (exists (select 1 from public.user_books ub where ub.book_id = book_id and ub.legacy_user_id = public.current_legacy_user_id()));
drop policy if exists book_reading_metadata_update on public.book_reading_metadata;
create policy book_reading_metadata_update on public.book_reading_metadata
  for update to authenticated
  using (exists (select 1 from public.user_books ub where ub.book_id = book_id and ub.legacy_user_id = public.current_legacy_user_id()))
  with check (exists (select 1 from public.user_books ub where ub.book_id = book_id and ub.legacy_user_id = public.current_legacy_user_id()));

select
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_books' and column_name = 'progress_mode') as progress_modes,
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_books' and column_name = 'total_chapters') as chapter_totals;
