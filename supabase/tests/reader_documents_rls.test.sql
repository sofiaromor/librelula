begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (id, email)
values
  ('40000000-0000-0000-0000-000000000001', 'reader-owner@example.test'),
  ('40000000-0000-0000-0000-000000000002', 'reader-other@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, legacy_id, username)
values
  ('40000000-0000-0000-0000-000000000001', 930000001, 'reader-owner'),
  ('40000000-0000-0000-0000-000000000002', 930000002, 'reader-other')
on conflict (id) do update
set legacy_id = excluded.legacy_id;

insert into public.books (id, title, author)
values
  (930000001, 'RLS reader one', 'Librélula'),
  (930000002, 'RLS reader two', 'Librélula'),
  (930000003, 'RLS reader three', 'Librélula')
on conflict (id) do nothing;

insert into public.reader_documents (
  id,
  owner_id,
  book_id,
  format,
  original_name,
  storage_path,
  mime_type,
  size_bytes
)
values
  (
    '41000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '930000001',
    'epub',
    'reader-one.epub',
    '40000000-0000-0000-0000-000000000001/930000001/reader-one.epub',
    'application/epub+zip',
    1024
  ),
  (
    '41000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000002',
    '930000002',
    'pdf',
    'reader-two.pdf',
    '40000000-0000-0000-0000-000000000002/930000002/reader-two.pdf',
    'application/pdf',
    2048
  ),
  (
    '41000000-0000-0000-0000-000000000003',
    '40000000-0000-0000-0000-000000000001',
    '930000002',
    'pdf',
    'reader-two-owner.pdf',
    '40000000-0000-0000-0000-000000000001/930000002/reader-two-owner.pdf',
    'application/pdf',
    2048
  )
on conflict (id) do nothing;

insert into public.reader_annotations (
  id,
  owner_id,
  book_id,
  document_id,
  kind,
  quote,
  note,
  locator
)
values
  (
    '42000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '930000001',
    '41000000-0000-0000-0000-000000000001',
    'highlight',
    'Una frase guardada',
    '',
    '{"cfi":"epubcfi(/6/2)"}'::jsonb
  ),
  (
    '42000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000002',
    '930000002',
    '41000000-0000-0000-0000-000000000002',
    'postit',
    '',
    'Una nota privada',
    '{"page":3}'::jsonb
  )
on conflict (id) do nothing;

select is(
  (select public from storage.buckets where id = 'reader-documents'),
  false,
  'reader documents bucket is private'
);

select ok(
  has_table_privilege('authenticated', 'public.reader_documents', 'select'),
  'authenticated readers have metadata access'
);

select ok(
  (
    select count(*) = 4
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'reader_documents_storage_%_own'
  ),
  'reader documents storage has four owner policies'
);

set local role anon;

select throws_ok(
  $$select * from public.reader_documents$$,
  '42501',
  null,
  'anonymous users cannot read reader documents'
);

select throws_ok(
  $$select * from public.reader_annotations$$,
  '42501',
  null,
  'anonymous users cannot read reader annotations'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.reader_documents),
  2::bigint,
  'a reader sees only their own documents'
);

select is(
  (select count(*) from public.reader_documents where owner_id = '40000000-0000-0000-0000-000000000002'),
  0::bigint,
  'a reader cannot read another owner document'
);

select lives_ok(
  $$update public.reader_documents
    set original_name = 'reader-one-renamed.epub'
    where id = '41000000-0000-0000-0000-000000000001'$$,
  'the owner can update their document'
);

select is_empty(
  $$update public.reader_documents
    set original_name = 'spoofed.pdf'
    where id = '41000000-0000-0000-0000-000000000002'
    returning id$$,
  'the owner cannot update another users document'
);

select throws_ok(
  $$insert into public.reader_documents (
      id, owner_id, book_id, format, original_name, storage_path, mime_type, size_bytes
    ) values (
      '41000000-0000-0000-0000-000000000004',
      '40000000-0000-0000-0000-000000000002',
      '930000003',
      'pdf',
      'spoofed.pdf',
      '40000000-0000-0000-0000-000000000002/930000003/spoofed.pdf',
      'application/pdf',
      1024
    )$$,
  '42501',
  null,
  'the owner cannot insert a document for another user'
);

select lives_ok(
  $$insert into public.reader_book_progress (
      owner_id, book_id, document_id, progress, locator, current_page
    ) values (
      '40000000-0000-0000-0000-000000000001',
      '930000001',
      '41000000-0000-0000-0000-000000000001',
      25,
      '{"cfi":"epubcfi(/6/4)"}'::jsonb,
      null
    )$$,
  'the owner can save progress for their document'
);

select throws_ok(
  $$insert into public.reader_book_progress (
      owner_id, book_id, document_id, progress
    ) values (
      '40000000-0000-0000-0000-000000000001',
      '930000002',
      '41000000-0000-0000-0000-000000000001',
      40
    )$$,
  '42501',
  null,
  'progress cannot point to a document from another book'
);

select lives_ok(
  $$insert into public.reader_annotations (
      owner_id, book_id, document_id, kind, note, locator
    ) values (
      '40000000-0000-0000-0000-000000000001',
      '930000001',
      '41000000-0000-0000-0000-000000000001',
      'postit',
      'Nota del lector',
      '{"cfi":"epubcfi(/6/6)"}'::jsonb
    )$$,
  'the owner can create an annotation for their document'
);

select throws_ok(
  $$insert into public.reader_annotations (
      owner_id, book_id, document_id, kind, note
    ) values (
      '40000000-0000-0000-0000-000000000001',
      '930000002',
      '41000000-0000-0000-0000-000000000001',
      'postit',
      'Anotación cruzada'
    )$$,
  '42501',
  null,
  'annotations cannot point to a document from another book'
);

select is(
  (select count(*) from public.reader_annotations),
  2::bigint,
  'a reader sees only their own annotations'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.reader_documents),
  1::bigint,
  'the second reader sees only their own document'
);

select is(
  (select count(*) from public.reader_annotations where owner_id = '40000000-0000-0000-0000-000000000001'),
  0::bigint,
  'the second reader cannot read another readers annotations'
);

select is_empty(
  $$update public.reader_book_progress
    set progress = 99
    where owner_id = '40000000-0000-0000-0000-000000000001'
    returning book_id$$,
  'the second reader cannot update another readers progress'
);

reset role;
select * from finish();

rollback;
