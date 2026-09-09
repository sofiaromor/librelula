-- Librélula: el perfil solo puede destacar colecciones propias y no curatoriales.

alter table public.profiles
  add column if not exists featured_collection_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_featured_collection_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_featured_collection_id_fkey
      foreign key (featured_collection_id)
      references public.reader_collections(id)
      on delete set null;
  end if;
end
$$;

create index if not exists profiles_featured_collection_id_idx
  on public.profiles (featured_collection_id);

create or replace function public.validate_featured_reader_collection()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.featured_collection_id is not null
    and not exists (
      select 1
      from public.reader_collections c
      where c.id = new.featured_collection_id
        and c.creator_id = new.id
        and c.is_public = true
        and c.is_curated = false
    )
  then
    raise exception 'Solo puedes destacar una colección creada por ti.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_validate_featured_reader_collection on public.profiles;
create trigger profiles_validate_featured_reader_collection
  before insert or update of featured_collection_id on public.profiles
  for each row
  execute function public.validate_featured_reader_collection();

revoke execute on function public.validate_featured_reader_collection() from public;

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'featured_collection_id'
  ) as featured_collection_id_enabled,
  exists (
    select 1
    from pg_trigger
    where tgname = 'profiles_validate_featured_reader_collection'
  ) as featured_collection_guard_enabled;
