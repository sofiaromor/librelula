# Supabase - Librélula

Este directorio guarda el esquema base versionado de Supabase para Librélula.

## Orden recomendado

1. Revisar `schema.sql`.
2. Pegar `schema.sql` en Supabase SQL Editor.
3. Ejecutarlo una vez.
4. Ejecutar las migraciones adicionales que use el proyecto (`moderation.sql`, `friends.sql`, `notifications-v1.sql`, etc.).
5. Ejecutar `book-editions.sql` para activar obras principales, ediciones y protección de duplicados.
6. Ejecutar `saga-unification-v2.sql` para unificar alias de sagas ya importadas.
7. Confirmar que las tablas existen.
8. Marcar tu perfil como admin desde Supabase, no desde el frontend.

## Nota sobre admin

Para poder crear libros desde el frontend con la sesión actual, el usuario debe tener `profiles.is_admin = true`.
No se usa `service_role` en el frontend.

## Pendiente posterior

- Storage para portadas, PDF y EPUB.
- Importación externa desde Open Library / Google Books.
- Herramienta administrativa para fusionar fichas antiguas que ya estuvieran duplicadas antes de `book-editions.sql`.
- Clubes de lectura y feed social real.
