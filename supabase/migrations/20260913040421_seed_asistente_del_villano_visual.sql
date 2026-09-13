begin;

do $$
begin
  if to_regclass('public.book_editions') is null
    or to_regclass('public.book_edition_visuals') is null then
    raise exception 'Apply book-editions.sql and book_edition_visuals_v1 before this catalog visual seed';
  end if;
end
$$;

-- Verified product image already used by the Librélula catalog for ISBN 9791388108112.
-- The narrow right-hand face is the photographed painted page edge in that edition.
insert into public.book_editions (
  book_id,
  title,
  edition_label,
  binding,
  publisher,
  year,
  pages,
  language,
  isbn,
  cover,
  provider,
  source_id,
  is_primary
)
select
  books.id,
  books.title,
  'Edición especial limitada',
  'Tapa dura',
  coalesce(books.publisher, 'Faeris'),
  coalesce(books.year::text, '2026'),
  coalesce(books.pages, 488),
  coalesce(nullif(books.language, ''), 'es'),
  '9791388108112',
  'https://imagessl2.casadellibro.com/a/l/s5/12/9791388108112.webp',
  coalesce(nullif(books.provider, ''), 'casa_del_libro'),
  coalesce(nullif(books.source_id, ''), '9791388108112'),
  not exists (
    select 1
    from public.book_editions existing
    where existing.book_id = books.id
  )
from public.books
where regexp_replace(upper(coalesce(books.isbn, '')), '[^0-9X]', '', 'g') = '9791388108112'
  and not exists (
    select 1
    from public.book_editions existing
    where existing.book_id = books.id
      and regexp_replace(upper(coalesce(existing.isbn, '')), '[^0-9X]', '', 'g') = '9791388108112'
  )
on conflict do nothing;

-- book-editions.sql may already have created the work's primary edition. Reuse
-- that row instead of creating a second edition with the same ISBN.
update public.book_editions editions
set
  edition_label = 'Edición especial limitada',
  binding = coalesce(nullif(editions.binding, ''), 'Tapa dura'),
  publisher = coalesce(nullif(editions.publisher, ''), 'Faeris'),
  year = coalesce(editions.year, '2026'),
  pages = coalesce(editions.pages, 488),
  language = coalesce(nullif(editions.language, ''), 'es'),
  cover = 'https://imagessl2.casadellibro.com/a/l/s5/12/9791388108112.webp',
  provider = coalesce(nullif(editions.provider, ''), 'casa_del_libro'),
  source_id = coalesce(nullif(editions.source_id, ''), '9791388108112'),
  updated_at = now()
from public.books
where editions.book_id = books.id
  and regexp_replace(upper(coalesce(books.isbn, '')), '[^0-9X]', '', 'g') = '9791388108112'
  and regexp_replace(upper(coalesce(editions.isbn, '')), '[^0-9X]', '', 'g') = '9791388108112';

-- The quad is kept per edition and can still be fine-tuned by an administrator later.
insert into public.book_edition_visuals (
  edition_id,
  product_image_url,
  image_gallery,
  front_quad,
  fore_edge_quad
)
select
  editions.id,
  'https://imagessl2.casadellibro.com/a/l/s5/12/9791388108112.webp',
  jsonb_build_array('https://imagessl2.casadellibro.com/a/l/s5/12/9791388108112.webp'),
  '[[0.25,0.14],[0.716,0.122],[0.716,0.843],[0.25,0.855]]'::jsonb,
  '[[0.716,0.122],[0.777,0.135],[0.777,0.856],[0.716,0.843]]'::jsonb
from public.book_editions editions
join public.books
  on books.id = editions.book_id
where regexp_replace(upper(coalesce(books.isbn, '')), '[^0-9X]', '', 'g') = '9791388108112'
  and regexp_replace(upper(coalesce(editions.isbn, '')), '[^0-9X]', '', 'g') = '9791388108112'
on conflict (edition_id) do nothing;

commit;
