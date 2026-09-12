import { useEffect, useMemo, useRef, useState } from "react";
import "./LibraryShelfShowcase.css";
import "./LibraryShelfActions.css";
import { shouldShowSpineTitle } from "./lib/librarySpineMedia.js";
import {
  filterShelfItems,
  formatShelfScore,
  groupShelfItemsByScore,
  shelfStarFills,
  composeSpineRow,
} from "./lib/libraryShelfSearch.js";

function coverUrl(cover) {
  const value = String(cover || "").trim();
  if (!value) return "/images/librelula.png";
  if (/^https?:\/\//i.test(value)) return value;
  return `/${value.replace(/^\/+/, "")}`;
}

function spineVariation(value) {
  return [...String(value || "")].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  ) % 5;
}

function chunk(items, size) {
  const rows = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function useRowSize(mode) {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1200 : window.innerWidth));

  useEffect(() => {
    function handleResize() {
      setWidth(window.innerWidth);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (mode === "spines") {
    if (width <= 420) return 10;
    if (width <= 650) return 12;
    if (width <= 950) return 15;
    return 20;
  }

  if (width <= 420) return 3;
  if (width <= 650) return 4;
  if (width <= 950) return 5;
  return 7;
}

function PhotoScoreRail({ score, horizontal = false }) {
  const scoreLabel = formatShelfScore(score);

  return (
    <span
      className={`library-showcase-photo-score ${horizontal ? "is-horizontal" : ""}`}
      role={horizontal ? undefined : "img"}
      aria-hidden={horizontal || undefined}
      aria-label={`Tu puntuación: ${scoreLabel}`}
    >
      {shelfStarFills(score).map((fill, index) => {
        const fillClass = fill === 1 ? "is-filled" : fill === 0.5 ? "is-half" : "";
        return <span className={fillClass} key={index} aria-hidden="true">★</span>;
      })}
    </span>
  );
}

function CoverTile({ item, photoMode, onSelectBook }) {
  const book = item.book || {};
  const scoreLabel = formatShelfScore(item.score);
  const visual = (
    <span className="library-showcase-cover-visual">
      <img
        src={coverUrl(book.cover)}
        alt={`Portada de ${book.title || "libro"}`}
        loading="lazy"
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = "/images/librelula.png";
        }}
      />
      <PhotoScoreRail score={item.score} />
    </span>
  );

  if (photoMode) {
    return (
      <div className="library-showcase-cover-card is-photo" title={book.title || "Libro"}>
        {visual}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="library-showcase-cover-card"
      onClick={() => onSelectBook?.(book)}
      aria-label={`Abrir ficha de ${book.title || "este libro"}. Tu puntuación: ${scoreLabel}`}
    >
      {visual}
      <span className="library-showcase-cover-copy">
        <strong>{book.title || "Libro sin título"}</strong>
        <small>{book.author || "Autor desconocido"}</small>
      </span>
    </button>
  );
}

function SpineTile({
  item,
  photoMode,
  onSelectBook,
  onChooseFile,
  onEditCrop,
  onRemove,
  busy,
  horizontal = false,
  leaning = false,
}) {
  const fileInputRef = useRef(null);
  const book = item.book || {};
  const personalUrl = String(item.personal_spine_url || "").trim();
  const generatedCover = coverUrl(book.cover);
  const crop = item.personal_spine_crop || { x: 50, y: 50, zoom: 1 };
  const showTitle = shouldShowSpineTitle({
    hasPersonalSpine: Boolean(personalUrl),
    showText: item.personal_spine_show_text,
  });
  const scoreLabel = formatShelfScore(item.score);

  const variation = spineVariation(item.book_id);
  const className = `library-showcase-spine is-variation-${variation} ${personalUrl ? "is-personal" : "is-generated"} ${horizontal ? "is-horizontal" : ""}`;
  const body = (
    <span className="library-showcase-spine-face">
      {personalUrl ? (
        <img
          src={personalUrl}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = "/images/librelula.png";
          }}
          style={{
            objectPosition: `${crop.x}% ${crop.y}%`,
            transform: `scale(${crop.zoom})`,
          }}
        />
      ) : (
        <img
          src={generatedCover}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = "/images/librelula.png";
          }}
        />
      )}
      <span className="library-showcase-spine-shade" aria-hidden="true" />
      {showTitle ? <span className="library-showcase-spine-title">{book.title || "Libro"}</span> : null}
    </span>
  );
  const palette = ["#31534d", "#6c3f4d", "#314e6b", "#77522f", "#57476b"];

  return (
    <div className={`library-showcase-spine-entry ${horizontal ? "is-horizontal" : ""} ${leaning ? "is-leaning" : ""} ${busy ? "is-busy" : ""}`} style={{ "--spine-cloth": palette[variation] }}>
      {photoMode ? (
        <div className={className} title={`${book.title || "Libro"} · ${scoreLabel}`}>
          {body}
        </div>
      ) : (
        <button
          type="button"
          className={className}
          onClick={() => onSelectBook?.(book)}
          aria-label={`Abrir ficha de ${book.title || "este libro"}. Tu puntuación: ${scoreLabel}`}
        >
          {body}
        </button>
      )}
      {!photoMode ? (
        <>
          <button
            type="button"
            className="library-showcase-spine-media-action"
            title={personalUrl ? "Cambiar foto del lomo" : "Subir foto del lomo"}
            aria-label={`${personalUrl ? "Cambiar" : "Subir"} foto del lomo de ${book.title || "libro"}`}
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
            className="library-showcase-spine-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onChooseFile?.(item, event)}
          />
          {personalUrl ? (
            <>
              <button
                type="button"
                className="library-showcase-spine-edit-action"
                onClick={(event) => {
                  event.stopPropagation();
                  onEditCrop?.(item);
                }}
                aria-label={`Ajustar foto de ${book.title || "libro"}`}
              >⌖</button>
              <button
                type="button"
                className="library-showcase-spine-remove-action"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove?.(item);
                }}
                aria-label={`Quitar lomo personal de ${book.title || "libro"}`}
              >×</button>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SpineRowBooks({ items, rowIndex, photoMode, onSelectBook, onChooseFile, onEditCrop, onRemove, savingBookId }) {
  const { upright, stack } = composeSpineRow(items);
  return (
    <>
      {upright.map((item, index) => (
        <SpineTile
          key={item.book_id}
          item={item}
          photoMode={photoMode}
          onSelectBook={onSelectBook}
          onChooseFile={onChooseFile}
          onEditCrop={onEditCrop}
          onRemove={onRemove}
          busy={savingBookId === item.book_id}
          leaning={index === upright.length - 1 && upright.length > 3 && rowIndex % 2 === 0}
        />
      ))}
      {stack.length > 0 ? (
        <div className="library-showcase-spine-stack">
          {stack.map((item) => (
            <SpineTile
              key={item.book_id}
              item={item}
              photoMode={photoMode}
              onSelectBook={onSelectBook}
              onChooseFile={onChooseFile}
              onEditCrop={onEditCrop}
              onRemove={onRemove}
              busy={savingBookId === item.book_id}
              horizontal
            />
          ))}
        </div>
      ) : null}
    </>
  );
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

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
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

export default function LibraryShelfShowcase({
  shelf,
  items,
  initialViewMode = "covers",
  onClose,
  onSelectBook,
  onChooseSpineFile,
  onEditSpine,
  onRemoveSpine,
  savingSpineBookId,
}) {
  const [mode, setMode] = useState(initialViewMode === "spines" ? "spines" : "covers");
  const [photoMode, setPhotoMode] = useState(false);
  const [query, setQuery] = useState("");
  const [scoreFilter, setScoreFilter] = useState("all");
  const rowSize = useRowSize(mode);
  const visibleItems = useMemo(
    () => filterShelfItems(items, { query, score: scoreFilter }),
    [items, query, scoreFilter],
  );
  const ratingGroups = useMemo(
    () => groupShelfItemsByScore(visibleItems).map((group) => ({
      ...group,
      rows: chunk(group.items, rowSize),
    })),
    [rowSize, visibleItems],
  );
  const totalItems = Array.isArray(items) ? items.length : 0;
  const hasFilters = query.trim() !== "" || scoreFilter !== "all";

  function clearSearch() {
    setQuery("");
    setScoreFilter("all");
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      if (photoMode) setPhotoMode(false);
      else onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, photoMode]);

  return (
    <div
      className={`library-showcase ${photoMode ? "is-photo-mode" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={photoMode ? "library-showcase-photo-title" : "library-showcase-title"}
      onClick={photoMode ? () => setPhotoMode(false) : undefined}
    >
      {photoMode ? (
        <button
          type="button"
          className="library-showcase-photo-back"
          onClick={(event) => {
            event.stopPropagation();
            setPhotoMode(false);
          }}
        >
          ← Volver
        </button>
      ) : null}
      <div className="library-showcase-shell">
        <header className="library-showcase-header">
          <button type="button" className="library-showcase-back" onClick={onClose}>← Biblioteca</button>
          <div className="library-showcase-heading">
            <span className="profile-kicker">Estantería completa</span>
            <h1 id="library-showcase-title">{shelf?.title || "Mis libros"}</h1>
            <p>{shelf?.subtitle || "Todos tus libros, juntos."}</p>
            <small>
              {hasFilters ? `${visibleItems.length} de ${totalItems}` : totalItems} {totalItems === 1 ? "libro" : "libros"}
            </small>
          </div>
          <div className="library-showcase-controls">
            <div className="library-showcase-switcher" role="group" aria-label="Cambiar vista de estantería completa">
              <button type="button" aria-pressed={mode === "covers"} onClick={() => setMode("covers")} aria-label="Ver portadas"><CoverViewIcon /></button>
              <button type="button" aria-pressed={mode === "spines"} onClick={() => setMode("spines")} aria-label="Ver lomos"><SpineViewIcon /></button>
            </div>
            <button
              type="button"
              className="library-showcase-photo-button"
              onClick={() => setPhotoMode(true)}
              title="Oculta los controles; toca cualquier punto para volver"
            >
              ◫ Modo foto
            </button>
          </div>
        </header>

        <section className={`library-showcase-photo-heading ${photoMode ? "is-visible" : ""}`} aria-hidden={!photoMode}>
          <span>Librélula</span>
          <h1 id="library-showcase-photo-title">{shelf?.title || "Mis libros"}</h1>
          <p>{visibleItems.length} {visibleItems.length === 1 ? "libro" : "libros"}</p>
        </section>

        <section className="library-showcase-tools" aria-label="Buscar y filtrar esta estantería">
          <label className="library-showcase-search">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar título o autor"
              aria-label="Buscar título o autor en esta estantería"
            />
          </label>
          <label className="library-showcase-score-filter">
            <span>Puntuación</span>
            <select
              value={scoreFilter}
              onChange={(event) => setScoreFilter(event.target.value)}
              aria-label="Filtrar por puntuación"
            >
              <option value="all">Todas</option>
              <option value="5">5 estrellas</option>
              <option value="4">4–4,5 estrellas</option>
              <option value="3">3–3,5 estrellas</option>
              <option value="2">2–2,5 estrellas</option>
              <option value="1">1–1,5 estrellas</option>
              <option value="unrated">Sin puntuar</option>
            </select>
          </label>
          <span className="library-showcase-result-count" aria-live="polite">
            {visibleItems.length} {visibleItems.length === 1 ? "resultado" : "resultados"}
          </span>
          {hasFilters ? (
            <button type="button" className="library-showcase-clear" onClick={clearSearch}>Limpiar</button>
          ) : null}
        </section>

        {visibleItems.length === 0 ? (
          <section className="library-showcase-empty">
            <h2>No encontramos ese libro</h2>
            <p>Prueba con otro título, autor o puntuación.</p>
            <button type="button" onClick={clearSearch}>Limpiar búsqueda</button>
          </section>
        ) : null}

        <div className={`library-showcase-rows is-${mode}`}>
          {ratingGroups.map((group) => (
            <section className="library-showcase-rating-group" key={group.score} aria-label={group.label}>
              <header className="library-showcase-rating-divider">
                <PhotoScoreRail score={group.score} horizontal />
                <strong>{group.label}</strong>
                <small>{group.items.length} {group.items.length === 1 ? "libro" : "libros"}</small>
              </header>
              {group.rows.map((row, rowIndex) => (
                <div className={`library-showcase-row is-${mode}`} key={`${shelf?.id || "shelf"}-${group.score}-${rowIndex}`}>
                  <div className="library-showcase-books">
                    {mode === "covers" ? row.map((item) => (
                      <CoverTile
                        key={`${group.score}-${rowIndex}-${item.book_id}`}
                        item={item}
                        photoMode
                        onSelectBook={onSelectBook}
                      />
                    )) : (
                      <SpineRowBooks
                        items={row}
                        rowIndex={rowIndex}
                        photoMode={photoMode}
                        onSelectBook={onSelectBook}
                        onChooseFile={onChooseSpineFile}
                        onEditCrop={onEditSpine}
                        onRemove={onRemoveSpine}
                        savingBookId={savingSpineBookId}
                      />
                    )}
                  </div>
                  <div className="library-showcase-wood" aria-hidden="true" />
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
