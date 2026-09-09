-- Librélula: moderación de libros propuestos
-- Ejecutar en Supabase SQL Editor después de schema.sql y storage.sql.

alter table public.books add column if not exists updated_at timestamptz;

update public.books
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.books alter column updated_at set default now();
alter table public.books alter column updated_at set not null;

-- Compatibilidad: si created_by existía como bigint heredado, lo conservamos aparte.
do $moderation$
declare
  created_by_type text;
  backup_column text;
begin
  select data_type
  into created_by_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'books'
    and column_name = 'created_by';

  if created_by_type is not null and created_by_type <> 'uuid' then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'books'
        and column_name = 'created_by_legacy_user_id'
    ) then
      alter table public.books rename column created_by to created_by_legacy_user_id;
    else
      backup_column := 'created_by_legacy_user_id_old_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS');
      execute format('alter table public.books rename column created_by to %I', backup_column);
    end if;
  end if;
end $moderation$;

alter table public.books add column if not exists review_status text not null default 'approved';
alter table public.books add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.books add column if not exists submitted_by_legacy_user_id bigint references public.profiles(legacy_id) on delete set null;
alter table public.books add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table public.books add column if not exists approved_at timestamptz;
alter table public.books add column if not exists rejected_at timestamptz;
alter table public.books add column if not exists moderation_note text;

do $moderation$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'books_review_status_check'
      and conrelid = 'public.books'::regclass
  ) then
    alter table public.books
      add constraint books_review_status_check
      check (review_status in ('pending', 'approved', 'rejected'));
  end if;
end $moderation$;

update public.books
set review_status = 'approved'
where review_status is null;

update public.books
set approved_at = coalesce(approved_at, created_at, now())
where review_status = 'approved'
  and approved_at is null;

create index if not exists books_review_status_idx on public.books (review_status);
create index if not exists books_created_by_idx on public.books (created_by);

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $librelula_function$
  select coalesce(
    (
      select profiles.is_admin
      from public.profiles
      where profiles.id = auth.uid()
      limit 1
    ),
    false
  );
$librelula_function$;

create or replace function public.can_read_book(target_book_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $librelula_function$
  select exists (
    select 1
    from public.books
    where books.id = target_book_id
      and (
        books.review_status = 'approved'
        or books.created_by = auth.uid()
        or public.is_current_user_admin()
      )
  );
$librelula_function$;

create or replace function public.can_manage_book(target_book_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $librelula_function$
  select exists (
    select 1
    from public.books
    where books.id = target_book_id
      and (
        public.is_current_user_admin()
        or (
          books.created_by = auth.uid()
          and books.review_status = 'pending'
        )
      )
  );
$librelula_function$;

revoke execute on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to anon, authenticated;
revoke execute on function public.can_read_book(text) from public;
grant execute on function public.can_read_book(text) to anon, authenticated;
revoke execute on function public.can_manage_book(text) from public, anon;
grant execute on function public.can_manage_book(text) to authenticated;

alter table public.books enable row level security;
alter table public.book_taxonomy enable row level security;

do $moderation$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'books'
  loop
    execute format('drop policy if exists %I on public.books', policy_record.policyname);
  end loop;

  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'book_taxonomy'
  loop
    execute format('drop policy if exists %I on public.book_taxonomy', policy_record.policyname);
  end loop;
end $moderation$;

create policy books_select_moderated
on public.books
for select
to public
using (
  review_status = 'approved'
  or created_by = auth.uid()
  or public.is_current_user_admin()
);

create policy books_insert_authenticated
on public.books
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    public.is_current_user_admin()
    or (
      review_status = 'pending'
      and pdf_file is null
      and epub_file is null
      and approved_by is null
      and approved_at is null
    )
  )
);

create policy books_update_moderated
on public.books
for update
to authenticated
using (
  public.is_current_user_admin()
  or (
    created_by = auth.uid()
    and review_status = 'pending'
  )
)
with check (
  public.is_current_user_admin()
  or (
    created_by = auth.uid()
    and review_status = 'pending'
    and pdf_file is null
    and epub_file is null
  )
);

create policy books_delete_moderated
on public.books
for delete
to authenticated
using (
  public.is_current_user_admin()
  or (
    created_by = auth.uid()
    and review_status = 'pending'
  )
);

create policy book_taxonomy_select_moderated
on public.book_taxonomy
for select
to public
using (public.can_read_book(book_id));

create policy book_taxonomy_insert_moderated
on public.book_taxonomy
for insert
to authenticated
with check (public.can_manage_book(book_id));

create policy book_taxonomy_update_moderated
on public.book_taxonomy
for update
to authenticated
using (public.can_manage_book(book_id))
with check (public.can_manage_book(book_id));

create policy book_taxonomy_delete_moderated
on public.book_taxonomy
for delete
to authenticated
using (public.can_manage_book(book_id));

do $moderation$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'book_covers_insert_authenticated'
  ) then
    create policy book_covers_insert_authenticated
    on storage.objects
    for insert
    to authenticated
    with check (bucket_id = 'book-covers');
  end if;
end $moderation$;
