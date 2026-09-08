import { useEffect, useMemo, useRef, useState } from "react";
import { publicUrl } from "./api.js";
import MisResenas from "./MisResenas.jsx";
import {
  getProfileOverview,
  uploadProfileAvatar,
  uploadProfileCover,
  updateProfileAvatar,
  updateProfileBio,
  normalizeProfileVisualSettings,
  updateProfileVisualSettings,
  updateFeaturedBooks,
  updateFeaturedCollection,
  updateFavoriteBooks,
  updateFavoriteAuthors,
} from "./lib/profileApi.js";
import { getProfileConnections } from "./lib/friendsApi.js";
import ReaderCollections from "./ReaderCollections.jsx";
import "./PerfilSupabase.css";

const PROFILE_TABS = [
  { id: "summary", label: "Resumen" },
  { id: "shelf", label: "Estantería" },
  { id: "activity", label: "Actividad" },
  { id: "favorites", label: "Favoritos" },
  { id: "reviews", label: "Reseñas" },
];

const SHELF_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "completed", label: "Leídos" },
  { id: "reading", label: "Leyendo" },
  { id: "planned", label: "Pendientes" },
  { id: "dropped", label: "Abandonados" },
];

const FEATURED_COLLECTIONS = [
  { id: "favorites", label: "Mis favoritos" },
  { id: "completed", label: "Libros leídos" },
  { id: "reading", label: "Lo que estoy leyendo" },
  { id: "planned", label: "Mi lista de pendientes" },
  { id: "custom", label: "Selección manual" },
];

const PROFILE_AVATARS = [1, 2, 3, 4, 5, 6].map((number) => ({
  value: `images/avatar/avatar${number}.png`,
  label: `Icono ${number}`,
}));

function clampProgress(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-ES").format(Number(value) || 0);
}

function formatDate(value, withTime = false) {
  if (!value) return "Sin fecha";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(new Date(value));
  } catch {
    return "Sin fecha";
  }
}

function assetUrl(path, fallback = "images/librelula.png") {
  const clean = String(path || "").trim();
  if (!clean || clean === "default.jpg") {
    return publicUrl(fallback);
  }

  if (/^https?:\/\//i.test(clean) || clean.startsWith("blob:")) {
    return clean;
  }

  return publicUrl(clean);
}

function avatarTransform(settings) {
  const scale = Number(settings?.avatarScale || 100) / 100;
  const x = Number(settings?.avatarX || 0);
  const y = Number(settings?.avatarY || 0);
  return `translate(${x}%, ${y}%) scale(${scale})`;
}

function coverStyle(url, settings) {
  const visualSettings = normalizeProfileVisualSettings(settings);
  return {
    "--profile-cover": `url("${url}")`,
    "--profile-cover-x": `${visualSettings.coverX}%`,
    "--profile-cover-y": `${visualSettings.coverY}%`,
    "--profile-cover-scale": visualSettings.coverScale / 100,
  };
}

function titleForStatus(status) {
  if (["reading", "rereading"].includes(status)) return "Leyendo";
  if (status === "completed") return "Leído";
  if (status === "planned") return "Pendiente";
  if (status === "paused") return "Pausado";
  if (status === "dropped") return "Abandonado";
  return "En tu biblioteca";
}

function EmptyBlock({ children }) {
  return <p className="profile-empty">{children}</p>;
}

function SectionHeading({ icon, title, meta, action, onAction }) {
  return (
    <div className="profile-section-heading">
      <div className="profile-section-title">
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        <h2>{title}</h2>
        {meta ? <small>{meta}</small> : null}
      </div>
      {action ? (
        <button type="button" className="profile-text-action" onClick={onAction}>
          {action} <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </div>
  );
}

function CoverImage({ book, className = "" }) {
  return (
    <img
      className={className}
      src={assetUrl(book?.cover)}
      alt={book?.title ? `Portada de ${book.title}` : "Portada del libro"}
      loading="lazy"
      onError={(event) => {
        event.currentTarget.src = publicUrl("images/librelula.png");
      }}
    />
  );
}

function ShelfPreview({ books, onSelectBook }) {
  const visible = (books || []).slice(0, 4);
  if (!visible.length) {
    return <EmptyBlock>Tu estantería empezará a llenarse cuando añadas libros.</EmptyBlock>;
  }

  return (
    <div className="profile-shelf-preview" aria-label="Vista previa de tu estantería">
      <div className="profile-shelf-books">
        {visible.map((book) => (
          <button
            type="button"
            key={`${book.id}-${book.status}`}
            className="profile-shelf-book"
            onClick={() => onSelectBook?.(book)}
            title={book.title}
          >
            <CoverImage book={book} />
          </button>
        ))}
      </div>
      <div className="profile-wood-shelf" aria-hidden="true" />
    </div>
  );
}

function ReadingCard({ book, onSelectBook }) {
  const progress = clampProgress(book.progress);
  return (
    <button
      type="button"
      className="profile-reading-book"
      onClick={() => onSelectBook?.(book)}
    >
      <CoverImage book={book} />
      <span className="profile-reading-copy">
        <strong>{book.title || "Libro sin título"}</strong>
        <small>{book.author || "Autor desconocido"}</small>
        <span className="profile-progress-row">
          <span className="profile-progress-track">
            <span style={{ width: `${progress}%` }} />
          </span>
          <em>{progress}%</em>
        </span>
      </span>
    </button>
  );
}

function SmallBookCard({ book, onSelectBook, showDate = false }) {
  return (
    <button
      type="button"
      className="profile-small-book"
      onClick={() => onSelectBook?.(book)}
    >
      <CoverImage book={book} />
      <span>
        <strong>{book.title || "Libro sin título"}</strong>
        <small>{book.author || "Autor desconocido"}</small>
        {showDate ? <time>{formatDate(book.added_at || book.activity_date)}</time> : null}
      </span>
    </button>
  );
}

function StarRating({ score }) {
  const safeScore = Math.max(0, Math.min(5, Number(score) || 0));
  return (
    <span className="profile-stars" aria-label={`${safeScore} de 5 estrellas`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className={index < safeScore ? "is-filled" : ""}>★</span>
      ))}
    </span>
  );
}

