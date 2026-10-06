"""Genera una importación transaccional de un lote revisado. No conecta a DB."""
import argparse
import json
from pathlib import Path
import re
import sys

from preparar_importacion import isbn_valido


def generate_sql(items, expected=100):
    if len(items) != expected or len({i['isbn'] for i in items}) != expected:
        raise ValueError('El lote debe contener exactamente las obras esperadas, sin ISBN repetidos')
    fields = ['id','title','author','synopsis','cover','genre','year','pages','publisher',
              'language','isbn','saga_name','saga_number','saga_key','hero_color','provider',
              'source_id','source_url','edition_title','edition','binding','publication_date',
              'product_image_url','image_gallery','themes','audiences','aesthetics']
    payload = []
    for item in items:
        if not all(item.get(k) for k in ['id','title','author','synopsis','cover','publisher','binding','year','pages','publication_date','hero_color']):
            raise ValueError(f'Ficha incompleta: {item.get("isbn")}')
        if not isbn_valido(item['isbn']) or item['language'] != 'es' or item['provider'] != 'casa_del_libro':
            raise ValueError('Procedencia, idioma o ISBN incorrectos')
        if not re.fullmatch(r'#[0-9A-Fa-f]{6}',item['hero_color']):
            raise ValueError('Falta un color calculado')
        if not item.get('series_review') or not item.get('color_evidence'):
            raise ValueError('Falta la revisión de saga o portada')
        payload.append({key:item.get(key) for key in fields})
    data = json.dumps(payload,ensure_ascii=False,separators=(',',':'))
    if '$catalog_data$' in data:
        raise ValueError('Delimitador SQL presente en los datos')
    return f'''BEGIN;
DO $import_batch$
DECLARE
  batch jsonb := $catalog_data${data}$catalog_data$::jsonb;
  entry jsonb;
  edition_id uuid;
  labels jsonb;
  label_kind text;
BEGIN
  IF jsonb_array_length(batch) <> {expected} THEN
    RAISE EXCEPTION 'Cantidad inesperada en el lote';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(batch) x
    WHERE EXISTS (SELECT 1 FROM public.books b WHERE b.isbn=x->>'isbn' OR b.id=x->>'id')
       OR EXISTS (SELECT 1 FROM public.book_editions e WHERE e.isbn=x->>'isbn')
       OR EXISTS (SELECT 1 FROM public.books b WHERE lower(b.title)=lower(x->>'title') AND lower(b.author)=lower(x->>'author'))
  ) THEN
    RAISE EXCEPTION 'El lote contiene una obra o edición ya existente; no se importa nada';
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(batch) LOOP
    INSERT INTO public.books
      (id,title,author,synopsis,cover,genre,year,pages,publisher,language,isbn,
       saga_name,saga_number,saga_key,hero_color,provider,source_id,review_status,approved_at)
    VALUES
      (entry->>'id',entry->>'title',entry->>'author',entry->>'synopsis',entry->>'cover',
       jsonb_build_array(entry->>'genre')::text,entry->>'year',(entry->>'pages')::int,
       entry->>'publisher','es',entry->>'isbn',nullif(entry->>'saga_name',''),
       (entry->>'saga_number')::numeric,nullif(entry->>'saga_key',''),entry->>'hero_color',
       'casa_del_libro',entry->>'source_id','approved',now());
    INSERT INTO public.book_editions
      (book_id,title,edition_label,binding,publisher,publication_date,year,pages,language,
       isbn,cover,provider,source_id,source_url,is_primary)
    VALUES
      (entry->>'id',entry->>'edition_title',entry->>'edition',entry->>'binding',
       entry->>'publisher',entry->>'publication_date',entry->>'year',(entry->>'pages')::int,
       'es',entry->>'isbn',entry->>'cover','casa_del_libro',entry->>'source_id',entry->>'source_url',true)
    RETURNING id INTO edition_id;
    IF nullif(entry->>'product_image_url','') IS NOT NULL THEN
      INSERT INTO public.book_edition_visuals (edition_id,product_image_url,image_gallery)
      VALUES (edition_id,entry->>'product_image_url',coalesce(entry->'image_gallery','[]'::jsonb));
    END IF;
    FOREACH label_kind IN ARRAY ARRAY['theme','audience','aesthetic'] LOOP
      labels := CASE label_kind WHEN 'theme' THEN entry->'themes'
        WHEN 'audience' THEN entry->'audiences' ELSE entry->'aesthetics' END;
      INSERT INTO public.book_taxonomy (book_id,kind,value,position)
      SELECT entry->>'id',label_kind,value,(ordinality-1)::int
      FROM jsonb_array_elements_text(coalesce(labels,'[]'::jsonb)) WITH ORDINALITY
      ON CONFLICT (book_id,kind,value) DO NOTHING;
    END LOOP;
  END LOOP;
END
$import_batch$;
COMMIT;
'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('entrada',type=Path)
    parser.add_argument('salida',type=Path)
    parser.add_argument('--expected',type=int,default=100)
    args=parser.parse_args()
    sql=generate_sql(json.loads(args.entrada.read_text(encoding='utf-8')),args.expected)
    args.salida.parent.mkdir(parents=True,exist_ok=True)
    args.salida.write_text(sql,encoding='utf-8')
    print(f'SQL generado para {args.expected} obras. No se ha ejecutado ninguna escritura.')


if __name__=='__main__':
    main()
