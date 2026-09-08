import { useEffect, useMemo, useRef, useState } from "react";
import "./MiBiblioteca.css";
import "./MiBibliotecaSpines.css";
import "./MiBibliotecaV2.css";
import SpineCropEditor from "./SpineCropEditor.jsx";
import LibraryShelfShowcase from "./LibraryShelfShowcase.jsx";
import { shelfStarFills, formatShelfScore } from "./lib/libraryShelfSearch.js";
import {
  getLibraryStatus,
  getMyLibrary,
  LIBRARY_STATUS_LABELS,
  removePersonalSpine,
  updateLibraryScore,
  updatePersonalSpineCrop,
  uploadPersonalSpine,
} from "./lib/library.js";
import { removeCatalogUserBook } from "./lib/catalogApi.js";
import {
  LIBRARY_SPINE_VIEW_STORAGE_KEY,
  normalizeLibraryViewMode,
  shouldShowSpineTitle,
} from "./lib/librarySpineMedia.js";

const SYSTEM_SHELVES = [
  {
    id: "reading",
    title: "Leyendo ahora",
    subtitle: "Tus lecturas activas y relecturas.",
    statuses: ["reading", "rereading"],
  },
  {
    id: "completed",
    title: "Leídos",
    subtitle: "Ordenados de mejor puntuación a menor.",
    statuses: ["completed"],
  },
  {
    id: "planned",
    title: "Pendientes",
    subtitle: "Los próximos libros de tu pila.",
    statuses: ["planned"],
  },
  {
    id: "paused",
    title: "En pausa",
    subtitle: "Los libros que has dejado descansar un poco.",
    statuses: ["paused"],
  },
  {
    id: "dropped",
    title: "Abandonados",
    subtitle: "Los que decidiste dejar atrás, sin culpa.",
    statuses: ["dropped"],
  },
];

function coverUrl(cover) {
  const value = String(cover || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `/${value.replace(/^\/+/, "")}`;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function genreValues(value) {
  return String(value || "")
    .split(/[,;|]/)
    .map((genre) => genre.trim())
    .filter(Boolean);
}

function dateValue(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function sortShelfItems(items, shelfId) {
  const rows = [...(items || [])];

  if (shelfId === "completed") {
    return rows.sort((left, right) => {
      const scoreDelta = Number(right.score || 0) - Number(left.score || 0);
      if (scoreDelta !== 0) return scoreDelta;
      return dateValue(right.finished_at || right.added_at) - dateValue(left.finished_at || left.added_at);
    });
  }

  return rows.sort((left, right) => Number(right.id || 0) - Number(left.id || 0));
}

function spineVariation(value) {
  return [...String(value || "")].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  ) % 5;
}

function CoverViewIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="4" width="6" height="7" rx="1" />
      <rect x="14" y="4" width="6" height="7" rx="1" />
      <rect x="4" y="13" width="6" height="7" rx="1" />
      <rect x="14" y="13" width="6" height="7" rx="1" />
    </svg>
  );
}

function SpineViewIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="4" width="3" height="16" rx="1" />
      <rect x="9" y="3" width="4" height="17" rx="1" />
      <rect x="15" y="5" width="5" height="15" rx="1" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 7h16M7 12h10M10 17h4" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 8.5h3l1.4-2h7.2l1.4 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
      <circle cx="12" cy="14" r="3.2" />
    </svg>
  );
}

