import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ePub from "epubjs";
import { getDocument, GlobalWorkerOptions, TextLayer } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import "./ReaderPage.css";
import { publicUrl } from "./api.js";
import { recordReadingProgress } from "./lib/homeDashboardApi.js";
import {
  createReaderAnnotation,
  deleteReaderAnnotation,
  getReaderBookAssets,
  getReaderBookState,
  getReaderDocuments,
  saveReaderBookProgress,
  uploadReaderDocument,
} from "./lib/readerApi.js";
import {
  clampReaderProgress,
  readerFileFormat,
  readerProgressFromEpub,
  readerProgressFromPdf,
  readerProgressFromPdfPosition,
  readerPdfResumeLocation,
} from "./lib/readerUtils.js";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const NOTE_COLORS = [
  ["yellow", "Amarillo"],
  ["pink", "Rosa"],
  ["blue", "Azul"],
  ["green", "Verde"],
  ["lilac", "Lila"],
];

const PDF_READING_MODES = {
  CASCADE: "cascade",
  PAGED: "paged",
};

const READER_ACTIVITY_IDLE_TIMEOUT_MS = 5 * 60_000;
const PDF_CASCADE_RENDER_MARGIN_PX = 1400;
const PDF_CASCADE_READING_LINE = 0.36;

function ReaderIcon({ name }) {
  const paths = {
    back: <path d="m15 5-7 7 7 7M8 12h12" />,
    cascade: <><path d="M5 4h14v6H5zM5 14h14v6H5z" /><path d="m9 12 3 2 3-2" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    fullscreen: <><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4" /></>,
    fullscreenExit: <><path d="M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5" /></>,
    menu: <><path d="M5 6h14M5 12h14M5 18h14" /></>,
    next: <path d="m9 5 7 7-7 7M16 12H4" />,
    prev: <path d="m15 5-7 7 7 7M8 12h12" />,
    note: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    pages: <><path d="M7 4h10v16H7z" /><path d="M4 7v10M20 7v10" /></>,
    upload: <><path d="M12 16V5M8 9l4-4 4 4" /><path d="M5 15v4h14v-4" /></>,
    zoomIn: <><circle cx="10.8" cy="10.8" r="5.8" /><path d="m15.2 15.2 4 4M10.8 8v5.6M8 10.8h5.6" /></>,
    zoomOut: <><circle cx="10.8" cy="10.8" r="5.8" /><path d="m15.2 15.2 4 4M8 10.8h5.6" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.note}
    </svg>
  );
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLabel(format) {
  return format === "pdf" ? "PDF" : "ePub";
}

function ReaderLoading({ text = "Abriendo tu lectura…" }) {
  return (
    <div className="reader-loading" role="status">
      <span className="reader-loading-mark" aria-hidden="true">✦</span>
      <strong>{text}</strong>
      <small>Estamos guardando tu lugar entre las páginas.</small>
    </div>
  );
}

