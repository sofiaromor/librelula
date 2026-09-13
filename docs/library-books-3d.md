# Libros 3D en la biblioteca

Se mantienen las dos vistas existentes: **Portadas** y **Lomos**. Las fichas y puntuaciones siguen en Portadas. En Portadas cada libro empieza de frente y se puede girar arrastrando con el ratón o el dedo para descubrir el canto pintado. Lomos es una vista estática y limpia; tocar un lomo abre el inspector 3D con sus seis caras, arrastre, botones y flechas del teclado. `Home` restablece el giro. Los lomos personales y sus recortes se conservan.

La portada de la ficha del libro también es interactiva y abre el mismo inspector 3D. Así la ficha, Portadas y Lomos comparten la misma lectura visual sin convertir la estantería de lomos en una colección de objetos que giran solos.

## Qué es real y qué es una composición

- Portada: portada de la edición, o cara visible rectificada de la foto original.
- Canto de páginas: cara visible recortada de la foto de **esa edición/ISBN**, solo después de definir sus esquinas. No es el lomo.
- Lomo: foto personal existente; en su ausencia, portada desenfocada con título y autora.
- Contraportada: composición de paleta/portada desenfocada y sinopsis, no una fotografía de la contraportada real.
- Canto sin foto, superior e inferior: papel neutro recreado con líneas verticales. Grosor aproximado según páginas, no dimensiones físicas verificadas.

Una foto no permite recuperar caras ocultas ni detalles perdidos por compresión. La rectificación corrige la perspectiva geométrica; no reconstruye ilustraciones. La extracción de portada/canto se confirma con el editor: **no hay detección automática de caras ni asignación de una imagen de galería a una cara oculta**.

## Importar fotos de producto

El scraper conserva `imagen_portada`, `imagen_producto` e `imagenes_producto` (máximo ocho URLs originales únicas de la ficha y JSON-LD Product/Book). No descarga archivos ni cambia el ritmo/alcance del rastreo autorizado. `preparar_importacion.py` transmite `cover`, `product_image_url` e `image_gallery` al JSON revisable.

En la revisión de una importación, **Preparar portada y canto 3D** permite elegir foto, mover cuatro esquinas de portada y activar el canto únicamente cuando es visible. Las esquinas se ordenan superior izquierda, superior derecha, inferior derecha e inferior izquierda. El preview muestra cada cara rectificada. Las flechas ajustan la esquina enfocada; `Shift` aumenta el paso.

Para libros importados anteriormente, una administradora puede abrir el inspector desde Lomos y usar **Ajustar portada y canto de esta edición**, pegando otra foto original si hace falta.

La migración `20260913040421_seed_asistente_del_villano_visual.sql` deja preparada una primera edición de prueba para **Asistente del villano (edición especial limitada)** (ISBN `9791388108112`). Usa la fotografía de producto importada y las esquinas que delimitan la portada y el canto pintado visible. Es una semilla puntual del catálogo, no una suposición que se aplique a todos los libros.

El inspector identifica la edición mostrada por ISBN/principal y permite ver otras ediciones sin modificar el estado de lectura ni la edición del registro de biblioteca. No se reutiliza automáticamente el canto de una edición especial para otra edición.

## Datos y permisos

`public.book_edition_visuals` tiene una fila por `book_editions.id`, con URL original, galería y coordenadas normalizadas. No se guarda otra copia de las fotos en Storage ni datos privados de la biblioteca. La visualización usa transformaciones proyectivas CSS sin canvas ni un proxy que descargue URLs arbitrarias; no depende de CORS para leer píxeles.

La lectura hereda la visibilidad RLS de `book_editions`: no expone ediciones pendientes ocultas. Solo administradoras pueden insertar/editar/eliminar texturas. La FK está indexada por la PK y elimina metadatos cuando se elimina su edición. Constraints rechazan fuentes no HTTPS y selecciones cruzadas, cóncavas, fuera de la foto o degeneradas.

## Rollout

1. Revisar/respaldar el esquema. Producción debe tener aplicado `book-editions.sql`.
2. Probar `supabase/migrations/20260913031711_book_edition_visuals_v1.sql` en staging y la suite `supabase/tests/book_edition_visuals_rls.test.sql`.
3. El staging histórico es una base mínima: `book_visuals_staging_base.sql` reproduce los prerrequisitos de acceso para esta prueba, únicamente dentro de una transacción que se revierte. No es una copia completa de producción y nunca debe ejecutarse en producción.
4. Completar QA visual: móvil 360/390px con navbar, giro táctil y teclado, cierre/Escape/foco, sinopsis larga, fotos ausentes/fallidas, lomos personales, Portadas/Lomos y modo foto/apilado.
5. Tras autorización, aplicar **solo la nueva migración de texturas** a producción y publicar el frontend. No ejecutar `schema.sql` ni la base de fixtures.

Si falta la tabla nueva, la biblioteca conserva sus portadas y libros 3D generados. El editor de guardado indica la migración pendiente. Otros errores de carga no se presentan como “migración ausente”.

## Verificación

- Frontend: `npm run lint`, `npm test`, `npm run build`, `npm audit --omit=dev`.
- Scraper: `python -m unittest discover -s tools/scraping_libros/tests`.
- Geometría: las cuatro esquinas de las caras fotografiadas se proyectan a un rectángulo; pruebas de quads inválidos y aislamiento por ISBN.
- pgTAP: 16 assertions nuevas para anónimo, lectora y administradora, visibilidad, escrituras, constraints y FK/cascade.
- Harness local: `/tests/fixtures/book3d.html` usa una ilustración geométrica de QA, no una portada comercial. No se incluye como entrada en el build de producción. La URL externa ficticia de textura debe interceptarse con el SVG de fixture para probar el canto sin red.

Esta rama no fusiona `main`, no ejecuta migraciones en producción y no hace reimportaciones masivas.
