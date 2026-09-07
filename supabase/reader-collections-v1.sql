-- Librélula: colecciones públicas creadas por la comunidad.

create table if not exists public.reader_collections (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(trim(title)) between 3 and 80),
  description text not null default '' check (char_length(description) <= 280),
  is_public boolean not null default true,
  is_curated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reader_collection_books (
  collection_id uuid not null references public.reader_collections(id) on delete cascade,
  book_id text not null references public.books(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  primary key (collection_id, book_id),
  unique (collection_id, sort_order)
);

create table if not exists public.reader_collection_likes (
  collection_id uuid not null references public.reader_collections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, user_id)
);

create index if not exists reader_collections_public_idx
  on public.reader_collections (is_public, created_at desc);
create index if not exists reader_collection_books_collection_idx
  on public.reader_collection_books (collection_id, sort_order);
create index if not exists reader_collection_likes_collection_idx
  on public.reader_collection_likes (collection_id);

alter table public.reader_collections enable row level security;
alter table public.reader_collection_books enable row level security;
alter table public.reader_collection_likes enable row level security;

drop policy if exists reader_collections_public_read on public.reader_collections;
create policy reader_collections_public_read on public.reader_collections
for select to public using (is_public = true or creator_id = (select auth.uid()));

drop policy if exists reader_collections_owner_insert on public.reader_collections;
create policy reader_collections_owner_insert on public.reader_collections
for insert to authenticated with check (creator_id = (select auth.uid()));

drop policy if exists reader_collections_owner_update on public.reader_collections;
create policy reader_collections_owner_update on public.reader_collections
for update to authenticated using (creator_id = (select auth.uid()))
with check (creator_id = (select auth.uid()));

drop policy if exists reader_collections_owner_delete on public.reader_collections;
create policy reader_collections_owner_delete on public.reader_collections
for delete to authenticated using (creator_id = (select auth.uid()));

drop policy if exists reader_collection_books_public_read on public.reader_collection_books;
create policy reader_collection_books_public_read on public.reader_collection_books
for select to public using (
  exists (select 1 from public.reader_collections c where c.id = collection_id and (c.is_public = true or c.creator_id = (select auth.uid())))
);

drop policy if exists reader_collection_books_owner_insert on public.reader_collection_books;
create policy reader_collection_books_owner_insert on public.reader_collection_books
for insert to authenticated with check (
  exists (select 1 from public.reader_collections c where c.id = collection_id and c.creator_id = (select auth.uid()))
);

drop policy if exists reader_collection_books_owner_update on public.reader_collection_books;
create policy reader_collection_books_owner_update on public.reader_collection_books
for update to authenticated using (
  exists (select 1 from public.reader_collections c where c.id = collection_id and c.creator_id = (select auth.uid()))
) with check (
  exists (select 1 from public.reader_collections c where c.id = collection_id and c.creator_id = (select auth.uid()))
);

drop policy if exists reader_collection_books_owner_delete on public.reader_collection_books;
create policy reader_collection_books_owner_delete on public.reader_collection_books
for delete to authenticated using (
  exists (select 1 from public.reader_collections c where c.id = collection_id and c.creator_id = (select auth.uid()))
);

drop policy if exists reader_collection_likes_public_read on public.reader_collection_likes;
create policy reader_collection_likes_public_read on public.reader_collection_likes
for select to public using (true);

drop policy if exists reader_collection_likes_own_insert on public.reader_collection_likes;
create policy reader_collection_likes_own_insert on public.reader_collection_likes
for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists reader_collection_likes_own_delete on public.reader_collection_likes;
create policy reader_collection_likes_own_delete on public.reader_collection_likes
for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.reader_collections, public.reader_collection_books, public.reader_collection_likes to anon, authenticated;
grant insert, update, delete on public.reader_collections, public.reader_collection_books to authenticated;
grant insert, delete on public.reader_collection_likes to authenticated;

insert into public.reader_collections (title, description, is_curated)
select title, description, true
from (values
  ('Dark academia: secretos y obsesiones', 'Universidades, bibliotecas, belleza oscura y secretos que nunca deberían salir a la luz.'),
  ('Lecturas LGTBIQ+ imprescindibles', 'Historias queer para descubrir nuevas voces, identidades y formas de querer.'),
  ('Fantasía independiente para perderse', 'Mundos completos en un solo volumen: fantasía sin comprometerse con una saga interminable.')
) as examples(title, description)
where not exists (select 1 from public.reader_collections c where c.title = examples.title);

-- Semillas disponibles en el catálogo actual; se completarán cuando existan más títulos.
insert into public.reader_collection_books (collection_id, book_id, sort_order)
select c.id, b.id, row_number() over (partition by c.id order by b.title) - 1
from public.reader_collections c
join public.books b on (
  (c.title = 'Dark academia: secretos y obsesiones' and lower(b.title) in ('piranesi', 'amarilla', 'magia más oscura', 'la voluntad de muchos'))
  or (c.title = 'Fantasía independiente para perderse' and lower(b.title) in ('piranesi', 'circe', 'la vida invisible de addie larue'))
)
where c.is_curated = true
on conflict (collection_id, book_id) do nothing;
