import { useEffect, useMemo, useState } from "react";
import { publicUrl } from "./api.js";
import { createReaderCollection, getPublicCollections, toggleCollectionLike } from "./lib/collectionsApi.js";
import "./ReaderCollections.css";

function coverUrl(value) {
  const text = String(value || "").trim();
  return text.startsWith("http") ? text : publicUrl(text || "images/librelula.png");
}

export default function ReaderCollections({ isLoggedIn = false, creatorId = null, availableBooks = [], onSelectBook, onSelectProfile, onSelectCollection }) {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", bookIds: [] });
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPublicCollections({ creatorId })
      .then((items) => { if (!cancelled) setCollections(items); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [creatorId]);

  const canCreate = isLoggedIn && !creatorId;
  const availableById = useMemo(() => new Map(availableBooks.map((book) => [String(book.id), book])), [availableBooks]);

  function toggleBook(bookId) {
    const id = String(bookId);
    setForm((current) => ({
      ...current,
      bookIds: current.bookIds.includes(id)
        ? current.bookIds.filter((value) => value !== id)
        : [...current.bookIds, id],
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await createReaderCollection(form);
      setCollections((current) => [created, ...current]);
      setForm({ title: "", description: "", bookIds: [] });
      setComposerOpen(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function like(collection) {
    if (!isLoggedIn) return;
    const nextLiked = !collection.liked;
    setCollections((current) => current.map((item) => item.id === collection.id ? { ...item, liked: nextLiked, likes: Math.max(0, item.likes + (nextLiked ? 1 : -1)) } : item));
    try { await toggleCollectionLike(collection.id, nextLiked); } catch (requestError) {
      setCollections((current) => current.map((item) => item.id === collection.id ? { ...item, liked: collection.liked, likes: collection.likes } : item));
      setError(requestError.message);
    }
  }

  function openCollection(collection) {
    onSelectCollection?.(collection);
  }

  return (
    <section className="reader-collections" aria-labelledby="reader-collections-title">
      <header className="reader-collections-heading">
        <div><span className="catalog-kicker">Listas hechas por lectores</span><h2 id="reader-collections-title">Colecciones para descubrir</h2><p>Ideas de lectura creadas por la comunidad.</p></div>
        {canCreate ? <button type="button" className="reader-collections-create" onClick={() => setComposerOpen((value) => !value)}>+ Crear colección</button> : null}
      </header>
      {composerOpen ? (
        <form className="reader-collection-composer" onSubmit={submit}>
          <label>Nombre<input required maxLength="80" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ej.: Fantasía acogedora para otoño" /></label>
          <label>Descripción<textarea maxLength="280" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="¿Qué une a estos libros?" /></label>
          {availableBooks.length ? <fieldset><legend>Libros de esta página</legend><div className="reader-collection-book-picker">{availableBooks.slice(0, 12).map((book) => <button type="button" key={book.id} className={form.bookIds.includes(String(book.id)) ? "is-selected" : ""} onClick={() => toggleBook(book.id)} aria-pressed={form.bookIds.includes(String(book.id))}><img src={coverUrl(book.cover)} alt="" /><span>{book.title}</span></button>)}</div></fieldset> : null}
          <div className="reader-collection-composer-actions"><button type="button" onClick={() => setComposerOpen(false)}>Cancelar</button><button type="submit" disabled={saving}>{saving ? "Creando…" : "Publicar colección"}</button></div>
        </form>
      ) : null}
      {error ? <p className="reader-collections-error" role="alert">{error}</p> : null}
      {loading ? <p className="reader-collections-empty">Cargando colecciones…</p> : null}
      {!loading && !collections.length ? <p className="reader-collections-empty">Todavía no hay colecciones públicas.</p> : null}
      <div className="reader-collections-grid">
        {(showAll ? collections : collections.slice(0, 4)).map((collection) => (
          <article className="reader-collection-card" key={collection.id}>
            <div className="reader-collection-covers">{collection.books.slice(0, 5).map((book) => <button type="button" key={book.id} onClick={() => onSelectBook?.(book)} title={book.title}><img src={coverUrl(book.cover)} alt={`Portada de ${book.title}`} /></button>)}</div>
            <div className="reader-collection-card-body"><button type="button" className="reader-collection-open" onClick={() => openCollection(collection)}><span className="reader-collection-kind">{collection.is_curated ? "Selección Librélula" : "Colección de la comunidad"}</span><h3>{collection.title}</h3><p>{collection.description}</p><span className="reader-collection-open-label">Ver colección →</span></button><footer><button type="button" className={`reader-collection-like${collection.liked ? " is-liked" : ""}`} onClick={() => like(collection)} disabled={!isLoggedIn} aria-label={isLoggedIn ? `${collection.liked ? "Quitar me gusta de" : "Dar me gusta a"} ${collection.title}` : "Inicia sesión para dar me gusta"}>♥ <span>{collection.likes}</span></button><span>{collection.books.length} libros</span></footer></div>
          </article>
        ))}
      </div>
      {collections.length > 4 ? <button type="button" className="reader-collections-more" onClick={() => setShowAll((value) => !value)}>{showAll ? "Ver menos" : `Ver las ${collections.length} colecciones`}</button> : null}
    </section>
  );
}
