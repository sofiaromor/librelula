insert into public.reader_collection_books (collection_id, book_id, sort_order)
select c.id, b.id, 0
from public.reader_collections c
join public.books b on lower(b.title) = 'la mala costumbre'
where c.title = 'Lecturas LGTBIQ+ imprescindibles'
  and not exists (
    select 1 from public.reader_collection_books cb
    where cb.collection_id = c.id and cb.book_id = b.id
  );
