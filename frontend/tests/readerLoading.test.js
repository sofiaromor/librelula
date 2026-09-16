import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/ReaderPage.jsx", import.meta.url), "utf8");
const engines = await readFile(new URL("../src/lib/readerEngines.js", import.meta.url), "utf8");
const readerApiSource = await readFile(new URL("../src/lib/readerApi.js", import.meta.url), "utf8");
const catalogApiSource = await readFile(new URL("../src/lib/catalogApi.js", import.meta.url), "utf8");
const activityMetadataSource = await readFile(new URL("../src/lib/readerActivityMetadata.js", import.meta.url), "utf8");
const chapterNavigationSource = await readFile(new URL("../src/lib/readerChapterNavigation.js", import.meta.url), "utf8");
const homeSource = await readFile(new URL("../src/Inicio.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/ReaderPage.css", import.meta.url), "utf8");

test("carga ePub y PDF bajo demanda y no en el chunk común del lector", () => {
  assert.doesNotMatch(source, /^import ePub from "epubjs";$/m);
  assert.doesNotMatch(source, /from "pdfjs-dist"/);
  assert.match(engines, /import\("epubjs"\)/);
  assert.match(engines, /import\("pdfjs-dist"\)/);
  assert.match(source, /book\.ready/);
  assert.match(source, /book\.locations\.generate\(1600\)/);
});

test("carga posición y anotaciones por separado", () => {
  assert.match(readerApiSource, /export async function getReaderBookProgress/);
  assert.match(readerApiSource, /export async function getReaderBookAnnotations/);
  assert.match(source, /getReaderBookProgress\(bookId\)/);
  assert.match(source, /void getReaderBookAnnotations\(bookId\)/);
  assert.doesNotMatch(source, /getReaderBookState\(bookId\)/);
});

test("reutiliza el contexto validado al guardar el progreso", () => {
  assert.match(readerApiSource, /READER_CONTEXT_CACHE_TTL_MS/);
  assert.match(readerApiSource, /supabase\.auth\.getSession/);
  assert.match(readerApiSource, /legacyUserId: context\.legacyId/);
  assert.match(catalogApiSource, /providedLegacyUserId/);
});

test("muestra la primera página antes de generar el mapa ePub", () => {
  const readyIndex = source.indexOf("book.ready");
  const displayIndex = source.indexOf("rendition.display(cfi)", readyIndex);
  const scheduleIndex = source.indexOf("scheduleLocations();", displayIndex);

  assert.ok(readyIndex >= 0);
  assert.ok(displayIndex > readyIndex);
  assert.ok(scheduleIndex > displayIndex);
  assert.match(source, /locationTimer = window\.setTimeout/);
});