function ReviewPreview({ review, onSelectBook }) {
  return (
    <button
      type="button"
      className="profile-review-preview"
      onClick={() => onSelectBook?.(review.book)}
    >
      <CoverImage book={review.book} />
      <span className="profile-review-copy">
        <span className="profile-review-topline">
          <strong>{review.book?.title || "Libro sin título"}</strong>
          <StarRating score={review.score} />
        </span>
        <small>{review.book?.author || "Autor desconocido"}</small>
        <p>{review.review || "Valoración guardada sin comentario."}</p>
      </span>
    </button>
  );
}

function FeaturedCollection({ data, onSelectBook, onCollectionChange }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(data.featuredCollectionTitle || "");
  const [selectedIds, setSelectedIds] = useState(() => (data.featuredBooks || []).map((book) => String(book.id)));
  const [saving, setSaving] = useState(false);
  const label = data.featuredCollectionTitle || FEATURED_COLLECTIONS.find((item) => item.id === data.featuredCollection)?.label
    || "Mi colección";

  function toggleBook(bookId) {
    const id = String(bookId);
    setSelectedIds((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : current.length >= 6 ? current : [...current, id]);
  }

  async function saveSelection() {
    setSaving(true);
    try {
      await updateFeaturedBooks(selectedIds);
      onCollectionChange?.("custom", data.featuredCollectionTitle, selectedIds);
      setPickerOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function saveTitle(event) {
    event.preventDefault();
    const title = titleDraft.trim().slice(0, 80);
    await onCollectionChange?.(data.featuredCollection, title);
    setTitleEditing(false);
  }

  return (
    <article className="profile-panel profile-featured-panel">
      <div className="profile-featured-heading">
        <div>
          <span className="profile-eyebrow">Expositor</span>
          {titleEditing ? (
            <form className="profile-featured-title-editor" onSubmit={saveTitle}>
              <label className="sr-only" htmlFor="featured-collection-title">Título de la colección destacada</label>
              <input id="featured-collection-title" value={titleDraft} maxLength={80} onChange={(event) => setTitleDraft(event.target.value)} placeholder="Mi colección" autoFocus />
              <button type="submit">Guardar</button>
            </form>
          ) : <h2>{label}</h2>}
          {data.isOwner ? <button type="button" className="profile-featured-title-edit" onClick={() => { setTitleDraft(data.featuredCollectionTitle || label); setTitleEditing(true); }}>Editar título</button> : null}
          {data.isOwner ? <p className="profile-featured-note">Fijada en tu perfil</p> : null}
        </div>
        {data.isOwner ? (
          <label className="profile-featured-select">
            <span className="sr-only">Colección que quieres destacar</span>
            <select value={data.featuredCollection} onChange={(event) => {
              const value = event.target.value;
              onCollectionChange?.(value, data.featuredCollectionTitle);
              if (value === "custom") setPickerOpen(true);
            }}>
              {FEATURED_COLLECTIONS.map((collection) => <option key={collection.id} value={collection.id}>{collection.label}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      {data.isOwner && data.featuredCollection === "custom" ? (
        <button type="button" className="profile-featured-edit" onClick={() => setPickerOpen(true)}>
          <span aria-hidden="true">✦</span> Elegir libros ({data.featuredBooks?.length || 0}/6)
        </button>
      ) : null}
      {data.featuredBooks?.length ? (
        <div className="profile-featured-books">
          {data.featuredBooks.map((book) => (
            <button type="button" key={book.id} className="profile-featured-book" onClick={() => onSelectBook?.(book)} title={book.title}>
              <CoverImage book={book} />
              <span>{book.title}</span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyBlock>{data.isOwner ? "Añade libros a esta sección para que tu perfil tenga una pequeña carta de presentación." : "Esta persona todavía no ha elegido una colección destacada."}</EmptyBlock>
      )}
      {pickerOpen && data.isOwner ? (
        <div className="profile-featured-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false); }}>
          <section className="profile-featured-picker" role="dialog" aria-modal="true" aria-labelledby="featured-picker-title">
            <header>
              <div><span className="profile-eyebrow">Tu expositor</span><h3 id="featured-picker-title">Elige los libros que quieres enseñar</h3></div>
              <button type="button" aria-label="Cerrar" onClick={() => setPickerOpen(false)}>×</button>
            </header>
            <p>Selecciona hasta seis libros. Se mostrarán en el orden en que los elijas.</p>
            <div className="profile-featured-picker-grid">
              {(data.shelfBooks || []).map((book) => {
                const selected = selectedIds.includes(String(book.id));
                return (
                  <button type="button" key={book.id} className={selected ? "is-selected" : ""} onClick={() => toggleBook(book.id)} aria-pressed={selected}>
                    <CoverImage book={book} />
                    <span>{book.title}</span>
                    {selected ? <b aria-hidden="true">{selectedIds.indexOf(String(book.id)) + 1}</b> : null}
                  </button>
                );
              })}
            </div>
            {!data.shelfBooks?.length ? <EmptyBlock>Añade algún libro a tu biblioteca para poder destacarlo.</EmptyBlock> : null}
            <footer><span>{selectedIds.length}/6 seleccionados</span><button type="button" className="profile-picker-save" onClick={saveSelection} disabled={saving}>{saving ? "Guardando…" : "Guardar selección"}</button></footer>
          </section>
        </div>
      ) : null}
    </article>
  );
}

function VisualRange({ id, label, value, min, max, onChange, formatValue = (current) => current }) {
  return (
    <label className="profile-visual-range" htmlFor={id}>
      <span>
        <span>{label}</span>
        <output htmlFor={id}>{formatValue(value)}</output>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ProfileVisualSettings({
  avatarUrl,
  coverUrl,
  displayName,
  handle,
  settings,
  onChange,
  onReset,
  onClose,
  onSave,
  saving,
  error,
}) {
  return (
    <div className="profile-visual-settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="profile-visual-settings" role="dialog" aria-modal="true" aria-labelledby="profile-visual-settings-title">
        <header>
          <div>
            <span className="profile-eyebrow">Personaliza tu carnet</span>
            <h2 id="profile-visual-settings-title">Ajustes visuales</h2>
          </div>
          <button type="button" className="profile-visual-settings-close" onClick={onClose} aria-label="Cerrar ajustes">×</button>
        </header>

        <div className="profile-visual-preview" aria-label="Vista previa de tu portada e icono">
          <div className="profile-visual-preview-banner" style={coverStyle(coverUrl, settings)}>
            <div className="profile-hero-banner-image" aria-hidden="true" />
            <span>Portada</span>
          </div>
          <div className="profile-visual-preview-card">
            <span className="profile-visual-preview-avatar">
              <img src={avatarUrl} alt={`Vista previa del avatar de ${displayName}`} style={{ "--profile-avatar-transform": avatarTransform(settings) }} />
            </span>
            <div>
              <strong>{displayName}</strong>
              <small>@{handle}</small>
            </div>
          </div>
        </div>

        <div className="profile-visual-controls">
          <fieldset>
            <legend>Icono</legend>
            <VisualRange id="profile-avatar-scale" label="Zoom" value={settings.avatarScale} min={100} max={160} onChange={(value) => onChange("avatarScale", value)} formatValue={(value) => `${value}%`} />
            <VisualRange id="profile-avatar-x" label="Horizontal" value={settings.avatarX} min={-20} max={20} onChange={(value) => onChange("avatarX", value)} formatValue={(value) => `${value > 0 ? "+" : ""}${value}`} />
            <VisualRange id="profile-avatar-y" label="Vertical" value={settings.avatarY} min={-20} max={20} onChange={(value) => onChange("avatarY", value)} formatValue={(value) => `${value > 0 ? "+" : ""}${value}`} />
          </fieldset>
          <fieldset>
            <legend>Fondo</legend>
            <VisualRange id="profile-cover-scale" label="Zoom" value={settings.coverScale} min={100} max={140} onChange={(value) => onChange("coverScale", value)} formatValue={(value) => `${value}%`} />
            <VisualRange id="profile-cover-x" label="Horizontal" value={settings.coverX} min={0} max={100} onChange={(value) => onChange("coverX", value)} formatValue={(value) => `${value}%`} />
            <VisualRange id="profile-cover-y" label="Vertical" value={settings.coverY} min={0} max={100} onChange={(value) => onChange("coverY", value)} formatValue={(value) => `${value}%`} />
          </fieldset>
        </div>

        {error ? <p className="profile-visual-settings-error" role="alert">{error}</p> : null}
        <footer>
          <button type="button" className="profile-visual-reset" onClick={onReset}>Restablecer</button>
          <div>
            <button type="button" className="profile-visual-cancel" onClick={onClose}>Cancelar</button>
            <button type="button" className="profile-visual-save" onClick={onSave} disabled={saving}>{saving ? "Guardando…" : "Guardar ajustes"}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function CircleReader({ reader, onSelectBook, onSelectProfile }) {
  const fallback = publicUrl("images/avatar/avatar1.png");
  return (
    <article className="profile-circle-reader">
      <button type="button" className="profile-circle-avatar-button" onClick={() => onSelectProfile?.(reader.id)} aria-label={`Abrir el perfil de ${reader.username || "lector"}`}><img className="profile-circle-avatar" src={assetUrl(reader.avatar, "images/avatar/avatar1.png")} alt="" onError={(event) => { event.currentTarget.src = fallback; }} /></button>
      <div>
        <strong>{reader.display_name || reader.username || "Lectora"}</strong>
        <p>
          {reader.current_book
            ? `Leyendo: ${reader.current_book.title}`
            : "Todavía no ha marcado una lectura actual."}
        </p>
        {reader.current_book ? (
          <div className="profile-circle-progress">
            <span style={{ width: `${clampProgress(reader.current_book.progress)}%` }} />
          </div>
        ) : null}
      </div>
      {reader.current_book ? (
        <button
          type="button"
          className="profile-circle-book-link"
          onClick={() => onSelectBook?.(reader.current_book)}
          aria-label={`Abrir ficha de ${reader.current_book.title}`}
        >
          <CoverImage book={reader.current_book} />
        </button>
      ) : null}
    </article>
  );
}

function SummaryView({ data, onSelectBook, onTabChange, onCollectionChange, onSelectProfile, onSelectCollection }) {
  const recentDays = (data.activityDays || []).slice(-7);

  return (
    <section className="profile-dashboard" id="profile-panel-summary" role="tabpanel">
      <div className="profile-dashboard-main">
        <FeaturedCollection data={data} onSelectBook={onSelectBook} onCollectionChange={onCollectionChange} />
        <ReaderCollections
          isLoggedIn={data.authenticated}
          creatorId={data.isOwner ? null : data.profile?.id}
          availableBooks={data.shelfBooks}
          onSelectBook={onSelectBook}
          onSelectCollection={onSelectCollection}
        />
        <article className="profile-panel profile-shelf-panel">
          <SectionHeading
            icon="▥"
            title="Mi estantería"
            action="Ver todo"
            onAction={() => onTabChange?.("shelf")}
          />
          <div className="profile-shelf-counts">
            <div><span>{formatNumber(data.shelfCounts.completed)}</span><small>Leídos</small></div>
            <div><span>{formatNumber(data.shelfCounts.reading)}</span><small>Leyendo</small></div>
            <div><span>{formatNumber(data.shelfCounts.planned)}</span><small>Pendientes</small></div>
            <div><span>{formatNumber(data.shelfCounts.dropped)}</span><small>Abandonados</small></div>
          </div>
          <ShelfPreview books={data.shelfBooks} onSelectBook={onSelectBook} />
        </article>

        <article className="profile-panel profile-reading-panel">
          <SectionHeading
            title="Leyendo ahora"
            meta={`${data.currentReadingBooks.length} libros`}
            action="Ver todos"
            onAction={() => onTabChange?.("shelf")}
          />
          {data.currentReadingBooks.length ? (
            <div className="profile-reading-grid">
              {data.currentReadingBooks.slice(0, 3).map((book) => (
                <ReadingCard key={book.id} book={book} onSelectBook={onSelectBook} />
              ))}
            </div>
          ) : (
            <EmptyBlock>No tienes ningún libro marcado como leyendo ahora mismo.</EmptyBlock>
          )}
        </article>

        <article className="profile-panel profile-latest-panel">
          <SectionHeading
            title="Últimas incorporaciones"
            action="Ver todo"
            onAction={() => onTabChange?.("shelf")}
          />
          {data.latestAdditions.length ? (
            <div className="profile-latest-grid">
              {data.latestAdditions.slice(0, 3).map((book) => (
                <SmallBookCard
                  key={`${book.id}-${book.status}`}
                  book={book}
                  onSelectBook={onSelectBook}
                  showDate
                />
              ))}
            </div>
          ) : (
            <EmptyBlock>Aún no hay incorporaciones recientes.</EmptyBlock>
          )}
        </article>

        <article className="profile-panel profile-reviews-summary">
          <SectionHeading
            title="Reseñas recientes"
            action="Ver todas"
            onAction={() => onTabChange?.("reviews")}
          />
          {data.recentReviews.length ? (
            <div className="profile-review-list">
              {data.recentReviews.slice(0, 3).map((review) => (
                <ReviewPreview key={review.id} review={review} onSelectBook={onSelectBook} />
              ))}
            </div>
          ) : (
            <EmptyBlock>Tus próximas reseñas aparecerán aquí.</EmptyBlock>
          )}
        </article>
      </div>

      <aside className="profile-dashboard-side">
        <article className="profile-panel profile-streak-panel">
          <SectionHeading title={`Racha de ${formatNumber(data.streak)} días`} />
          <p>¡Sigue así!</p>
          <div className="profile-week-dots" aria-label="Actividad de los últimos siete días">
            {recentDays.map((day) => (
              <span key={day.date} className={day.points > 0 ? "is-active" : ""} title={day.label} />
            ))}
          </div>
          <div className="profile-week-labels" aria-hidden="true">
            {recentDays.map((day) => (
              <small key={day.date}>{new Date(day.date).toLocaleDateString("es-ES", { weekday: "narrow" })}</small>
            ))}
          </div>
          <button type="button" className="profile-text-action" onClick={() => onTabChange?.("activity")}>Ver actividad →</button>
        </article>

        <article className="profile-panel profile-clubs-panel">
          <SectionHeading title="Marcapáginas de clubes" />
          {data.clubAchievements?.length ? (
            <div className="profile-club-achievements">
              {data.clubAchievements.slice(0, 4).map((achievement) => (
                <article key={achievement.id}>
                  <span aria-hidden="true">❧</span>
                  <div>
                    <strong>{achievement.label}</strong>
                    <small>{achievement.club?.name || "Club de lectura"}</small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="profile-coming-soon">
              <span aria-hidden="true">❧</span>
              <strong>Tu colección empezará aquí</strong>
              <p>Los marcapáginas que consigas en tus clubes aparecerán en este espacio.</p>
            </div>
          )}
        </article>

        <article className="profile-panel profile-circle-panel">
          <SectionHeading title="Círculo lector" />
          {data.readerCircle.length ? (
            <div className="profile-circle-list">
              {data.readerCircle.slice(0, 3).map((reader) => (
                <CircleReader key={reader.id} reader={reader} onSelectBook={onSelectBook} onSelectProfile={onSelectProfile} />
              ))}
            </div>
          ) : (
            <EmptyBlock>Sigue a otras lectoras para ver qué están leyendo.</EmptyBlock>
          )}
        </article>
      </aside>
    </section>
  );
}

function ShelfView({ data, shelfFilter, onShelfFilter, onSelectBook }) {
  const visibleBooks = useMemo(() => {
    if (shelfFilter === "all") return data.shelfBooks;
    if (shelfFilter === "reading") {
      return data.shelfBooks.filter((book) => ["reading", "rereading", "paused"].includes(book.status));
    }
    return data.shelfBooks.filter((book) => book.status === shelfFilter);
  }, [data.shelfBooks, shelfFilter]);

  const orderedBooks = useMemo(() => [...visibleBooks].sort((left, right) => {
    const scoreDifference = Number(right.score || 0) - Number(left.score || 0);
    if (scoreDifference) return scoreDifference;
    return String(left.title || "").localeCompare(String(right.title || ""), "es");
  }), [visibleBooks]);

  return (
    <section className="profile-tab-view" id="profile-panel-shelf" role="tabpanel">
      <div className="profile-tab-intro">
        <div>
          <span className="profile-eyebrow">Tu biblioteca personal</span>
          <h2>Estantería</h2>
          <p>Tus libros por estado de lectura.</p>
        </div>
        <strong>{formatNumber(visibleBooks.length)} libros</strong>
      </div>
      <div className="profile-filter-row" role="group" aria-label="Filtrar estantería">
        {SHELF_FILTERS.map((filter) => (
          <button
            type="button"
            key={filter.id}
            className={shelfFilter === filter.id ? "is-active" : ""}
            onClick={() => onShelfFilter(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      {visibleBooks.length ? (
        <div className="profile-library-grid">
          {orderedBooks.map((book) => (
            <button
              type="button"
              className="profile-library-book"
              key={`${book.id}-${book.status}`}
              onClick={() => onSelectBook?.(book)}
            >
              <CoverImage book={book} />
              <span>
                <strong>{book.title || "Libro sin título"}</strong>
                <small>{book.author || "Autor desconocido"}</small>
                <em>{titleForStatus(book.status)}</em>
                <StarRating score={book.score} />
                {book.progress > 0 ? (
                  <span className="profile-progress-track">
                    <span style={{ width: `${clampProgress(book.progress)}%` }} />
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyBlock>No hay libros en esta sección.</EmptyBlock>
      )}
    </section>
  );
}

function ActivityView({ data, onSelectBook }) {
  return (
    <section className="profile-tab-view" id="profile-panel-activity" role="tabpanel">
      <div className="profile-tab-intro">
        <div>
          <span className="profile-eyebrow">Tus huellas lectoras</span>
          <h2>Actividad</h2>
          <p>Tu actividad lectora.</p>
        </div>
      </div>
      {data.recentActivity.length ? (
        <div className="profile-timeline">
          {data.recentActivity.map((item) => (
            <button
              type="button"
              key={`${item.book_id}-${item.status}-${item.date}`}
              className="profile-timeline-item"
              onClick={() => onSelectBook?.(item)}
            >
              <span className="profile-timeline-dot" />
              <CoverImage book={item} />
              <span>
                <strong>{item.action} {item.title}</strong>
                <small>{item.author || "Autor desconocido"} · {formatDate(item.date, true)}</small>
                {item.progress > 0 ? <em>{clampProgress(item.progress)}% completado</em> : null}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyBlock>Aún no hay actividad reciente para mostrar.</EmptyBlock>
      )}
    </section>
  );
}

function FavoritesView({ data, onSelectBook, onFavoritesChange }) {
  const [editingBooks, setEditingBooks] = useState(false);
  const [editingAuthors, setEditingAuthors] = useState(false);
  const [bookIds, setBookIds] = useState(() => data.favoriteBooks.map((book) => String(book.id)));
  const [authors, setAuthors] = useState(() => data.favoriteAuthors);
  const [authorInput, setAuthorInput] = useState("");
  const [saving, setSaving] = useState(false);
  const toggleBook = (id) => setBookIds((current) => current.includes(String(id)) ? current.filter((value) => value !== String(id)) : [...current, String(id)].slice(0, 9));
  async function saveBooks() { setSaving(true); try { await updateFavoriteBooks(bookIds); onFavoritesChange?.(); setEditingBooks(false); } finally { setSaving(false); } }
  async function saveAuthors() { setSaving(true); try { await updateFavoriteAuthors(authors); onFavoritesChange?.(); setEditingAuthors(false); } finally { setSaving(false); } }
  return (
    <section className="profile-tab-view" id="profile-panel-favorites" role="tabpanel">
      <div className="profile-tab-intro">
        <div>
          <span className="profile-eyebrow">Tu mapa de afinidades</span>
          <h2>Favoritos</h2>
          <p>Tus favoritos y géneros más leídos.</p>
        </div>
      </div>
      <div className="profile-favorites-layout">
        <article className="profile-panel">
          <SectionHeading title="Libros favoritos" action={data.isOwner ? "Editar" : null} onAction={() => setEditingBooks(true)} />
          {data.favoriteBooks.length ? (
            <div className="profile-favorite-books-grid">
              {data.favoriteBooks.map((book) => (
                <SmallBookCard key={book.id} book={book} onSelectBook={onSelectBook} />
              ))}
            </div>
          ) : (
            <EmptyBlock>Aún no has elegido libros favoritos.</EmptyBlock>
          )}
          {editingBooks && data.isOwner ? <div className="profile-favorites-editor"><p>Elige hasta nueve libros.</p><div className="profile-favorites-picker">{(data.shelfBooks || []).map((book) => <button type="button" key={book.id} className={bookIds.includes(String(book.id)) ? "is-selected" : ""} onClick={() => toggleBook(book.id)} aria-pressed={bookIds.includes(String(book.id))}><CoverImage book={book} /><span>{book.title}</span></button>)}</div><footer><button type="button" onClick={() => setEditingBooks(false)}>Cancelar</button><button type="button" onClick={saveBooks} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></footer></div> : null}
        </article>
        <article className="profile-panel">
          <SectionHeading title="Autores favoritos" action={data.isOwner ? "Editar" : null} onAction={() => setEditingAuthors(true)} />
          {data.favoriteAuthors.length ? (
            <div className="profile-tag-cloud">
              {data.favoriteAuthors.map((author) => <span key={author}>{author}</span>)}
            </div>
          ) : (
            <EmptyBlock>Aún no has elegido autores favoritos.</EmptyBlock>
          )}
          {editingAuthors && data.isOwner ? <div className="profile-authors-editor"><p>Añade autores separados por líneas.</p><textarea value={authors.join("\n")} onChange={(event) => setAuthors(event.target.value.split("\n").map((value) => value.trim()).filter(Boolean).slice(0, 10))} placeholder="Nombre del autor" /><footer><button type="button" onClick={() => setEditingAuthors(false)}>Cancelar</button><button type="button" onClick={saveAuthors} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></footer><label className="profile-author-add">Añadir autor<input value={authorInput} onChange={(event) => setAuthorInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && authorInput.trim()) { event.preventDefault(); setAuthors((current) => [...new Set([...current, authorInput.trim()])].slice(0, 10)); setAuthorInput(""); } }} /></label></div> : null}
        </article>
        <article className="profile-panel">
          <SectionHeading title="Géneros más leídos" />
          {data.favoriteGenres.length ? (
            <div className="profile-genre-bars">
              {data.favoriteGenres.map((genre) => (
                <div key={genre.name}>
                  <span><strong>{genre.name}</strong><small>{genre.count}</small></span>
                  <div><i style={{ width: `${Math.min(100, genre.share || genre.count * 12)}%` }} /></div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock>Todavía no hay géneros destacados.</EmptyBlock>
          )}
        </article>
      </div>
    </section>
  );
}

export default function PerfilSupabase({
  activeTab = "summary",
  onTabChange,
  onOpenLibrary,
  onOpenCatalog,
  onSelectBook,
  onSelectReviewBook,
  profileId = null,
  onOpenOwnProfile,
  onBackToClub,
  onSelectProfile,
  onSelectCollection,
}) {
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [coverState, setCoverState] = useState({ saving: false, error: "" });
  const [avatarState, setAvatarState] = useState({ open: false, saving: false, error: "" });
  const [shelfFilter, setShelfFilter] = useState("all");
  const [connections, setConnections] = useState({ open: false, direction: "followers", loading: false, error: "", items: [] });
  const [bioEditing, setBioEditing] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [bioSaving, setBioSaving] = useState(false);
  const [visualEditor, setVisualEditor] = useState({ open: false, draft: null, saving: false, error: "" });

  async function loadProfile() {
    try {
      const data = await getProfileOverview(profileId);
      setState({ loading: false, error: "", data });
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || "No se pudo cargar tu perfil.",
        data: null,
      });
    }
  }

  useEffect(() => {
    let cancelled = false;
    getProfileOverview(profileId)
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: "", data });
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: error?.message || "No se pudo cargar tu perfil.",
            data: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  useEffect(() => {
    if (!visualEditor.open) return undefined;

    function handleVisualEditorKeyDown(event) {
      if (event.key === "Escape" && !visualEditor.saving) {
        setVisualEditor({ open: false, draft: null, saving: false, error: "" });
      }
    }

    window.addEventListener("keydown", handleVisualEditorKeyDown);
    return () => window.removeEventListener("keydown", handleVisualEditorKeyDown);
  }, [visualEditor.open, visualEditor.saving]);

  const data = state.data;
  const profile = data?.profile;
  const currentTab = PROFILE_TABS.some((tab) => tab.id === activeTab)
    ? activeTab
    : "summary";

  async function handleCoverSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setCoverState({ saving: true, error: "" });
    try {
      const coverImage = await uploadProfileCover(file);
      setState((current) => ({
        ...current,
        data: current.data
          ? {
              ...current.data,
              profile: { ...current.data.profile, cover_image: coverImage },
            }
          : current.data,
      }));
      setCoverState({ saving: false, error: "" });
    } catch (error) {
      setCoverState({
        saving: false,
        error: error?.message || "No se pudo cambiar la portada.",
      });
    }
  }

  async function handleAvatarSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setAvatarState({ open: false, saving: true, error: "" });
    try {
      const avatar = await uploadProfileAvatar(file);
      setState((current) => current.data ? {
        ...current,
        data: { ...current.data, profile: { ...current.data.profile, avatar } },
      } : current);
      setAvatarState({ open: false, saving: false, error: "" });
      window.dispatchEvent(new CustomEvent("librelula:profile-updated", { detail: { avatar } }));
    } catch (error) {
      setAvatarState({ open: true, saving: false, error: error?.message || "No se pudo cambiar el icono." });
    }
  }

  async function handleAvatarPreset(value) {
    setAvatarState({ open: false, saving: true, error: "" });
    try {
      const avatar = await updateProfileAvatar(value);
      setState((current) => current.data ? {
        ...current,
        data: { ...current.data, profile: { ...current.data.profile, avatar } },
      } : current);
      setAvatarState({ open: false, saving: false, error: "" });
      window.dispatchEvent(new CustomEvent("librelula:profile-updated", { detail: { avatar } }));
    } catch (error) {
      setAvatarState({ open: true, saving: false, error: error?.message || "No se pudo cambiar el icono." });
    }
  }

  async function openConnections(direction) {
    setConnections({ open: true, direction, loading: true, error: "", items: [] });
    try {
      const items = await getProfileConnections(profile?.id, direction);
      setConnections({ open: true, direction, loading: false, error: "", items });
    } catch (error) {
      setConnections({ open: true, direction, loading: false, error: error?.message || "No se pudieron cargar estas personas.", items: [] });
    }
  }

  async function handleBioSave(event) {
    event?.preventDefault();
    setBioSaving(true);
    try {
      const bio = await updateProfileBio(bioDraft);
      setState((current) => current.data ? { ...current, data: { ...current.data, profile: { ...current.data.profile, bio } } } : current);
      setBioEditing(false);
      window.dispatchEvent(new CustomEvent("librelula:profile-updated", { detail: { bio } }));
    } catch (error) {
      setCoverState({ saving: false, error: error?.message || "No se pudo guardar la descripción." });
    } finally {
      setBioSaving(false);
    }
  }

  async function handleCollectionChange(value, title = "", customIds = null) {
    try {
      await updateFeaturedCollection(value, title);
      setState((current) => current.data ? {
        ...current,
        data: {
          ...current.data,
          featuredCollection: value,
          featuredCollectionTitle: title,
          featuredBooks: value === "custom" && customIds
            ? customIds.map((id) => current.data.shelfBooks.find((book) => String(book.id) === String(id))).filter(Boolean)
            : value === "favorites"
            ? current.data.favoriteBooks.slice(0, 6)
            : current.data.shelfBooks.filter((book) => value === "reading"
              ? ["reading", "rereading", "paused"].includes(book.status)
              : book.status === value).slice(0, 6),
        },
      } : current);
    } catch (error) {
      setCoverState({ saving: false, error: error?.message || "No se pudo guardar la colección destacada." });
    }
  }

  if (state.loading) {
    return (
      <main className="reader-profile profile-redesign">
        <section className="profile-shell">
          <div className="profile-loading-card">
            <span className="profile-loader" />
            <p>Cargando tu rincón literario…</p>
          </div>
        </section>
      </main>
    );
  }

  if (state.error) {
    return (
      <main className="reader-profile profile-redesign">
        <section className="profile-shell">
          <div className="profile-error-card">
            <h1>No se pudo abrir Mi rincón</h1>
            <p>{state.error}</p>
            <div className="profile-error-actions">
              <button type="button" onClick={loadProfile}>Reintentar</button>
              <button type="button" className="is-secondary" onClick={onOpenCatalog}>Volver al catálogo</button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!data?.authenticated || !profile) {
    return (
      <main className="reader-profile profile-redesign">
        <section className="profile-shell">
          <div className="profile-error-card">
            <h1>Inicia sesión para ver tu rincón</h1>
            <p>Tu perfil lector se carga con tu cuenta de Librélula.</p>
            <button type="button" onClick={onOpenCatalog}>Volver al catálogo</button>
          </div>
        </section>
      </main>
    );
  }

  const avatarUrl = assetUrl(profile.avatar, "images/avatar/avatar1.png");
  const coverUrl = assetUrl(profile.cover_image, "images/fondo.png");
  const displayName = profile.display_name || profile.username || "Mi rincón";
  const handle = String(profile.username || "lectora").replace(/^@/, "");
  const currentVisualSettings = normalizeProfileVisualSettings(profile.profile_visual_settings);
  const editorVisualSettings = visualEditor.draft || currentVisualSettings;

  function openVisualSettings() {
    setVisualEditor({ open: true, draft: currentVisualSettings, saving: false, error: "" });
  }

  function changeVisualSetting(key, value) {
    setVisualEditor((current) => ({
      ...current,
      draft: { ...(current.draft || currentVisualSettings), [key]: value },
      error: "",
    }));
  }

  function resetVisualSettings() {
    setVisualEditor((current) => ({
      ...current,
      draft: normalizeProfileVisualSettings({}),
      error: "",
    }));
  }

  function closeVisualSettings() {
    if (!visualEditor.saving) setVisualEditor({ open: false, draft: null, saving: false, error: "" });
  }

  async function saveVisualSettings() {
    setVisualEditor((current) => ({ ...current, saving: true, error: "" }));
    try {
      const saved = await updateProfileVisualSettings(editorVisualSettings);
      setState((current) => current.data ? {
        ...current,
        data: {
          ...current.data,
          profile: { ...current.data.profile, profile_visual_settings: saved },
        },
      } : current);
      setVisualEditor({ open: false, draft: null, saving: false, error: "" });
    } catch (error) {
      setVisualEditor((current) => ({ ...current, saving: false, error: error?.message || "No se pudieron guardar los ajustes." }));
    }
  }

  return (
    <main className="reader-profile profile-redesign">
      <section className="profile-shell">
        {onBackToClub ? (
          <button type="button" className="profile-back-to-club" onClick={onBackToClub}>
            <span aria-hidden="true">←</span> Volver al club
          </button>
        ) : null}
        <header
          className="profile-hero"
        >
          <div className="profile-hero-banner" style={coverStyle(coverUrl, currentVisualSettings)} role="img" aria-label="Portada del perfil">
            <div className="profile-hero-banner-image" aria-hidden="true" />
          </div>
          {data.isOwner ? (
            <>
              <div className="profile-hero-tools">
                <button type="button" className="profile-visual-settings-trigger" onClick={openVisualSettings} aria-label="Ajustar icono y portada" title="Ajustar icono y portada">
                  <span aria-hidden="true">⚙</span>
                </button>
                <button
                  type="button"
                  className="profile-change-cover"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={coverState.saving}
                >
                  <span aria-hidden="true">▣</span>
                  {coverState.saving ? "Guardando…" : "Cambiar portada"}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={handleCoverSelected}
              />
            </>
          ) : null}
          <div className="profile-identity">
            <div className="profile-avatar-wrap">
              <button
                type="button"
                className="profile-avatar-frame"
                aria-label="Cambiar icono del perfil"
                aria-expanded={avatarState.open}
                onClick={() => data.isOwner && setAvatarState((current) => ({ ...current, open: !current.open, error: "" }))}
                disabled={!data.isOwner || avatarState.saving}
              >
                <span className="profile-avatar-image-window">
                  <img
                    src={avatarUrl}
                    alt={`Avatar de ${displayName}`}
                    style={{ "--profile-avatar-transform": avatarTransform(currentVisualSettings) }}
                    onError={(event) => {
                      event.currentTarget.src = publicUrl("images/avatar/avatar1.png");
                    }}
                  />
                </span>
                {data.isOwner ? <span className="profile-avatar-edit" aria-hidden="true">✦</span> : null}
              </button>
              {data.isOwner && avatarState.open ? (
                <div className="profile-avatar-menu" role="dialog" aria-label="Cambiar icono del perfil">
                  <strong>Elige tu icono</strong>
                  <div className="profile-avatar-options">
                    {PROFILE_AVATARS.map((option) => (
                      <button type="button" key={option.value} onClick={() => handleAvatarPreset(option.value)} aria-label={option.label}>
                        <img src={publicUrl(option.value)} alt="" />
                      </button>
                    ))}
                  </div>
                  <button type="button" className="profile-avatar-upload" onClick={() => avatarInputRef.current?.click()}>
                    <span aria-hidden="true">↑</span> Subir una imagen
                  </button>
                  {avatarState.error ? <small className="profile-avatar-error" role="alert">{avatarState.error}</small> : null}
                </div>
              ) : null}
              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleAvatarSelected} />
            </div>
            <div className="profile-identity-copy">
              <h1>{displayName}</h1>
              <span>@{handle}</span>
              {bioEditing ? (
                <form className="profile-bio-editor" onSubmit={handleBioSave}>
                  <label htmlFor="profile-bio">Descripción</label>
                  <textarea id="profile-bio" value={bioDraft} maxLength={240} onChange={(event) => setBioDraft(event.target.value)} autoFocus />
                  <div><button type="submit" disabled={bioSaving}>{bioSaving ? "Guardando…" : "Guardar"}</button><button type="button" onClick={() => setBioEditing(false)}>Cancelar</button></div>
                </form>
              ) : (
                <p>{profile.bio || "Añade una breve descripción."}</p>
              )}
              {data.isOwner && !bioEditing ? <button type="button" className="profile-edit-bio" onClick={() => { setBioDraft(profile.bio || ""); setBioEditing(true); }}>Editar descripción</button> : null}
              <div className="profile-social-counts">
                <button type="button" onClick={() => openConnections("followers")}><strong>{formatNumber(data.social.followers)}</strong> seguidores</button>
                <button type="button" onClick={() => openConnections("following")}><strong>{formatNumber(data.social.following)}</strong> siguiendo</button>
              </div>
            </div>
            {!data.isOwner && onOpenOwnProfile ? <button type="button" className="profile-return-action" onClick={onOpenOwnProfile}>Mi perfil</button> : null}
          </div>
        </header>

        {visualEditor.open ? (
          <ProfileVisualSettings
            avatarUrl={avatarUrl}
            coverUrl={coverUrl}
            displayName={displayName}
            handle={handle}
            settings={editorVisualSettings}
            onChange={changeVisualSetting}
            onReset={resetVisualSettings}
            onClose={closeVisualSettings}
            onSave={saveVisualSettings}
            saving={visualEditor.saving}
            error={visualEditor.error}
          />
        ) : null}

        {coverState.error ? <p className="profile-inline-error">{coverState.error}</p> : null}

        <nav className="profile-tabs" aria-label="Secciones del perfil" role="tablist">
          {PROFILE_TABS.map((tab) => (
            <button
              key={tab.id}
              id={`profile-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-controls={`profile-panel-${tab.id}`}
              aria-selected={currentTab === tab.id}
              tabIndex={currentTab === tab.id ? 0 : -1}
              className={currentTab === tab.id ? "active" : ""}
              onClick={() => onTabChange?.(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {currentTab === "summary" ? (
          <SummaryView
            data={data}
            onSelectBook={onSelectBook}
            onTabChange={onTabChange}
            onCollectionChange={handleCollectionChange}
            onSelectProfile={onSelectProfile}
            onSelectCollection={onSelectCollection}
          />
        ) : null}
        {currentTab === "shelf" ? (
          <ShelfView
            data={data}
            shelfFilter={shelfFilter}
            onShelfFilter={setShelfFilter}
            onSelectBook={onSelectBook}
          />
        ) : null}
        {currentTab === "activity" ? (
          <ActivityView data={data} onSelectBook={onSelectBook} />
        ) : null}
        {currentTab === "favorites" ? (
          <FavoritesView data={data} onSelectBook={onSelectBook} onFavoritesChange={loadProfile} />
        ) : null}
        {currentTab === "reviews" ? (
          <section
            id="profile-panel-reviews"
            className="profile-tab-view profile-reviews-card"
            role="tabpanel"
            aria-labelledby="profile-tab-reviews"
          >
            {data.isOwner ? (
              <MisResenas
                embedded
                onOpenCatalog={onOpenCatalog}
                onSelectBook={onSelectReviewBook}
              />
            ) : data.recentReviews.length ? (
              <div className="profile-review-list profile-public-reviews">
                {data.recentReviews.map((review) => (
                  <ReviewPreview key={review.id} review={review} onSelectBook={onSelectBook} />
                ))}
              </div>
            ) : (
              <EmptyBlock>Esta persona todavía no ha publicado reseñas.</EmptyBlock>
            )}
          </section>
        ) : null}
      </section>
      {connections.open ? (
        <div className="profile-connections-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConnections((current) => ({ ...current, open: false })); }}>
          <section className="profile-connections-modal" role="dialog" aria-modal="true" aria-labelledby="profile-connections-title">
            <header>
              <div>
                <span className="profile-eyebrow">Comunidad Librélula</span>
                <h2 id="profile-connections-title">{connections.direction === "followers" ? "Seguidores" : "Siguiendo"}</h2>
              </div>
              <button type="button" onClick={() => setConnections((current) => ({ ...current, open: false }))} aria-label="Cerrar">×</button>
            </header>
            {connections.loading ? <p className="profile-empty">Cargando personas…</p> : null}
            {connections.error ? <p className="profile-inline-error">{connections.error}</p> : null}
            {!connections.loading && !connections.error && connections.items.length === 0 ? <p className="profile-empty">Todavía no hay personas en esta lista.</p> : null}
            <div className="profile-connections-list">
              {connections.items.map((reader) => (
                <button type="button" className="profile-connection" key={reader.id} onClick={() => { setConnections((current) => ({ ...current, open: false })); onSelectProfile?.(reader.id); }}>
                  <img src={assetUrl(reader.avatar, "images/avatar/avatar1.png")} alt="" />
                  <span><strong>{reader.display_name || reader.username || "Lectora"}</strong><small>@{reader.username || "lectora"}</small></span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