function EpubReader({ sourceUrl, initialProgress, textScale, onProgress, onQuoteSelected, controlsRef, onChapterChange }) {
  const containerRef = useRef(null);
  const bookRef = useRef(null);
  const renditionRef = useRef(null);
  const initialCfiRef = useRef(initialProgress?.locator?.cfi || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toc, setToc] = useState([]);
  const [tocOpen, setTocOpen] = useState(false);

  useEffect(() => {
    if (!sourceUrl || !containerRef.current) return undefined;

    let cancelled = false;
    let book = null;
    let rendition = null;
    setLoading(true);
    setError("");
    setToc([]);

    try {
      book = ePub(sourceUrl);
      bookRef.current = book;
      rendition = book.renderTo(containerRef.current, {
        width: "100%",
        height: "100%",
        spread: "none",
        flow: "paginated",
      });
      renditionRef.current = rendition;

      const handleRelocated = (location) => {
        if (cancelled || !location?.start) return;
        const cfi = location.start.cfi || "";
        const percentage = book.locations?.length
          ? book.locations.percentageFromCfi(cfi)
          : Number(location.start.percentage || 0);
        const chapter = location.start.href?.split("#")[0]?.split("/").pop() || "Lectura";
        onChapterChange?.(chapter);
        onProgress?.({
          progress: readerProgressFromEpub(percentage),
          locator: { cfi },
          currentPage: null,
          currentChapter: chapter,
        });
      };

      rendition.on("relocated", handleRelocated);
      rendition.on("selected", (cfiRange, contents) => {
        const quote = contents?.window?.getSelection?.()?.toString?.().trim() || "";
        if (quote) {
          onQuoteSelected?.({ quote, locator: { cfi: cfiRange } });
        }
      });

      book.ready
        .then(async () => {
          if (cancelled) return;
          try {
            await book.locations.generate(1600);
          } catch {
            // El lector sigue funcionando aunque no se pueda generar el mapa de posiciones.
          }

          const navigation = await book.loaded.navigation;
          if (!cancelled) {
            setToc(Array.isArray(navigation?.toc) ? navigation.toc : []);
          }

          const cfi = initialCfiRef.current || undefined;
          await rendition.display(cfi);
          if (!cancelled) setLoading(false);
        })
        .catch((loadError) => {
          if (!cancelled) {
            setError(loadError?.message || "No se pudo abrir este ePub.");
            setLoading(false);
          }
        });
    } catch (loadError) {
      const errorMessage = loadError?.message || "No se pudo preparar el lector ePub.";
      window.setTimeout(() => {
        if (!cancelled) {
          setError(errorMessage);
          setLoading(false);
        }
      }, 0);
    }

    if (controlsRef) {
      controlsRef.current = {
        next: () => renditionRef.current?.next(),
        previous: () => renditionRef.current?.prev(),
        goTo: (target) => renditionRef.current?.display(target),
      };
    }

    return () => {
      cancelled = true;
      if (controlsRef) controlsRef.current = null;
      rendition?.destroy?.();
      book?.destroy?.();
      bookRef.current = null;
      renditionRef.current = null;
    };
  }, [controlsRef, onChapterChange, onProgress, onQuoteSelected, sourceUrl]);

  useEffect(() => {
    renditionRef.current?.themes?.fontSize?.(`${textScale}%`);
  }, [textScale]);

  function openTocItem(item) {
    if (!item?.href) return;
    renditionRef.current?.display(item.href);
    setTocOpen(false);
  }

  return (
    <div className="reader-format-stage reader-epub-stage">
      {toc.length > 0 && (
        <div className="reader-toc-wrap">
          <button type="button" className="reader-toc-trigger" onClick={() => setTocOpen((open) => !open)} aria-expanded={tocOpen}>
            <ReaderIcon name="menu" />
            <span>Contenido</span>
          </button>
          {tocOpen && (
            <div className="reader-toc" role="listbox" aria-label="Índice del ePub">
              {toc.map((item, index) => (
                <button type="button" key={`${item.href || "chapter"}-${index}`} onClick={() => openTocItem(item)}>
                  {item.label || `Capítulo ${index + 1}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="reader-epub-viewport" ref={containerRef} aria-label="Contenido del ePub" />
      {loading && <div className="reader-stage-overlay"><ReaderLoading /></div>}
      {error && (
        <div className="reader-stage-overlay">
          <div className="reader-reader-error" role="alert">
            <strong>No se pudo abrir el ePub</strong>
            <p>{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PdfPageSurface({
  pdf,
  pageNumber,
  viewportWidth,
  zoom,
  pageAspectRatio,
  lazy,
  scrollRootRef,
  registerPage,
  onQuoteSelected,
}) {
  const pageRef = useRef(null);
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const [shouldRender, setShouldRender] = useState(!lazy);
  const [rendered, setRendered] = useState(false);
  const [pageError, setPageError] = useState("");
  const targetWidth = Math.max(120, Math.round(viewportWidth * zoom));

  useEffect(() => {
    registerPage?.(pageNumber, pageRef.current);
    return () => registerPage?.(pageNumber, null);
  }, [pageNumber, registerPage]);

  useEffect(() => {
    const element = pageRef.current;
    if (!lazy || !element || typeof IntersectionObserver === "undefined") {
      setShouldRender(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setShouldRender(Boolean(entry?.isIntersecting)),
      {
        root: scrollRootRef?.current || null,
        rootMargin: `${PDF_CASCADE_RENDER_MARGIN_PX}px 0px`,
        threshold: 0,
      },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [lazy, scrollRootRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const pageElement = pageRef.current;
    const textLayerElement = textLayerRef.current;
    if (!pdf || !shouldRender || !canvas || !pageElement || !textLayerElement) {
      setRendered(false);
      return undefined;
    }

    let cancelled = false;
    let page = null;
    let renderTask = null;
    let textLayer = null;
    setRendered(false);
    setPageError("");

    pdf.getPage(pageNumber)
      .then(async (loadedPage) => {
        page = loadedPage;
        if (cancelled || !canvasRef.current || !pageRef.current || !textLayerRef.current) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: targetWidth / baseViewport.width });
        const context = canvas.getContext("2d", { alpha: false });
        const outputScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

        pageElement.style.width = `${Math.ceil(viewport.width)}px`;
        pageElement.style.height = `${Math.ceil(viewport.height)}px`;
        pageElement.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
        pageElement.style.setProperty("--reader-pdf-scale", String(viewport.scale));
        canvas.width = Math.ceil(viewport.width * outputScale);
        canvas.height = Math.ceil(viewport.height * outputScale);
        canvas.style.width = `${Math.ceil(viewport.width)}px`;
        canvas.style.height = `${Math.ceil(viewport.height)}px`;
        textLayerElement.replaceChildren();

        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        const textContent = await page.getTextContent({ includeMarkedContent: true });
        if (cancelled) return;
        textLayer = new TextLayer({
          textContentSource: textContent,
          container: textLayerElement,
          viewport,
        });
        await Promise.all([renderTask.promise, textLayer.render()]);
        if (!cancelled) setRendered(true);
      })
      .catch((renderError) => {
        if (!cancelled && renderError?.name !== "RenderingCancelledException") {
          setPageError("No se pudo cargar esta página.");
        }
      });

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
      textLayer?.cancel?.();
      textLayerElement.replaceChildren();
      canvas.width = 0;
      canvas.height = 0;
      page?.cleanup?.();
    };
  }, [pageNumber, pdf, shouldRender, targetWidth]);

  const captureSelection = useCallback(() => {
    window.setTimeout(() => {
      const selection = window.getSelection?.();
      const anchor = selection?.anchorNode;
      const focus = selection?.focusNode;
      const layer = textLayerRef.current;
      const quote = selection?.toString?.().replace(/\s+/g, " ").trim() || "";
      const belongsToPage = (anchor && layer?.contains(anchor)) || (focus && layer?.contains(focus));

      if (!layer || !quote || !belongsToPage) return;
      onQuoteSelected?.({
        quote,
        locator: { page: pageNumber },
        page: pageNumber,
      });
    }, 80);
  }, [onQuoteSelected, pageNumber]);

  return (
    <article
      ref={pageRef}
      className={`reader-pdf-page${lazy ? " is-cascade-page" : ""}${rendered ? " is-rendered" : " is-placeholder"}`}
      data-page-number={pageNumber}
      style={{ width: `${targetWidth}px`, aspectRatio: String(pageAspectRatio) }}
      aria-label={`Página ${pageNumber}`}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div
        ref={textLayerRef}
        className="reader-pdf-text-layer"
        onPointerUp={captureSelection}
        onTouchEnd={captureSelection}
        aria-label={`Texto seleccionable de la página ${pageNumber}`}
      />
      {!rendered && (
        <div className={`reader-pdf-page-placeholder${pageError ? " is-error" : ""}`} aria-hidden={!pageError}>
          <span>{pageError || `Página ${pageNumber}`}</span>
        </div>
      )}
      <span className="reader-pdf-page-number" aria-hidden="true">{pageNumber}</span>
    </article>
  );
}

function PdfReader({
  sourceUrl,
  initialProgress,
  zoom,
  readingMode,
  onProgress,
  onQuoteSelected,
  controlsRef,
  onPageChange,
  onDocumentInfo,
  onUserAction,
}) {
  const viewportRef = useRef(null);
  const pagesContainerRef = useRef(null);
  const pdfRef = useRef(null);
  const pageElementsRef = useRef(new Map());
  const scrollFrameRef = useRef(null);
  const restoreFrameRef = useRef(null);
  const savedInitialPage = Number(initialProgress?.current_page || initialProgress?.locator?.page || 0);
  const initialPageRef = useRef(savedInitialPage > 0 ? Math.round(savedInitialPage) : 0);
  const initialOffsetRef = useRef(Math.max(0, Math.min(1, Number(initialProgress?.locator?.offset || 0))));
  const initialProgressRef = useRef(initialProgress);
  const lastSnapshotRef = useRef(null);
  const lastReportedRef = useRef({ page: 0, offset: -1, progress: -1 });
  const callbacksRef = useRef({ onProgress, onPageChange, onUserAction });
  const [pdf, setPdf] = useState(null);
  const [pageNumber, setPageNumber] = useState(Math.max(1, savedInitialPage));
  const [totalPages, setTotalPages] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(760);
  const [pageAspectRatio, setPageAspectRatio] = useState(0.707);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isCascade = readingMode === PDF_READING_MODES.CASCADE;

  useEffect(() => {
    callbacksRef.current = { onProgress, onPageChange, onUserAction };
  }, [onProgress, onPageChange, onUserAction]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;

    const updateWidth = () => {
      const width = Math.floor(element.clientWidth - (isCascade ? 16 : 8));
      if (width > 0) setViewportWidth(width);
    };
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isCascade]);

  useEffect(() => {
    if (!sourceUrl) return undefined;

    let cancelled = false;
    const resetTimer = window.setTimeout(() => {
      if (!cancelled) {
        setLoading(true);
        setError("");
        setPdf(null);
      }
    }, 0);
    const loadingTask = getDocument({ url: sourceUrl });

    loadingTask.promise
      .then(async (loadedPdf) => {
        if (cancelled) {
          await loadedPdf.destroy();
          return;
        }

        const firstPage = await loadedPdf.getPage(1);
        const firstViewport = firstPage.getViewport({ scale: 1 });
        if (cancelled) {
          await loadedPdf.destroy();
          return;
        }

        pdfRef.current = loadedPdf;
        const resumeLocation = readerPdfResumeLocation(initialProgressRef.current, loadedPdf.numPages);
        initialPageRef.current = resumeLocation.page;
        initialOffsetRef.current = resumeLocation.offset;
        setPdf(loadedPdf);
        setTotalPages(loadedPdf.numPages);
        setPageAspectRatio(firstViewport.width / firstViewport.height);
        setPageNumber(resumeLocation.page);
        onDocumentInfo?.({ totalPages: loadedPdf.numPages });
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError?.message || "No se pudo abrir este PDF.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(resetTimer);
      void loadingTask.destroy();
      void pdfRef.current?.destroy?.();
      pdfRef.current = null;
    };
  }, [onDocumentInfo, sourceUrl]);

  const registerPage = useCallback((number, element) => {
    if (element) pageElementsRef.current.set(number, element);
    else pageElementsRef.current.delete(number);
  }, []);

  const emitProgress = useCallback((nextPage, nextOffset = 0, force = false) => {
    if (!totalPages) return null;
    const safePage = Math.min(totalPages, Math.max(1, Math.round(Number(nextPage) || 1)));
    const safeOffset = Math.max(0, Math.min(1, Number(nextOffset) || 0));
    const progress = isCascade
      ? readerProgressFromPdfPosition(safePage, totalPages, safeOffset)
      : readerProgressFromPdf(safePage, totalPages);
    const snapshot = {
      progress,
      locator: {
        page: safePage,
        ...(isCascade ? { offset: Number(safeOffset.toFixed(4)) } : {}),
      },
      currentPage: safePage,
      currentChapter: `Página ${safePage} de ${totalPages}`,
      totalPages,
    };
    const previous = lastReportedRef.current;
    const unchanged = previous.page === safePage
      && previous.progress === progress
      && Math.abs(previous.offset - safeOffset) < 0.015;

    lastSnapshotRef.current = snapshot;
    if (unchanged && !force) return snapshot;

    lastReportedRef.current = { page: safePage, offset: safeOffset, progress };
    setPageNumber(safePage);
    callbacksRef.current.onPageChange?.(snapshot.currentChapter);
    callbacksRef.current.onProgress?.(snapshot);
    return snapshot;
  }, [isCascade, totalPages]);

  const measureCascadeProgress = useCallback((force = false) => {
    const viewport = viewportRef.current;
    const pagesContainer = pagesContainerRef.current;
    if (!isCascade || !viewport || !pagesContainer || !totalPages) return lastSnapshotRef.current;

    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const atEnd = maxScroll > 2 && viewport.scrollTop >= maxScroll - 2;
    if (atEnd) return emitProgress(totalPages, 1, force);
    if (maxScroll <= 2 || viewport.scrollTop <= 1 && initialPageRef.current === 1 && !lastSnapshotRef.current) {
      return emitProgress(1, 0, force);
    }

    const readingLine = viewport.scrollTop + (viewport.clientHeight * PDF_CASCADE_READING_LINE);
    const containerOffset = pagesContainer.offsetTop;
    let activePage = Math.min(totalPages, Math.max(1, lastSnapshotRef.current?.currentPage || initialPageRef.current));
    let activeElement = pageElementsRef.current.get(activePage) || null;

    for (let number = 1; number <= totalPages; number += 1) {
      const element = pageElementsRef.current.get(number);
      if (!element) continue;
      const top = containerOffset + element.offsetTop;
      const bottom = top + element.offsetHeight;
      if (readingLine < top) {
        const previousNumber = Math.max(1, number - 1);
        activePage = previousNumber;
        activeElement = pageElementsRef.current.get(previousNumber) || element;
        break;
      }
      activePage = number;
      activeElement = element;
      if (readingLine <= bottom) break;
    }

    if (!activeElement) return lastSnapshotRef.current;
    const pageTop = containerOffset + activeElement.offsetTop;
    const pageHeight = Math.max(1, activeElement.offsetHeight);
    const pageOffset = Math.max(0, Math.min(1, (readingLine - pageTop) / pageHeight));
    return emitProgress(activePage, pageOffset, force);
  }, [emitProgress, isCascade, totalPages]);

  const scheduleCascadeProgress = useCallback(() => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      measureCascadeProgress();
    });
  }, [measureCascadeProgress]);

  const scrollToCascadeLocation = useCallback((targetPage, targetOffset = 0, behavior = "smooth") => {
    const viewport = viewportRef.current;
    const pagesContainer = pagesContainerRef.current;
    const safePage = Math.min(totalPages || 1, Math.max(1, Math.round(Number(targetPage) || 1)));
    const element = pageElementsRef.current.get(safePage);
    if (!viewport || !pagesContainer || !element) return false;

    const safeOffset = Math.max(0, Math.min(1, Number(targetOffset) || 0));
    const targetTop = pagesContainer.offsetTop
      + element.offsetTop
      + (element.offsetHeight * safeOffset)
      - (viewport.clientHeight * PDF_CASCADE_READING_LINE);
    const top = Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight, targetTop));

    try {
      viewport.scrollTo({ top, behavior });
    } catch {
      viewport.scrollTop = top;
    }
    return true;
  }, [totalPages]);

  useEffect(() => {
    if (!pdf || !totalPages || isCascade) return;
    emitProgress(pageNumber, 0, true);
  }, [emitProgress, isCascade, pageNumber, pdf, totalPages]);

  useEffect(() => {
    if (!pdf || !totalPages || !isCascade) return undefined;

    const location = lastSnapshotRef.current?.locator || {
      page: initialPageRef.current,
      offset: initialOffsetRef.current,
    };
    let attempts = 0;
    const restore = () => {
      attempts += 1;
      if (scrollToCascadeLocation(location.page, location.offset, "auto") || attempts >= 8) {
        measureCascadeProgress(true);
        restoreFrameRef.current = null;
        return;
      }
      restoreFrameRef.current = window.requestAnimationFrame(restore);
    };
    restoreFrameRef.current = window.requestAnimationFrame(restore);

    return () => {
      if (restoreFrameRef.current !== null) window.cancelAnimationFrame(restoreFrameRef.current);
      restoreFrameRef.current = null;
    };
  }, [isCascade, measureCascadeProgress, pdf, scrollToCascadeLocation, totalPages, viewportWidth, zoom]);

  const goToPage = useCallback((nextPage) => {
    callbacksRef.current.onUserAction?.();
    const safePage = Math.min(totalPages || 1, Math.max(1, Math.round(Number(nextPage) || 1)));
    if (isCascade) {
      scrollToCascadeLocation(safePage, 0);
      return;
    }
    setPageNumber(safePage);
  }, [isCascade, scrollToCascadeLocation, totalPages]);

  const scrollCascadeScreen = useCallback((direction) => {
    callbacksRef.current.onUserAction?.();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distance = Math.max(180, viewport.clientHeight * 0.88) * (direction === "next" ? 1 : -1);
    try {
      viewport.scrollBy({ top: distance, behavior: "smooth" });
    } catch {
      viewport.scrollTop += distance;
    }
  }, []);

  useEffect(() => {
    if (!controlsRef) return undefined;
    controlsRef.current = {
      next: () => (isCascade ? scrollCascadeScreen("next") : goToPage(pageNumber + 1)),
      previous: () => (isCascade ? scrollCascadeScreen("previous") : goToPage(pageNumber - 1)),
      goTo: (target) => goToPage(Number(target)),
      getProgress: () => (isCascade ? measureCascadeProgress(true) : lastSnapshotRef.current),
    };
    return () => { controlsRef.current = null; };
  }, [controlsRef, goToPage, isCascade, measureCascadeProgress, pageNumber, scrollCascadeScreen]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
    if (restoreFrameRef.current !== null) window.cancelAnimationFrame(restoreFrameRef.current);
  }, []);

  return (
    <div className={`reader-format-stage reader-pdf-stage${isCascade ? " is-cascade" : " is-paged"}`}>
      <div className="reader-pdf-page-label" aria-live="polite">Página {pageNumber} de {totalPages || "…"}</div>
      <div
        ref={viewportRef}
        className={`reader-pdf-viewport${isCascade ? " is-cascade" : " is-paged"}`}
        onScroll={isCascade ? scheduleCascadeProgress : undefined}
        onWheel={() => callbacksRef.current.onUserAction?.()}
        onTouchStart={() => callbacksRef.current.onUserAction?.()}
        onPointerDown={() => callbacksRef.current.onUserAction?.()}
        aria-label={isCascade ? `PDF en lectura continua, página ${pageNumber} de ${totalPages || "…"}` : `Página ${pageNumber} del PDF`}
      >
        {isCascade ? (
          <div ref={pagesContainerRef} className="reader-pdf-cascade-pages">
            {Array.from({ length: totalPages }, (_, index) => {
              const number = index + 1;
              return (
                <PdfPageSurface
                  key={number}
                  pdf={pdf}
                  pageNumber={number}
                  viewportWidth={viewportWidth}
                  zoom={zoom}
                  pageAspectRatio={pageAspectRatio}
                  lazy
                  scrollRootRef={viewportRef}
                  registerPage={registerPage}
                  onQuoteSelected={onQuoteSelected}
                />
              );
            })}
            {totalPages > 0 && (
              <div className="reader-pdf-end-marker" role="status">
                <span aria-hidden="true">✦</span>
                <strong>Has llegado al final del documento</strong>
                <small>{totalPages} páginas leídas</small>
              </div>
            )}
          </div>
        ) : (
          <PdfPageSurface
            pdf={pdf}
            pageNumber={pageNumber}
            viewportWidth={viewportWidth}
            zoom={zoom}
            pageAspectRatio={pageAspectRatio}
            lazy={false}
            scrollRootRef={viewportRef}
            registerPage={registerPage}
            onQuoteSelected={onQuoteSelected}
          />
        )}
      </div>
      {loading && <div className="reader-stage-overlay"><ReaderLoading text="Preparando las páginas…" /></div>}
      {error && (
        <div className="reader-stage-overlay">
          <div className="reader-reader-error" role="alert">
            <strong>No se pudo abrir el PDF</strong>
            <p>{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function AnnotationComposer({ draft, saving, onChange, onClose, onSubmit }) {
  const dialogRef = useRef(null);
  const noteRef = useRef(null);
  const closeRef = useRef(onClose);
  const savingRef = useRef(saving);

  useEffect(() => {
    closeRef.current = onClose;
    savingRef.current = saving;
  }, [onClose, saving]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const focusTimer = window.requestAnimationFrame(() => noteRef.current?.focus());
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !savingRef.current) {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = [...dialogRef.current.querySelectorAll(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  return (
    <div className="reader-composer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form
        ref={dialogRef}
        className="reader-composer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-composer-title"
        onSubmit={onSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="reader-eyebrow">Tu margen de lectura</span>
            <h2 id="reader-composer-title">{draft.quote ? "Guardar selección" : "Nueva anotación"}</h2>
          </div>
          <button type="button" className="reader-icon-button" onClick={onClose} disabled={saving} aria-label="Cerrar anotación"><ReaderIcon name="close" /></button>
        </header>

        {draft.quote && <blockquote className="reader-selected-quote">“{draft.quote}”</blockquote>}

        <label className="reader-form-label" htmlFor="reader-annotation-note">Nota personal <span>(opcional)</span></label>
        <textarea
          ref={noteRef}
          id="reader-annotation-note"
          value={draft.note}
          onChange={(event) => onChange({ note: event.target.value })}
          placeholder="¿Qué quieres recordar de este momento?"
          rows="4"
          maxLength="1200"
        />

        <div className="reader-composer-row">
          <div>
            <span className="reader-form-label">Color</span>
            <div className="reader-color-options" role="radiogroup" aria-label="Color de la anotación">
              {NOTE_COLORS.map(([color, label]) => (
                <button
                  key={color}
                  type="button"
                  className={`reader-color-choice is-${color}${draft.color === color ? " is-selected" : ""}`}
                  onClick={() => onChange({ color })}
                  aria-label={label}
                  aria-pressed={draft.color === color}
                />
              ))}
            </div>
          </div>
          <label className="reader-spoiler-check">
            <input type="checkbox" checked={draft.spoiler} onChange={(event) => onChange({ spoiler: event.target.checked })} />
            <span>Contiene spoilers</span>
          </label>
        </div>

        <label className="reader-share-check">
          <input type="checkbox" checked={draft.share} onChange={(event) => onChange({ share: event.target.checked })} />
          <span><strong>Compartir en Actividad</strong><small>Solo se publicará esta anotación, nunca el archivo.</small></span>
        </label>

        <footer>
          <button type="button" className="reader-secondary-button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="reader-primary-button" disabled={saving || (!draft.quote.trim() && !draft.note.trim())}>
            {saving ? "Guardando…" : draft.share ? "Guardar y compartir" : "Guardar anotación"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function AnnotationList({ annotations, onOpen, onDelete }) {
  if (!annotations.length) {
    return (
      <div className="reader-notes-empty">
        <span aria-hidden="true">✧</span>
        <strong>Tus notas aparecerán aquí</strong>
        <p>Selecciona una frase en el ePub o PDF, o añade una nota desde la barra del lector.</p>
      </div>
    );
  }

  return (
    <div className="reader-annotation-list">
      {annotations.map((annotation) => (
        <article className={`reader-annotation-card is-${annotation.color}`} key={annotation.id}>
          <button type="button" className="reader-annotation-open" onClick={() => onOpen(annotation)}>
            <span className="reader-annotation-kind">{annotation.kind === "highlight" ? "Selección" : "Post-it"}{annotation.shared_post_id ? " · Compartida" : ""}</span>
            {annotation.quote && <blockquote>“{annotation.quote}”</blockquote>}
            {annotation.note && <p>{annotation.note}</p>}
            <small>{annotation.page ? `Página ${annotation.page}` : "Abrir en el lector"}</small>
          </button>
          <button type="button" className="reader-annotation-delete" onClick={() => onDelete(annotation)} aria-label="Eliminar anotación">×</button>
        </article>
      ))}
    </div>
  );
}

export default function ReaderPage({ book, isLoggedIn, onBack }) {
  const [assets, setAssets] = useState({ epub_file: "", pdf_file: "" });
  const [documents, setDocuments] = useState([]);
  const [readerState, setReaderState] = useState({ progress: null, annotations: [] });
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [catalogFormat, setCatalogFormat] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [savingAnnotation, setSavingAnnotation] = useState(false);
  const [annotationComposer, setAnnotationComposer] = useState(null);
  const [textScale, setTextScale] = useState(100);
  const [notesOpen, setNotesOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState("");
  const [pdfReadingMode, setPdfReadingMode] = useState(PDF_READING_MODES.CASCADE);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [readerDocumentPages, setReaderDocumentPages] = useState(0);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [currentChapter, setCurrentChapter] = useState("");
  const [currentPage, setCurrentPage] = useState(null);
  const fileInputRef = useRef(null);
  const readerControlsRef = useRef(null);
  const latestProgressRef = useRef(null);
  const progressTimerRef = useRef(null);
  const progressSaveQueueRef = useRef(Promise.resolve());
  const progressSaveCountRef = useRef(0);
  const mountedRef = useRef(true);
  const flushProgressRef = useRef(null);
  const progressActivityTimerRef = useRef(null);
  const progressActivityBaselineRef = useRef({ sourceKey: "", progress: 0 });
  const progressActivityInFlightRef = useRef(false);
  const touchStartRef = useRef(null);
  const readerPageRef = useRef(null);
  const nativeFullscreenRef = useRef(false);
  const activityArmedRef = useRef(false);
  const readerStartedRef = useRef("");

  const bookId = String(book?.id || "").trim();
  const bookEpubFile = book?.epub_file || "";
  const bookPdfFile = book?.pdf_file || "";

  useEffect(() => {
    let cancelled = false;
    const resetTimer = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      setError("");
      setMessage(null);
    }, 0);

    if (!bookId || !isLoggedIn) {
      window.clearTimeout(resetTimer);
      return undefined;
    }

    readerStartedRef.current = "";

    Promise.all([
      getReaderBookAssets(bookId),
      getReaderDocuments(bookId),
      getReaderBookState(bookId),
    ])
      .then(([bookAssets, bookDocuments, state]) => {
        if (cancelled) return;
        const nextAssets = {
          epub_file: bookAssets?.epub_file || bookEpubFile,
          pdf_file: bookAssets?.pdf_file || bookPdfFile,
        };
        setAssets(nextAssets);
        setDocuments(bookDocuments || []);
        setReaderState(state || { progress: null, annotations: [] });
        const preferredDocument = (bookDocuments || []).find((document) => document.id === state?.progress?.document_id)
          || (bookDocuments || [])[0]
          || null;
        setSelectedDocumentId(preferredDocument?.id || "");
        setCatalogFormat(
          preferredDocument?.format
            || (nextAssets.epub_file ? "epub" : nextAssets.pdf_file ? "pdf" : ""),
        );
        setCurrentProgress(clampReaderProgress(state?.progress?.progress));
        setCurrentChapter(state?.progress?.current_chapter || "");
        setCurrentPage(state?.progress?.current_page || null);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError?.message || "No se pudo preparar el lector.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(resetTimer);
    };
  }, [bookEpubFile, bookId, bookPdfFile, isLoggedIn]);

  const selectedDocument = useMemo(
    () => documents.find((document) => String(document.id) === String(selectedDocumentId)) || null,
    [documents, selectedDocumentId],
  );

  const selectedFormat = selectedDocument?.format || catalogFormat || readerFileFormat(assets.epub_file) || readerFileFormat(assets.pdf_file);
  const catalogSourcePath = selectedFormat === "pdf" ? assets.pdf_file : assets.epub_file;
  const sourceUrl = selectedDocument?.signed_url || (catalogSourcePath ? publicUrl(catalogSourcePath) : "");
  const sourceKey = selectedDocument?.id || `catalog:${bookId}:${selectedFormat}`;
  const savedProgressMatchesSource = !readerState.progress
    || String(readerState.progress.document_id || "") === String(selectedDocument?.id || "");
  const storedSourceProgress = savedProgressMatchesSource ? readerState.progress : null;
  const catalogProgress = clampReaderProgress(book?.progress);
  const sourceProgress = useMemo(() => storedSourceProgress || (
    selectedFormat === "pdf" && catalogProgress > 0
      ? { progress: catalogProgress, locator: {}, current_page: null, current_chapter: "" }
      : null
  ), [catalogProgress, selectedFormat, storedSourceProgress]);
  const visibleAnnotations = useMemo(
    () => readerState.annotations || [],
    [readerState.annotations],
  );

  const persistProgress = useCallback((snapshot = latestProgressRef.current, { quiet = false } = {}) => {
    window.clearTimeout(progressTimerRef.current);
    if (!snapshot || !bookId || (selectedFormat === "pdf" && !activityArmedRef.current)) return Promise.resolve(null);

    const pending = {
      ...snapshot,
      locator: { ...(snapshot.locator || {}) },
    };
    progressSaveCountRef.current += 1;
    if (!quiet && mountedRef.current) setSavingProgress(true);

    const operation = progressSaveQueueRef.current
      .catch(() => null)
      .then(() => saveReaderBookProgress({
        bookId,
        documentId: pending.documentId,
        progress: pending.progress,
        locator: pending.locator,
        currentPage: pending.currentPage,
        currentChapter: pending.currentChapter,
      }));
    progressSaveQueueRef.current = operation.catch(() => null);

    return operation
      .then((result) => {
        if (mountedRef.current) {
          setReaderState((current) => ({ ...current, progress: result.progress }));
        }
        return result;
      })
      .catch((saveError) => {
        if (mountedRef.current && !quiet) {
          setMessage({ type: "error", text: saveError?.message || "No se pudo guardar tu posición." });
        }
        return null;
      })
      .finally(() => {
        progressSaveCountRef.current = Math.max(0, progressSaveCountRef.current - 1);
        if (mountedRef.current && progressSaveCountRef.current === 0) setSavingProgress(false);
      });
  }, [bookId, selectedFormat]);

  const clearProgressActivityTimer = useCallback(() => {
    if (progressActivityTimerRef.current === null) return;
    window.clearTimeout(progressActivityTimerRef.current);
    progressActivityTimerRef.current = null;
  }, []);

  const recordProgressActivity = useCallback(async () => {
    if (!bookId || !sourceUrl || progressActivityInFlightRef.current) return null;

    progressActivityInFlightRef.current = true;
    try {
      let snapshot = latestProgressRef.current;
      const liveSnapshot = await Promise.resolve(readerControlsRef.current?.getProgress?.());
      if (liveSnapshot) {
        snapshot = {
          ...(snapshot || {}),
          ...liveSnapshot,
          documentId: selectedDocument?.id || null,
        };
        latestProgressRef.current = snapshot;
      }
      if (!snapshot) return null;

      const nextProgress = clampReaderProgress(snapshot.progress);
      const baseline = progressActivityBaselineRef.current;
      const previousProgress = baseline.sourceKey === sourceKey
        ? clampReaderProgress(baseline.progress)
        : clampReaderProgress(sourceProgress?.progress);
      if (nextProgress <= previousProgress) return null;

      const saved = await persistProgress(snapshot, { quiet: true });
      if (!saved) return null;
      const progressLog = await recordReadingProgress({
        bookId,
        previousProgress,
        newProgress: nextProgress,
        totalPages: snapshot.totalPages || readerDocumentPages || book?.pages,
      });
      if (progressLog?.id) {
        progressActivityBaselineRef.current = { sourceKey, progress: nextProgress };
      }
      return progressLog;
    } catch {
      // Guardar la posición sigue siendo prioritario si falla el registro social.
      return null;
    } finally {
      progressActivityInFlightRef.current = false;
    }
  }, [book, bookId, persistProgress, readerDocumentPages, selectedDocument, sourceKey, sourceProgress, sourceUrl]);

  const scheduleProgressActivity = useCallback(() => {
    clearProgressActivityTimer();
    if (!bookId || !sourceUrl) return;

    progressActivityTimerRef.current = window.setTimeout(() => {
      progressActivityTimerRef.current = null;
      void recordProgressActivity();
    }, READER_ACTIVITY_IDLE_TIMEOUT_MS);
  }, [bookId, clearProgressActivityTimer, recordProgressActivity, sourceUrl]);

  useEffect(() => {
    flushProgressRef.current = persistProgress;
  }, [persistProgress]);

  const handleProgress = useCallback((details) => {
    const previous = latestProgressRef.current;
    const next = {
      ...details,
      progress: clampReaderProgress(details?.progress),
      documentId: selectedDocument?.id || null,
    };
    latestProgressRef.current = next;
    setCurrentProgress(next.progress);
    if (next.currentPage) setCurrentPage(next.currentPage);
    if (next.currentChapter) setCurrentChapter(next.currentChapter);

    if (selectedFormat !== "pdf" || activityArmedRef.current) {
      window.clearTimeout(progressTimerRef.current);
      progressTimerRef.current = window.setTimeout(() => {
        void persistProgress(next);
      }, 650);
    }

    const previousOffset = Number(previous?.locator?.offset);
    const nextOffset = Number(next.locator?.offset);
    const moved = Boolean(previous) && (
      previous.currentPage !== next.currentPage
      || previous.locator?.cfi !== next.locator?.cfi
      || (Number.isFinite(previousOffset) && Number.isFinite(nextOffset) && Math.abs(previousOffset - nextOffset) >= 0.015)
      || previous.progress !== next.progress
    );
    if (moved && activityArmedRef.current) scheduleProgressActivity();
  }, [persistProgress, scheduleProgressActivity, selectedDocument?.id, selectedFormat]);

  useEffect(() => {
    if (!sourceUrl || !bookId || readerStartedRef.current === sourceKey || loading) return;
    readerStartedRef.current = sourceKey;
    clearProgressActivityTimer();
    activityArmedRef.current = false;
    setReaderDocumentPages(0);
    const startingPosition = {
      documentId: selectedDocument?.id || null,
      progress: clampReaderProgress(sourceProgress?.progress),
      locator: sourceProgress?.locator || {},
      currentPage: sourceProgress?.current_page || null,
      currentChapter: sourceProgress?.current_chapter || "",
    };
    latestProgressRef.current = startingPosition;
    progressActivityBaselineRef.current = {
      sourceKey,
      progress: startingPosition.progress,
    };
  }, [bookId, clearProgressActivityTimer, loading, selectedDocument?.id, sourceKey, sourceProgress, sourceUrl]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      window.clearTimeout(progressTimerRef.current);
      void flushProgressRef.current?.(latestProgressRef.current, { quiet: true });
    };
  }, []);

  useEffect(() => {
    const saveBeforeLeaving = () => {
      if (document.visibilityState === "hidden") {
        void persistProgress(latestProgressRef.current, { quiet: true });
      }
    };
    const saveOnPageHide = () => void persistProgress(latestProgressRef.current, { quiet: true });

    document.addEventListener("visibilitychange", saveBeforeLeaving);
    window.addEventListener("pagehide", saveOnPageHide);
    return () => {
      document.removeEventListener("visibilitychange", saveBeforeLeaving);
      window.removeEventListener("pagehide", saveOnPageHide);
    };
  }, [persistProgress]);

  useEffect(() => {
    if (!sourceUrl || annotationComposer) return undefined;

    const handleKeyDown = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target?.tagName || "")) return;

      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        readerControlsRef.current?.previous?.();
      } else if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        readerControlsRef.current?.next?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [annotationComposer, sourceUrl]);

  async function selectSource(documentId, format = "") {
    clearProgressActivityTimer();
    if (activityArmedRef.current) await recordProgressActivity();
    await persistProgress();
    latestProgressRef.current = null;
    activityArmedRef.current = false;
    setSelectedDocumentId(documentId || "");
    if (format) setCatalogFormat(format);
    setMessage(null);
    setCurrentProgress(0);
    setCurrentChapter("");
    setCurrentPage(null);
  }

  async function handleFileSelected(event) {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file || !bookId) return;

    setUploading(true);
    setMessage(null);
    try {
      const saved = await uploadReaderDocument({ bookId, file });
      setDocuments((current) => [saved, ...current.filter((document) => document.format !== saved.format)]);
      setSelectedDocumentId(saved.id);
      setMessage({ type: "success", text: `${formatLabel(saved.format)} guardado de forma privada.` });
    } catch (uploadError) {
      setMessage({ type: "error", text: uploadError?.message || "No se pudo subir el documento." });
    } finally {
      setUploading(false);
    }
  }

  function openNewAnnotation(overrides = {}) {
    setAnnotationComposer({
      quote: "",
      note: "",
      locator: {},
      page: currentPage,
      kind: "postit",
      color: "yellow",
      spoiler: false,
      share: false,
      ...overrides,
    });
    setNotesOpen(false);
  }

  function handleQuoteSelected(selection) {
    openNewAnnotation({
      quote: selection.quote || "",
      locator: selection.locator || {},
      kind: "highlight",
    });
  }

  async function handleAnnotationSubmit(event) {
    event.preventDefault();
    if (!annotationComposer || savingAnnotation) return;

    setSavingAnnotation(true);
    setMessage(null);
    try {
      const result = await createReaderAnnotation({
        bookId,
        documentId: selectedDocument?.id || null,
        ...annotationComposer,
      });
      setReaderState((current) => ({
        ...current,
        annotations: [result.annotation, ...(current.annotations || [])],
      }));
      setAnnotationComposer(null);
      setNotesOpen(true);
      setMessage({
        type: result.shareError ? "error" : "success",
        text: result.shareError || (annotationComposer.share ? "Anotación guardada y compartida en Actividad." : "Anotación guardada en tus notas."),
      });
    } catch (saveError) {
      setMessage({ type: "error", text: saveError?.message || "No se pudo guardar la anotación." });
    } finally {
      setSavingAnnotation(false);
    }
  }

  function openAnnotation(annotation) {
    if (selectedFormat === "epub" && annotation.locator?.cfi) {
      readerControlsRef.current?.goTo?.(annotation.locator.cfi);
      return;
    }
    if (selectedFormat === "pdf" && (annotation.locator?.page || annotation.page)) {
      readerControlsRef.current?.goTo?.(Number(annotation.locator?.page || annotation.page));
    }
  }

  async function removeAnnotation(annotation) {
    if (!annotation?.id) return;
    try {
      await deleteReaderAnnotation(annotation.id);
      setReaderState((current) => ({
        ...current,
        annotations: (current.annotations || []).filter((item) => item.id !== annotation.id),
      }));
      setMessage({ type: "success", text: "Anotación eliminada de tus notas." });
    } catch (deleteError) {
      setMessage({ type: "error", text: deleteError?.message || "No se pudo eliminar la anotación." });
    }
  }

  function changeScale(delta) {
    setTextScale((current) => Math.max(80, Math.min(150, current + delta)));
  }

  async function handleBack() {
    clearProgressActivityTimer();
    if (activityArmedRef.current) await recordProgressActivity();
    await persistProgress();
    if (document.fullscreenElement === readerPageRef.current) await document.exitFullscreen?.();
    onBack?.();
  }

  async function toggleImmersiveMode() {
    if (immersiveMode) {
      if (document.fullscreenElement === readerPageRef.current) await document.exitFullscreen?.();
      setImmersiveMode(false);
      nativeFullscreenRef.current = false;
      return;
    }

    setImmersiveMode(true);
    try {
      await readerPageRef.current?.requestFullscreen?.();
      nativeFullscreenRef.current = document.fullscreenElement === readerPageRef.current;
    } catch {
      // El diseño a pantalla completa funciona también sin la API nativa.
      nativeFullscreenRef.current = false;
    }
  }

  useEffect(() => {
    if (!immersiveMode) return undefined;
    document.body.classList.add("reader-immersive-active");
    const onFullscreenChange = () => {
      if (nativeFullscreenRef.current && document.fullscreenElement !== readerPageRef.current) {
        nativeFullscreenRef.current = false;
        setImmersiveMode(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.body.classList.remove("reader-immersive-active");
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [immersiveMode]);

  function handleReaderTouchStart(event) {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleReaderTouchEnd(event) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches?.[0];
    if (!start || !touch || annotationComposer || (selectedFormat === "pdf" && (textScale > 100 || pdfReadingMode === PDF_READING_MODES.CASCADE))) return;
    if (window.getSelection?.()?.toString?.().trim()) return;

    const distanceX = touch.clientX - start.x;
    const distanceY = touch.clientY - start.y;
    if (Math.abs(distanceX) < 72 || Math.abs(distanceY) > 55) return;
    if (distanceX > 0) readerControlsRef.current?.previous?.();
    else readerControlsRef.current?.next?.();
  }

  if (!bookId || !isLoggedIn) {
    return (
      <main className="reader-page">
        <section className="reader-empty-state">
          <h1>Tu lector personal</h1>
          <p>Inicia sesión para abrir lecturas privadas y guardar tu posición.</p>
        </section>
      </main>
    );
  }

  return (
    <main ref={readerPageRef} className={`reader-page${immersiveMode ? " is-reader-immersive" : ""}`}>
      <header className="reader-header">
        <button type="button" className="reader-back-button" onClick={handleBack}>
          <ReaderIcon name="back" />
          <span>Volver</span>
        </button>

        <div className="reader-book-heading">
          <span className="reader-eyebrow">Lectura privada</span>
          <h1>{book.title || "Tu libro"}</h1>
          <p>{book.author || ""}</p>
        </div>

        <div className="reader-header-progress" aria-label={`${currentProgress}% leído`}>
          <strong>{currentProgress}%</strong>
          <span><i style={{ width: `${currentProgress}%` }} /></span>
          <small>{savingProgress ? "Guardando…" : currentChapter || "Tu posición se guarda sola"}</small>
        </div>
      </header>

      <div className="reader-toolbar" role="toolbar" aria-label="Controles del lector">
        <div className="reader-toolbar-group">
          <button type="button" className="reader-toolbar-button" onClick={() => readerControlsRef.current?.previous?.()} aria-label="Página o sección anterior">
            <ReaderIcon name="prev" /><span>Anterior</span>
          </button>
          <button type="button" className="reader-toolbar-button" onClick={() => readerControlsRef.current?.next?.()} aria-label="Página o sección siguiente">
            <span>Siguiente</span><ReaderIcon name="next" />
          </button>
        </div>

        <div className="reader-toolbar-group reader-toolbar-center">
          <button type="button" className="reader-toolbar-button" onClick={() => changeScale(-10)} aria-label="Reducir tamaño de texto o zoom"><ReaderIcon name="zoomOut" /><span>−</span></button>
          <span className="reader-scale-label">{textScale}%</span>
          <button type="button" className="reader-toolbar-button" onClick={() => changeScale(10)} aria-label="Aumentar tamaño de texto o zoom"><ReaderIcon name="zoomIn" /><span>+</span></button>
        </div>

        <div className="reader-toolbar-group reader-toolbar-actions">
          {selectedFormat === "pdf" && sourceUrl && (
            <button
              type="button"
              className={`reader-toolbar-button${pdfReadingMode === PDF_READING_MODES.CASCADE ? " is-active" : ""}`}
              onClick={() => setPdfReadingMode((mode) => mode === PDF_READING_MODES.CASCADE ? PDF_READING_MODES.PAGED : PDF_READING_MODES.CASCADE)}
              aria-label={pdfReadingMode === PDF_READING_MODES.CASCADE ? "Cambiar a lectura por páginas" : "Cambiar a lectura continua"}
              aria-pressed={pdfReadingMode === PDF_READING_MODES.CASCADE}
            >
              <ReaderIcon name={pdfReadingMode === PDF_READING_MODES.CASCADE ? "cascade" : "pages"} />
              <span>{pdfReadingMode === PDF_READING_MODES.CASCADE ? "Cascada" : "Páginas"}</span>
            </button>
          )}
          {sourceUrl && (
            <button type="button" className="reader-toolbar-button" onClick={toggleImmersiveMode} aria-label={immersiveMode ? "Salir de pantalla completa" : "Pantalla completa"}>
              <ReaderIcon name={immersiveMode ? "fullscreenExit" : "fullscreen"} /><span>{immersiveMode ? "Salir" : "Ampliar"}</span>
            </button>
          )}
          <button type="button" className="reader-toolbar-button is-note" onClick={() => openNewAnnotation()}>
            <ReaderIcon name="plus" /><span>Nueva anotación</span>
          </button>
          <button type="button" className={`reader-toolbar-button${notesOpen ? " is-active" : ""}`} onClick={() => setNotesOpen((open) => !open)}>
            <ReaderIcon name="note" /><span>Mis notas</span>{visibleAnnotations.length > 0 && <b>{visibleAnnotations.length}</b>}
          </button>
        </div>
      </div>

      {(documents.length > 0 || assets.epub_file || assets.pdf_file) && (
        <div className="reader-source-strip">
          <span>Fuente de lectura</span>
          <div className="reader-source-options" role="tablist" aria-label="Elegir fuente de lectura">
            {documents.map((document) => (
              <button
                key={document.id}
                type="button"
                role="tab"
                aria-selected={String(selectedDocumentId) === String(document.id)}
                className={String(selectedDocumentId) === String(document.id) ? "is-active" : ""}
                onClick={() => selectSource(document.id)}
              >
                {formatLabel(document.format)} <small>{formatBytes(document.size_bytes)}</small>
              </button>
            ))}
            {assets.epub_file && !documents.some((document) => document.format === "epub") && (
              <button type="button" role="tab" aria-selected={!selectedDocumentId && selectedFormat === "epub"} className={!selectedDocumentId && selectedFormat === "epub" ? "is-active" : ""} onClick={() => selectSource("", "epub")}>ePub del catálogo</button>
            )}
            {assets.pdf_file && !documents.some((document) => document.format === "pdf") && (
              <button type="button" role="tab" aria-selected={!selectedDocumentId && selectedFormat === "pdf"} className={!selectedDocumentId && selectedFormat === "pdf" ? "is-active" : ""} onClick={() => selectSource("", "pdf")}>PDF del catálogo</button>
            )}
          </div>
        </div>
      )}

      {message && <p className={`reader-feedback is-${message.type}`} role={message.type === "error" ? "alert" : "status"}>{message.text}</p>}

      {loading ? (
        <ReaderLoading />
      ) : error ? (
        <section className="reader-setup-card reader-error-card">
          <span className="reader-setup-icon" aria-hidden="true">!</span>
          <div>
            <h2>El lector necesita un paso previo</h2>
            <p>{error}</p>
            <button type="button" className="reader-secondary-button" onClick={handleBack}>Volver al libro</button>
          </div>
        </section>
      ) : !sourceUrl ? (
        <section className="reader-setup-card">
          <span className="reader-setup-icon" aria-hidden="true"><ReaderIcon name="upload" /></span>
          <div>
            <span className="reader-eyebrow">Solo para ti</span>
            <h2>Añade tu ePub o PDF</h2>
            <p>Sube tu copia privada de <strong>{book.title || "este libro"}</strong>. Quedará protegida y podrás seguir leyendo desde cualquier dispositivo.</p>
            <button type="button" className="reader-primary-button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <ReaderIcon name="upload" />{uploading ? "Subiendo…" : "Elegir archivo"}
            </button>
            <small className="reader-setup-hint">Formatos admitidos: ePub y PDF · máximo 100 MB</small>
          </div>
        </section>
      ) : (
        <div className="reader-layout">
          <section className="reader-main-column" onTouchStart={handleReaderTouchStart} onTouchEnd={handleReaderTouchEnd}>
            {selectedFormat === "pdf" ? (
              <PdfReader
                key={sourceKey}
                sourceUrl={sourceUrl}
                initialProgress={sourceProgress}
                zoom={textScale / 100}
                readingMode={pdfReadingMode}
                onProgress={handleProgress}
                onQuoteSelected={handleQuoteSelected}
                controlsRef={readerControlsRef}
                onPageChange={setCurrentChapter}
                onDocumentInfo={setReaderDocumentPages}
                onUserAction={() => { activityArmedRef.current = true; }}
              />
            ) : (
              <EpubReader
                key={sourceKey}
                sourceUrl={sourceUrl}
                initialProgress={sourceProgress}
                textScale={textScale}
                onProgress={handleProgress}
                onQuoteSelected={handleQuoteSelected}
                controlsRef={readerControlsRef}
                onChapterChange={setCurrentChapter}
              />
            )}
            <footer className="reader-reader-footer">
              <span>{selectedDocument ? `${formatLabel(selectedDocument.format)} privado` : `${formatLabel(selectedFormat)} del catálogo`}</span>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>{uploading ? "Subiendo…" : "Cambiar archivo"}</button>
            </footer>
          </section>

          {notesOpen && (
            <aside className="reader-notes-panel" aria-label="Mis anotaciones">
              <header>
                <div><span className="reader-eyebrow">Cuaderno de lectura</span><h2>Mis notas</h2></div>
                <button type="button" className="reader-icon-button" onClick={() => setNotesOpen(false)} aria-label="Cerrar mis notas"><ReaderIcon name="close" /></button>
              </header>
              <AnnotationList annotations={visibleAnnotations} onOpen={openAnnotation} onDelete={removeAnnotation} />
            </aside>
          )}
        </div>
      )}

      {sourceUrl && !loading && !error && (
        <div className="reader-reading-statusbar" role="status">
          <span className="reader-reading-statusbar-title" title={book.title || "Tu libro"}>{book.title || "Tu libro"}</span>
          <span>{selectedFormat === "pdf" && currentPage ? `Página ${currentPage}${readerDocumentPages ? ` / ${readerDocumentPages}` : ""}` : currentChapter || "Lectura"}</span>
          <strong>{currentProgress}%</strong>
          <small>{savingProgress ? "Guardando…" : "Posición guardada"}</small>
        </div>
      )}

      <input ref={fileInputRef} className="reader-hidden-input" type="file" accept=".epub,.pdf,application/epub+zip,application/pdf" onChange={handleFileSelected} />

      {annotationComposer && (
        <AnnotationComposer
          draft={annotationComposer}
          saving={savingAnnotation}
          onChange={(changes) => setAnnotationComposer((current) => ({ ...current, ...changes }))}
          onClose={() => setAnnotationComposer(null)}
          onSubmit={handleAnnotationSubmit}
        />
      )}
    </main>
  );
}
