import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ePub from "epubjs";
import { getDocument, GlobalWorkerOptions, TextLayer } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import "./ReaderPage.css";
import { publicUrl } from "./api.js";
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
} from "./lib/readerUtils.js";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const NOTE_COLORS = [
  ["yellow", "Amarillo"],
  ["pink", "Rosa"],
  ["blue", "Azul"],
  ["green", "Verde"],
  ["lilac", "Lila"],
];

function ReaderIcon({ name }) {
  const paths = {
    back: <path d="m15 5-7 7 7 7M8 12h12" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    menu: <><path d="M5 6h14M5 12h14M5 18h14" /></>,
    next: <path d="m9 5 7 7-7 7M16 12H4" />,
    prev: <path d="m15 5-7 7 7 7M8 12h12" />,
    note: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
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

function PdfReader({ sourceUrl, initialProgress, zoom, onProgress, onQuoteSelected, controlsRef, onPageChange }) {
  const canvasRef = useRef(null);
  const pageRef = useRef(null);
  const textLayerRef = useRef(null);
  const viewportRef = useRef(null);
  const pdfRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [pageNumber, setPageNumber] = useState(Math.max(1, Number(initialProgress?.current_page || initialProgress?.locator?.page || 1)));
  const [totalPages, setTotalPages] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(760);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;

    const updateWidth = () => {
      const width = Math.floor(element.clientWidth - 8);
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
  }, []);

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
      .then((loadedPdf) => {
        if (cancelled) {
          loadedPdf.destroy();
          return;
        }
        pdfRef.current = loadedPdf;
        setPdf(loadedPdf);
        setTotalPages(loadedPdf.numPages);
        setPageNumber((current) => Math.min(loadedPdf.numPages, Math.max(1, current)));
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
      loadingTask.destroy();
      pdfRef.current?.destroy?.();
      pdfRef.current = null;
    };
  }, [sourceUrl]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !pageRef.current || !textLayerRef.current) return undefined;

    let cancelled = false;
    let renderTask = null;
    let textLayer = null;

    pdf.getPage(pageNumber)
      .then(async (page) => {
        if (cancelled || !canvasRef.current || !pageRef.current || !textLayerRef.current) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const fitScale = Math.min(1.35, Math.max(0.35, viewportWidth / baseViewport.width));
        const viewport = page.getViewport({ scale: fitScale * zoom });
        const canvas = canvasRef.current;
        const pageElement = pageRef.current;
        const textLayerElement = textLayerRef.current;
        const context = canvas.getContext("2d", { alpha: false });
        const outputScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

        pageElement.style.width = `${Math.ceil(viewport.width)}px`;
        pageElement.style.height = `${Math.ceil(viewport.height)}px`;
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
      })
      .then(() => {
        if (cancelled) return;
        const progress = readerProgressFromPdf(pageNumber, totalPages);
        onPageChange?.(`Página ${pageNumber}`);
        onProgress?.({
          progress,
          locator: { page: pageNumber },
          currentPage: pageNumber,
          currentChapter: `Página ${pageNumber}`,
        });
      })
      .catch((renderError) => {
        if (!cancelled && renderError?.name !== "RenderingCancelledException") {
          setError(renderError?.message || "No se pudo renderizar esta página.");
        }
      });

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
      textLayer?.cancel?.();
    };
  }, [onPageChange, onProgress, pageNumber, pdf, totalPages, viewportWidth, zoom]);

  const goToPage = useCallback((nextPage) => {
    setPageNumber((current) => Math.min(totalPages || 1, Math.max(1, nextPage ?? current)));
  }, [totalPages]);

  useEffect(() => {
    if (!controlsRef) return undefined;
    controlsRef.current = {
      next: () => goToPage(pageNumber + 1),
      previous: () => goToPage(pageNumber - 1),
      goTo: (target) => goToPage(Number(target)),
    };
    return () => { controlsRef.current = null; };
  }, [controlsRef, goToPage, pageNumber]);

  const captureSelection = useCallback(() => {
    window.setTimeout(() => {
      const selection = window.getSelection?.();
      const anchor = selection?.anchorNode;
      const focus = selection?.focusNode;
      const layer = textLayerRef.current;
      const quote = selection?.toString?.().replace(/\s+/g, " ").trim() || "";

      const selectionBelongsToPage = (anchor && layer?.contains(anchor)) || (focus && layer?.contains(focus));
      if (!layer || !quote || !selectionBelongsToPage) return;
      onQuoteSelected?.({
        quote,
        locator: { page: pageNumber },
        page: pageNumber,
      });
    }, 80);
  }, [onQuoteSelected, pageNumber]);

  return (
    <div className="reader-format-stage reader-pdf-stage">
      <div className="reader-pdf-page-label">Página {pageNumber} de {totalPages || "…"}</div>
      <div ref={viewportRef} className="reader-pdf-viewport" aria-label={`Página ${pageNumber} del PDF`}>
        <div ref={pageRef} className="reader-pdf-page">
          <canvas ref={canvasRef} />
          <div
            ref={textLayerRef}
            className="reader-pdf-text-layer"
            onMouseUp={captureSelection}
            onTouchEnd={captureSelection}
            aria-label="Texto seleccionable del PDF"
          />
        </div>
      </div>
      {loading && <div className="reader-stage-overlay"><ReaderLoading text="Abriendo tu PDF…" /></div>}
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
  const touchStartRef = useRef(null);
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
  const sourceProgress = savedProgressMatchesSource ? readerState.progress : null;
  const visibleAnnotations = useMemo(
    () => readerState.annotations || [],
    [readerState.annotations],
  );

  const persistProgress = useCallback((snapshot = latestProgressRef.current, { quiet = false } = {}) => {
    window.clearTimeout(progressTimerRef.current);
    if (!snapshot || !bookId) return Promise.resolve(null);

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
  }, [bookId]);

  useEffect(() => {
    flushProgressRef.current = persistProgress;
  }, [persistProgress]);

  const handleProgress = useCallback((details) => {
    const next = {
      ...details,
      progress: clampReaderProgress(details?.progress),
      documentId: selectedDocument?.id || null,
    };
    latestProgressRef.current = next;
    setCurrentProgress(next.progress);
    if (next.currentPage) setCurrentPage(next.currentPage);
    if (next.currentChapter) setCurrentChapter(next.currentChapter);

    window.clearTimeout(progressTimerRef.current);
    progressTimerRef.current = window.setTimeout(() => {
      void persistProgress(next);
    }, 650);
  }, [persistProgress, selectedDocument?.id]);

  useEffect(() => {
    if (!sourceUrl || !bookId || readerStartedRef.current === sourceKey || loading) return;
    readerStartedRef.current = sourceKey;
    const startingPosition = {
      documentId: selectedDocument?.id || null,
      progress: clampReaderProgress(sourceProgress?.progress),
      locator: sourceProgress?.locator || {},
      currentPage: sourceProgress?.current_page || null,
      currentChapter: sourceProgress?.current_chapter || "",
    };
    latestProgressRef.current = startingPosition;
    void persistProgress(startingPosition);
  }, [bookId, loading, persistProgress, selectedDocument?.id, sourceKey, sourceProgress, sourceUrl]);

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
    await persistProgress();
    latestProgressRef.current = null;
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
    await persistProgress();
    onBack?.();
  }

  function handleReaderTouchStart(event) {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleReaderTouchEnd(event) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches?.[0];
    if (!start || !touch || annotationComposer || (selectedFormat === "pdf" && textScale > 100)) return;
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
    <main className="reader-page">
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
                onProgress={handleProgress}
                onQuoteSelected={handleQuoteSelected}
                controlsRef={readerControlsRef}
                onPageChange={setCurrentChapter}
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
