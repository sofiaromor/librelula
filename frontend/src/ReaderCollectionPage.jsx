import { publicUrl } from "./api.js";
import "./ReaderCollectionPage.css";

function coverUrl(value) {
  const text = String(value || "").trim();
  return text.startsWith("http") ? text : publicUrl(text || "images/librelula.png");
}

export default function ReaderCollectionPage({ collection, onBack, onSelectBook }) {
  if (!collection) return null;

  return (
    <main className="reader-collection-page">
      <div className="reader-collection-page-inner">
        <button type="button" className="reader-collection-back" onClick={onBack}>
          <span aria-hidden="true">←</span> Catálogo
        </button>

        <header className="reader-collection-page-header">
          <span className="reader-collection-page-kind">
            {collection.is_curated ? "Selección Librélula" : "Colección de la comunidad"}
          </span>
          <h1>{collection.title}</h1>
          {collection.description ? <p>{collection.description}</p> : null}
          <div className="reader-collection-page-meta" aria-label="Datos de la colección">
            <span>{collection.books.length} {collection.books.length === 1 ? "libro" : "libros"}</span>
            <span aria-hidden="true">·</span>
            <span>♥ {collection.likes || 0}</span>
          </div>
        </header>

        {collection.books.length ? (
          <section aria-labelledby="reader-collection-books-title">
            <h2 id="reader-collection-books-title" className="sr-only">Libros de la colección</h2>
            <div className="reader-collection-page-books">
              {collection.books.map((book) => (
                <button
                  type="button"
                  className="reader-collection-page-book"
                  key={book.id}
                  onClick={() => onSelectBook?.(book)}
                >
                  <img src={coverUrl(book.cover)} alt={`Portada de ${book.title}`} />
                  <span className="reader-collection-page-book-copy">
                    <strong>{book.title}</strong>
                    <span>{book.author || "Autoría por confirmar"}</span>
                  </span>
                  <span className="reader-collection-page-arrow" aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <p className="reader-collection-page-empty">Esta colección todavía no tiene libros.</p>
        )}
      </div>
    </main>
  );
}
