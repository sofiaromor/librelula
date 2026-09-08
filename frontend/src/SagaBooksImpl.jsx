import { useEffect, useMemo, useState } from "react";

import { publicUrl } from "./api.js";
import { getCatalogSagaBooks } from "./lib/catalogApi.js";
import { canonicalSagaIdentity } from "./lib/sagaIdentity.js";
import "./SagaBooks.css";

function sagaOrder(book) {
  if (
    book.saga_number === null ||
    book.saga_number === undefined ||
    book.saga_number === ""
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const number = Number(book.saga_number);

  return Number.isFinite(number)
    ? number
    : Number.POSITIVE_INFINITY;
}

export default function SagaBooks({
  sagaKey,
  sagaName,
  onBack,
  onSelectBook,
}) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const saga = useMemo(
    () => canonicalSagaIdentity(sagaKey, sagaName),
    [sagaKey, sagaName],
  );

  useEffect(() => {
    async function loadBooks() {
      try {
        setLoading(true);
        setError("");

        setBooks(await getCatalogSagaBooks({ sagaKey, sagaName }));
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }

    loadBooks();
  }, [sagaKey, sagaName]);

  const sagaBooks = useMemo(() => {
    return [...books]
      .sort((firstBook, secondBook) => {
        const numberDifference =
          sagaOrder(firstBook) - sagaOrder(secondBook);

        if (numberDifference !== 0) {
          return numberDifference;
        }

        return String(firstBook.title || "").localeCompare(
          String(secondBook.title || ""),
          "es"
        );
      });
  }, [books]);

  function openBook(book) {
    if (typeof onSelectBook === "function") {
      onSelectBook(book);
    }
  }

  function handleKeyDown(event, book) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openBook(book);
    }
  }

  if (loading) {
    return <p>Cargando libros de la saga...</p>;
  }

  if (error) {
    return (
      <main>
        <button type="button" className="saga-back-button" onClick={onBack}>
          ← Volver
        </button>

        <p role="alert" style={{ color: "#b00020" }}>
          {error}
        </p>
      </main>
    );
  }

  return (
    <main
      style={{
        width: "min(1200px, 100%)",
        margin: "0 auto",
      }}
    >
      <button
        type="button"
        className="saga-back-button"
        onClick={onBack}
      >
        ← Volver al libro
      </button>

      <header style={{ marginBottom: 26 }}>
        <h1 style={{ marginBottom: 6 }}>
          Saga: {saga.name || sagaName || "Sin nombre"}
        </h1>

        <p style={{ margin: 0 }}>
          {sagaBooks.length} libro
          {sagaBooks.length === 1 ? "" : "s"}, ordenados por volumen
        </p>
      </header>

      {sagaBooks.length === 0 ? (
        <p>No se encontraron otros libros de esta saga.</p>
      ) : (
        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(210px, 1fr))",
            gap: 22,
          }}
        >
          {sagaBooks.map((book) => (
            <article
              key={book.id}
              role="button"
              tabIndex={0}
              onClick={() => openBook(book)}
              onKeyDown={(event) =>
                handleKeyDown(event, book)
              }
              style={{
                display: "flex",
                flexDirection: "column",
                padding: 16,
                background: "#ffffff",
                border: "1px solid #d8d0c4",
                borderRadius: 8,
                boxShadow: "0 3px 10px rgb(0 0 0 / 8%)",
                cursor: "pointer",
              }}
            >
              {book.cover ? (
                <img
                  src={publicUrl(book.cover)}
                  alt={`Portada de ${book.title}`}
                  loading="lazy"
                  style={{
                    width: "100%",
                    height: 280,
                    objectFit: "cover",
                    borderRadius: 5,
                    background: "#eeeeee",
                  }}
                />
              ) : (
                <div
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: "100%",
                    height: 280,
                    borderRadius: 5,
                    background: "#eeeeee",
                  }}
                >
                  Sin portada
                </div>
              )}

              <p
                style={{
                  marginBottom: 0,
                  fontWeight: "bold",
                  color: "#8057b7",
                }}
              >
                {book.saga_number !== null &&
                book.saga_number !== undefined &&
                book.saga_number !== ""
                  ? `Volumen ${book.saga_number}`
                  : "Sin número"}
              </p>

              <h2
                style={{
                  marginBottom: 5,
                  fontSize: "1.1rem",
                }}
              >
                {book.title}
              </h2>

              <p style={{ marginTop: 0 }}>
                {book.author || "Autor desconocido"}
              </p>

              <p
                style={{
                  marginTop: "auto",
                  marginBottom: 0,
                  fontWeight: "bold",
                }}
              >
                Abrir libro →
              </p>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
