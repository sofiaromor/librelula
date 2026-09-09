import { useEffect, useState } from "react";
import { publicUrl } from "./api.js";
import { getPublicCollections, toggleCollectionLike } from "./lib/collectionsApi.js";
import "./ReaderCollections.css";

function coverUrl(value) {
  const text = String(value || "").trim();
  return text.startsWith("http") ? text : publicUrl(text || "images/librelula.png");
}

export default function ReaderCollections({ isLoggedIn = false, creatorId = null, onSelectBook, onSelectCollection, onCreateCollection }) {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPublicCollections({ creatorId })
      .then((items) => { if (!cancelled) setCollections(items); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [creatorId]);

  const canCreate = Boolean(isLoggedIn && !creatorId && onCreateCollection);

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
        {canCreate ? <button type="button" className="reader-collections-create" onClick={onCreateCollection}>＋ Crear colección</button> : null}
      </header>
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
