import { useEffect, useMemo, useRef, useState } from "react";
import { publicUrl } from "./api.js";
import {
  COLLECTION_ACCENT_OPTIONS,
  deleteLibraryCollection,
  getProfileCollections,
  isCollectionUnavailableError,
  saveLibraryCollection,
  setCollectionFollow,
} from "./lib/libraryCollections.js";
import "./ProfileCollections.css";

function coverUrl(path) {
  const value = String(path || "").trim();
  if (!value) return publicUrl("images/librelula.png");
  if (/^https?:\/\//i.test(value) || value.startsWith("blob:")) return value;
  return publicUrl(value);
}

function emptyDraft() {
  return {
    id: "",
    name: "",
    description: "",
    accentColor: COLLECTION_ACCENT_OPTIONS[0],
    visibility: "private",
    bookIds: [],
  };
}

function CollectionShelf({ collection, onSelectBook }) {
  const visible = (collection.books || []).slice(0, 5);

  return (
    <div className="profile-collection-shelf" aria-label={`Libros de ${collection.name}`}>
      <div className="profile-collection-books">
        {visible.length ? visible.map((book, index) => (
          <button
            type="button"
            key={book.id || book.book_id || index}
            className="profile-collection-book"
            style={{ "--collection-book-index": index }}
            onClick={() => onSelectBook?.(book)}
            title={book.title || "Libro"}
          >
            <img
              src={coverUrl(book.cover)}
              alt={`Portada de ${book.title || "libro"}`}
              loading="lazy"
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = publicUrl("images/librelula.png");
              }}
            />
          </button>
        )) : (
          <div className="profile-collection-empty-shelf">
            <span aria-hidden="true">❧</span>
            <small>Esta balda espera sus primeros libros</small>
          </div>
        )}
      </div>
      <div className="profile-collection-wood" aria-hidden="true" />
    </div>
  );
}

function CollectionCard({ collection, ownerView, onEdit, onDelete, onFollow, onSelectBook, busy, preview = false }) {
  return (
    <article
      className={`profile-collection-card ${preview ? "is-preview" : ""}`}
      style={{ "--collection-accent": collection.accent_color || COLLECTION_ACCENT_OPTIONS[0] }}
    >
      <header>
        <div>
          <span className="profile-collection-visibility">
            {preview ? "Vista previa" : collection.visibility === "public" ? "Pública" : "Privada"}
          </span>
          <h3>{collection.name}</h3>
          {collection.description ? <p>{collection.description}</p> : null}
        </div>
        {ownerView && !preview ? (
          <div className="profile-collection-owner-actions">
            <button type="button" onClick={() => onEdit(collection)} aria-label={`Editar ${collection.name}`}>✎</button>
            <button type="button" onClick={() => onDelete(collection)} aria-label={`Eliminar ${collection.name}`}>×</button>
          </div>
        ) : null}
      </header>

      <CollectionShelf collection={collection} onSelectBook={onSelectBook} />

      <footer>
        <div className="profile-collection-stats">
          <strong>{collection.books?.length || 0}</strong>
          <span>{collection.books?.length === 1 ? "libro" : "libros"}</span>
          {collection.visibility === "public" && !preview ? (
            <>
              <i aria-hidden="true">·</i>
              <strong>{collection.follower_count || 0}</strong>
              <span>{collection.follower_count === 1 ? "seguidor" : "seguidores"}</span>
            </>
          ) : null}
        </div>

        {!ownerView && !preview && collection.visibility === "public" ? (
          <button
            type="button"
            className={`profile-collection-follow ${collection.followed_by_viewer ? "is-following" : ""}`}
            disabled={busy}
            onClick={() => onFollow(collection)}
          >
            {collection.followed_by_viewer ? "Siguiendo" : "Seguir"}
          </button>
        ) : null}
      </footer>
    </article>
  );
}