test("no bloquea la primera página esperando la navegación", () => {
  const readyIndex = source.indexOf("book.ready");
  const displayIndex = source.indexOf("rendition.display(cfi)", readyIndex);
  const navigationIndex = source.indexOf("book.loaded.navigation", displayIndex);

  assert.ok(navigationIndex > displayIndex);
  assert.match(source, /withStartupTimeout\(\s*book\.ready/);
  assert.match(source, /EPUB_STARTUP_TIMEOUT_MS = 10_000/);
});

test("el progreso manual no bloquea el arranque del lector", () => {
  const readerDataIndex = source.indexOf("const readerDataRequest = Promise.all([");
  const readerDataEnd = source.indexOf("]);", readerDataIndex);
  const catalogIndex = source.indexOf("const catalogProgressRequest", readerDataEnd);

  assert.ok(readerDataIndex >= 0);
  assert.ok(readerDataEnd > readerDataIndex);
  assert.ok(catalogIndex > readerDataEnd);
  assert.match(source, /CATALOG_PROGRESS_TIMEOUT_MS = 3_000/);
  assert.match(source, /Promise\.race\(\[catalogProgressRequest, catalogProgressFallback\]\)/);
  assert.match(source, /let catalogProgressTimedOut = false/);
  assert.match(source, /void catalogProgressRequest\.then/);
  assert.match(source, /const readerRenderKey/);
  assert.doesNotMatch(source, /Boolean\\(sourceUrl\\) && !catalogProgressReady/);
  assert.match(source, /TextLayer: PdfTextLayer/);
  assert.match(source, /new TextLayerConstructor/);
});

test("la carga inicial del lector tiene un límite visible", () => {
  assert.match(source, /READER_DATA_TIMEOUT_MS = 12_000/);
  assert.match(source, /const readerDataFallback = new Promise/);
  assert.match(source, /Promise\.race\(\[readerDataRequest, readerDataFallback\]\)/);
  assert.match(source, /setCatalogProgressReady\(true\)/);
});

test("protege el progreso manual hasta que la posición del archivo es autoritativa", () => {
  assert.match(source, /getCatalogUserBooks\(\{ bookId \}\)/);
  assert.match(source, /const manualProgress = catalogReading/);
  assert.match(source, /resolveReaderSessionProgress/);
  assert.match(source, /manualProgressAppliedRef/);
  assert.match(source, /documentProgressIsAuthoritative/);
  assert.match(source, /userNavigationOccurredRef/);
  assert.match(source, /isReaderDocumentProgressAuthoritative/);
});

test("reconstruye el EPUB solo cuando cambia la fuente o el modo y conserva el progreso", () => {
  assert.match(source, /const callbackRef = useRef\(\{ onChapterChange, onProgress, onQuoteSelected, onTapNavigate, onUserNavigation, onReaderActivity \}\)/);
  assert.match(source, /callbackRef\.current\.onProgress\?\./);
  assert.match(source, /callbackRef\.current\.onQuoteSelected\?\./);
  assert.match(source, /const readerRenderKey = `\$\{sourceKey\}:\$\{readingMode\}`;/);
  assert.match(source, /getProgress\?\.\(\{ ensureLocations: false \}\)/);
  assert.match(source, /setReaderSessionProgress\(sessionSnapshot\)/);
  assert.match(source, /initialProgress\?\.locator\?\.cfi/);
});

test("el progreso tardío no desmonta el motor ni pisa una posición precisa", () => {
  assert.match(source, /const readerRenderKey = `\$\{sourceKey\}:\$\{readingMode\}`;/);
  assert.match(source, /goToProgress/);
  assert.match(source, /getProgress/);
  assert.match(source, /const manualNavigationKeyRef = useRef/);
  assert.match(source, /liveSnapshot\?\.progressIsPrecise/);
  assert.match(source, /liveProgress >= manualProgress/);
  assert.doesNotMatch(source, /catalogProgressSettled/);
});

test("valida y abre el EPUB desde los bytes descargados", () => {
  assert.match(source, /EPUB_SOURCE_FETCH_TIMEOUT_MS = 8_000/);
  assert.match(source, /const fetchEpubSource = async/);
  assert.match(source, /response\.arrayBuffer\(\)/);
  assert.match(source, /new Uint8Array\(buffer\)/);
  assert.match(source, /ePub\(sourceBuffer\)/);
});

test("no sincroniza un porcentaje provisional con la biblioteca", () => {
  assert.match(source, /progressIsPrecise: false/);
  assert.match(source, /documentProgressIsAuthoritative \? pending\.progress : null/);
  assert.match(source, /manualProgressAppliedRef\.current/);
  assert.doesNotMatch(source, /lateCatalogProgressRef/);
});


test("ofrece pantalla completa y navegación por zonas con un toque", () => {
  assert.match(source, /requestFullscreen/);
  assert.match(source, /fullscreenchange/);
  assert.match(source, /onTapNavigate/);
  assert.match(source, /handleReaderSurfaceClick/);
  assert.match(source, /touchstart/);
  assert.match(source, /touchend/);
  assert.match(source, /changedTouches/);
  assert.match(source, /pointerup/);
  assert.match(source, /readerTouchAction/);
  assert.match(source, /readingModeRef\.current === READER_FLOW_MODES\.CASCADE/);
  assert.match(source, /selectedFormat === "epub" && readingMode === READER_FLOW_MODES\.CASCADE/);
  assert.match(source, /fraction <= 0\.32/);
  assert.match(source, /fraction >= 0\.68/);
  assert.match(source, /tapIgnoreUntilRef/);
  assert.match(source, /reader-immersive-back-button/);
  assert.match(source, /onClick=\{handleBack\}/);
  assert.match(source, /reader-immersive-heading/);
  assert.match(styles, /\.reader-page\.is-reader-immersive/);
  assert.match(styles, /body\.reader-immersive-active \.mobile-reader-dock/);
  assert.match(styles, /prefers-reduced-motion/);
});


test("actualiza el progreso ePub aunque locations tarde y ofrece guardado manual", () => {
  assert.match(source, /function readerEpubProgressFromLocation/);
  assert.match(source, /displayed\?\.page/);
  assert.match(chapterNavigationSource, /spineItems/);
  assert.match(source, /const currentLocation = rendition\.currentLocation\?\.\(\)/);
  assert.match(source, /relocatedHandlerRef\.current\?\.\(currentLocation\)/);
  assert.match(source, /READER_SAVE_MODES\.MANUAL/);
  assert.match(source, /shouldAutoSaveReaderProgress/);
  assert.match(source, /pendingPageTurns: pendingAutoSaveTurnsRef\.current/);
  assert.match(source, /progressIsPrecise/);
  assert.match(source, /getProgress: async/);
  assert.match(source, /libraryProgress: documentProgressIsAuthoritative \? pending\.progress : null/);
  assert.match(source, /setCatalogReading\(result\.libraryItem\)/);
  assert.match(source, /Guardar posición ahora/);
  assert.match(source, /Auto · 5 pág\./);
  assert.match(source, /selectionchange/);
  assert.match(source, /onPointerUp={captureSelection}/);
  assert.match(source, /pendingSelection/);
  assert.match(source, /Marcar selección/);
  assert.doesNotMatch(source, /openNewAnnotation\(\{\s*quote: selection\.quote/);
  assert.doesNotMatch(source, /scrolled-continuous/);
  assert.match(source, /flow: isCascade \? "scrolled-doc" : "paginated"/);
  assert.match(source, /manager: "default"/);
  assert.match(source, /configureEpubRendering/);
  assert.match(source, /nextChapter/);
  assert.match(source, /reader-cascade-boundary/);
  assert.match(source, /Has llegado al final del capítulo/);
  assert.match(source, /Leer siguiente capítulo/);
  assert.match(source, /onClick=\{\(\) => callbackRef\.current\.onTapNavigate\?\.\("nextChapter"\)\}/);
  assert.doesNotMatch(source, /READER_CASCADE_HOLD_MS/);
  assert.doesNotMatch(source, /holdReady/);
  assert.match(source, /scrollCascadeByPage/);
  assert.doesNotMatch(source, /updateAxis\?\.\(/);
  assert.match(source, /readerEpubLocationsLength\(book\?\.locations\) > 0/);
  assert.match(source, /book\.locations\.generate\(1600\)/);
  assert.match(source, /book\.locations\.load\(cachedLocations\)/);
  assert.match(source, /book\.locations\.save\(\)/);
  assert.match(source, /turnEpubPage\("next"\)/);
  assert.match(source, /scrollBehavior/);
  assert.match(source, /overflowY = isCascade \? "auto" : "hidden"/);
  assert.doesNotMatch(source, /flowChangeIdRef/);
  assert.doesNotMatch(source, /rendition\.display\(preservedCfi\)/);
  assert.match(source, /readingMode/);
  assert.match(source, /readerTheme/);
  assert.match(source, /reader-base/);
  assert.match(source, /themes\?\.override/);
  assert.match(source, /formatReaderClock/);
  assert.match(source, /reader-reading-statusbar/);
  assert.match(source, /chapterProgress/);
  assert.match(source, /chapterIndex/);
  assert.match(source, /chapterCount/);
  assert.match(source, /READER_ACTIVITY_IDLE_TIMEOUT_MS = 5 \* 60_000/);
  assert.match(source, /recordProgressActivity/);
  assert.match(source, /recordReadingProgress\(\{/);
  assert.match(source, /totalPages: book\?\.pages/);
  assert.match(source, /previousProgress/);
  assert.match(source, /newProgress: nextProgress/);
  assert.match(source, /onReaderActivity/);
  assert.match(homeSource, /Avance \{item\.previous_progress\}% → \{item\.progress\}%/);
  assert.match(homeSource, /Actualizó su progreso\./);
  assert.doesNotMatch(source, /progressTimerRef\.current = window\.setTimeout/);
  assert.match(styles, /-webkit-user-select: text/);
  assert.match(styles, /touch-action: auto/);
  assert.match(styles, /reader-page\.is-reader-dark/);
  assert.match(styles, /reader-page\.is-reader-cascade/);
  assert.match(styles, /reader-reading-statusbar/);
  assert.match(styles, /reader-page\.is-reader-immersive \.reader-reading-statusbar/);
  assert.match(styles, /reader-cascade-boundary/);
  assert.match(styles, /reader-selection-actions/);
  assert.match(styles, /flex-wrap: wrap/);
});

test("las anotaciones conservan color y título configurable en Actividad", () => {
  assert.match(source, /READER_ACTIVITY_TITLE_OPTIONS/);
  assert.match(source, /Título personalizado/);
  assert.match(source, /customActivityTitle/);
  assert.match(source, /annotationComposer\.share/);
  assert.match(source, /activityTitle/);
  assert.match(readerApiSource, /normalizeReaderActivityTitle\(activityTitle, ""\)/);
  assert.match(readerApiSource, /activityTitle: cleanActivityTitle/);
  assert.match(activityMetadataSource, /encodeReaderActivityBody/);
  assert.match(activityMetadataSource, /parseReaderActivityBody/);
  assert.match(styles, /--annotation-accent/);
  assert.match(styles, /reader-activity-title-fields/);
});
