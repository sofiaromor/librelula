-- TEST-ONLY minimal edition prerequisites for the existing schema-only staging.
-- Execute inside the SAME transaction as the visuals migration/test and roll back.
-- Never execute this file in production; production already has book-editions.sql.
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.books add column if not exists review_status text not null default 'approved';
create table if not exists public.book_editions (
 id uuid primary key default gen_random_uuid(),
 book_id text not null references public.books(id) on delete cascade,
 title text not null default '', isbn text, is_primary boolean not null default false
);
create or replace function public.book_editions_current_user_is_admin()
returns boolean language sql stable security definer set search_path = public
as $$select coalesce((select profiles.is_admin from public.profiles where profiles.id=auth.uid() limit 1),false)$$;
revoke all on function public.book_editions_current_user_is_admin() from public;
grant execute on function public.book_editions_current_user_is_admin() to anon,authenticated;
-- Same approved/admin read contract as the existing edition helper. Base tables
-- in this staging deliberately have RLS enabled without frontend read policies.
create or replace function public.can_read_book_editions(target_book_id text)
returns boolean language sql stable security definer set search_path = public
as $$select exists(select 1 from public.books where books.id=target_book_id and (review_status='approved' or public.book_editions_current_user_is_admin()))$$;
revoke all on function public.can_read_book_editions(text) from public;
grant execute on function public.can_read_book_editions(text) to anon,authenticated;
alter table public.book_editions enable row level security;
grant select on public.book_editions to anon,authenticated;
create policy visual_fixture_edition_read on public.book_editions for select to anon,authenticated
using (public.can_read_book_editions(book_id));
