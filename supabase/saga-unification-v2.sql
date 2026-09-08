-- Librélula · unificación de nombres de saga
--
-- Corrige variantes creadas por distintas fuentes de importación sin borrar
-- libros ni ediciones. Wax & Wayne se mantiene como subserie independiente.

begin;

create extension if not exists unaccent;

with prepared as (
  select
    b.id,
    b.saga_name,
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(unaccent(btrim(b.saga_name))),
            '^(saga|serie|series)[[:space:]]+',
            '',
            'i'
          ),
          '^[[:space:]]*estuche[[:space:]]+',
          '',
          'i'
        ),
        '[[:space:]]*(edicion|edition|especial|limitada|ilustrada|coleccionista|aniversario|tapa dura|tapa blanda|bolsillo|rustica|cartone|hardcover|paperback|box[[:space:]]*set|pack)[[:space:]]*.*$',
        '',
        'i'
      ),
      ' :;|,()[]{}–—-'
    ) as saga_base
  from public.books b
  where nullif(btrim(b.saga_name), '') is not null
), canonical as (
  select
    id,
    saga_name,
    saga_base,
    case
      when saga_base = 'acotar'
        or saga_base = 'una corte'
        or saga_base like 'una corte de rosas y espinas%'
        then 'acotar'
      when saga_base in ('nacidos de la bruma', 'mistborn')
        or saga_base like 'trilogia original mistborn%'
        then 'nacidos-de-la-bruma'
      when saga_base in ('la asistenta', 'l''assistenta')
        then 'la-asistenta'
      when saga_base = 'los chicos de tommen'
        then 'los-chicos-de-tommen'
      when saga_base like 'misterios en la libreria%sherlock holmes'
        then 'misterios-en-la-libreria-de-sherlock-holmes'
      when saga_base in ('charlie parker', 'detective charlie parker')
        then 'charlie-parker'
      when saga_base in ('elena blanco', 'inspectora elena blanco')
        then 'elena-blanco'
      else nullif(
        trim(both '-' from regexp_replace(saga_base, '[^a-z0-9]+', '-', 'g')),
        ''
      )
    end as canonical_key
  from prepared
)
update public.books b
set
  saga_key = c.canonical_key,
  saga_name = case c.canonical_key
    when 'acotar' then 'ACOTAR'
    when 'nacidos-de-la-bruma' then 'Nacidos de la bruma'
    when 'la-asistenta' then 'La asistenta'
    when 'los-chicos-de-tommen' then 'Los chicos de Tommen'
    when 'misterios-en-la-libreria-de-sherlock-holmes' then 'Misterios en la librería de Sherlock Holmes'
    when 'charlie-parker' then 'Charlie Parker'
    when 'elena-blanco' then 'Elena Blanco'
    else b.saga_name
  end
from canonical c
where b.id = c.id
  and c.canonical_key is not null;

commit;

-- Comprobación: no debe quedar más de una clave para estos grupos.
select saga_key, saga_name, count(*) as books
from public.books
where review_status = 'approved'
  and saga_key in (
    'acotar',
    'nacidos-de-la-bruma',
    'la-asistenta',
    'los-chicos-de-tommen',
    'misterios-en-la-libreria-de-sherlock-holmes',
    'charlie-parker',
    'elena-blanco'
  )
group by saga_key, saga_name
order by saga_key;
