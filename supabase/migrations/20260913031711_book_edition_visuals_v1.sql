-- Textures belong to an edition, never to a work or another edition's ISBN.
-- Requires the existing book-editions.sql migration. No book content is stored here.
begin;

do $$
begin
  if to_regclass('public.book_editions') is null
    or to_regprocedure('public.book_editions_current_user_is_admin()') is null then
    raise exception 'Apply book-editions.sql before book_edition_visuals_v1';
  end if;
end;
$$;

create schema if not exists private;

-- Side-effect-free constraint helper, not a privileged Data API endpoint.
create or replace function private.valid_book_face_quad(points jsonb)
returns boolean
language plpgsql immutable strict security invoker
set search_path = ''
as $$
declare
  i integer;
  a jsonb;
  b jsonb;
  c jsonb;
  area numeric := 0;
begin
  if jsonb_typeof(points) <> 'array' or jsonb_array_length(points) <> 4 then return false; end if;
  for i in 0..3 loop
    a := points->i;
    if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) <> 2 then return false; end if;
    if jsonb_typeof(a->0) <> 'number' or jsonb_typeof(a->1) <> 'number' then return false; end if;
    if (a->>0)::numeric < 0 or (a->>0)::numeric > 1
      or (a->>1)::numeric < 0 or (a->>1)::numeric > 1 then return false; end if;
  end loop;
  for i in 0..3 loop
    a := points->i; b := points->((i+1)%4); c := points->((i+2)%4);
    if ((b->>0)::numeric-(a->>0)::numeric)*((c->>1)::numeric-(b->>1)::numeric)
      - ((b->>1)::numeric-(a->>1)::numeric)*((c->>0)::numeric-(b->>0)::numeric) <= 0.00001 then return false; end if;
    area := area + (a->>0)::numeric*(b->>1)::numeric - (b->>0)::numeric*(a->>1)::numeric;
  end loop;
  return area > 0.002;
exception when others then return false;
end;
$$;
revoke all on function private.valid_book_face_quad(jsonb) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.valid_book_face_quad(jsonb) to authenticated;

create table if not exists public.book_edition_visuals (
  edition_id uuid primary key references public.book_editions(id) on delete cascade,
  product_image_url text not null check (
    length(product_image_url) <= 2048
    and product_image_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$'
  ),
  image_gallery jsonb not null default '[]'::jsonb check (
    case when jsonb_typeof(image_gallery) = 'array' then
      jsonb_array_length(image_gallery) <= 8
      and not jsonb_path_exists(image_gallery, '$[*] ? (@.type() != "string")')
      and not jsonb_path_exists(image_gallery, '$[*] ? (!(@ like_regex "^https://"))')
    else false end
  ),
  front_quad jsonb check (front_quad is null or private.valid_book_face_quad(front_quad)),
  fore_edge_quad jsonb check (fore_edge_quad is null or private.valid_book_face_quad(fore_edge_quad)),
  updated_at timestamptz not null default now()
);

comment on column public.book_edition_visuals.front_quad is 'Normalized TL,TR,BR,BL corners in the original photograph; null means use the edition cover.';
comment on column public.book_edition_visuals.fore_edge_quad is 'Only the photographed page edge of this edition. Null means generated neutral paper, never inferred artwork.';

alter table public.book_edition_visuals enable row level security;
revoke all on public.book_edition_visuals from public, anon, authenticated;
grant select on public.book_edition_visuals to anon, authenticated;
grant insert, update, delete on public.book_edition_visuals to authenticated;
grant all on public.book_edition_visuals to service_role;

drop policy if exists edition_visuals_read on public.book_edition_visuals;
create policy edition_visuals_read on public.book_edition_visuals for select to anon, authenticated
using (exists (select 1 from public.book_editions e where e.id = book_edition_visuals.edition_id));

drop policy if exists edition_visuals_insert on public.book_edition_visuals;
create policy edition_visuals_insert on public.book_edition_visuals for insert to authenticated
with check ((select public.book_editions_current_user_is_admin()));

drop policy if exists edition_visuals_update on public.book_edition_visuals;
create policy edition_visuals_update on public.book_edition_visuals for update to authenticated
using ((select public.book_editions_current_user_is_admin()))
with check ((select public.book_editions_current_user_is_admin()));

drop policy if exists edition_visuals_delete on public.book_edition_visuals;
create policy edition_visuals_delete on public.book_edition_visuals for delete to authenticated
using ((select public.book_editions_current_user_is_admin()));

commit;
