-- Unifica las claves de saga y corrige la clasificación de ACOTAR.
-- Idempotente: no elimina libros, solo corrige metadatos.

begin;

create extension if not exists unaccent;

update public.books
set saga_key = nullif(
  trim(both '-' from regexp_replace(
    lower(unaccent(trim(saga_name))),
    '[^a-z0-9]+',
    '-',
    'g'
  )),
  ''
)
where nullif(btrim(saga_name), '') is not null;

-- ACOTAR es fantasía adulta, no literatura infantil.
delete from public.book_taxonomy
where book_id = 'manual_f91e6273c2c25f16'
  and kind = 'audience'
  and lower(unaccent(value)) = 'infantil';

insert into public.book_taxonomy (book_id, kind, value, position)
select 'manual_f91e6273c2c25f16', 'audience', 'Adulto', 0
where not exists (
  select 1
  from public.book_taxonomy
  where book_id = 'manual_f91e6273c2c25f16'
    and kind = 'audience'
);

commit;