function useShelfPageSize(viewMode) {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1200 : window.innerWidth));

  useEffect(() => {
    function handleResize() {
      setWidth(window.innerWidth);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (viewMode === "spines") {
    if (width <= 420) return 7;
    if (width <= 650) return 8;
    if (width <= 950) return 11;
    return 15;
  }

  if (width <= 420) return 2;
  if (width <= 650) return 3;
  if (width <= 950) return 4;
  return 6;
}

export function CoverBook({ item, onSelectBook, onScoreChange, savingBookId }) {
  const book = item.book || {};
  const cover = coverUrl(book.cover);
  const [statusLabel, statusClass] = getLibraryStatus(item.status);

  return (
    <article className="library-v2-cover-card">
      <div className="library-v2-cover-visual">
        <button
          type="button"
          className="library-v2-cover-image"
          onClick={() => onSelectBook?.(book)}
          aria-label={`Abrir ficha de ${book.title || "este libro"}`}
        >
          {cover ? (
            <img
              src={cover}
              alt={`Portada de ${book.title || "libro"}`}
              loading="lazy"
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = "/images/librelula.png";
              }}
            />
          ) : (
            <img className="is-fallback" src="/images/librelula.png" alt="Portada no disponible" />
          )}
          <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
        </button>

        <div className="library-v2-score" role="group" aria-label={`Tu puntuación de ${book.title || "libro"}: ${formatShelfScore(item.score)}`}>
          {shelfStarFills(item.score).map((fill, index) => (
            <button
              type="button"
              key={index}
              disabled={savingBookId === item.book_id}
              onClick={() => onScoreChange(item, index + 1)}
              aria-label={`Puntuar con ${index + 1} ${index === 0 ? "estrella" : "estrellas"}`}
            >
              <span className={fill === 1 ? "is-filled" : fill === 0.5 ? "is-half" : ""} aria-hidden="true">★</span>
            </button>
          ))}
        </div>
      </div>

      <div className="library-v2-cover-copy">
        <strong>{book.title || "Libro sin título"}</strong>
        <small>{book.author || "Autor desconocido"}</small>
        {["reading", "rereading", "paused"].includes(item.status) ? (
          <div className="library-v2-progress" aria-label={`${Number(item.progress || 0)}% leído`}>
            <span style={{ width: `${Math.max(0, Math.min(100, Number(item.progress || 0)))}%` }} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function SpineBook({
  item,
  onSelectBook,
  onChooseFile,
  onEditCrop,
  onRemove,
  busy,
}) {
  const fileInputRef = useRef(null);
  const book = item.book || {};
  const generatedCover = coverUrl(book.cover);
  const personalUrl = String(item.personal_spine_url || "").trim();
  const crop = item.personal_spine_crop || { x: 50, y: 50, zoom: 1 };
  const showTitle = shouldShowSpineTitle({
    hasPersonalSpine: Boolean(personalUrl),
    showText: item.personal_spine_show_text,
  });

  return (
    <article
      className={`library-spine-item ${busy ? "is-busy" : ""}`}
      style={{ "--spine-variation": spineVariation(item.book_id) }}
    >
      <button
        type="button"
        className={`library-spine ${personalUrl ? "is-personal" : "is-generated"}`}
        onClick={() => onSelectBook?.(book)}
        title={`${book.title || "Libro"} · ${book.author || ""}`}
      >
        {personalUrl ? (
          <img
            src={personalUrl}
            alt={`Lomo personal de ${book.title || "libro"}`}
            loading="lazy"
            style={{
              objectPosition: `${crop.x}% ${crop.y}%`,
              transform: `scale(${crop.zoom})`,
            }}
          />
        ) : generatedCover ? (
          <img src={generatedCover} alt="" loading="lazy" />
        ) : (
          <span className="library-spine-fallback">
            <img src="/images/librelula.png" alt="" />
          </span>
        )}
        <span className="library-spine-overlay" />
        {showTitle ? <span className="library-spine-title">{book.title || "Libro"}</span> : null}
        {personalUrl ? <span className="library-spine-personal-badge">Personal</span> : null}
      </button>

      <button
        type="button"
        className="library-spine-media-action"
        title={personalUrl ? "Cambiar foto" : "Añadir foto"}
        aria-label={`${personalUrl ? "Cambiar" : "Añadir"} foto del lomo de ${book.title || "libro"}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          fileInputRef.current?.click();
        }}
      >
        <CameraIcon />
      </button>
      <input
        ref={fileInputRef}
        className="library-spine-file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onChooseFile(item, event)}
      />

      {personalUrl ? (
        <>
          <button type="button" className="library-spine-edit-action" onClick={() => onEditCrop(item)} aria-label={`Ajustar foto de ${book.title || "libro"}`}>⌖</button>
          <button type="button" className="library-spine-remove-action" onClick={() => onRemove(item)} aria-label={`Quitar lomo personal de ${book.title || "libro"}`}>×</button>
        </>
      ) : null}
    </article>
  );
}

function ShelfPagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;

  return (
    <nav className="library-v2-pagination" aria-label="Páginas de esta estantería">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">‹</button>
      <span>{page} / {totalPages}</span>
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Página siguiente">›</button>
    </nav>
  );
}

function ShelfSection({
  shelf,
  items,
  viewMode,
  pageSize,
  page,
  onPage,
  onShowAll,
  onSelectBook,
  onScoreChange,
  onRemoveBook,
  savingBookId,
  onChooseFile,
  onEditCrop,
  onRemoveSpine,
  savingSpineBookId,
}) {
  if (!items.length) return null;

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(totalPages, Math.max(1, page || 1));
  const visible = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <section className="library-v2-shelf-section">
      <header className="library-v2-shelf-heading">
        <div>
          <span className="profile-kicker">Estantería</span>
          <h2>{shelf.title}</h2>
          <p>{shelf.subtitle}</p>
        </div>
        <div className="library-v2-shelf-meta">
          <span>{items.length} {items.length === 1 ? "libro" : "libros"}</span>
          {onShowAll ? (
            <button type="button" onClick={onShowAll}>Ver todos ↗</button>
          ) : null}
        </div>
      </header>

      <div className={`library-v2-visual-row is-${viewMode}`}>
        {viewMode === "covers"
          ? visible.map((item) => (
              <CoverBook
                key={`${shelf.id}-${item.book_id}`}
                item={item}
                onSelectBook={onSelectBook}
                onScoreChange={onScoreChange}
                savingBookId={savingBookId}
              />
            ))
          : visible.map((item) => (
              <SpineBook
                key={`${shelf.id}-${item.book_id}`}
                item={item}
                onSelectBook={onSelectBook}
                onChooseFile={onChooseFile}
                onEditCrop={onEditCrop}
                onRemove={onRemoveSpine}
                busy={savingSpineBookId === item.book_id}
              />
            ))}
        <div className="library-v2-wood-rail" aria-hidden="true" />
      </div>

      <ShelfPagination page={safePage} totalPages={totalPages} onPage={onPage} />
    </section>
  );
}

export default function MiBiblioteca({ onOpenCatalog, onSelectBook }) {
  const [library, setLibrary] = useState({
    profile: null,
    items: [],
    counts: { all: 0, reading: 0, rereading: 0, paused: 0, completed: 0, planned: 0, dropped: 0 },
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [genreFilter, setGenreFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("recent");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === "undefined") return "covers";
    try {
      return normalizeLibraryViewMode(window.localStorage.getItem(LIBRARY_SPINE_VIEW_STORAGE_KEY));
    } catch {
      return "covers";
    }
  });
  const [pages, setPages] = useState({});
  const [showcaseShelfId, setShowcaseShelfId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingBookId, setSavingBookId] = useState("");
  const [savingSpineBookId, setSavingSpineBookId] = useState("");
  const [cropEditor, setCropEditor] = useState(null);
  const [message, setMessage] = useState(null);
  const pageSize = useShelfPageSize(viewMode);

  useEffect(() => {
    let cancelled = false;

    async function loadLibrary() {
      setLoading(true);
      setMessage(null);
      try {
        const data = await getMyLibrary();
        if (!cancelled) setLibrary(data);
      } catch (error) {
        if (!cancelled) setMessage({ type: "error", text: error.message || "No se pudo cargar tu biblioteca." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadLibrary();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LIBRARY_SPINE_VIEW_STORAGE_KEY, viewMode);
    } catch {
      // Optional preference only.
    }
  }, [viewMode]);

  useEffect(() => () => {
    if (cropEditor?.objectUrl) URL.revokeObjectURL(cropEditor.objectUrl);
  }, [cropEditor]);

  const genreOptions = useMemo(() => {
    const genres = library.items.flatMap((item) => genreValues(item.book?.genre));
    return [...new Set(genres)].sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));
  }, [library.items]);

  const yearOptions = useMemo(() => {
    const years = library.items
      .map((item) => Number(item.book?.year))
      .filter((year) => Number.isInteger(year) && year > 0);
    return [...new Set(years)].sort((left, right) => right - left);
  }, [library.items]);

  const hasAdvancedFilters =
    statusFilter !== "all" ||
    ratingFilter !== "all" ||
    genreFilter !== "all" ||
    yearFilter !== "all" ||
    sortOrder !== "recent";
  const isSearchMode = searchQuery.trim() !== "" || hasAdvancedFilters;
  const activeFilterCount = [
    statusFilter !== "all",
    ratingFilter !== "all",
    genreFilter !== "all",
    yearFilter !== "all",
    sortOrder !== "recent",
  ].filter(Boolean).length;

  const filteredItems = useMemo(() => {
    const query = normalizeText(searchQuery);
    const collator = new Intl.Collator("es", { sensitivity: "base" });

    const matches = library.items.filter((item) => {
      const book = item.book || {};
      const score = Number(item.score || 0);
      if (query && !normalizeText(`${book.title || ""} ${book.author || ""}`).includes(query)) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (ratingFilter === "unrated" && score !== 0) return false;
      if (!["all", "unrated"].includes(ratingFilter) && score !== Number(ratingFilter)) return false;
      if (genreFilter !== "all" && !genreValues(book.genre).includes(genreFilter)) return false;
      if (yearFilter !== "all" && Number(book.year || 0) !== Number(yearFilter)) return false;
      return true;
    });

    return matches.sort((left, right) => {
      const leftBook = left.book || {};
      const rightBook = right.book || {};
      if (sortOrder === "title") return collator.compare(leftBook.title || "", rightBook.title || "");
      if (sortOrder === "author") return collator.compare(leftBook.author || "", rightBook.author || "");
      if (sortOrder === "rating") return Number(right.score || 0) - Number(left.score || 0);
      if (sortOrder === "year") return Number(rightBook.year || 0) - Number(leftBook.year || 0);
      return Number(right.id || 0) - Number(left.id || 0);
    });
  }, [genreFilter, library.items, ratingFilter, searchQuery, sortOrder, statusFilter, yearFilter]);

  const shelfRows = useMemo(() => {
    if (isSearchMode) {
      return [{
        id: "results",
        title: "Resultados",
        subtitle: "Tu búsqueda y filtros aplicados.",
        items: filteredItems,
      }];
    }

    return SYSTEM_SHELVES.map((shelf) => ({
      ...shelf,
      items: sortShelfItems(
        library.items.filter((item) => shelf.statuses.includes(item.status)),
        shelf.id,
      ),
    })).filter((shelf) => shelf.items.length > 0);
  }, [filteredItems, isSearchMode, library.items]);

  const showcaseShelf = useMemo(
    () => shelfRows.find((shelf) => shelf.id === showcaseShelfId) || null,
    [shelfRows, showcaseShelfId],
  );

  function clearFilters() {
    setStatusFilter("all");
    setRatingFilter("all");
    setGenreFilter("all");
    setYearFilter("all");
    setSortOrder("recent");
  }

  async function handleScoreChange(item, score) {
    if (!library.profile?.legacy_id || !item.book_id) return;
    setSavingBookId(item.book_id);
    setMessage(null);
    try {
      await updateLibraryScore({ legacyUserId: library.profile.legacy_id, bookId: item.book_id, score });
      setLibrary((current) => ({
        ...current,
        items: current.items.map((currentItem) => currentItem.book_id === item.book_id ? { ...currentItem, score } : currentItem),
      }));
    } catch (error) {
      setMessage({ type: "error", text: error.message || "No se pudo guardar la puntuación." });
    } finally {
      setSavingBookId("");
    }
  }

  async function handleRemoveBook(item) {
    const bookId = String(item?.book_id || "").trim();
    if (!bookId || savingBookId === bookId) return;
    setSavingBookId(bookId);
    setMessage(null);

    try {
      await removeCatalogUserBook({ book_id: bookId });
      setLibrary((current) => {
        const items = current.items.filter((currentItem) => String(currentItem.book_id) !== bookId);
        return { ...current, items, counts: buildLibraryCounts(items) };
      });
      setMessage({ type: "success", text: "Libro quitado de tu biblioteca." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "No se pudo quitar el libro." });
    } finally {
      setSavingBookId("");
    }
  }

  function handleSpineFileSelected(item, event) {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setCropEditor({ mode: "upload", item, file, imageSrc: objectUrl, objectUrl });
  }

  function handleEditCrop(item) {
    if (!item.personal_spine_url) return;
    setCropEditor({ mode: "edit", item, file: null, imageSrc: item.personal_spine_url });
  }

  async function handleConfirmCrop(crop) {
    const editor = cropEditor;
    if (!editor?.item?.book_id) return;
    const bookId = editor.item.book_id;
    setCropEditor(null);
    setSavingSpineBookId(bookId);
    setMessage(null);

    try {
      if (editor.mode === "upload") {
        const uploaded = await uploadPersonalSpine({
          bookId,
          file: editor.file,
          crop,
          showText: crop.showText,
        });
        setLibrary((current) => ({
          ...current,
          items: current.items.map((item) => item.book_id === bookId
            ? {
                ...item,
                personal_spine_path: uploaded.path,
                personal_spine_url: uploaded.url,
                personal_spine_crop: uploaded.crop,
                personal_spine_show_text: uploaded.showText,
              }
            : item),
        }));
        setMessage({ type: "success", text: "Lomo personal guardado." });
      } else {
        const saved = await updatePersonalSpineCrop({
          bookId,
          crop,
          showText: crop.showText,
        });
        setLibrary((current) => ({
          ...current,
          items: current.items.map((item) => item.book_id === bookId
            ? {
                ...item,
                personal_spine_crop: saved.crop,
                personal_spine_show_text: saved.showText,
              }
            : item),
        }));
        setMessage({ type: "success", text: "Recorte actualizado." });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message || "No se pudo guardar el lomo personal." });
    } finally {
      setSavingSpineBookId("");
    }
  }

  async function handleRemovePersonalSpine(item) {
    if (!item.book_id) return;
    setSavingSpineBookId(item.book_id);
    setMessage(null);
    try {
      await removePersonalSpine({ bookId: item.book_id });
      setLibrary((current) => ({
        ...current,
        items: current.items.map((currentItem) => currentItem.book_id === item.book_id
          ? {
              ...currentItem,
              personal_spine_path: "",
              personal_spine_url: "",
              personal_spine_crop: { x: 50, y: 50, zoom: 1 },
              personal_spine_show_text: false,
            }
          : currentItem),
      }));
      setMessage({ type: "success", text: "Lomo personal eliminado." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "No se pudo quitar el lomo personal." });
    } finally {
      setSavingSpineBookId("");
    }
  }

  return (
    <main className="library-page library-v2-page">
      <header className="library-v2-hero">
        <div>
          <span className="profile-kicker">Tu rincón lector</span>
          <h1>Mi biblioteca</h1>
          <p>Una estantería viva para tus lecturas, tus lomos reales y tus próximas historias.</p>
        </div>
        <button className="profile-button primary" type="button" onClick={onOpenCatalog}>+ Añadir libro</button>
      </header>

      <section className="library-v2-toolbar" aria-label="Herramientas de Mi biblioteca">
        <label className="library-v2-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.4-3.4" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar título o autor"
          />
        </label>

        <button type="button" className={`library-v2-filter-button ${activeFilterCount ? "is-active" : ""}`} onClick={() => setFiltersOpen(true)}>
          <FilterIcon />
          <span>Filtros</span>
          {activeFilterCount ? <small>{activeFilterCount}</small> : null}
        </button>

        <div className="library-view-switcher" role="group" aria-label="Cambiar vista">
          <button type="button" aria-label="Ver portadas" aria-pressed={viewMode === "covers"} onClick={() => setViewMode("covers")}><CoverViewIcon /></button>
          <button type="button" aria-label="Ver lomos" aria-pressed={viewMode === "spines"} onClick={() => setViewMode("spines")}><SpineViewIcon /></button>
        </div>
      </section>

      {isSearchMode ? (
        <div className="library-v2-active-mode">
          <span>{filteredItems.length} {filteredItems.length === 1 ? "resultado" : "resultados"}</span>
          <button type="button" onClick={() => { setSearchQuery(""); clearFilters(); }}>Volver a mis estanterías</button>
        </div>
      ) : null}

      {message ? <p className={`library-message ${message.type === "error" ? "is-error" : "is-success"}`}>{message.text}</p> : null}

      {loading ? (
        <section className="profile-empty library-empty">
          <span>📚</span>
          <h2>Ordenando tu biblioteca…</h2>
          <p>Estamos colocando cada libro en su estante.</p>
        </section>
      ) : null}

      {!loading && library.items.length === 0 ? (
        <section className="profile-empty library-empty">
          <span>📚</span>
          <h2>Tu primera balda está esperando</h2>
          <p>Añade un libro desde el catálogo y empezaremos a construir tu biblioteca.</p>
          <button className="profile-button primary" type="button" onClick={onOpenCatalog}>Explorar catálogo</button>
        </section>
      ) : null}

      {!loading && library.items.length > 0 && shelfRows.every((shelf) => !shelf.items.length) ? (
        <section className="profile-empty library-empty">
          <span>🔎</span>
          <h2>No encontramos ese libro</h2>
          <p>Prueba con otra búsqueda o limpia los filtros.</p>
          <button className="profile-button secondary" type="button" onClick={() => { setSearchQuery(""); clearFilters(); }}>Limpiar búsqueda</button>
        </section>
      ) : null}

      {!loading ? (
        <div className="library-v2-shelves">
          {shelfRows.map((shelf) => (
            <ShelfSection
              key={shelf.id}
              shelf={shelf}
              items={shelf.items}
              viewMode={viewMode}
              pageSize={pageSize}
              page={pages[shelf.id] || 1}
              onPage={(page) => setPages((current) => ({ ...current, [shelf.id]: page }))}
              onShowAll={!isSearchMode ? () => setShowcaseShelfId(shelf.id) : null}
              onSelectBook={onSelectBook}
              onScoreChange={handleScoreChange}
              onRemoveBook={handleRemoveBook}
              savingBookId={savingBookId}
              onChooseFile={handleSpineFileSelected}
              onEditCrop={handleEditCrop}
              onRemoveSpine={handleRemovePersonalSpine}
              savingSpineBookId={savingSpineBookId}
            />
          ))}
        </div>
      ) : null}

      {showcaseShelf ? (
        <LibraryShelfShowcase
          shelf={showcaseShelf}
          items={showcaseShelf.items}
          initialViewMode={viewMode}
          onClose={() => setShowcaseShelfId("")}
          onSelectBook={onSelectBook}
        />
      ) : null}

      {filtersOpen ? (
        <div className="library-v2-filter-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setFiltersOpen(false);
        }}>
          <section className="library-v2-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="library-filter-title">
            <header>
              <div>
                <span className="profile-kicker">Afinar biblioteca</span>
                <h2 id="library-filter-title">Filtros</h2>
              </div>
              <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Cerrar filtros">×</button>
            </header>

            <div className="library-v2-filter-grid">
              <label>
                <span>Estado</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  {Object.entries(LIBRARY_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>
                <span>Puntuación</span>
                <select value={ratingFilter} onChange={(event) => setRatingFilter(event.target.value)}>
                  <option value="all">Todas</option>
                  {[5, 4, 3, 2, 1].map((score) => <option key={score} value={String(score)}>{score} estrellas</option>)}
                  <option value="unrated">Sin puntuar</option>
                </select>
              </label>
              <label>
                <span>Género</span>
                <select value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)}>
                  <option value="all">Todos</option>
                  {genreOptions.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
                </select>
              </label>
              <label>
                <span>Año</span>
                <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                  <option value="all">Todos</option>
                  {yearOptions.map((year) => <option key={year} value={String(year)}>{year}</option>)}
                </select>
              </label>
              <label className="is-wide">
                <span>Orden</span>
                <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                  <option value="recent">Añadidos recientemente</option>
                  <option value="rating">Mejor puntuados</option>
                  <option value="title">Título A–Z</option>
                  <option value="author">Autor A–Z</option>
                  <option value="year">Año más reciente</option>
                </select>
              </label>
            </div>

            <footer>
              <button type="button" className="profile-button secondary" onClick={clearFilters}>Limpiar</button>
              <button type="button" className="profile-button primary" onClick={() => setFiltersOpen(false)}>Ver biblioteca</button>
            </footer>
          </section>
        </div>
      ) : null}

      {cropEditor ? (
        <SpineCropEditor
          imageSrc={cropEditor.imageSrc}
          book={cropEditor.item.book}
          initialValue={{
            ...cropEditor.item.personal_spine_crop,
            showText: cropEditor.item.personal_spine_show_text,
          }}
          onCancel={() => setCropEditor(null)}
          onConfirm={handleConfirmCrop}
        />
      ) : null}
    </main>
  );
}
