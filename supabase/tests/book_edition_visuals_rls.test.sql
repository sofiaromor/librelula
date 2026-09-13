-- Run only in staging: all fixtures and mutations are rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temp table visual_test_results(line text);
grant insert, select on visual_test_results to anon, authenticated;
insert into visual_test_results select plan(16);

insert into auth.users(id,email) values
 ('50000000-0000-0000-0000-000000000001','visual-admin@example.test'),
 ('50000000-0000-0000-0000-000000000002','visual-reader@example.test');
insert into public.profiles(id,legacy_id,username,is_admin) values
 ('50000000-0000-0000-0000-000000000001',950000001,'visual-admin',true),
 ('50000000-0000-0000-0000-000000000002',950000002,'visual-reader',false);
insert into public.books(id,title,author,review_status) values
 ('950000001','Public texture fixture','Librélula','approved'),
 ('950000002','Pending texture fixture','Librélula','pending');
insert into public.book_editions(id,book_id,title,isbn,is_primary) values
 ('51000000-0000-0000-0000-000000000001','950000001','Normal','9500000000001',true),
 ('51000000-0000-0000-0000-000000000002','950000001','Painted','9500000000002',false),
 ('51000000-0000-0000-0000-000000000003','950000002','Pending','9500000000003',true);
insert into public.book_edition_visuals(edition_id,product_image_url,front_quad,fore_edge_quad) values
 ('51000000-0000-0000-0000-000000000001','https://images.example.test/normal.jpg',null,null),
 ('51000000-0000-0000-0000-000000000002','https://images.example.test/painted.jpg','[[0,0],[0.8,0],[0.8,1],[0,1]]','[[0.8,0],[1,0],[1,1],[0.8,1]]'),
 ('51000000-0000-0000-0000-000000000003','https://images.example.test/pending.jpg',null,null);

set local role anon;
insert into visual_test_results select is((select count(*)::integer from public.book_edition_visuals where edition_id::text like '51000000%'),2,'anon sees only approved edition visuals');
insert into visual_test_results select ok(not has_table_privilege('anon','public.book_edition_visuals','insert'),'anon has no insert grant');
insert into visual_test_results select is((select fore_edge_quad from public.book_edition_visuals where edition_id='51000000-0000-0000-0000-000000000001'),null::jsonb,'ordinary ISBN does not inherit the special edition edge');
reset role;

select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
set local role authenticated;
insert into visual_test_results select is((select count(*)::integer from public.book_edition_visuals where edition_id::text like '51000000%'),2,'reader sees approved visuals');
insert into visual_test_results select throws_ok($q$insert into public.book_edition_visuals(edition_id,product_image_url) values ('51000000-0000-0000-0000-000000000003','https://images.example.test/x.jpg')$q$,'42501',null,'reader cannot insert a texture');
update public.book_edition_visuals set product_image_url='https://images.example.test/changed.jpg' where edition_id='51000000-0000-0000-0000-000000000002';
insert into visual_test_results select is((select product_image_url from public.book_edition_visuals where edition_id='51000000-0000-0000-0000-000000000002'),'https://images.example.test/painted.jpg','reader cannot edit a texture');
delete from public.book_edition_visuals where edition_id='51000000-0000-0000-0000-000000000002';
insert into visual_test_results select is((select count(*)::integer from public.book_edition_visuals where edition_id='51000000-0000-0000-0000-000000000002'),1,'reader cannot delete a texture');
reset role;

select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
set local role authenticated;
insert into visual_test_results select is((select count(*)::integer from public.book_edition_visuals where edition_id::text like '51000000%'),3,'admin can review pending edition visuals');
update public.book_edition_visuals set product_image_url='https://images.example.test/admin.jpg' where edition_id='51000000-0000-0000-0000-000000000002';
insert into visual_test_results select is((select product_image_url from public.book_edition_visuals where edition_id='51000000-0000-0000-0000-000000000002'),'https://images.example.test/admin.jpg','admin can update a texture');
insert into visual_test_results select throws_ok($q$update public.book_edition_visuals set front_quad='[[0,0],[1,1],[1,0],[0,1]]' where edition_id='51000000-0000-0000-0000-000000000002'$q$,'23514',null,'crossed texture geometry is rejected');
insert into visual_test_results select throws_ok($q$update public.book_edition_visuals set fore_edge_quad='[[0,0],[2,0],[2,1],[0,1]]' where edition_id='51000000-0000-0000-0000-000000000002'$q$,'23514',null,'out-of-image geometry is rejected');
insert into visual_test_results select throws_ok($q$update public.book_edition_visuals set product_image_url='javascript:alert(1)' where edition_id='51000000-0000-0000-0000-000000000002'$q$,'23514',null,'non-HTTPS source is rejected');
insert into visual_test_results select throws_ok($q$update public.book_edition_visuals set image_gallery='[12]' where edition_id='51000000-0000-0000-0000-000000000002'$q$,'23514',null,'non-image gallery entries are rejected');
insert into visual_test_results select throws_ok($q$insert into public.book_edition_visuals(edition_id,product_image_url) values ('51000000-0000-0000-0000-000000000099','https://images.example.test/x.jpg')$q$,'23503',null,'texture cannot point to an absent edition');
delete from public.book_edition_visuals where edition_id='51000000-0000-0000-0000-000000000003';
insert into visual_test_results select lives_ok($q$insert into public.book_edition_visuals(edition_id,product_image_url) values ('51000000-0000-0000-0000-000000000003','https://images.example.test/new.jpg')$q$,'admin can insert a texture');
reset role;
delete from public.book_editions where id='51000000-0000-0000-0000-000000000003';
insert into visual_test_results select is((select count(*)::integer from public.book_edition_visuals where edition_id='51000000-0000-0000-0000-000000000003'),0,'edition deletion cascades to its visual metadata');

insert into visual_test_results select finish();
select line from visual_test_results;
rollback;
