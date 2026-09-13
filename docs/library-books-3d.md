# Libros 3D en la biblioteca

Se mantienen las dos vistas existentes: **Portadas** y **Lomos**. Las fichas y puntuaciones siguen en Portadas. En Portadas cada libro empieza de frente y se puede girar arrastrando con el ratón o el dedo para descubrir el canto pintado. Lomos es una vista estática y limpia; tocar un lomo abre el inspector 3D con sus seis caras, arrastre, botones y flechas del teclado. `Home` restablece el giro. Los lomos personales y sus recortes se conservan.

La portada de la ficha del libro también es interactiva y abre el mismo inspector 3D. Así la ficha, Portadas y Lomos comparten la misma lectura visual sin convertir la estantería de lomos en una colección de objetos que giran solos.

En la ficha, el libro gira sobre un contenedor transparente, sin fondo ni sombra rectangular y sin recorte exterior. El margen alrededor reserva espacio para las caras que sobresalen al girar, también en móvil. Se conserva el indicador de foco del botón y el recorte interno de las texturas de cada cara.

## Qué es real y qué es una composición

- Portada: portada de la edición, o cara visible rectificada de la foto original.
- Canto de páginas: cara visible recortada de la foto de **esa edición/ISBN**, solo después de definir sus esquinas. No es el lomo.
- Lomo: foto personal existente; en su ausencia, fondo del color predominante de la portada, con título y autora.
- Contraportada: composición del color predominante de la portada y sinopsis, no una fotografía de la contraportada real.
- Canto sin foto: papel neutro recreado con líneas verticales. Caras superior e inferior: líneas horizontales, paralelas al ancho de la portada. Grosor aproximado según páginas, no dimensiones físicas verificadas.

Cuando existe canto pintado, las caras superior e inferior reutilizan ese mismo dibujo girado, como continuación aproximada. No se presentan como fotografías ni extracción de las caras ocultas. El papel neutro y sus líneas horizontales siguen siendo el respaldo cuando no hay canto fotografiado.

Las imágenes rectificadas mantienen sus dimensiones naturales durante la transformación, sin reducir primero toda la foto al tamaño de la cara. Para la foto verificada de Asistente del villano se prefiere la variante de mayor resolución incluso si el recorte guardado referencia su miniatura; las esquinas originales se conservan. No se inventan detalles ni se promete recuperar información perdida: una foto de producto de 552 px solo aporta unos 240 px útiles de portada y unos 28 px de canto. Hace falta una fuente realmente mayor para eliminar esa limitación en pantallas de alta densidad.

La paleta 3D se calcula del grupo de píxeles más frecuente en la portada visible, no del fondo blanco de la foto, del canto ni del color genérico del hero. Se comparte una caché por fuente/recorte entre los lomos estáticos y el visor. El fondo calculado no queda oculto por otra portada desenfocada y el texto adapta su contraste a las portadas claras. Si la lectura de píxeles falla por CORS o carga, se conserva el color almacenado/respaldado sin romper la textura.

Una foto no permite recuperar caras ocultas ni detalles perdidos por compresión. La rectificación corrige la perspectiva geométrica; no reconstruye ilustraciones. La extracción de portada/canto se confirma con el editor: **no hay detección automática de caras ni asignación de una imagen de galería a una cara oculta**.

## Importar fotos de producto

El scraper conserva `imagen_portada`, `imagen_producto` e `imagenes_producto` (máximo ocho URLs originales únicas de la ficha y JSON-LD Product/Book). No descarga archivos ni cambia el ritmo/alcance del rastreo autorizado. `preparar_importacion.py` transmite `cover`, `product_image_url` e `image_gallery` al JSON revisable.

En la revisión de una importación, **Preparar portada y canto 3D** permite elegir foto, mover cuatro esquinas de portada y activar el canto únicamente cuando es visible. Las esquinas se ordenan superior izquierda, superior derecha, inferior derecha e inferior izquierda. El preview muestra cada cara rectificada. Las flechas ajustan la esquina enfocada; `Shift` aumenta el paso.

Para libros importados anteriormente, una administradora puede abrir el inspector desde Lomos y usar **Ajustar portada y canto de esta edición**, pegando otra foto original si hace falta.

La migración `20260913040421_seed_asistente_del_villano_visual.sql` deja preparada una primera edición de prueba para **Asistente del villano (edición especial limitada)** (ISBN `9791388108112`). Usa la fotografía de producto importada y las esquinas que delimitan la portada y el canto pintado visible. Es una semilla puntual del catálogo, no una suposición que se aplique a todos los libros.

La misma foto tiene un recorte público de respaldo en `resolveBookVisual`: funciona en la ficha y en ambos puntos de entrada al inspector antes de activar la semilla opcional. Solo se aplica al ISBN `9791388108112` y a las URLs verificadas de esa fotografía (`s5`/`s7`); usa la versión `s7` de 552 px publicada en el srcset original. La portada y el canto se rectifican por separado y no incluyen el fondo blanco. Un recorte guardado en la edición tiene prioridad, incluso si desactiva el canto. Cambiar de ISBN o de fotografía no reutiliza estas coordenadas. No se modifica la base de datos para activar este respaldo.

El inspector identifica la edición mostrada por ISBN/principal y permite ver otras ediciones sin modificar el estado de lectura ni la edición del registro de biblioteca. No se reutiliza automáticamente el canto de una edición especial para otra edición.

## Datos y permisos

`public.book_edition_visuals` tiene una fila por `book_editions.id`, con URL original, galería y coordenadas normalizadas. No se guarda otra copia de las fotos en Storage ni datos privados de la biblioteca. Las texturas se rectifican con transformaciones proyectivas CSS sin canvas ni un proxy que descargue URLs arbitrarias; no necesitan leer píxeles ni permisos CORS. Solo la paleta de color opcional usa un canvas reducido con carga CORS anónima, sin credenciales y con respaldo seguro.

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
