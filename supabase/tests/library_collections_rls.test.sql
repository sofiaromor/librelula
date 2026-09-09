begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

insert into auth.users (id, email)
values
  ('20000000-0000-0000-0000-000000000001', 'collections-owner@example.test'),
  ('20000000-0000-0000-0000-000000000002', 'collections-reader@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, legacy_id, username)
values
  ('20000000-0000-0000-0000-000000000001', 920000001, 'collections-owner'),
  ('20000000-0000-0000-0000-000000000002', 920000002, 'collections-reader')
on conflict (id) do update
set legacy_id = excluded.legacy_id;

insert into public.books (id, title, author)
values
  (920000001, 'RLS collection owner book', 'Librélula'),
  (920000002, 'RLS collection other book', 'Librélula')
on conflict (id) do nothing;

insert into public.user_books (legacy_user_id, book_id, status)
values
  (920000001, '920000001', 'reading'),
  (920000002, '920000002', 'reading')
on conflict (legacy_user_id, book_id) do nothing;

insert into public.library_collections (id, owner_id, name, description, visibility)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'RLS pública',
    '',
    'public'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'RLS privada',
    '',
    'private'
  )
on conflict (id) do update
set owner_id = excluded.owner_id,
    name = excluded.name,
    description = excluded.description,
    visibility = excluded.visibility;

insert into public.library_collection_books (collection_id, book_id, sort_order)
values
  ('30000000-0000-0000-0000-000000000001', '920000001', 0),
  ('30000000-0000-0000-0000-000000000002', '920000001', 0)
on conflict (collection_id, book_id) do nothing;

set local role anon;

select is(
  (select count(*) from public.library_collections where owner_id = '20000000-0000-0000-0000-000000000001'),
  1::bigint,
  'anonymous users see only public collections'
);

select is(
  (select count(*) from public.library_collection_books where collection_id = '30000000-0000-0000-0000-000000000002'),
  0::bigint,
  'anonymous users cannot read books from private collections'
);

select throws_ok(
  $$select * from public.library_collection_follows$$,
  '42501',
  null,
  'anonymous users cannot read follower identities'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.library_collections where owner_id = '20000000-0000-0000-0000-000000000001'),
  1::bigint,
  'another authenticated user sees only public collections'
);

select is(
  (select count(*) from public.library_collection_books where collection_id = '30000000-0000-0000-0000-000000000002'),
  0::bigint,
  'another authenticated user cannot read private collection books'
);

select lives_ok(
  $$insert into public.library_collection_follows (collection_id, user_id)
    values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002')$$,
  'an authenticated user can follow a public collection'
);

select throws_ok(
  $$insert into public.library_collection_follows (collection_id, user_id)
    values ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002')$$,
  '42501',
  null,
  'an authenticated user cannot follow a private collection'
);

select is(
  (select count(*) from public.library_collection_follows),
  1::bigint,
  'a follower can read only their own follow row'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.library_collections where owner_id = '20000000-0000-0000-0000-000000000001'),
  2::bigint,
  'the owner sees public and private collections'
);

select is(
  (select count(*) from public.library_collection_books where collection_id = '30000000-0000-0000-0000-000000000002'),
  1::bigint,
  'the owner can read private collection books'
);

update public.library_collections
set updated_at = '2000-01-01 00:00:00+00'::timestamptz
where id = '30000000-0000-0000-0000-000000000001';

select lives_ok(
  $$select public.set_library_collection_books(
    '30000000-0000-0000-0000-000000000001',
    array['920000001']::text[]
  )$$,
  'the owner can replace the collection books'
);

select ok(
  (
    select updated_at > '2000-01-01 00:00:00+00'::timestamptz
    from public.library_collections
    where id = '30000000-0000-0000-0000-000000000001'
  ),
  'replacing collection books refreshes updated_at'
);

select throws_ok(
  $$select public.set_library_collection_books(
    '30000000-0000-0000-0000-000000000001',
    array['920000002']::text[]
  )$$,
  'P0001',
  'book is not in owner library',
  'the RPC rejects books outside the owner library'
);

select lives_ok(
  $$update public.library_collections
    set visibility = 'private'
    where id = '30000000-0000-0000-0000-000000000001'$$,
  'the owner can privatize a collection'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.library_collections where id = '30000000-0000-0000-0000-000000000001'),
  0::bigint,
  'a former follower cannot see a collection after it becomes private'
);

select is(
  (select count(*) from public.library_collection_books where collection_id = '30000000-0000-0000-0000-000000000001'),
  0::bigint,
  'a former follower cannot read books after privatization'
);

select is(
  (select count(*) from public.library_collection_follows),
  0::bigint,
  'privatization removes existing follows'
);

select is(
  (select count(*) from public.get_library_collection_follower_counts(
    array['30000000-0000-0000-0000-000000000001']::uuid[]
  )),
  0::bigint,
  'the aggregate RPC does not expose private follower counts'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$update public.library_collections
    set visibility = 'public'
    where id = '30000000-0000-0000-0000-000000000001'$$,
  'the owner can republish a collection'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into public.library_collection_follows (collection_id, user_id)
    values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002')$$,
  'a former follower can follow again after republishing'
);

select is(
  (select count(*) from public.library_collection_follows),
  1::bigint,
  'the new follow is isolated to the authenticated user'
);

reset role;
select * from finish();

rollback;
