import { useEffect, useMemo, useState } from "react";

import { publicUrl } from "./api.js";
import { getAuthorBiography, getAuthorProfile } from "./lib/authorsApi.js";
import "./AutoresPage.css";

function assetUrl(value) {
  const clean = String(value || "").trim();
  if (/^(?:https?:\/\/|data:|blob:)/i.test(clean)) return clean;
  return publicUrl(clean || "images/librelula.png");
}

function authorInitials(name) {
  const words = String(name || "Autor").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "A";
}

function normalizeSaga(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es-ES");
}

function bookTitleWithoutSaga(book) {
  const title = String(book?.title || "Libro sin título").trim();
  const sagaName = String(book?.saga_name || "").trim();
  if (!sagaName) return title;

  const numberedMarker = ` (${sagaName}, #`;
  const simpleMarker = ` (${sagaName})`;
  const numberedIndex = title.lastIndexOf(numberedMarker);
  const simpleIndex = title.lastIndexOf(simpleMarker);

  if (numberedIndex > 0 && title.endsWith(")")) return title.slice(0, numberedIndex).trim();
  if (simpleIndex > 0 && title.endsWith(simpleMarker)) return title.slice(0, simpleIndex).trim();
  return title;
}

function volumeLabel(book) {
  const number = book?.saga_number;
  if (number === null || number === undefined || String(number).trim() === "") return "";
  return `Volumen ${number}`;
}

