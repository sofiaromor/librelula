# Cantos pintados: detección y aplicación por edición

## Resultado de esta revisión (2026-09-13)

La búsqueda de metadatos del catálogo aprobado, hecha en modo lectura, devolvió 117 registros amplios (incluye duplicados obra/edición y falsos positivos) y 30 ISBN distintos con menciones explícitas de cantos especiales. Se revisaron también las fotografías de ediciones especiales aunque sus títulos no mencionasen el canto. Estos números no significan que todos los candidatos tengan cantos confirmados.

**41 ISBN tienen ahora un recorte individual de portada y canto delantero visible**, incluido Asistente del villano. La activación ocurre en el frontend de la rama de preview, sin escrituras en la base de datos, reimportaciones ni migraciones en producción. No se ha fusionado main.

El registro está en `frontend/src/lib/paintedEdgePresets.js`. Cada recorte usa sus propias coordenadas y la fotografía original de 552 px de ancho. Se comprobaron visualmente las caras y se compararon las variantes s5/s7 a igual tamaño; no se infieren coordenadas por el aspecto de otro libro. Las fotos públicas pueden cambiar: si cambia su composición, hay que revisar/eliminar el preset.

## Detección y revisión

El scraper y el preparador conservan `painted_edges` con estado, motivo y evidencia breve. El importador recalcula esta información al editar; no confía en un booleano procedente del JSON. Los casos de prueba se comparten entre Python y JavaScript.

- `explicit`: el título o etiqueta de esta edición indica cantos pintados/tintados/decorados/metalizados/teñidos, o términos ingleses como sprayed/stencilled/gilded edges.
- `review`: mención únicamente en sinopsis, primera tirada/stock, dibujo provisional, ISBN ausente/incorrecto o portada de otro ISBN.
- `possible`: edición especial/limitada/coleccionista sin prueba del canto.
- `excluded`: estuche/cofre con varios libros. No tratarlo como un único volumen.
- `none`: no hay señal. Se evitan coincidencias como «encanto», el canto de aves y negaciones («sin cantos pintados»).

**Ninguno de estos estados habilita una textura por sí mismo.** Hace falta una foto visible y un recorte verificado. El importador ofrece «Revisar posibles cantos» y «Revisar foto del canto», abre el editor bajo demanda y mantiene la selección explícita. Seleccionar todos con el filtro activo solo selecciona candidatos nuevos visibles. Cambiar ISBN o foto borra los recortes anteriores.

Los nuevos JSON pueden llevar originales/galerías sin esquinas. Un preset solo se prepara automáticamente si ISBN y foto coinciden exactamente. Un recorte guardado tiene prioridad, incluso si desactiva deliberadamente el canto. Las ediciones desconocidas y fotos personalizadas no heredan coordenadas de otra edición. En el inspector se muestran avisos solo a administradoras, sin reutilizar la sinopsis de la obra para otra edición seleccionada.

## Ediciones con recorte aplicado