function CollectionEditor({ draft, shelfBooks, onChange, onClose, onSave, saving, persistEnabled }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const savingRef = useRef(saving);
  const [bookSearch, setBookSearch] = useState("");
  const search = bookSearch.trim().toLocaleLowerCase("es");
  const selected = new Set(draft.bookIds || []);
  const visibleBooks = (shelfBooks || []).filter((book) => {
    if (!search) return true;
    return `${book.title || ""} ${book.author || ""}`.toLocaleLowerCase("es").includes(search);
  });

  useEffect(() => {
    onCloseRef.current = onClose;
    savingRef.current = saving;
  }, [onClose, saving]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previousActiveElement = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    const focusableSelector = [
      "button:not([disabled])",
      "input:not([disabled])",
      "textarea:not([disabled])",
      "select:not([disabled])",
      "[href]",
      "[tabindex]:not([tabindex=\"-1\"])",
    ].join(",");

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        if (!savingRef.current) {
          event.preventDefault();
          onCloseRef.current();
        }
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = [...dialog.querySelectorAll(focusableSelector)];
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previousActiveElement instanceof HTMLElement && document.contains(previousActiveElement)) {
        previousActiveElement.focus();
      }
    };
  }, []);

  function toggleBook(bookId) {
    const next = new Set(selected);
    if (next.has(bookId)) next.delete(bookId);
    else next.add(bookId);
    onChange({ ...draft, bookIds: [...next] });
  }

  return (
    <div className="collection-editor-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section
        ref={dialogRef}
        className="collection-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-editor-title"
        aria-describedby="collection-editor-description"
        tabIndex={-1}
      >
        <header>
          <div>
            <span className="profile-eyebrow">Tu selección</span>
            <h2 id="collection-editor-title">{draft.id ? "Editar colección" : "Nueva colección"}</h2>
            <p id="collection-editor-description">Crea una balda con personalidad propia y decide si quieres compartirla.</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} disabled={saving} aria-label="Cerrar editor">×</button>
        </header>

        <div className="collection-editor-fields">
          <label className="is-wide">
            <span>Nombre</span>
            <input
              value={draft.name}
              maxLength={80}
              placeholder="Ej. Otoño cozy"
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
            />
          </label>

          <label className="is-wide">
            <span>Descripción</span>
            <textarea
              value={draft.description}
              maxLength={280}
              rows={3}
              placeholder="Qué une a estos libros…"
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
            />
          </label>

          <fieldset className="collection-color-field">
            <legend>Color</legend>
            <div>
              {COLLECTION_ACCENT_OPTIONS.map((color) => (
                <button
                  type="button"
                  key={color}
                  className={draft.accentColor === color ? "is-selected" : ""}
                  style={{ "--swatch": color }}
                  onClick={() => onChange({ ...draft, accentColor: color })}
                  aria-label={`Elegir color ${color}`}
                  aria-pressed={draft.accentColor === color}
                />
              ))}
            </div>
          </fieldset>

          <label>
            <span>Visibilidad</span>
            <select
              value={draft.visibility}
              onChange={(event) => onChange({ ...draft, visibility: event.target.value })}
            >
              <option value="public">Pública · aparece en mi perfil</option>
              <option value="private">Privada · solo para mí</option>
            </select>
            {draft.visibility === "private" ? (
              <small className="collection-visibility-note">
                Al privatizarla se eliminarán los follows existentes por privacidad.
              </small>
            ) : null}
          </label>
        </div>

        <div className="collection-book-picker">
          <div className="collection-book-picker-heading">
            <div>
              <strong>Libros</strong>
              <small>{selected.size} seleccionados</small>
            </div>
            <input
              type="search"
              value={bookSearch}
              onChange={(event) => setBookSearch(event.target.value)}
              placeholder="Buscar en mi biblioteca"
            />
          </div>

          <div className="collection-book-options">
            {visibleBooks.length ? visibleBooks.map((book) => {
              const bookId = String(book.id || book.book_id || "");
              const isSelected = selected.has(bookId);
              return (
                <button
                  type="button"
                  key={bookId}
                  className={isSelected ? "is-selected" : ""}
                  onClick={() => toggleBook(bookId)}
                  aria-pressed={isSelected}
                >
                  <img src={coverUrl(book.cover)} alt="" loading="lazy" />
                  <span>
                    <strong>{book.title || "Libro sin título"}</strong>
                    <small>{book.author || "Autor desconocido"}</small>
                  </span>
                  <i>{isSelected ? "✓" : "+"}</i>
                </button>
              );
            }) : (
              <p>No encontramos libros con esa búsqueda.</p>
            )}
          </div>
        </div>

        {!persistEnabled ? (
          <p className="collection-editor-preview-note">Vista previa: todavía no se guardarán cambios en producción.</p>
        ) : null}

        <footer>
          <button type="button" className="profile-button secondary" disabled={saving} onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="profile-button primary"
            disabled={saving || !draft.name.trim() || !persistEnabled}
            onClick={onSave}
          >
            {!persistEnabled ? "Activación pendiente" : saving ? "Guardando…" : "Guardar colección"}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function ProfileCollections({ profileId, isOwner, shelfBooks, onSelectBook, contextError = "" }) {
  const [state, setState] = useState({ loading: true, available: false, unavailable: false, collections: [], error: "" });
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [shareStatus, setShareStatus] = useState("");

  const applyResult = (result) => {
    const unavailable = result.unavailable === true || result.available === false;
    setState({
      loading: false,
      available: result.available === true,
      unavailable,
      collections: result.collections || [],
      error: "",
    });
  };

  async function reload() {
    try {
      const result = await getProfileCollections(profileId);
      applyResult(result);
    } catch (error) {
      setState({
        loading: false,
        available: false,
        unavailable: isCollectionUnavailableError(error),
        collections: [],
        error: error?.message || "No se pudieron cargar las colecciones.",
      });
    }
  }

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, available: false, unavailable: false, collections: [], error: "" });

    getProfileCollections(profileId)
      .then((result) => {
        if (!cancelled) {
          const unavailable = result.unavailable === true || result.available === false;
          setState({
            loading: false,
            available: result.available === true,
            unavailable,
            collections: result.collections || [],
            error: "",
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            loading: false,
            available: false,
            unavailable: isCollectionUnavailableError(error),
            collections: [],
            error: error?.message || "No se pudieron cargar las colecciones.",
          });
        }
      });

    return () => { cancelled = true; };
  }, [profileId]);

  const publicCount = useMemo(
    () => state.collections.filter((collection) => collection.visibility === "public").length,
    [state.collections],
  );

  const canPersist = Boolean(isOwner && state.available && !state.error && !contextError);

  async function sharePublicRoute() {
    const cleanProfileId = String(profileId || "").trim();
    if (!cleanProfileId) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("book");
    url.searchParams.delete("profile");
    url.searchParams.delete("tab");
    url.searchParams.set("collections", cleanProfileId);

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: "Colecciones públicas de Librélula",
          text: "Mira mis colecciones lectoras en Librélula.",
          url: url.toString(),
        });
        setShareStatus("Enlace compartido");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url.toString());
        setShareStatus("Enlace copiado");
      } else {
        setShareStatus(url.toString());
      }
    } catch (error) {
      if (error?.name !== "AbortError") setShareStatus("No se pudo compartir el enlace.");
    }
  }

  const previewCollections = useMemo(() => {
    const books = shelfBooks || [];
    return [
      {
        id: "preview-favorites",
        name: "Mis cinco estrellas",
        description: "Historias que se quedaron conmigo después de cerrar el libro.",
        accent_color: "#b8896a",
        visibility: "public",
        books: books.slice(0, 5),
      },
      {
        id: "preview-cozy",
        name: "Domingos cozy",
        description: "Lecturas para manta, café y una tarde sin prisa.",
        accent_color: "#7f8f74",
        visibility: "private",
        books: books.slice(5, 10),
      },
    ];
  }, [shelfBooks]);

  function startCreate() {
    if (!canPersist) return;
    setDraft(emptyDraft());
  }

  function startEdit(collection) {
    setDraft({
      id: collection.id,
      name: collection.name || "",
      description: collection.description || "",
      accentColor: collection.accent_color || COLLECTION_ACCENT_OPTIONS[0],
      visibility: collection.visibility || "private",
      bookIds: (collection.books || []).map((book) => String(book.id || book.book_id || "")).filter(Boolean),
    });
  }

  async function saveDraft() {
    if (!draft || !canPersist) return;
    setSaving(true);
    setState((current) => ({ ...current, error: "" }));

    try {
      await saveLibraryCollection(draft);
      setDraft(null);
      await reload();
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "No se pudo guardar la colección." }));
    } finally {
      setSaving(false);
    }
  }

  async function removeCollection(collection) {
    if (!window.confirm(`¿Eliminar “${collection.name}”? Los libros seguirán en tu biblioteca.`)) return;
    setBusyId(collection.id);
    try {
      await deleteLibraryCollection(collection.id);
      await reload();
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "No se pudo eliminar la colección." }));
    } finally {
      setBusyId("");
    }
  }

  async function toggleFollow(collection) {
    setBusyId(collection.id);
    try {
      await setCollectionFollow(collection.id, !collection.followed_by_viewer);
      setState((current) => ({
        ...current,
        collections: current.collections.map((item) => item.id === collection.id
          ? {
              ...item,
              followed_by_viewer: !item.followed_by_viewer,
              follower_count: Math.max(0, Number(item.follower_count || 0) + (item.followed_by_viewer ? -1 : 1)),
            }
          : item),
      }));
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "No se pudo actualizar el seguimiento." }));
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="profile-collections-view" aria-label="Colecciones del perfil">
      <header className="profile-collections-intro">
        <div>
          <span className="profile-eyebrow">Estanterías con historia</span>
          <h2>{isOwner ? "Mis colecciones" : "Colecciones"}</h2>
          <p>
            {isOwner
              ? "Agrupa libros por mood, género o recuerdo y decide qué baldas quieres compartir."
              : "Una selección de baldas creadas por esta lectora."}
          </p>
        </div>
        <div className="profile-collections-intro-actions">
          {state.available ? <span>{publicCount} {publicCount === 1 ? "pública" : "públicas"}</span> : null}
          {isOwner && profileId ? (
            <button type="button" className="profile-collection-share-button" onClick={sharePublicRoute}>
              Compartir enlace
            </button>
          ) : null}
          {canPersist ? <button type="button" onClick={startCreate}>+ Nueva colección</button> : null}
        </div>
      </header>

      {contextError ? <p className="profile-collections-message is-error">{contextError}</p> : null}
      {state.error ? <p className="profile-collections-message is-error">{state.error}</p> : null}
      {shareStatus ? <p className="profile-collections-message" role="status">{shareStatus}</p> : null}

      {state.loading ? (
        <div className="profile-collections-loading"><span /> Preparando las baldas…</div>
      ) : null}

      {!state.loading && state.unavailable && isOwner && !contextError ? (
        <>
          <div className="profile-collections-preview-banner">
            <strong>Vista previa</strong>
            <span>La interfaz está lista; los datos reales se activarán después de revisar la migración.</span>
          </div>
          <div className="profile-collections-grid">
            {previewCollections.map((collection) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                ownerView
                onSelectBook={onSelectBook}
                preview
              />
            ))}
          </div>
        </>
      ) : null}

      {!state.loading && state.unavailable && !isOwner && !state.error ? (
        <p className="profile-collections-message">Las colecciones públicas todavía no están activadas.</p>
      ) : null}

      {!state.loading && state.available && state.collections.length ? (
        <div className="profile-collections-grid">
          {state.collections.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              ownerView={isOwner && collection.is_owner}
              onEdit={startEdit}
              onDelete={removeCollection}
              onFollow={toggleFollow}
              onSelectBook={onSelectBook}
              busy={busyId === collection.id}
            />
          ))}
        </div>
      ) : null}

      {!state.loading && state.available && !state.error && !contextError && !state.collections.length ? (
        <article className="profile-collections-empty">
          <span aria-hidden="true">📚</span>
          <h3>{isOwner ? "Crea tu primera colección" : "Todavía no hay colecciones públicas"}</h3>
          <p>{isOwner
            ? "Empieza con una idea sencilla: cinco estrellas, otoño cozy o libros que volverías a leer."
            : "Cuando esta lectora publique una colección aparecerá aquí."}</p>
          {canPersist ? <button type="button" onClick={startCreate}>Crear colección</button> : null}
        </article>
      ) : null}

      {draft ? (
        <CollectionEditor
          draft={draft}
          shelfBooks={shelfBooks}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={saveDraft}
          saving={saving}
          persistEnabled={canPersist}
        />
      ) : null}
    </section>
  );
}