function formatReleaseDate(value) {
  const text = String(value || "").trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T12:00:00`)
    : null;
  if (!date || Number.isNaN(date.getTime())) return text || "Fecha por confirmar";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function groupBooks(books) {
  const groups = new Map();

  for (const book of books) {
    const sagaName = String(book?.saga_name || "").trim();
    const sagaKey = String(book?.saga_key || "").trim() || normalizeSaga(sagaName);
    const key = sagaName ? `saga:${sagaKey}` : "standalone";

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: sagaName || "Obras independientes",
        isStandalone: !sagaName,
        books: [],
      });
    }

    groups.get(key).books.push(book);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      books: [...group.books].sort((left, right) => {
        const leftNumber = Number(left.saga_number);
        const rightNumber = Number(right.saga_number);
        const leftHasNumber = Number.isFinite(leftNumber);
        const rightHasNumber = Number.isFinite(rightNumber);
        if (leftHasNumber && rightHasNumber && leftNumber !== rightNumber) return leftNumber - rightNumber;
        if (leftHasNumber !== rightHasNumber) return leftHasNumber ? -1 : 1;
        return String(left.title || "").localeCompare(String(right.title || ""), "es");
      }),
    }))
    .sort((left, right) => {
      if (left.isStandalone !== right.isStandalone) return left.isStandalone ? 1 : -1;
      return left.title.localeCompare(right.title, "es");
    });
}

function AuthorBookCard({ book, onSelectBook }) {
  const title = bookTitleWithoutSaga(book);
  const volume = volumeLabel(book);

  return (
    <button
      type="button"
      className="author-book-card"
      onClick={() => onSelectBook?.(book)}
      aria-label={`Abrir ${title}`}
    >
      <span className="author-book-cover">
        <img
          src={assetUrl(book.cover)}
          alt={`Portada de ${title}`}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = assetUrl("images/librelula.png");
          }}
        />
      </span>
      <span className="author-book-copy">
        {volume ? <small className="author-book-volume">{volume}</small> : null}
        <strong>{title}</strong>
        <span>{book.year || "Año no indicado"}{book.pages ? ` · ${book.pages} págs.` : ""}</span>
      </span>
      <span className="author-book-arrow" aria-hidden="true">↗</span>
    </button>
  );
}

function UpcomingCard({ book, onSelectBook }) {
  const title = bookTitleWithoutSaga(book);

  return (
    <button
      type="button"
      className="author-upcoming-card"
      onClick={() => onSelectBook?.(book)}
      aria-label={`Abrir ${title}, próximo lanzamiento`}
    >
      <span className="author-upcoming-cover">
        <img
          src={assetUrl(book.cover)}
          alt={`Portada de ${title}`}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = assetUrl("images/librelula.png");
          }}
        />
      </span>
      <span className="author-upcoming-copy">
        <small>Próximo lanzamiento</small>
        <strong>{book.edition_title || title}</strong>
        <span>{formatReleaseDate(book.publication_date)}</span>
        {book.edition_label || book.binding ? <em>{book.edition_label || book.binding}</em> : null}
      </span>
      <span className="author-book-arrow" aria-hidden="true">↗</span>
    </button>
  );
}

export default function AutoresPage({ author = "", onBack, onSelectBook }) {
  const authorName = String(author || "").trim();
  const [profile, setProfile] = useState(null);
  const [profileState, setProfileState] = useState({ loading: true, error: "", author: "" });
  const [biography, setBiography] = useState({ loading: true, text: "", photoUrl: "", author: "" });

  useEffect(() => {
    let cancelled = false;

    getAuthorProfile(authorName)
      .then((data) => {
        if (!cancelled) {
          setProfile(data);
          setProfileState({ loading: false, error: "", author: authorName });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setProfileState({ loading: false, error: error.message || "No se pudo cargar este autor.", author: authorName });
        }
      });

    getAuthorBiography(authorName)
      .then((data) => {
        if (!cancelled) {
          setBiography({ loading: false, text: data.biography || "", photoUrl: data.photo_url || "", author: authorName });
        }
      })
      .catch(() => {
        if (!cancelled) setBiography({ loading: false, text: "", photoUrl: "", author: authorName });
      });

    return () => {
      cancelled = true;
    };
  }, [authorName]);

  const groups = useMemo(() => groupBooks(profile?.books || []), [profile?.books]);
  const profileMatchesAuthor = profileState.author === authorName && profile?.author;
  const biographyMatchesAuthor = biography.author === authorName;
  const fallbackBiography = profile
    ? `${profile.author} aparece en ${profile.books.length} ${profile.books.length === 1 ? "libro" : "libros"} del catálogo de Librélula.`
    : "";
  const displayedBiography = (biographyMatchesAuthor ? biography.text : "")
    || fallbackBiography
    || "Biografía todavía no disponible.";
  const sagaCount = groups.filter((group) => !group.isStandalone).length;

  if (profileState.loading || !profileMatchesAuthor) {
    return (
      <main className="authors-page" aria-busy="true">
        <div className="authors-page-inner">
          <button type="button" className="authors-back-link" onClick={onBack}>← Volver</button>
          <section className="authors-state-card" aria-live="polite">
            <span className="authors-state-mark" aria-hidden="true">✦</span>
            <h1>Abriendo la ficha de autor…</h1>
            <p>{authorName || "Estamos buscando esta bibliografía."}</p>
          </section>
        </div>
      </main>
    );
  }

  if (profileState.error) {
    return (
      <main className="authors-page">
        <div className="authors-page-inner">
          <button type="button" className="authors-back-link" onClick={onBack}>← Volver</button>
          <section className="authors-state-card is-error" role="alert">
            <span className="authors-state-mark" aria-hidden="true">!</span>
            <h1>No encontramos al autor</h1>
            <p>{profileState.error}</p>
            <button type="button" className="authors-state-action" onClick={onBack}>Volver al catálogo</button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="authors-page">
      <div className="authors-page-inner">
        <button type="button" className="authors-back-link" onClick={onBack}>← Volver</button>

        <header className="author-profile-card">
          <div className="author-profile-portrait">
            {biographyMatchesAuthor && biography.photoUrl ? (
              <img
                src={biography.photoUrl}
                alt={`Retrato de ${profile.author}`}
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                  event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                }}
              />
            ) : null}
            <span hidden={Boolean(biographyMatchesAuthor && biography.photoUrl)} aria-hidden={biographyMatchesAuthor && biography.photoUrl ? "true" : undefined}>
              {authorInitials(profile.author)}
            </span>
          </div>

          <div className="author-profile-copy">
            <span className="authors-eyebrow">Ficha de autor</span>
            <h1>{profile.author}</h1>
            <p className="author-biography" aria-live="polite">
              {!biographyMatchesAuthor || biography.loading ? "Buscando una breve biografía…" : displayedBiography}
            </p>
            <dl className="author-profile-stats">
              <div><dt>Libros</dt><dd>{profile.books.length}</dd></div>
              <div><dt>Sagas</dt><dd>{sagaCount}</dd></div>
              <div><dt>Próximos</dt><dd>{profile.upcoming.length}</dd></div>
            </dl>
          </div>
        </header>

        <section className="authors-books-section" aria-labelledby="authors-books-title">
          <header className="authors-section-heading">
            <div>
              <span className="authors-eyebrow">Bibliografía</span>
              <h2 id="authors-books-title">Sus libros</h2>
            </div>
            <span>{profile.books.length} {profile.books.length === 1 ? "título" : "títulos"}</span>
          </header>

          {groups.length ? (
            <div className="author-saga-list">
              {groups.map((group) => (
                <section className="author-saga-group" key={group.key} aria-labelledby={`author-group-${group.key}`}>
                  <header>
                    <div>
                      <span>{group.isStandalone ? "Fuera de saga" : "Saga"}</span>
                      <h3 id={`author-group-${group.key}`}>{group.title}</h3>
                    </div>
                    <strong>{group.books.length}</strong>
                  </header>
                  <div className="author-books-grid" role="list">
                    {group.books.map((book) => (
                      <AuthorBookCard key={book.id} book={book} onSelectBook={onSelectBook} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="authors-empty">Este autor todavía no tiene libros publicados en el catálogo.</p>
          )}
        </section>

        {profile.upcoming.length ? (
          <section className="authors-upcoming-section" aria-labelledby="authors-upcoming-title">
            <header className="authors-section-heading">
              <div>
                <span className="authors-eyebrow">En el horizonte</span>
                <h2 id="authors-upcoming-title">Próximos lanzamientos</h2>
              </div>
              <span>{profile.upcoming.length}</span>
            </header>
            <div className="author-upcoming-grid">
              {profile.upcoming.map((book) => (
                <UpcomingCard key={book.edition_id} book={book} onSelectBook={onSelectBook} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
