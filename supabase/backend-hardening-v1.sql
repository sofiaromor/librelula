-- Librélula · Endurecimiento del backend V1
--
-- Corrige permisos heredados y search_path mutable en funciones existentes.
-- También añade índices a las claves foráneas de public que Supabase marca
-- como no indexadas. Es idempotente y transaccional.
--
-- No modifica datos ni políticas RLS. Aplicar después de las migraciones base
-- y probar en staging antes de producción.

begin;

-- ---------------------------------------------------------------------------
-- 1. Las funciones de trigger no son endpoints RPC.
--    PostgreSQL concede EXECUTE a PUBLIC al crear una función si no se revoca.
-- ---------------------------------------------------------------------------

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.touch_updated_at()',
    'public.touch_book_edition_updated_at()',
    'public.reading_club_touch_updated_at()',
    'public.reading_club_protect_owner()',
    'public.reading_club_rotate_invite_when_private()',
    'public.reading_club_reading_touch_updated_at()',
    'public.handle_new_user()',
    'public.protect_profile_admin_fields()',
    'public.prepare_profile_social_fields()',
    'public.reading_club_add_owner()',
    'public.reading_club_attach_current_reading()',
    'public.reading_club_sync_next_meeting()',
    'public.sync_user_book_progress_to_reading_clubs()',
    'public.generate_friend_code()'
  ] loop
    if to_regprocedure(function_signature) is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated',
        function_signature
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Fijar search_path en funciones de trigger que no lo tenían.
--    Así no dependen del search_path de quien provoque el trigger.
-- ---------------------------------------------------------------------------

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.touch_updated_at()',
    'public.touch_book_edition_updated_at()',
    'public.reading_club_touch_updated_at()',
    'public.reading_club_protect_owner()',
    'public.reading_club_rotate_invite_when_private()',
    'public.reading_club_reading_touch_updated_at()'
  ] loop
    if to_regprocedure(function_signature) is not null then
      execute format(
        'alter function %s set search_path = public',
        function_signature
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Helpers de sesión y mutación: solo authenticated.
--    Se conserva EXECUTE para authenticated porque estas funciones se usan
--    dentro de políticas RLS y/o por los RPC autenticados de la aplicación.
-- ---------------------------------------------------------------------------

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.current_legacy_user_id()',
    'public.current_user_is_admin()',
    'public.can_manage_book(text)',
    'public.can_manage_book_editions(text)',
    'public.is_reading_club_admin(bigint, uuid)',
    'public.reading_club_next_meetings(bigint[])',
    'public.reading_club_home_snapshot()'
  ] loop
    if to_regprocedure(function_signature) is not null then
      execute format(
        'revoke execute on function %s from public, anon',
        function_signature
      );
      execute format(
        'grant execute on function %s to authenticated',
        function_signature
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Índices de claves foráneas de public que no tenían un índice cuyo primer
--    campo fuese la propia FK. Se omiten tablas/columnas opcionales ausentes
--    para que la migración siga siendo segura ante esquemas antiguos.
-- ---------------------------------------------------------------------------

do $$
declare
  index_spec text;
  target_table text;
  target_index text;
  target_column text;
begin
  foreach index_spec in array array[
    'book_enrichment_cache|book_enrichment_cache_created_by_idx|created_by',
    'book_postits|book_postits_book_idx|book_id',
    'book_reading_metadata|book_reading_metadata_updated_by_idx|updated_by',
    'books|books_approved_by_idx|approved_by',
    'books|books_created_by_legacy_user_id_idx|created_by_legacy_user_id',
    'books|books_submitted_by_legacy_user_id_idx|submitted_by_legacy_user_id',
    'goodreads_import_sources|goodreads_import_sources_legacy_user_id_idx|legacy_user_id',
    'profile_favorite_books|profile_favorite_books_book_idx|book_id',
    'profile_featured_books|profile_featured_books_book_idx|book_id',
    'reader_activity_comments|reader_activity_comments_user_idx|user_id',
    'reader_activity_likes|reader_activity_likes_user_idx|user_id',
    'reader_collection_books|reader_collection_books_book_idx|book_id',
    'reader_collection_likes|reader_collection_likes_user_idx|user_id',
    'reader_collections|reader_collections_creator_idx|creator_id',
    'reader_posts|reader_posts_author_idx|author_id',
    'reading_club_chapters|reading_club_chapters_created_by_idx|created_by',
    'reading_club_meetings|reading_club_meetings_created_by_idx|created_by',
    'reading_club_member_achievements|reading_club_member_achievements_awarded_by_idx|awarded_by',
    'reading_club_post_reactions|reading_club_post_reactions_user_idx|user_id',
    'reading_club_posts|reading_club_posts_parent_post_idx|parent_post_id',
    'reading_club_posts|reading_club_posts_reading_id_idx|reading_id',
    'reading_club_posts|reading_club_posts_user_idx|user_id',
    'reading_club_readings|reading_club_readings_book_idx|book_id',
    'reading_club_readings|reading_club_readings_closed_by_idx|closed_by',
    'reading_clubs|reading_clubs_current_book_idx|current_book_id',
    'reading_clubs|reading_clubs_current_reading_idx|current_reading_id',
    'reading_clubs|reading_clubs_owner_idx|owner_id',
    'review_atmosphere|review_atmosphere_book_idx|book_id',
    'review_vibes|review_vibes_book_idx|book_id',
    'user_follows|user_follows_following_idx|following_id'
  ] loop
    target_table := split_part(index_spec, '|', 1);
    target_index := split_part(index_spec, '|', 2);
    target_column := split_part(index_spec, '|', 3);

    if to_regclass(format('public.%s', target_table)) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and information_schema.columns.table_name = target_table
           and information_schema.columns.column_name = target_column
       ) then
      execute format(
        'create index if not exists %I on public.%I (%I)',
        target_index,
        target_table,
        target_column
      );
    end if;
  end loop;
end $$;

commit;
