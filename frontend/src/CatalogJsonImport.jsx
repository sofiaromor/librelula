import { useMemo, useRef, useState } from "react";
import "./CatalogJsonImport.css";
import { apiFetch, readJsonResponse } from "./api.js";
import { BOOK_GENRES, normalizeBookGenre } from "./bookGenres.js";
import { inferTaxonomyFromSubjects } from "./bookTaxonomy.js";
import { deriveBaseTitle } from "./lib/bookIdentity.js";
import { extractHeroColor, FALLBACK_HERO_COLOR } from "./heroColor.js";

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const IMPORTABLE_STATUSES = ["new_work", "new_edition"];
const IMPORTED_STATUSES = ["imported_work", "imported_edition"];

function cleanText(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function cleanInteger(value) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 ? String(number) : "";
}

function cleanIsbn(value) {
  return String(value ?? "").toUpperCase().replace(/[^0-9X]/gu, "");
}

function validIsbn(value) {
  const isbn = cleanIsbn(value);
  if (!isbn) return true;

  if (isbn.length === 10) {
    let total = 0;

    for (let index = 0; index < isbn.length; index += 1) {
      const character = isbn[index];
      const digit = character === "X" && index === 9 ? 10 : Number(character);
      if (!Number.isInteger(digit)) return false;
      total += digit * (10 - index);
    }

    return total % 11 === 0;
  }

  if (isbn.length === 13 && /^\d{13}$/u.test(isbn)) {
    const total = isbn
      .slice(0, 12)
      .split("")
      .reduce(
        (sum, character, index) =>
          sum + Number(character) * (index % 2 === 0 ? 1 : 3),
        0,
      );

    return (10 - (total % 10)) % 10 === Number(isbn[12]);
  }

  return false;
}

function normalizedItem(value, index) {
  const item = value && typeof value === "object" ? value : {};
  const sourceGenre = cleanText(item.source_genre || item.genre);
  const genre = normalizeBookGenre(item.genre || sourceGenre);
  const sourceId = cleanText(item.source_id);
  const title = cleanText(item.title || item.titulo);
  const titleBase = deriveBaseTitle(title, item.title_base);

  return {
    rowId: `${index + 1}-${sourceId || "sin-fuente"}`,
    importId: item.import_id || index + 1,
    selected: false,
    expanded: false,
    status: "pending_check",
    resultMessage: "",
    matchedBookId: "",
    matchedBookTitle: "",
    title,
    titleBase,
    edition: cleanText(item.edition || item.edicion),
    author: cleanText(item.author || item.autora),
    synopsis: cleanText(item.synopsis || item.sinopsis),
    genre,
    sourceGenre,
    year: cleanInteger(item.year || item.anio),
    pages: cleanInteger(item.pages || item.numero_paginas),
    publisher: cleanText(item.publisher || item.editorial),
    language: cleanText(item.language || item.idioma || "es") || "es",
    isbn: cleanIsbn(item.isbn),
    sagaName: cleanText(item.saga_name || item.saga),
    sagaNumber: cleanInteger(item.saga_number || item.sagaNumber),
    cover: cleanText(item.cover || item.imagen_portada),
    provider: cleanText(item.provider || "casa_del_libro"),
    sourceId,
    sourceUrl: cleanText(item.source_url || item.url),
    binding: cleanText(item.binding || item.encuadernacion || item.formato),
    heroColor: cleanText(item.hero_color || item.heroColor),
    publicationDate: cleanText(
      item.publication_date || item.fecha_publicacion,
    ),
    warnings: Array.isArray(item.warnings)
      ? item.warnings.map(cleanText).filter(Boolean)
      : [],
  };
}

function itemErrors(item, allItems) {
  const errors = [];

  if (!item.title) errors.push("Falta el título");
  if (!item.author) errors.push("Falta el autor");
  if (!validIsbn(item.isbn)) errors.push("El ISBN no supera la validación");

  if (item.isbn) {
    const duplicateIsbn = allItems.some(
      (candidate) =>
        candidate.rowId !== item.rowId &&
        cleanIsbn(candidate.isbn) === cleanIsbn(item.isbn),
    );
    if (duplicateIsbn) errors.push("ISBN repetido dentro del archivo");
  }

  if (item.sourceId) {
    const duplicateSource = allItems.some(
      (candidate) =>
        candidate.rowId !== item.rowId &&
        candidate.provider === item.provider &&
        candidate.sourceId === item.sourceId,
    );
    if (duplicateSource) errors.push("Fuente repetida dentro del archivo");
  }

  return [...new Set(errors)];
}

