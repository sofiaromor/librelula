begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

insert into auth.users (id, email)
values
  ('40000000-0000-4000-8000-000000000001', 'notifications-owner-v1@example.test'),
  ('40000000-0000-4000-8000-000000000002', 'notifications-actor-v1@example.test'),
  ('40000000-0000-4000-8000-000000000003', 'notifications-outsider-v1@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, legacy_id, username, display_name, avatar)
values
  ('40000000-0000-4000-8000-000000000001', 950000001, 'notifications-owner', 'Propietaria', 'images/avatar/avatar1.png'),
  ('40000000-0000-4000-8000-000000000002', 950000002, 'notifications-actor', 'Otra lectora', 'images/avatar/avatar2.png'),
  ('40000000-0000-4000-8000-000000000003', 950000003, 'notifications-outsider', 'Tercera lectora', 'images/avatar/avatar3.png')
on conflict (id) do update
set legacy_id = excluded.legacy_id,
    username = excluded.username,
    display_name = excluded.display_name,
    avatar = excluded.avatar;

delete from public.notifications
where recipient_id in (
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000003'
);
delete from public.reader_activity_comments
where activity_key = 'post:41000000-0000-4000-8000-000000000001'
   or user_id in (
     '40000000-0000-4000-8000-000000000001',
     '40000000-0000-4000-8000-000000000002',
     '40000000-0000-4000-8000-000000000003'
   );
delete from public.reader_activity_likes
where activity_key = 'post:41000000-0000-4000-8000-000000000001'
   or user_id in (
     '40000000-0000-4000-8000-000000000001',
     '40000000-0000-4000-8000-000000000002',
     '40000000-0000-4000-8000-000000000003'
   );
delete from public.user_follows
where follower_id in (
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000003'
)
or following_id in (
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000003'
);
delete from public.reader_posts
where id = '41000000-0000-4000-8000-000000000001';
delete from public.reading_progress_log where id = 950000101;
delete from public.user_books where id = 950000102;

insert into public.reader_posts (id, author_id, body)
values (
  '41000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'Una actualización para probar la campanita'
);

insert into public.books (id, title, author)
values ('notification-test-book', 'Libro de prueba de notificaciones', 'Librélula')
on conflict (id) do nothing;

insert into public.reading_progress_log (
  id,
  legacy_user_id,
  book_id,
  previous_progress,
  new_progress,
  pages_delta
)
values (950000101, 950000001, 'notification-test-book', 10, 20, 10);

insert into public.user_books (id, legacy_user_id, book_id, status)
values (950000102, 950000001, 'notification-test-book', 'reading');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into public.user_follows (follower_id, following_id)
    values ('40000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001')$$,
  'following someone creates a notification for the followed profile'
);

select lives_ok(
  $$insert into public.reader_activity_likes (activity_key, user_id)
    values ('post:41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002')$$,
  'liking an update creates a notification for its author'
);

select lives_ok(
  $$insert into public.reader_activity_comments (activity_key, user_id, body)
    values ('post:41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'Qué bonito avance')$$,
  'replying to an update creates a notification for its author'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.notifications),
  3::bigint,
  'the recipient sees one follow, one like and one reply notification'
);

select is(
  (select count(*) from public.notifications where type = 'follow'),
  1::bigint,
  'follow notifications keep their type'
);

select is(
  (select count(*) from public.notifications where type = 'like' and activity_key = 'post:41000000-0000-4000-8000-000000000001'),
  1::bigint,
  'like notifications point to the activity key'
);

select is(
  (select count(*) from public.notifications where type = 'reply' and comment_preview = 'Qué bonito avance'),
  1::bigint,
  'reply notifications keep only a bounded comment preview'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.notifications),
  0::bigint,
  'another authenticated account cannot read the recipient notifications'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$update public.notifications set read_at = now() where recipient_id = '40000000-0000-4000-8000-000000000001'$$,
  'the recipient can mark notifications as read'
);

select is(
  (select count(*) from public.notifications where read_at is null),
  0::bigint,
  'marking notifications as read removes the unread state'
);

select throws_ok(
  $$update public.notifications set actor_name = 'Cuenta falsa' where recipient_id = '40000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'the recipient cannot rewrite notification identity fields'
);

select lives_ok(
  $$insert into public.reader_activity_likes (activity_key, user_id)
    values ('post:41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001')$$,
  'the author can like their own update'
);

select lives_ok(
  $$insert into public.reader_activity_comments (activity_key, user_id, body)
    values ('post:41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Comentario propio')$$,
  'the author can reply to their own update'
);

select is(
  (select count(*) from public.notifications),
  3::bigint,
  'self likes and replies do not create self-notifications'
);

select is(
  (select count(*) from public.notifications where actor_id = '40000000-0000-4000-8000-000000000001'),
  0::bigint,
  'no notification stores the author as their own actor'
);

reset role;

select is(
  public.reader_activity_author('post:41000000-0000-4000-8000-000000000001'),
  '40000000-0000-4000-8000-000000000001'::uuid,
  'post activities resolve to their profile author'
);

select is(
  public.reader_activity_author('progress:950000101'),
  '40000000-0000-4000-8000-000000000001'::uuid,
  'progress activities resolve through legacy_id'
);

select is(
  public.reader_activity_author('review:950000102'),
  '40000000-0000-4000-8000-000000000001'::uuid,
  'review activities resolve through legacy_id'
);

select is(
  public.reader_activity_author('status:950000102'),
  '40000000-0000-4000-8000-000000000001'::uuid,
  'status activities resolve through legacy_id'
);

select is(
  public.reader_activity_author('post:not-a-uuid'),
  null::uuid,
  'malformed activity keys resolve to no author'
);

reset role;
set local role anon;

select throws_ok(
  $$select * from public.notifications$$,
  '42501',
  null,
  'anonymous users cannot read notifications'
);

select * from finish();
rollback;
