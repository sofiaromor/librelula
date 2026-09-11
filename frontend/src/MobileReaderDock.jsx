import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./MobileReaderDock.css";
import {
  publishReaderPost,
  searchReaderPostBooks,
} from "./lib/homeDashboardApi.js";

function DockIcon({ name }) {
  const paths = {
    home: <><path d="M3.5 10.5 12 3l8.5 7.5" /><path d="M5.5 9.5V21h13V9.5" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
    clubs: <><path d="M8 20h8" /><path d="M9.5 16.5h5" /><path d="M12 4v10" /><path d="M8.5 8h7" /><circle cx="12" cy="4" r="1.5" /></>,
    library: <><path d="M4 5.5h4v13H4z" /><path d="M10 3.5h4v15h-4z" /><path d="M16 6h4v12h-4z" /><path d="M3 20.5h18" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="8.5" cy="9" r="1.5" /><path d="m5.5 17 4.3-4.4 3.2 3 2.4-2.2 3.1 3.6" /></>,
    book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22Z" /><path d="M4 5.5V22" /></>,
    close: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function findButtonByText(selector, label) {
  return [...document.querySelectorAll(selector)].find(
    (button) => button.textContent?.trim() === label,
  ) || null;
}

function clickPrimaryNavigation(label) {
  const button = findButtonByText(".site-nav-links button", label);
  if (!button) return false;
  button.click();
  return true;
}

function openLogin() {
  const button = document.querySelector(".btn-signin");
  if (!button) return false;
  button.click();
  return true;
}

function scrollToCatalogBooks(attempt = 0) {
  const target = document.querySelector(".catalog-browser-layout");
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (attempt < 60) {
    window.setTimeout(() => scrollToCatalogBooks(attempt + 1), 50);
  }
}

export default function MobileReaderDock() {
  const [activeItem, setActiveItem] = useState("home");
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [book, setBook] = useState(null);
  const [bookPickerOpen, setBookPickerOpen] = useState(false);
  const [bookSearch, setBookSearch] = useState("");
  const [bookResults, setBookResults] = useState([]);
  const [bookSearching, setBookSearching] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const textareaRef = useRef(null);
  const imageInputRef = useRef(null);
  const imagePreviewUrlRef = useRef("");

  useEffect(() => {
    function syncNavigationState() {
      const activeButton = document.querySelector(".site-nav-links button.is-active");
      const activeLabel = activeButton?.textContent?.trim();
      if (activeLabel === "Inicio") setActiveItem("home");
      if (activeLabel === "Catálogo") setActiveItem("search");
      if (activeLabel === "Clubes") setActiveItem("clubs");
      if (activeLabel === "Mi biblioteca") setActiveItem("library");
    }

    syncNavigationState();
    const root = document.getElementById("root");
    const observer = new MutationObserver(syncNavigationState);
    if (root) observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!composerOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => textareaRef.current?.focus());

    function closeOnEscape(event) {
      if (event.key === "Escape" && !publishing) setComposerOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [composerOpen, publishing]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrlRef.current) URL.revokeObjectURL(imagePreviewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const cleanSearch = bookSearch.trim();
    if (!bookPickerOpen || cleanSearch.length < 2) {
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setBookSearching(true);
      try {
        const results = await searchReaderPostBooks(cleanSearch);
        if (!cancelled) setBookResults(results);
      } catch {
        if (!cancelled) setBookResults([]);
      } finally {
        if (!cancelled) setBookSearching(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bookPickerOpen, bookSearch]);

  const bookSearchReady = bookPickerOpen && bookSearch.trim().length >= 2;

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function requireSession() {
    const hasSession = Boolean(document.querySelector(".user-btn"));
    if (hasSession) return true;
    openLogin();
    return false;
  }

  function goHome() {
    clickPrimaryNavigation("Inicio");
    setActiveItem("home");
  }

  function goSearch() {
    clickPrimaryNavigation("Catálogo");
    setActiveItem("search");
    window.setTimeout(() => scrollToCatalogBooks(), 40);
  }

  function goClubs() {
    if (!requireSession()) return;
    clickPrimaryNavigation("Clubes");
    setActiveItem("clubs");
  }

  function goLibrary() {
    if (!requireSession()) return;
    clickPrimaryNavigation("Mi biblioteca");
    setActiveItem("library");
  }

  function openComposer() {
    if (!requireSession()) return;
    setMessage("");
    setComposerOpen(true);
  }

  function resetComposer() {
    setDraft("");
    setSpoiler(false);
    setBook(null);
    setBookPickerOpen(false);
    setBookSearch("");
    setBookResults([]);
    replaceImageFile(null);
    setMessage("");
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function replaceImageFile(file) {
    if (imagePreviewUrlRef.current) URL.revokeObjectURL(imagePreviewUrlRef.current);
    const nextPreview = file ? URL.createObjectURL(file) : "";
    imagePreviewUrlRef.current = nextPreview;
    setImageFile(file);
    setImagePreview(nextPreview);
  }

  function closeComposer() {
    if (publishing) return;
    setComposerOpen(false);
    setMessage("");
  }

  async function submitPost(event) {
    event.preventDefault();
    const cleanDraft = draft.trim();
    if ((!cleanDraft && !imageFile) || publishing) return;

    setPublishing(true);
    setMessage("");

    try {
      await publishReaderPost({
        body: cleanDraft,
        spoiler,
        bookId: book?.id || null,
        imageFile,
      });
      resetComposer();
      setComposerOpen(false);
      setToast("Publicado en tu actividad");
      window.dispatchEvent(new CustomEvent("librelula:reader-post-published"));
    } catch (error) {
      setMessage(error?.message || "No se pudo publicar ahora mismo.");
    } finally {
      setPublishing(false);
    }
  }

  const composer = composerOpen && typeof document !== "undefined"
    ? createPortal(
        <div className="mobile-post-layer" role="presentation">
          <button type="button" className="mobile-post-backdrop" aria-label="Cerrar publicación" onClick={closeComposer} />
          <section className="mobile-post-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-post-title">
            <header className="mobile-post-header">
              <button type="button" className="mobile-post-close" onClick={closeComposer} disabled={publishing}>
                Cancelar
              </button>
              <strong id="mobile-post-title">Crear publicación</strong>
              <button
                type="submit"
                form="mobile-reader-post-form"
                className="mobile-post-submit is-top"
                disabled={(!draft.trim() && !imageFile) || publishing}
              >
                {publishing ? "Publicando…" : "Publicar"}
              </button>
            </header>

            <form id="mobile-reader-post-form" className="mobile-post-form" onSubmit={submitPost}>
              <div className="mobile-post-compose-row">
                <span className="mobile-post-avatar" aria-hidden="true">✦</span>
                <div className="mobile-post-compose-main">
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows="6"
                    maxLength="1200"
                    placeholder="¿Qué está pasando entre tus páginas?"
                    aria-label="Texto de la publicación"
                  />

                  {book && (
                    <div className="mobile-post-selected-book">
                      {book.cover ? <img src={book.cover} alt="" /> : <span aria-hidden="true">⌑</span>}
                      <div>
                        <strong>{book.title}</strong>
                        <small>{book.author || "Autor desconocido"}</small>
                      </div>
                      <button type="button" aria-label="Quitar libro" onClick={() => setBook(null)}>
                        <DockIcon name="close" />
                      </button>
                    </div>
                  )}

                  {imagePreview && (
                    <div className="mobile-post-image-preview">
                      <img src={imagePreview} alt="Vista previa de la imagen" />
                      <button type="button" aria-label="Quitar imagen" onClick={() => replaceImageFile(null)}>
                        <DockIcon name="close" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {message && <p className="mobile-post-message" role="alert">{message}</p>}

              {bookPickerOpen && (
                <div className="mobile-post-book-picker">
                  <label>
                    <span className="sr-only">Buscar libro para asociar</span>
                    <DockIcon name="search" />
                    <input
                      type="search"
                      value={bookSearch}
                      onChange={(event) => setBookSearch(event.target.value)}
                      placeholder="Buscar un libro del catálogo…"
                      autoFocus
                    />
                  </label>

                  <div className="mobile-post-book-results">
                    {bookSearching && bookSearchReady ? (
                      <p>Buscando libros…</p>
                    ) : bookSearch.trim().length < 2 ? (
                      <p>Escribe al menos dos letras.</p>
                    ) : bookResults.length ? (
                      bookResults.map((result) => (
                        <button
                          type="button"
                          key={result.id}
                          onClick={() => {
                            setBook(result);
                            setBookPickerOpen(false);
                            setBookSearch("");
                            setBookResults([]);
                          }}
                        >
                          {result.cover ? <img src={result.cover} alt="" /> : <span aria-hidden="true">⌑</span>}
                          <span>
                            <strong>{result.title}</strong>
                            <small>{result.author || "Autor desconocido"}</small>
                          </span>
                        </button>
                      ))
                    ) : (
                      <p>No encontramos coincidencias.</p>
                    )}
                  </div>
                </div>
              )}

              <footer className="mobile-post-footer">
                <div className="mobile-post-tools">
                  <button
                    type="button"
                    className={bookPickerOpen ? "is-active" : ""}
                    onClick={() => setBookPickerOpen((current) => !current)}
                    aria-label="Asociar un libro"
                  >
                    <DockIcon name="book" />
                  </button>
                  <button type="button" onClick={() => imageInputRef.current?.click()} aria-label="Añadir imagen">
                    <DockIcon name="image" />
                  </button>
                  <input
                    ref={imageInputRef}
                    className="mobile-post-file-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(event) => replaceImageFile(event.target.files?.[0] || null)}
                  />
                  <label className="mobile-post-spoiler">
                    <input type="checkbox" checked={spoiler} onChange={(event) => setSpoiler(event.target.checked)} />
                    <span>{spoiler ? "Con spoilers" : "Sin spoilers"}</span>
                  </label>
                </div>
                <span className="mobile-post-count">{draft.length}/1200</span>
              </footer>
            </form>
          </section>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <nav className="mobile-reader-dock" aria-label="Navegación rápida">
        <button type="button" className={activeItem === "home" ? "is-active" : ""} onClick={goHome}>
          <DockIcon name="home" />
          <span>Inicio</span>
        </button>
        <button type="button" className={activeItem === "search" ? "is-active" : ""} onClick={goSearch}>
          <DockIcon name="search" />
          <span>Buscar</span>
        </button>
        <button type="button" className="mobile-reader-create" onClick={openComposer} aria-label="Crear publicación">
          <span className="mobile-reader-create-circle"><DockIcon name="plus" /></span>
          <span>Crear</span>
        </button>
        <button type="button" className={activeItem === "clubs" ? "is-active" : ""} onClick={goClubs}>
          <DockIcon name="clubs" />
          <span>Clubes</span>
        </button>
        <button type="button" className={activeItem === "library" ? "is-active" : ""} onClick={goLibrary}>
          <DockIcon name="library" />
          <span>Biblioteca</span>
        </button>
      </nav>

      {toast && <div className="mobile-reader-toast" role="status">{toast}</div>}
      {composer}
    </>
  );
}