function itemWarnings(item) {
  const warnings = [...item.warnings];

  if (!item.cover) warnings.push("Falta una portada HTTPS");
  if (!item.synopsis) warnings.push("Falta la sinopsis");
  if (!item.pages) warnings.push("Falta el número de páginas");
  if (!item.publisher) warnings.push("Falta la editorial");
  if (!item.year) warnings.push("Falta el año");
  if (!item.sourceUrl) warnings.push("Falta la URL de procedencia");
  if (!item.edition && !item.binding) warnings.push("Falta indicar la edición o el formato");
  if (item.sourceGenre && !item.genre) {
    warnings.push(`Revisar el género de origen: «${item.sourceGenre}»`);
  }

  return [...new Set(warnings.filter(Boolean))];
}

function isImportable(item, errors = []) {
  return errors.length === 0 && IMPORTABLE_STATUSES.includes(item.status);
}

function statusLabel(item, errors) {
  if (errors.length > 0 || item.status === "blocked") return "Bloqueado";

  const labels = {
    pending_check: "Sin comprobar",
    checking: "Comprobando",
    new_work: "Obra nueva",
    new_edition: "Edición nueva",
    existing_edition: "Ya existe",
    ambiguous: "Revisión manual",
    importing: "Importando",
    imported_work: "Obra importada",
    imported_edition: "Edición añadida",
    failed: "Con error",
  };

  return labels[item.status] || "Pendiente";
}

function importPayload(item) {
  const inferredTaxonomy = inferTaxonomyFromSubjects(
    [item.genre, item.sourceGenre].filter(Boolean),
  );

  return {
    row_id: item.rowId,
    title: item.title,
    title_base: item.titleBase || deriveBaseTitle(item.title),
    edition: item.edition || null,
    binding: item.binding || null,
    author: item.author,
    synopsis: item.synopsis || null,
    genres: item.genre ? [item.genre] : [],
    year: item.year || null,
    pages: item.pages || null,
    publisher: item.publisher || null,
    language: item.language || "es",
    isbn: item.isbn || null,
    saga_name: item.sagaName || null,
    saga_number: item.sagaNumber || null,
    cover: item.cover || null,
    provider: item.provider || "casa_del_libro",
    source_id: item.sourceId || null,
    source_url: item.sourceUrl || null,
    publication_date: item.publicationDate || null,
    hero_color: item.heroColor || null,
    matched_book_id: item.matchedBookId || null,
    ...inferredTaxonomy,
  };
}

function previewPayload(item) {
  return importPayload(item);
}