| ISBN | Edición | Fuentes públicas |
| --- | --- | --- |
| 9788401034367 | Oscura (El Bosque Voraz, #2) | [Foto original](https://imagessl7.casadellibro.com/a/l/s7/67/9788401034367.webp) |
| 9788401038280 | Anatema (Primera edición limitada) (El Bosque Voraz, #1) | [Foto original](https://imagessl0.casadellibro.com/a/l/s7/80/9788401038280.webp) · [Ficha](https://www.casadellibro.com/libro-anatema-el-bosque-voraz-1/9788401038280/17031866) |
| 9788408285298 | Una corte de rosas y espinas. Edición especial | [Foto original](https://imagessl8.casadellibro.com/a/l/s7/98/9788408285298.webp) · [Ficha](https://www.casadellibro.com/libro-una-corte-de-rosas-y-espinas-edicion-especial/9788408285298/14508004) |
| 9788408290964 | Una corte de niebla y furia. Edición especial | [Foto original](https://imagessl4.casadellibro.com/a/l/s7/64/9788408290964.webp) · [Ficha](https://www.casadellibro.com/libro-una-corte-de-niebla-y-furia-ed-especial/9788408290964/16157758) |
| 9788408292678 | Una corte de alas y ruina | [Foto original](https://imagessl8.casadellibro.com/a/l/s7/78/9788408292678.webp) · [Ficha](https://www.casadellibro.com/libro-una-corte-de-alas-y-ruina-edicion-especial/9788408292678/16299633) |
| 9788408304012 | Una corte de llamas plateadas. Edición especial | [Foto original](https://imagessl2.casadellibro.com/a/l/s7/12/9788408304012.webp) · [Ficha](https://www.casadellibro.com/libro-una-corte-de-llamas-plateadas-edicion-especial/9788408304012/16834014) |
| 9788408310129 | Alas de ónix -Edición coleccionista enriquecida y limitada  (Empíreo, #3) | [Foto original](https://imagessl9.casadellibro.com/a/l/s7/29/9788408310129.webp) · [Ficha](https://www.casadellibro.com/libro-alas-de-onix-empireo-3-edicion-coleccionista-enriquecida-y-limitada/9788408310129/17108870) |
| 9788408322108 | Odisea. Edición limitada con cantos decorados | [Foto original](https://imagessl8.casadellibro.com/a/l/s7/08/9788408322108.webp) · [Ficha](https://www.casadellibro.com/libro-odisea-edicion-limitada-con-cantos-decorados/9788408322108/18067380) |
| 9788408324294 | El despertar. Edición especial (Zodiac Academy, #1) | [Foto original](https://imagessl4.casadellibro.com/a/l/s7/94/9788408324294.webp) · [Ficha](https://www.casadellibro.com/libro-zodiac-academy-1-el-despertar-edicion-especial/9788408324294/18275243) |
| 9788408324706 | Rey de la gula. Edición Especial (Pecados, #6) | [Foto original](https://imagessl6.casadellibro.com/a/l/s7/06/9788408324706.webp) · [Ficha](https://www.casadellibro.com/libro-pecados-6-rey-de-la-gula-edicion-especial/9788408324706/18312159) |
| 9788408326472 | Alas de Hierro. Edición especial limitada con cantos decorados | [Foto original](https://imagessl2.casadellibro.com/a/l/s7/72/9788408326472.webp) · [Ficha](https://www.casadellibro.com/libro-alas-de-hierro-edicion-especial-limitada-con-cantos-decorados/9788408326472/18312185) |
| 9788408326632 | Hasta que nos quedemos sin estrellas (edición especial) | [Foto original](https://imagessl2.casadellibro.com/a/l/s7/32/9788408326632.webp) |
| 9788408327271 | Lazos de fuego (Academia Bloodwing 2) Edición especial con cantos tintados (Academia Bloodwing, #2) | [Foto original](https://imagessl1.casadellibro.com/a/l/s7/71/9788408327271.webp) · [Ficha](https://www.casadellibro.com/libro-lazos-de-fuego-academia-bloodwing-2-edicion-especial-con-cantos-tintados/9788408327271/18312220) |
| 9788410163621 | Trono de cristal | [Foto original](https://imagessl1.casadellibro.com/a/l/s7/21/9788410163621.webp) · [Ficha](https://www.casadellibro.com/libro-trono-de-cristal-edicion-especial-limitada/9788410163621/16175577) |
| 9788410163638 | Corona de medianoche (edición especial limitada) | [Foto original](https://imagessl8.casadellibro.com/a/l/s7/38/9788410163638.webp) · [Ficha](https://www.casadellibro.com/libro-corona-de-medianoche-edicion-limitada/9788410163638/16175580) |
| 9788410163645 | Heredera de fuego | [Foto original](https://imagessl5.casadellibro.com/a/l/s7/45/9788410163645.webp) · [Ficha](https://www.casadellibro.com/libro-heredera-de-fuego-edicion-limitada/9788410163645/16175579) |
| 9788410163652 | La espada de la asesina | [Foto original](https://imagessl2.casadellibro.com/a/l/s7/52/9788410163652.webp) · [Ficha](https://www.casadellibro.com/libro-la-espada-de-la-asesina-edicion-limitada/9788410163652/16175578) |
| 9788410163669 | Reina de sombras | [Foto original](https://imagessl9.casadellibro.com/a/l/s7/69/9788410163669.webp) · [Ficha](https://www.casadellibro.com/libro-reina-de-sombras--edicion-limitada/9788410163669/16643390) |
| 9788410163676 | Imperio de tormentas | [Foto original](https://imagessl6.casadellibro.com/a/l/s7/76/9788410163676.webp) · [Ficha](https://www.casadellibro.com/libro-imperio-de-tormentas-edicion-limitada/9788410163676/16643389) |
| 9788410163683 | Torre del Alba (Edición Limitada) | [Foto original](https://imagessl3.casadellibro.com/a/l/s7/83/9788410163683.webp) · [Ficha](https://www.casadellibro.com/libro-torre-del-alba-edicion-limitada/9788410163683/16643387) |
| 9788410163690 | Reino de Cenizas (edición especial limitada) | [Foto original](https://imagessl0.casadellibro.com/a/l/s7/90/9788410163690.webp) · [Ficha](https://www.casadellibro.com/libro-reino-de-cenizas-edicion-especial-limitada/9788410163690/16643386) |
| 9788410190108 | Casa de tierra y sangre (edición especial limitada) (Ciudad Medialuna, #1) | [Foto original](https://imagessl8.casadellibro.com/a/l/s7/08/9788410190108.webp) · [Ficha](https://www.casadellibro.com/libro-casa-de-tierra-y-sangre-ciudad-medialuna-1-edicion-especial/9788410190108/15952221) |
| 9788410190443 | Casa de cielo y aliento (edición especial limitada) (Ciudad Medialuna, #2) | [Foto original](https://imagessl3.casadellibro.com/a/l/s7/43/9788410190443.webp) · [Ficha](https://www.casadellibro.com/libro-casa-de-cielo-y-aliento-edicion-especial-limitada-ciudad-media-luna-2/9788410190443/15986275) |
| 9788410190603 | Casa de llama y sombra (edición especial limitada) (Ciudad Medialuna, #3) | [Foto original](https://imagessl3.casadellibro.com/a/l/s7/03/9788410190603.webp) · [Ficha](https://www.casadellibro.com/libro-casa-de-llama-y-sombra-edicion-especial-limitada-ciudad-medialuna-3/9788410190603/16226043) |
| 9788410425569 | El rey eterno (edición especial limitada con cantos pintados) | [Foto original](https://imagessl9.casadellibro.com/a/l/s7/69/9788410425569.webp) · [Ficha](https://www.casadellibro.com/libro-el-rey-eterno-edicion-especial-limitada-con-cantos-pintados-los-mares-eternos-i/9788410425569/17627531) |
| 9788410425811 | Objetivo: tú y yo (Off Campus 2) - Edición especial en tapa dura con cantos pintados | [Foto original](https://imagessl1.casadellibro.com/a/l/s7/11/9788410425811.webp) · [Ficha](https://www.casadellibro.com/libro-objetivo-tu-y-yo-off-campus-2---edicion-especial-en-tapa-dura-con-cantos-pintados/9788410425811/18269901) |
| 9788410648371 | El ingenioso hidalgo don Quijote de la Mancha (edición con cantos tintados) | [Foto original](https://imagessl1.casadellibro.com/a/l/s7/71/9788410648371.webp) · [Ficha](https://www.casadellibro.com/libro-el-ingenioso-hidalgo-don-quijote-de-la-mancha-edicion-con-cantos-tintados/9788410648371/18314716) |
| 9788418431227 | The Raven Scholar (edición especial limitada en tapa dura con cantos pintados) | [Foto original](https://imagessl7.casadellibro.com/a/l/s7/27/9788418431227.webp) · [Ficha](https://www.casadellibro.com/libro-the-raven-scholar-edicion-especial-limitada-en-tapa-dura-con-can-tos-pintados/9788418431227/17923332) |
| 9788427257627 | La sexta facción 1 - La sexta facción (edición especial limitada con cantos tintados) (La sexta facción, #1) | [Foto original](https://imagessl7.casadellibro.com/a/l/s7/27/9788427257627.webp) |
| 9788427257702 | Los Juegos del Hambre 5 - Amanecer en la cosecha (Los Juegos del Hambre, #5) | [Foto original](https://imagessl2.casadellibro.com/a/l/s7/02/9788427257702.webp) |
| 9788427257757 | Divergente 1 - Divergente (edición especial) (Divergente, #1) | [Foto original](https://imagessl7.casadellibro.com/a/l/s7/57/9788427257757.webp) |
| 9788445017210 | El hobbit. | [Foto original](https://imagessl0.casadellibro.com/a/l/s7/10/9788445017210.webp) |
| 9788467079517 | Y no quedó ninguno (Edición especial cantos tintados) | [Foto original](https://imagessl7.casadellibro.com/a/l/s7/17/9788467079517.webp) · [Ficha](https://www.casadellibro.com/libro-y-no-quedo-ninguno-edicion-especial-cantos-tintados/9788467079517/17422425) |
| 9788491058090 | Odisea (Edición limitada con cantos tintados) | [Foto original](https://imagessl0.casadellibro.com/a/l/s7/90/9788491058090.webp) · [Ficha](https://www.casadellibro.com/libro-odisea-edicion-limitada-con-cantos-tintados/9788491058090/17908837) |
| 9791387711269 | Cazaestrellas (EDICIÓN ESPECIAL LIMITADA) | [Foto original](https://imagessl9.casadellibro.com/a/l/s7/69/9791387711269.webp) |
| 9791387711443 | El príncipe cruel (Edición especial limitada) | [Foto original](https://imagessl3.casadellibro.com/a/l/s7/43/9791387711443.webp) · [Ficha](https://www.casadellibro.com/libro-el-principe-cruel-edicion-especial-limitada/9791387711443/17114033) |
| 9791387711818 | De sangre y fuego (edición cantos tintados) | [Foto original](https://imagessl8.casadellibro.com/a/l/s7/18/9791387711818.webp) · [Ficha](https://www.casadellibro.com/libro-de-sangre-y-fuego/9791387711818/17907094) |
| 9791387711894 | En este reino soy inmortal (EDICIÓN ESPECIAL LIMITADA) | [Foto original](https://imagessl4.casadellibro.com/a/l/s7/94/9791387711894.webp) |
| 9791387788698 | Crimen en la pensión de las flores (Los secretos de Cinnamon Falls, #2) | [Foto original](https://imagessl8.casadellibro.com/a/l/s7/98/9791387788698.webp) |
| 9791387871185 | Proyecto Hail Mary (edición especial limitada) | [Foto original](https://imagessl5.casadellibro.com/a/l/s7/85/9791387871185.webp) · [Ficha](https://www.casadellibro.com/libro-proyecto-hail-mary-edicion-especial-limitada/9791387871185/17910328) |
| 9791388108112 | Asistente del villano (edición especial limitada) | [Foto original](https://imagessl2.casadellibro.com/a/l/s7/12/9791388108112.webp) |

## Menciones explícitas aún pendientes

| ISBN | Libro | Motivo |
| --- | --- | --- |
| 9786073901802 | Alas de sangre (Empíreo, #1) | Primera tirada no garantizada; portada plana, sin fotografía verificable del canto. |
| 9788427248427 | Amanecer en la cosecha (Los Juegos del Hambre, #5) | Portada plana; la mención en la sinopsis no confirma esta edición. |
| 9788445021927 | El espacio entre nosotros | Portada personalizada; no se sustituye ni se aplican coordenadas de otra fotografía. |
| 9788408322610 | Estuche Ilíada & Odisea. Edición limitada con cantos decorados | Estuche de varios volúmenes. Preparar cada libro por separado. |
| 9788401035623 | Hasta que caiga la luna (La caída lunar, #1) | La portada pertenece a otro ISBN (9788401037498); además hay condición de primera tirada. |
| 9788410644724 | La casa de la bestia (Edición especial limitada en tapa dura y con cantos tintados) | La foto muestra el canto superior pero no el delantero completo. No inventar el dibujo lateral. |
| 9788427258754 | La correspondencia privada: Un libro de Rojo, blanco y sangre azul | Imagen de marcador «defecto1», sin fotografía utilizable. |
| 9788445021637 | La sombra de los dioses | La portada pertenece a otro ISBN (9788445012352). |
| 9791387871642 | Los Juegos del Hambre 5 - Amanecer en la cosecha (edición película) (Los Juegos del Hambre, #5) | Edición película con portada plana; comprobar que la sinopsis no proviene de otra edición. |
| 9791388108389 | Saciar a la bestia | El dibujo se ve, pero el original publicado contiene una miniatura ampliada y pixelada. Buscar una fuente mejor. |

También quedan pendientes las ediciones especiales cuya foto no muestra el canto. **El bribón y la luna** (9791387711573) y **Unidos por la sangre** (9791388204098) muestran «diseño de canto provisional» en la foto: se excluyen de los presets hasta tener el diseño definitivo. «Edición especial» no equivale a «canto pintado».

## Lo que se conserva

El modo 2D sigue mostrando la portada original, sin rectificación. Lomos permanece estático. El lomo y la contraportada generados usan el color predominante de la portada; no se presentan como fotos reales. Las caras superior/inferior continúan el dibujo del canto de forma **aproximada**, no como extracción de caras ocultas. Si falta una foto verificada, permanece el papel neutro con orientación correcta.

## Verificación y siguiente revisión

```sh
cd frontend
node --test tests/book3dGeometry.test.js tests/book3dIntegration.test.js tests/book3dPalette.test.js tests/librarySpineMedia.test.js tests/paintedEdges.test.js
cd ..
python -m unittest discover -s tools/scraping_libros/tests
```

Para añadir otro ISBN: obtener la fotografía publicada de esa edición, comprobar que el lateral es el canto de páginas (no el lomo), verificar resolución/composición y ausencia de marcas provisionales, delimitar cada cara y ejecutar las pruebas. No repetir coordenadas de otro ISBN por tener una maqueta parecida. Alternativamente, una administradora puede guardar las esquinas en el editor cuando esté autorizada y activada la migración opcional de texturas.

La validación geométrica y las pruebas de integración de código no sustituyen la QA táctil/visual en navegador móvil. La publicación de la rama proporciona el preview para esa comprobación; no modifica producción.

