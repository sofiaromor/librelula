-- Librélula · Lector personal de ePub y PDF V1
--
-- Los documentos subidos por una lectora son privados. El contenido solo se
-- comparte cuando la lectora crea explícitamente una publicación en Actividad.
-- Requiere que exista public.books. La opción de compartir anotaciones usa el
-- modelo social de Actividad cuando está aplicado.

begin;

do $$
declare
  books_id_type text;
begin
  if to_regclass('public.books') is null then
    raise exception using
      errcode = '42P01',
      message = 'reader-documents-v1 requires public.books to exist';
  end if;

  select format_type(att.atttypid, att.atttypmod)
    into books_id_type
    from pg_attribute att
    join pg_class rel on rel.oid = att.attrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where nsp.nspname = 'public'
     and rel.relname = 'books'
     and att.attname = 'id'
     and not att.attisdropped;

  if books_id_type <> 'text' then
    raise exception using
      errcode = '42804',
      message = format(
        'reader-documents-v1 expects public.books.id to be text, found %s',
        coalesce(books_id_type, 'unknown')
      );
  end if;
end;
$$;

create table if not exists public.reader_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null references public.books(id) on delete cascade,
  format text not null check (format in ('epub', 'pdf')),
  original_name text not null check (char_length(trim(original_name)) between 1 and 255),
  storage_path text not null check (
    char_length(storage_path) between 1 and 512
    and split_part(storage_path, '/', 1) = owner_id::text
  ),
  mime_type text not null check (mime_type in ('application/epub+zip', 'application/pdf')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, book_id, format)
);

create index if not exists reader_documents_book_idx
  on public.reader_documents (book_id, updated_at desc);

create table if not exists public.reader_book_progress (
  owner_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null references public.books(id) on delete cascade,
  document_id uuid references public.reader_documents(id) on delete set null,
  progress integer not null default 0 check (progress between 0 and 100),
  locator jsonb not null default '{}'::jsonb,
  current_page integer check (current_page is null or current_page >= 1),
  current_chapter text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, book_id)
);

create index if not exists reader_book_progress_document_idx
  on public.reader_book_progress (document_id);

create table if not exists public.reader_annotations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null references public.books(id) on delete cascade,
  document_id uuid references public.reader_documents(id) on delete set null,
  kind text not null default 'postit' check (kind in ('highlight', 'note', 'postit', 'bookmark')),
  quote text not null default '',
  note text not null default '',
  locator jsonb not null default '{}'::jsonb,
  page integer check (page is null or page >= 1),
  color text not null default 'yellow' check (color in ('yellow', 'pink', 'blue', 'green', 'lilac')),
  spoiler boolean not null default false,
  shared_post_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(quote)) > 0 or char_length(trim(note)) > 0)
);

create index if not exists reader_annotations_owner_book_idx
  on public.reader_annotations (owner_id, book_id, created_at desc);

create index if not exists reader_annotations_document_idx
  on public.reader_annotations (document_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'reader_documents_touch_updated_at'
  ) then
    create trigger reader_documents_touch_updated_at
      before update on public.reader_documents
      for each row execute function public.touch_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'reader_book_progress_touch_updated_at'
  ) then
    create trigger reader_book_progress_touch_updated_at
      before update on public.reader_book_progress
      for each row execute function public.touch_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'reader_annotations_touch_updated_at'
  ) then
    create trigger reader_annotations_touch_updated_at
      before update on public.reader_annotations
      for each row execute function public.touch_updated_at();
  end if;
end $$;

alter table public.reader_documents enable row level security;
alter table public.reader_book_progress enable row level security;
alter table public.reader_annotations enable row level security;

revoke all on table public.reader_documents from public, anon;
revoke all on table public.reader_book_progress from public, anon;
revoke all on table public.reader_annotations from public, anon;

grant select, insert, update, delete on table public.reader_documents to authenticated;
grant select, insert, update, delete on table public.reader_book_progress to authenticated;
grant select, insert, update, delete on table public.reader_annotations to authenticated;

drop policy if exists reader_documents_select_own on public.reader_documents;
create policy reader_documents_select_own
  on public.reader_documents
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists reader_documents_insert_own on public.reader_documents;
create policy reader_documents_insert_own
  on public.reader_documents
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists reader_documents_update_own on public.reader_documents;
create policy reader_documents_update_own
  on public.reader_documents
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists reader_documents_delete_own on public.reader_documents;
create policy reader_documents_delete_own
  on public.reader_documents
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists reader_book_progress_select_own on public.reader_book_progress;
create policy reader_book_progress_select_own
  on public.reader_book_progress
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists reader_book_progress_insert_own on public.reader_book_progress;
create policy reader_book_progress_insert_own
  on public.reader_book_progress
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and (
      document_id is null
      or exists (
        select 1
        from public.reader_documents document
        where document.id = reader_book_progress.document_id
          and document.owner_id = (select auth.uid())
          and document.book_id = reader_book_progress.book_id
      )
    )
  );

drop policy if exists reader_book_progress_update_own on public.reader_book_progress;
create policy reader_book_progress_update_own
  on public.reader_book_progress
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (
      document_id is null
      or exists (
        select 1
        from public.reader_documents document
        where document.id = reader_book_progress.document_id
          and document.owner_id = (select auth.uid())
          and document.book_id = reader_book_progress.book_id
      )
    )
  );

drop policy if exists reader_book_progress_delete_own on public.reader_book_progress;
create policy reader_book_progress_delete_own
  on public.reader_book_progress
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists reader_annotations_select_own on public.reader_annotations;
create policy reader_annotations_select_own
  on public.reader_annotations
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists reader_annotations_insert_own on public.reader_annotations;
create policy reader_annotations_insert_own
  on public.reader_annotations
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and (
      document_id is null
      or exists (
        select 1
        from public.reader_documents document
        where document.id = reader_annotations.document_id
          and document.owner_id = (select auth.uid())
          and document.book_id = reader_annotations.book_id
      )
    )
  );

drop policy if exists reader_annotations_update_own on public.reader_annotations;
create policy reader_annotations_update_own
  on public.reader_annotations
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (
      document_id is null
      or exists (
        select 1
        from public.reader_documents document
        where document.id = reader_annotations.document_id
          and document.owner_id = (select auth.uid())
          and document.book_id = reader_annotations.book_id
      )
    )
  );

drop policy if exists reader_annotations_delete_own on public.reader_annotations;
create policy reader_annotations_delete_own
  on public.reader_annotations
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reader-documents',
  'reader-documents',
  false,
  104857600,
  array['application/epub+zip', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists reader_documents_storage_select_own on storage.objects;
create policy reader_documents_storage_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'reader-documents'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists reader_documents_storage_insert_own on storage.objects;
create policy reader_documents_storage_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'reader-documents'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists reader_documents_storage_update_own on storage.objects;
create policy reader_documents_storage_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'reader-documents'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'reader-documents'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists reader_documents_storage_delete_own on storage.objects;
create policy reader_documents_storage_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'reader-documents'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

commit;

select
  to_regclass('public.reader_documents') is not null as documentos_creados,
  to_regclass('public.reader_book_progress') is not null as progreso_creado,
  to_regclass('public.reader_annotations') is not null as anotaciones_creadas,
  exists(select 1 from storage.buckets where id = 'reader-documents' and public = false) as bucket_privado,
  not has_table_privilege('anon', 'public.reader_documents', 'select') as documentos_sin_lectura_anon,
  not has_table_privilege('anon', 'public.reader_annotations', 'select') as anotaciones_sin_lectura_anon;
