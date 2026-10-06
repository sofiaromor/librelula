# Lote de fantasía: 6 de octubre de 2026

`fantasia_100_2026-10-06.json` contiene 100 obras nuevas en castellano,
con su edición primaria, ISBN, autoría, sinopsis resumida en español,
editorial, páginas, fecha, portada y ficha de Casa del Libro.

Se compararon ISBN, títulos, autores y posiciones de saga con las 880 obras
y 825 ediciones del catálogo antes de importar. Se excluyeron reediciones,
alias de obras existentes, packs, fichas incompletas, otros idiomas y una
novela histórica clasificada en la categoría de fantasía por la fuente.

73 obras tienen una vinculación de saga revisada. En las otras 27 no se ha
identificado una saga narrativa; esto no convierte una ausencia de información
en una garantía de que nunca vaya a publicarse una continuación. Las notas
`series_review` distinguen colecciones editoriales, relatos complementarios,
universos compartidos y las numeraciones particulares de las ediciones españolas.

Las sinopsis son resúmenes originales de las fichas, sin citas promocionales,
biografías insertadas por error ni duplicación de párrafos. Los datos
bibliográficos y las imágenes proceden de Casa del Libro; cuando hizo falta
comprobar una saga se consultaron además fuentes bibliográficas y editoriales.

Las 100 portadas se descargaron y decodificaron antes de importar. Se calculó
un `hero_color` para cada una, retirando el fondo claro conectado al borde
de la fotografía y manteniendo las zonas claras que pertenecen a la portada.
`color_evidence` registra la URL, dimensiones y color anterior al ajuste de
luminosidad. No se usó el gris de reserva del navegador.

El lote añade obras, ediciones primarias, galerías originales y taxonomía.
No modifica las obras anteriores ni asigna coordenadas de caras a imágenes 3D.
Los identificadores de las nuevas obras empiezan por `cdl_fantasy_20261006_`.

Para generar SQL revisable, sin conectar ni escribir en la base de datos:

```sh
python scripts/importar_lote_sql.py catalog_batches/fantasia_100_2026-10-06.json salidas/fantasia_100.sql
```

El SQL valida duplicados y ejecuta el lote en una única transacción. Si los
ISBN ya existen, aborta por completo: no debe volver a importarse el mismo lote.
