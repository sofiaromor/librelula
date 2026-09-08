-- Ajustes persistentes de encuadre para la portada y el icono del perfil.
alter table public.profiles
  add column if not exists profile_visual_settings jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_visual_settings_object;

alter table public.profiles
  add constraint profiles_visual_settings_object
  check (jsonb_typeof(profile_visual_settings) = 'object');

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'profile_visual_settings'
  ) as profile_visual_settings_ready;