export default function CatalogJsonImport({ onCancel }) {
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);

  const preparedItems = useMemo(
    () =>
      items.map((item) => ({
        item,
        errors: itemErrors(item, items),
        warnings: itemWarnings(item),
      })),
    [items],
  );

  const selectedItems = preparedItems.filter(
    ({ item, errors }) => item.selected && isImportable(item, errors),
  );
  const newWorkCount = items.filter((item) => item.status === "new_work").length;
  const newEditionCount = items.filter((item) => item.status === "new_edition").length;
  const existingCount = items.filter((item) => item.status === "existing_edition").length;
  const ambiguousCount = items.filter((item) => item.status === "ambiguous").length;
  const warningCount = preparedItems.filter(
    ({ warnings }) => warnings.length > 0,
  ).length;
  const blockedCount = preparedItems.filter(
    ({ item, errors }) => errors.length > 0 || item.status === "blocked",
  ).length;
  const completedCount = items.filter((item) =>
    IMPORTED_STATUSES.includes(item.status),
  ).length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const readyCount = newWorkCount + newEditionCount;

  function updateItem(rowId, changes) {
    setItems((current) =>
      current.map((item) =>
        item.rowId === rowId ? { ...item, ...changes } : item,
      ),
    );
  }

  function editItem(rowId, changes) {
    updateItem(rowId, {
      ...changes,
      selected: false,
      status: "pending_check",
      matchedBookId: "",
      matchedBookTitle: "",
      resultMessage: "Vuelve a comprobar el catálogo después de editar esta ficha.",
    });
    setNotice("");
  }

  async function checkCatalog(sourceItems = items) {
    if (checking || importing || sourceItems.length === 0) return;

    const withLocalStatus = sourceItems.map((item) => {
      const errors = itemErrors(item, sourceItems);
      return {
        ...item,
        selected: false,
        status: errors.length > 0 ? "blocked" : "checking",
        resultMessage:
          errors.length > 0 ? "Corrige los errores antes de comparar." : "Comparando con Librélula…",
      };
    });

    setItems(withLocalStatus);
    setChecking(true);
    setFileError("");
    setNotice("Comparando el archivo completo con las obras y ediciones actuales…");

    try {
      const response = await apiFetch("preview_external_books.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ books: withLocalStatus.map(previewPayload) }),
      });
      const data = await readJsonResponse(response);
      const resultsByRow = new Map(
        (Array.isArray(data.items) ? data.items : []).map((result) => [
          result.row_id,
          result,
        ]),
      );

      const checkedItems = withLocalStatus.map((item) => {
        const errors = itemErrors(item, withLocalStatus);
        if (errors.length > 0) {
          return {
            ...item,
            selected: false,
            status: "blocked",
            resultMessage: "Corrige los errores antes de importar.",
          };
        }

        const result = resultsByRow.get(item.rowId);
        const status = result?.status || "pending_check";

        return {
          ...item,
          titleBase: result?.title_base || item.titleBase || deriveBaseTitle(item.title),
          selected: IMPORTABLE_STATUSES.includes(status),
          status,
          matchedBookId: result?.matched_book_id || "",
          matchedBookTitle: result?.matched_book_title || "",
          resultMessage:
            result?.message || "No se pudo clasificar este registro. Vuelve a comprobarlo.",
        };
      });

      const summary = checkedItems.reduce(
        (counts, item) => ({
          ...counts,
          [item.status]: (counts[item.status] || 0) + 1,
        }),
        {},
      );

      setItems(checkedItems);
      setNotice(
        `${summary.existing_edition || 0} existentes · ${summary.new_edition || 0} ediciones nuevas · ${summary.new_work || 0} obras nuevas · ${summary.ambiguous || 0} para revisar.`,
      );
    } catch (error) {
      setItems((current) =>
        current.map((item) => ({
          ...item,
          selected: false,
          status: item.status === "blocked" ? "blocked" : "pending_check",
          resultMessage:
            item.status === "blocked"
              ? item.resultMessage
              : "No se pudo completar la comprobación previa.",
        })),
      );
      setFileError(error.message || "No se pudo comparar el archivo con el catálogo.");
      setNotice("");
    } finally {
      setChecking(false);
    }
  }

  async function loadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setFileError("");
    setNotice("");

    if (!file.name.toLowerCase().endsWith(".json")) {
      setFileError("Selecciona el archivo JSON preparado para Librélula.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setFileError("El archivo supera los 3 MB. Prepara una tanda más pequeña.");
      return;
    }

    try {
      const parsed = JSON.parse(await file.text());
      const records = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.books)
          ? parsed.books
          : null;

      if (!records) {
        throw new Error("El JSON debe contener una lista de libros.");
      }

      if (records.length === 0) {
        throw new Error("El archivo no contiene ningún libro.");
      }

      if (records.length > 500) {
        throw new Error("El archivo contiene más de 500 libros.");
      }

      const normalizedItems = records.map(normalizedItem);
      setItems(normalizedItems);
      setFileName(file.name);
      await checkCatalog(normalizedItems);
    } catch (error) {
      setItems([]);
      setFileName("");
      setFileError(error.message || "No se pudo leer el archivo JSON.");
    }
  }

  function toggleSelection(rowId) {
    if (importing || checking) return;

    const prepared = preparedItems.find(({ item }) => item.rowId === rowId);
    if (!prepared || !isImportable(prepared.item, prepared.errors)) return;

    updateItem(rowId, { selected: !prepared.item.selected });
    setNotice("");
  }

  function selectAllReady() {
    if (importing || checking) return;

    const selectableIds = preparedItems
      .filter(({ item, errors }) => isImportable(item, errors))
      .map(({ item }) => item.rowId);

    setItems((current) =>
      current.map((item) => ({
        ...item,
        selected: selectableIds.includes(item.rowId),
      })),
    );
    setNotice(
      selectableIds.length > 0
        ? `Seleccionados ${selectableIds.length} registros nuevos.`
        : "No hay obras ni ediciones nuevas listas para importar.",
    );
  }

  function clearSelection() {
    setItems((current) =>
      current.map((item) => ({ ...item, selected: false })),
    );
    setNotice("");
  }

  async function importSelected() {
    const queue = preparedItems.filter(
      ({ item, errors }) => item.selected && isImportable(item, errors),
    );

    if (queue.length === 0 || importing || checking) {
      setNotice("Selecciona al menos una obra o edición nueva.");
      return;
    }

    const confirmed = window.confirm(
      `Vas a importar ${queue.length} ${
        queue.length === 1 ? "registro" : "registros"
      } nuevos. Los existentes no se tocarán. ¿Quieres continuar?`,
    );

    if (!confirmed) return;

    setImporting(true);
    setFileError("");
    setNotice("Importando de forma secuencial y comprobando cada edición de nuevo…");

    for (const { item } of queue) {
      updateItem(item.rowId, {
        status: "importing",
        resultMessage: "Validando la obra y la edición antes de escribir…",
      });

      try {
        let heroColor = item.heroColor;
        if (!heroColor && item.cover) {
          heroColor = await extractHeroColor(item.cover);
        }

        const response = await apiFetch("import_external_book.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            importPayload({
              ...item,
              heroColor: heroColor || FALLBACK_HERO_COLOR,
            }),
          ),
        });
        const data = await readJsonResponse(response);
        const resultType = data.result_type;

        if (resultType === "existing_edition" || data.already_exists) {
          updateItem(item.rowId, {
            selected: false,
            status: "existing_edition",
            resultMessage:
              "La edición ya estaba en Librélula; no se ha creado ningún duplicado.",
          });
        } else if (resultType === "edition_created") {
          updateItem(item.rowId, {
            selected: false,
            status: "imported_edition",
            resultMessage: `Edición añadida dentro de «${data.book?.title || item.titleBase}».`,
          });
        } else {
          updateItem(item.rowId, {
            selected: false,
            status: "imported_work",
            resultMessage:
              "Obra principal creada y edición guardada correctamente.",
          });
        }
      } catch (error) {
        updateItem(item.rowId, {
          selected: false,
          status: "failed",
          resultMessage: error.message || "No se pudo importar este registro.",
        });
      }
    }

    setImporting(false);
    setNotice("Tanda terminada. Revisa el resultado antes de continuar.");
  }

  return (
    <main className="json-import-page">
      <header className="json-import-hero">
        <div>
          <span className="json-import-kicker">Administración del catálogo</span>
          <h1>Revisar libros del scraper</h1>
          <p>
            Librélula compara primero el archivo completo y separa las obras de
            sus ediciones antes de guardar nada.
          </p>
        </div>
        <button type="button" className="json-import-back" onClick={onCancel}>
          Volver al catálogo
        </button>
      </header>

      <section className="json-import-upload">
        <div className="json-import-upload-copy">
          <span className="json-import-step">1</span>
          <div>
            <h2>Carga el archivo preparado</h2>
            <p>
              Usa <strong>librelula_import_*.json</strong>, generado por
              <strong> preparar_importacion.py</strong>.
            </p>
            {fileName && <small>Archivo actual: {fileName}</small>}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          onChange={loadFile}
          hidden
        />
        <button
          type="button"
          className="json-import-file-button"
          onClick={() => inputRef.current?.click()}
          disabled={importing || checking}
        >
          {items.length > 0 ? "Cambiar archivo JSON" : "Elegir archivo JSON"}
        </button>
      </section>

      {fileError && (
        <p className="json-import-feedback is-error" role="alert">
          {fileError}
        </p>
      )}

      {notice && (
        <p className="json-import-feedback is-info" role="status">
          {notice}
        </p>
      )}

      {items.length > 0 && (
        <>
          <section className="json-import-summary" aria-label="Resumen del archivo">
            <article className="is-new-work">
              <strong>{newWorkCount}</strong>
              <span>Obras nuevas</span>
            </article>
            <article className="is-new-edition">
              <strong>{newEditionCount}</strong>
              <span>Ediciones nuevas</span>
            </article>
            <article className="is-existing">
              <strong>{existingCount}</strong>
              <span>Ya existentes</span>
            </article>
            <article className="is-ambiguous">
              <strong>{ambiguousCount}</strong>
              <span>Para revisar</span>
            </article>
            <article>
              <strong>{warningCount}</strong>
              <span>Con avisos</span>
            </article>
            <article className="is-blocked">
              <strong>{blockedCount}</strong>
              <span>Bloqueados</span>
            </article>
          </section>

          <section className="json-import-toolbar">
            <div>
              <span className="json-import-step">2</span>
              <div>
                <h2>Revisa la selección antes de importar</h2>
                <p>
                  {selectedItems.length} seleccionados de {readyCount} registros
                  nuevos · los existentes se desmarcan automáticamente.
                </p>
              </div>
            </div>
            <div className="json-import-toolbar-actions">
              <button
                type="button"
                onClick={() => checkCatalog()}
                disabled={importing || checking}
              >
                {checking ? "Comprobando…" : "Comprobar catálogo de nuevo"}
              </button>
              <button
                type="button"
                onClick={selectAllReady}
                disabled={importing || checking}
              >
                Seleccionar todos los nuevos
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={importing || checking || selectedItems.length === 0}
              >
                Quitar selección
              </button>
            </div>
          </section>

          <div className="json-import-list">
            {preparedItems.map(({ item, errors, warnings }) => {
              const imported = IMPORTED_STATUSES.includes(item.status);
              const selectable = isImportable(item, errors);
              const checkboxDisabled =
                importing || checking || !selectable || imported;

              return (
                <article
                  className={`json-import-card is-${item.status}${
                    item.selected && selectable ? " is-selected" : ""
                  }`}
                  key={item.rowId}
                >
                  <label className="json-import-select">
                    <input
                      type="checkbox"
                      checked={item.selected && selectable}
                      onChange={() => toggleSelection(item.rowId)}
                      disabled={checkboxDisabled}
                    />
                    <span>{selectable ? "Seleccionar" : "No se importará"}</span>
                  </label>

                  <div className="json-import-cover">
                    {item.cover ? (
                      <img
                        src={item.cover}
                        alt={`Portada de ${item.title || "libro"}`}
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                          event.currentTarget.nextElementSibling?.removeAttribute(
                            "hidden",
                          );
                        }}
                      />
                    ) : null}
                    <div hidden={Boolean(item.cover)}>
                      <span aria-hidden="true">⌁</span>
                      Sin portada
                    </div>
                  </div>

                  <div className="json-import-card-main">
                    <div className="json-import-card-heading">
                      <div>
                        <span>Registro {item.importId}</span>
                        <h3>{item.title || "Título pendiente"}</h3>
                        <p>{item.author || "Autor pendiente"}</p>
                      </div>
                      <span
                        className={`json-import-status is-${item.status}${
                          errors.length > 0 ? " has-errors" : ""
                        }`}
                      >
                        {statusLabel(item, errors)}
                      </span>
                    </div>

                    <dl className="json-import-meta">
                      <div>
                        <dt>Obra principal</dt>
                        <dd>{item.titleBase || deriveBaseTitle(item.title) || "Por revisar"}</dd>
                      </div>
                      <div>
                        <dt>ISBN</dt>
                        <dd>{item.isbn || "Sin ISBN"}</dd>
                      </div>
                      <div>
                        <dt>Edición</dt>
                        <dd>{item.edition || item.binding || "Sin indicar"}</dd>
                      </div>
                      <div>
                        <dt>Destino</dt>
                        <dd>{item.matchedBookTitle || "Nueva obra"}</dd>
                      </div>
                    </dl>

                    {errors.length > 0 && (
                      <ul className="json-import-issues is-error">
                        {errors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    )}

                    {warnings.length > 0 && (
                      <details className="json-import-issues is-warning">
                        <summary>
                          {warnings.length} {warnings.length === 1 ? "aviso" : "avisos"}
                        </summary>
                        <ul>
                          {warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {item.resultMessage && (
                      <p
                        className={`json-import-result is-${item.status}`}
                        role={item.status === "failed" ? "alert" : "status"}
                      >
                        {item.resultMessage}
                      </p>
                    )}

                    <button
                      type="button"
                      className="json-import-edit-toggle"
                      onClick={() =>
                        updateItem(item.rowId, { expanded: !item.expanded })
                      }
                      disabled={importing || checking || imported}
                      aria-expanded={item.expanded}
                    >
                      {item.expanded ? "Cerrar revisión" : "Revisar y editar ficha"}
                    </button>

                    {item.expanded && (
                      <div className="json-import-editor">
                        <label>
                          <span>Título de esta edición *</span>
                          <input
                            value={item.title}
                            onChange={(event) =>
                              editItem(item.rowId, { title: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          <span>Título de la obra principal *</span>
                          <input
                            value={item.titleBase}
                            onChange={(event) =>
                              editItem(item.rowId, { titleBase: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          <span>Autor *</span>
                          <input
                            value={item.author}
                            onChange={(event) =>
                              editItem(item.rowId, { author: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          <span>Nombre de la edición</span>
                          <input
                            value={item.edition}
                            placeholder="Edición especial, 2.ª edición…"
                            onChange={(event) =>
                              editItem(item.rowId, { edition: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          <span>Formato o encuadernación</span>
                          <input
                            value={item.binding}
                            placeholder="Tapa dura, bolsillo, ebook…"
                            onChange={(event) =>
                              editItem(item.rowId, { binding: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          <span>ISBN</span>
                          <input
                            value={item.isbn}
                            onChange={(event) =>
                              editItem(item.rowId, {
                                isbn: cleanIsbn(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>Género de Librélula</span>
                          <select
                            value={item.genre}
                            onChange={(event) =>
                              editItem(item.rowId, { genre: event.target.value })
                            }
                          >
                            <option value="">Selecciona un género</option>
                            {BOOK_GENRES.map((genre) => (
                              <option key={genre} value={genre}>
                                {genre}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Editorial</span>
                          <input
                            value={item.publisher}
                            onChange={(event) =>
                              editItem(item.rowId, { publisher: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          <span>Año</span>
                          <input
                            type="number"
                            min="1"
                            max="9999"
                            value={item.year}
                            onChange={(event) =>
                              editItem(item.rowId, { year: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          <span>Fecha de publicación</span>
                          <input
                            value={item.publicationDate}
                            placeholder="15/03/2024"
                            onChange={(event) =>
                              editItem(item.rowId, {
                                publicationDate: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>Páginas</span>
                          <input
                            type="number"
                            min="1"
                            value={item.pages}
                            onChange={(event) =>
                              editItem(item.rowId, { pages: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          <span>Idioma</span>
                          <input
                            value={item.language}
                            onChange={(event) =>
                              editItem(item.rowId, { language: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          <span>Saga</span>
                          <input
                            value={item.sagaName}
                            onChange={(event) =>
                              editItem(item.rowId, { sagaName: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          <span>N.º en la saga</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={item.sagaNumber}
                            onChange={(event) =>
                              editItem(item.rowId, { sagaNumber: event.target.value })
                            }
                          />
                        </label>
                        <label className="is-wide">
                          <span>URL de portada</span>
                          <input
                            type="url"
                            value={item.cover}
                            onChange={(event) =>
                              editItem(item.rowId, { cover: event.target.value })
                            }
                          />
                        </label>
                        <label className="is-wide">
                          <span>Sinopsis</span>
                          <textarea
                            rows="5"
                            value={item.synopsis}
                            onChange={(event) =>
                              editItem(item.rowId, { synopsis: event.target.value })
                            }
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <section className="json-import-submit">
            <div>
              <span className="json-import-step">3</span>
              <div>
                <h2>Importa solo las novedades</h2>
                <p>
                  {completedCount > 0 && `${completedCount} completados. `}
                  {failedCount > 0 && `${failedCount} con error. `}
                  Cada registro vuelve a comprobarse justo antes de guardarse.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={importSelected}
              disabled={importing || checking || selectedItems.length === 0}
            >
              {importing
                ? "Importando…"
                : `Importar obras y ediciones seleccionadas${
                    selectedItems.length > 0 ? ` (${selectedItems.length})` : ""
                  }`}
            </button>
          </section>
        </>
      )}
    </main>
  );
}

