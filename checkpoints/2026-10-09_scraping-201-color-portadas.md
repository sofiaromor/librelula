# Checkpoint Librélula — 2026-10-09

## Resultado

- Repositorio: https://github.com/sofiaromor/librelula
- Base de main al comenzar: 8689384dfb519fab42c8cb4af9a7641c33331748.
- Rama de trabajo: codex/catalogo-200-color-portadas.
- PR abierta: https://github.com/sofiaromor/librelula/pull/53.
- JSON entregado: Librelula_201_libros_2026-10-09.json.
- SHA256 del JSON: fcaddaff959f6ae62b97d0d77279ebb1b2ca4edc0d38404fc8f76ec1962f4722.
- 200 obras nuevas y un registro adicional de Una espina en cada corazón.
- Los 201 registros tienen autor, ISBN válido y hero_color calculado de la portada.
- 62 registros indican saga. Esperando al diluvio conserva Los Valles Tranquilos sin número de entrega, con aviso de revisión.
- El libro solicitado es de Kate King, Encanto 1, ISBN 9786073943482, edición eBook en español. No se ha cambiado el estado de lectura personal.

## Extracción y revisión

Se continuó la categoría Literatura de Casa del Libro desde la página 7 y después desde la 17. Se conservaron los resultados de una ejecución interrumpida. Se revisaron 333 candidatos; las últimas fichas con errores temporales se completaron por consulta pública de Casa del Libro y contraste editorial. Se respetó la concurrencia de una petición y la pausa configurada del scraper.

Se contrastó el lote con 980 obras y 925 ediciones del catálogo público. Se descartaron ISBN existentes, otras ediciones de la misma obra, coincidencias dudosas, duplicados internos, packs y fichas en otros idiomas. Hay una obra de reserva fuera del archivo final.

Se verificaron y completaron sagas que no aparecían en el campo técnico, incluyendo Encanto, Blackwater, Rose Hill, Silver Pines, Dream Harbor, Legacy, Crimson Ridge y Compostela. Las colecciones editoriales y premios no se han tratado como sagas. Romancero gitano conserva a Federico García Lorca como autor y a Ricardo Cavolo como ilustrador en la preparación; no se incluye si coincide con una obra existente.

El JSON está preparado para revisión e importación en el administrador, con selected=false. No se insertaron ni actualizaron registros en Supabase. Se mantienen avisos de datos ausentes: 30 fichas sin sinopsis y una sin número de páginas. No se inventaron esos campos.

## Cambios de código

- El fondo del detalle calcula el color predominante de la portada de la misma edición visible en 3D; utiliza el recorte frontal cuando está delimitado.
- Se conserva el tono y se ajusta la luminosidad para mantener legible el texto claro.
- La extracción admite portadas subidas mediante blob y reintenta fallos temporales de carga.
- El scraper admite campos técnicos tanto en h3 como en div, conserva metadatos entre reintentos y recupera autores del JSON-LD del ISBN correspondiente.
- Se aceptan sinopsis con texto directo y br. Una editorial no se toma como autor cuando falta el segmento de autor.

## Validación y publicación

- 102 pruebas del frontend aprobadas.
- Compilación Vite y ESLint de los archivos modificados aprobados.
- 11 pruebas del scraper aprobadas.
- Quality gate de GitHub aprobado para el commit de código bca179cf310580297c5093d2ff39a476f7e68d79.
- La verificación visual de la preview quedó bloqueada por la protección de Vercel; no se afirma verificación visual ni E2E.
- La PR sigue abierta. El cambio del fondo no está publicado en producción.

## Siguiente sesión

Revisar los avisos del JSON en el administrador antes de importarlo y publicar la PR cuando corresponda. Los resultados brutos no se guardan en Git. No hay cambios de base de datos pendientes realizados automáticamente.
