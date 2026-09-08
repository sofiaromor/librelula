alter table public.profiles
  add column if not exists featured_collection_title text not null default '';

alter table public.profiles
  add constraint profiles_featured_collection_title_length
  check (char_length(featured_collection_title) <= 80);
