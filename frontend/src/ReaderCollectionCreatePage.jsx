import { useEffect, useMemo, useState } from "react";
import { publicUrl } from "./api.js";
import { getCatalogBooks } from "./lib/catalogApi.js";
import { createReaderCollection } from "./lib/collectionsApi.js";
import "./ReaderCollectionCreatePage.css";

function coverUrl(value) {
  const text = String(value || "").trim();
  return text.startsWith("http") ? text : publicUrl(text || "images/librelula.png");
}

function bookTitle(book) {
  return book?.title || "Libro sin título";
}

export default function ReaderCollectionCreatePage({ onBack, onCreated }) {
  const [form, setForm] = useState({ title: "", description: "" });
  const [search, setSearch] = useState("");
  const [books, setBooks] = useState([]);
  const [selectedBooks, setSelectedBooks] = useState([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingBooks(true);
      setError("");
      try {
        const response = await getCatalogBooks({ page: 1, pageSize: 60, search });
        if (!cancelled) setBooks(response.books || []);
      } catch (requestError) {
        if (!cancelled) {
          setBooks([]);
          setError(requestError?.message || "No se pudieron cargar los libros.");
        }
      } finally {
        if (!cancelled) setLoadingBooks(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search]);

  const selectedIds = useMemo(
    () => new Set(selectedBooks.map((book) => String(book.id))),
    [selectedBooks],
  );

  function toggleBook(book) {
    const id = String(book?.id || "");
    if (!id) return;

    setSelectedBooks((current) => {
      if (current.some((item) => String(item.id) === id)) {
        return current.filter((item) => String(item.id) !== id);
      }
      if (current.length >= 30) {
        setError("Puedes añadir hasta 30 libros por colección.");
        return current;
      }
      setError("");
      return [...current, book];
    });
  }

  function removeBook(bookId) {
    setSelectedBooks((current) => current.filter((book) => String(book.id) !== String(bookId)));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (selectedBooks.length === 0) {
      setError("Añade al menos un libro a la colección.");
      return;
    }

    setSaving(true);
    try {
      const created = await createReaderCollection({
        ...form,
        bookIds: selectedBooks.map((book) => book.id),
      });
      onCreated?.(created);
    } catch (requestError) {
      setError(requestError?.message || "No se pudo publicar la colección.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="reader-collection-create-page">
      <div className="reader-collection-create-inner">
        <button type="button" className="reader-collection-create-back" onClick={onBack}>
          <span aria-hidden="true">←</span> Volver
        </button>

        <header className="reader-collection-create-header">
          <div>
            <span className="reader-collection-create-kicker">Nueva colección</span>
            <h1>Crear colección</h1>
            <p>Añade tus libros y compártela con la comunidad.</p>
          </div>
          <span className="reader-collection-create-public" aria-label="La colección será pública">
            <span aria-hidden="true">◉</span> Pública
          </span>
        </header>

        <form className="reader-collection-create-layout" onSubmit={submit}>
          <section className="reader-collection-create-details" aria-labelledby="reader-collection-details-title">
            <div>
              <span className="reader-collection-create-section-label">1</span>
              <h2 id="reader-collection-details-title">Ponle nombre</h2>
            </div>
            <label htmlFor="reader-collection-title">
              Nombre de la colección
              <input
                id="reader-collection-title"
                type="text"
                required
                minLength={3}
                maxLength={80}
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Ej.: Fantasía para perderse"
              />
            </label>
            <label htmlFor="reader-collection-description">
              Descripción <span>(opcional)</span>
              <textarea
                id="reader-collection-description"
                maxLength={280}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Qué tienen en común estos libros"
              />
            </label>
            <p className="reader-collection-create-note">
              Al publicarla, cualquier persona podrá verla y darle me gusta.
            </p>
          </section>

          <section className="reader-collection-create-books" aria-labelledby="reader-collection-books-title">
            <div className="reader-collection-create-books-heading">
              <div>
                <span className="reader-collection-create-section-label">2</span>
                <h2 id="reader-collection-books-title">Elige los libros</h2>
              </div>
              <strong>{selectedBooks.length}/30</strong>
            </div>

            {selectedBooks.length ? (
              <div className="reader-collection-create-selected" aria-label="Libros seleccionados">
                {selectedBooks.map((book) => (
                  <button
                    type="button"
                    key={book.id}
                    onClick={() => removeBook(book.id)}
                    aria-label={`Quitar ${bookTitle(book)} de la selección`}
                  >
                    <img src={coverUrl(book.cover)} alt="" />
                    <span>{bookTitle(book)}</span>
                    <b aria-hidden="true">×</b>
                  </button>
                ))}
              </div>
            ) : (
              <p className="reader-collection-create-empty-selection">Todavía no has elegido ningún libro.</p>
            )}

            <label className="reader-collection-create-search" htmlFor="reader-collection-book-search">
              <span className="sr-only">Buscar libros para añadir</span>
              <span aria-hidden="true">⌕</span>
              <input
                id="reader-collection-book-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar título o autor"
              />
            </label>

            {loadingBooks ? <p className="reader-collection-create-status" aria-live="polite">Cargando libros…</p> : null}
            {!loadingBooks && !books.length ? <p className="reader-collection-create-status">No encontramos libros.</p> : null}
            <div className="reader-collection-create-book-grid">
              {books.map((book) => {
                const selected = selectedIds.has(String(book.id));
                return (
                  <button
                    type="button"
                    key={book.id}
                    className={selected ? "is-selected" : ""}
                    onClick={() => toggleBook(book)}
                    aria-pressed={selected}
                  >
                    <span className="reader-collection-create-cover">
                      <img src={coverUrl(book.cover)} alt="" loading="lazy" />
                      {selected ? <span aria-hidden="true">✓</span> : null}
                    </span>
                    <strong>{bookTitle(book)}</strong>
                    <small>{book.author || "Autor desconocido"}</small>
                  </button>
                );
              })}
            </div>
          </section>

          {error ? <p className="reader-collection-create-error" role="alert">{error}</p> : null}
          <footer className="reader-collection-create-actions">
            <button type="button" onClick={onBack}>Cancelar</button>
            <button type="submit" disabled={saving}>{saving ? "Publicando…" : "Publicar colección"}</button>
          </footer>
        </form>
      </div>
    </main>
  );
}
