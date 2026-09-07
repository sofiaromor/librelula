import { supabase } from "./supabase.js";
import {
  deriveBaseTitle,
  hasEditionMarker,
  normalizedAuthorIdentity,
  normalizedIdentity,
  titleSimilarity,
  workIdentityKey,
} from "./bookIdentity.js";
import { extractHeroColor, FALLBACK_HERO_COLOR } from "../heroColor.js";

const BOOK_SELECT = `
  id,
  title,
  author,
  synopsis,
  cover,
  genre,
  year,
  pages,
  publisher,
  language,
  isbn,
  saga_name,
  saga_number,
  saga_key,
  hero_color,
  pdf_file,
  epub_file,
  provider,
  source_id,
  review_status,
  created_by,
  submitted_by_legacy_user_id,
  approved_by,
  approved_at,
  rejected_at,
  moderation_note,
  created_at
`;

const BOOK_COVERS_BUCKET = "book-covers";

type BookInput = FormData | Record<string, unknown>;
type TaxonomyKind = "theme" | "aesthetic" | "audience";

function apiError(message: string, status = 500) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function hasFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function hasFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function getValue(input: BookInput, name: string): unknown {
  if (hasFormData(input)) {
    return input.get(name);
  }

  return input?.[name];
}

function getAllValues(input: BookInput, name: string): unknown[] {
  if (hasFormData(input)) {
    return input.getAll(name);
  }

  const value = input?.[name];
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function asText(value: unknown): string {
  if (hasFile(value)) return "";
  return String(value ?? "").trim();
}

function textOrNull(value: unknown): string | null {
  const text = asText(value);
  return text ? text : null;
}

function intOrNull(value: unknown): number | null {
  const text = asText(value);
  if (!text) return null;

  const number = Number.parseInt(text, 10);
  return Number.isFinite(number) ? number : null;
}

function slugify(value: unknown): string | null {
  const text = asText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return text || null;
}

function randomBookId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "book-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

function normalizedIsbn(value: unknown): string {
  return asText(value).toUpperCase().replace(/[^0-9X]/g, "");
}

function genreValue(input: BookInput): string | null {
  const rawGenres = getValue(input, "genres");

  if (Array.isArray(rawGenres)) {
    const genres = rawGenres.map(asText).filter(Boolean);
    return genres.length ? JSON.stringify([...new Set(genres)]) : null;
  }

  const repeatedGenres = getAllValues(input, "genres").map(asText).filter(Boolean);
  if (repeatedGenres.length > 0) {
    return JSON.stringify([...new Set(repeatedGenres)]);
  }

  return textOrNull(getValue(input, "genre"));
}

function taxonomyValues(input: BookInput, names: string[]): string[] {
  const values: string[] = [];

  for (const name of names) {
    const raw = getValue(input, name);

    if (Array.isArray(raw)) {
      values.push(...raw.map(asText));
      continue;
    }

    values.push(...getAllValues(input, name).map(asText));
  }

  return [...new Set(values.filter(Boolean))].slice(0, 24);
}

function taxonomyRows(input: BookInput, bookId: string) {
  const groups: Array<[TaxonomyKind, string[]]> = [
    ["theme", taxonomyValues(input, ["themes", "theme"])],
    ["aesthetic", taxonomyValues(input, ["aesthetics", "aesthetic"])],
    ["audience", taxonomyValues(input, ["audiences", "audience"])],
  ];

  return groups.flatMap(([kind, values]) =>
    values.map((value, position) => ({
      book_id: bookId,
      kind,
      value,
      position,
    })),
  );
}

function buildBookPayload(input: BookInput) {
  const title = asText(getValue(input, "title"));
  const author = asText(getValue(input, "author"));

  if (!title) {
    throw apiError("Escribe el tÃ­tulo del libro.", 400);
  }

  if (!author) {
    throw apiError("Escribe el autor del libro.", 400);
  }

  const sagaName = textOrNull(getValue(input, "saga_name")) || textOrNull(getValue(input, "sagaName"));
  const provider = textOrNull(getValue(input, "provider"));
  const sourceId = textOrNull(getValue(input, "source_id")) || textOrNull(getValue(input, "sourceId"));
  const providedId = textOrNull(getValue(input, "id"));

  return {
    id: providedId || randomBookId(),
    title,
    author,
    synopsis: textOrNull(getValue(input, "synopsis")) || textOrNull(getValue(input, "description")),
    cover: textOrNull(getValue(input, "cover")),
    genre: genreValue(input),
    year: intOrNull(getValue(input, "year")),
    pages: intOrNull(getValue(input, "pages")),
    publisher: textOrNull(getValue(input, "publisher")),
    language: textOrNull(getValue(input, "language")) || "es",
    isbn: normalizedIsbn(getValue(input, "isbn")) || null,
    saga_name: sagaName,
    saga_number: intOrNull(getValue(input, "saga_number")) ?? intOrNull(getValue(input, "sagaNumber")),
    saga_key: textOrNull(getValue(input, "saga_key")) || slugify(sagaName),
    hero_color: textOrNull(getValue(input, "hero_color")) || textOrNull(getValue(input, "heroColor")),
    pdf_file: textOrNull(getValue(input, "pdf_file")),
    epub_file: textOrNull(getValue(input, "epub_file")),
    provider,
    source_id: sourceId,
  };
}


function safeStorageName(value: string) {
  return String(value || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 90) || "archivo";
}

function coverExtension(file: File) {
  const nameExtension = String(file.name || "").split(".").pop()?.toLowerCase();

  if (nameExtension && ["jpg", "jpeg", "png", "webp"].includes(nameExtension)) {
    return nameExtension === "jpeg" ? "jpg" : nameExtension;
  }

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function uploadCoverFile(input: BookInput, bookId: string, title: string) {
  const value = getValue(input, "cover");

  if (!hasFile(value) || value.size === 0) {
    return textOrNull(value);
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(value.type)) {
    throw apiError("La portada debe ser JPG, PNG o WEBP.", 400);
  }

  const maxSize = 10 * 1024 * 1024;

  if (value.size > maxSize) {
    throw apiError("La portada no puede superar los 10 MB.", 400);
  }

  const path = `${bookId}/${Date.now()}-${safeStorageName(title)}.${coverExtension(value)}`;

  const { error } = await supabase.storage
    .from(BOOK_COVERS_BUCKET)
    .upload(path, value, {
      cacheControl: "3600",
      upsert: true,
      contentType: value.type,
    });

  if (error) {
    throw apiError(error.message || "No se pudo subir la portada.", 500);
  }

  const { data } = supabase.storage.from(BOOK_COVERS_BUCKET).getPublicUrl(path);

  return data.publicUrl;
}

async function getCurrentProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw apiError("Inicia sesión para proponer libros.", 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, legacy_id, is_admin")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw apiError("No se pudo comprobar tu perfil.", 500);
  }

  return {
    id: profile?.id || user.id,
    legacy_id: profile?.legacy_id || null,
    is_admin: Boolean(profile?.is_admin),
  };
}

function applyModerationFields(
  basePayload: ReturnType<typeof buildBookPayload>,
  profile: Awaited<ReturnType<typeof getCurrentProfile>>,
) {
  const isAdmin = Boolean(profile.is_admin);

  return {
    ...basePayload,
    review_status: isAdmin ? "approved" : "pending",
    created_by: profile.id,
    submitted_by_legacy_user_id: profile.legacy_id,
    approved_by: isAdmin ? profile.id : null,
    approved_at: isAdmin ? new Date().toISOString() : null,
    rejected_at: null,
    moderation_note: null,
    pdf_file: isAdmin ? basePayload.pdf_file : null,
    epub_file: isAdmin ? basePayload.epub_file : null,
  };
}

async function saveTaxonomy(input: BookInput, bookId: string) {
  const rows = taxonomyRows(input, bookId);

  if (rows.length === 0) return;

  const { error } = await supabase.from("book_taxonomy").insert(rows);

  if (error) {
    throw apiError("El libro se creÃ³, pero no se pudieron guardar sus etiquetas.", 500);
  }
}


async function replaceTaxonomy(input: BookInput, bookId: string) {
  const rows = taxonomyRows(input, bookId);

  const { error: deleteError } = await supabase
    .from("book_taxonomy")
    .delete()
    .eq("book_id", bookId);

  if (deleteError) {
    throw apiError("El libro se actualiz?, pero no se pudieron reemplazar sus etiquetas.", 500);
  }

  if (rows.length === 0) return;

  const { error } = await supabase.from("book_taxonomy").insert(rows);

  if (error) {
    throw apiError("El libro se actualiz?, pero no se pudieron guardar sus etiquetas.", 500);
  }
}

const EDITION_SELECT = `
  id,
  book_id,
  title,
  edition_label,
  binding,
  publisher,
  publication_date,
  year,
  pages,
  language,
  isbn,
  cover,
  provider,
  source_id,
  source_url,
  is_primary,
  created_at,
  updated_at
`;

type CatalogBookIdentity = {
  id: string;
  title: string | null;
  author: string | null;
  isbn?: string | null;
  provider?: string | null;
  source_id?: string | null;
  publisher?: string | null;
  year?: string | number | null;
  pages?: number | null;
};

type CatalogEditionIdentity = {
  id: string;
  book_id: string;
  title?: string | null;
  edition_label?: string | null;
  binding?: string | null;
  publisher?: string | null;
  year?: string | null;
  pages?: number | null;
  isbn?: string | null;
  provider?: string | null;
  source_id?: string | null;
  is_primary?: boolean | null;
};

function editionTableError(error: { code?: string; message?: string } | null) {
  if (!error) return null;

  const message = error.message || "";
  const missingTable =
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .*book_editions.* does not exist/iu.test(message) ||
    /could not find .*book_editions/iu.test(message);

  if (missingTable) {
    return apiError(
      "Falta activar el sistema de ediciones en Supabase. Ejecuta primero supabase/book-editions.sql.",
      503,
    );
  }

  return apiError(error.message || "No se pudieron consultar las ediciones.", 500);
}

function sourceKey(provider: unknown, sourceId: unknown) {
  const cleanProvider = normalizedIdentity(provider);
  const cleanSourceId = asText(sourceId);
  return cleanProvider && cleanSourceId ? `${cleanProvider}::${cleanSourceId}` : "";
}

function editionLabel(input: BookInput, isPrimary = false) {
  return (
    textOrNull(getValue(input, "edition")) ||
    textOrNull(getValue(input, "edition_label")) ||
    textOrNull(getValue(input, "binding")) ||
    (isPrimary ? "Edición principal" : "Otra edición")
  );
}

function buildEditionPayload(input: BookInput, bookId: string, isPrimary = false) {
  return {
    book_id: bookId,
    title:
      textOrNull(getValue(input, "title")) ||
      textOrNull(getValue(input, "title_base")) ||
      "",
    edition_label: editionLabel(input, isPrimary),
    binding: textOrNull(getValue(input, "binding")),
    publisher: textOrNull(getValue(input, "publisher")),
    publication_date:
      textOrNull(getValue(input, "publication_date")) ||
      textOrNull(getValue(input, "publicationDate")),
    year: textOrNull(getValue(input, "year")),
    pages: intOrNull(getValue(input, "pages")),
    language: textOrNull(getValue(input, "language")) || "es",
    isbn: normalizedIsbn(getValue(input, "isbn")) || null,
    cover: textOrNull(getValue(input, "cover")),
    provider: textOrNull(getValue(input, "provider")),
    source_id:
      textOrNull(getValue(input, "source_id")) ||
      textOrNull(getValue(input, "sourceId")),
    source_url:
      textOrNull(getValue(input, "source_url")) ||
      textOrNull(getValue(input, "sourceUrl")),
    is_primary: isPrimary,
  };
}

function editionInputFromSavedBook(
  input: BookInput,
  book: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(hasFormData(input)
      ? {
          edition: getValue(input, "edition"),
          edition_label: getValue(input, "edition_label"),
          binding: getValue(input, "binding"),
          publication_date: getValue(input, "publication_date"),
          source_url: getValue(input, "source_url"),
        }
      : input),
    title: book.title,
    publisher: book.publisher,
    year: book.year,
    pages: book.pages,
    language: book.language,
    isbn: book.isbn,
    cover: book.cover,
    provider: book.provider,
    source_id: book.source_id,
  };
}

async function insertEdition(input: BookInput, bookId: string, isPrimary = false) {
  const { data, error } = await supabase
    .from("book_editions")
    .insert(buildEditionPayload(input, bookId, isPrimary))
    .select(EDITION_SELECT)
    .single();

  if (error) {
    throw editionTableError(error);
  }

  return data;
}

async function syncPrimaryEdition(
  input: BookInput,
  bookId: string,
  previousBookTitle = "",
) {
  const { data: primary, error: findError } = await supabase
    .from("book_editions")
    .select(EDITION_SELECT)
    .eq("book_id", bookId)
    .eq("is_primary", true)
    .maybeSingle();

  if (findError) throw editionTableError(findError);

  const payload = buildEditionPayload(input, bookId, true);

  if (primary?.id) {
    const primaryUsedOldWorkTitle =
      previousBookTitle &&
      normalizedIdentity(primary.title) === normalizedIdentity(previousBookTitle);

    const preservedPayload = {
      ...payload,
      title: primaryUsedOldWorkTitle ? payload.title : primary.title || payload.title,
      edition_label: primary.edition_label || payload.edition_label,
      binding: primary.binding || payload.binding,
      publication_date: primary.publication_date || payload.publication_date,
      source_url: primary.source_url || payload.source_url,
    };

    const { error } = await supabase
      .from("book_editions")
      .update(preservedPayload)
      .eq("id", primary.id);

    if (error) throw editionTableError(error);
    return;
  }

  await insertEdition(input, bookId, true);
}

async function catalogIdentities() {
  const [{ data: books, error: booksError }, { data: editions, error: editionsError }] =
    await Promise.all([
      supabase
        .from("books")
        .select("id, title, author, isbn, provider, source_id, publisher, year, pages"),
      supabase
        .from("book_editions")
        .select(
          "id, book_id, title, edition_label, binding, publisher, year, pages, isbn, provider, source_id, is_primary",
        ),
    ]);

  if (booksError) {
    throw apiError("No se pudo comparar el archivo con el catálogo actual.", 500);
  }

  if (editionsError) throw editionTableError(editionsError);

  return {
    books: (books || []) as CatalogBookIdentity[],
    editions: (editions || []) as CatalogEditionIdentity[],
  };
}

function editionDetails(input: BookInput) {
  const title = asText(getValue(input, "title"));
  const baseTitle = deriveBaseTitle(title, asText(getValue(input, "title_base")));
  const edition = normalizedIdentity(
    getValue(input, "edition") || getValue(input, "edition_label"),
  );
  const binding = normalizedIdentity(getValue(input, "binding"));

  return {
    title: normalizedIdentity(title),
    titleHasEditionMarker: hasEditionMarker(title),
    edition,
    binding,
    publisher: normalizedIdentity(getValue(input, "publisher")),
    year: asText(getValue(input, "year")),
    pages: intOrNull(getValue(input, "pages")),
    hasExplicitEdition: Boolean(edition || binding) || hasEditionMarker(title),
  };
}

function editionCandidateDetails(candidate: CatalogEditionIdentity | CatalogBookIdentity) {
  return {
    title: normalizedIdentity(candidate.title),
    edition:
      "edition_label" in candidate
        ? normalizedIdentity(candidate.edition_label)
        : "",
    binding:
      "binding" in candidate ? normalizedIdentity(candidate.binding) : "",
    publisher: normalizedIdentity(candidate.publisher),
    year: asText(candidate.year),
    pages: intOrNull(candidate.pages),
    isPrimary: "is_primary" in candidate ? Boolean(candidate.is_primary) : true,
  };
}

function editionMetadataComparison(
  input: ReturnType<typeof editionDetails>,
  candidate: ReturnType<typeof editionCandidateDetails>,
) {
  const fields: Array<[string | number | null, string | number | null]> = [
    [input.publisher, candidate.publisher],
    [input.year, candidate.year],
    [input.pages, candidate.pages],
  ];
  let matches = 0;
  let conflicts = 0;

  for (const [left, right] of fields) {
    if (left === "" || left === null || right === "" || right === null) continue;
    if (String(left) === String(right)) matches += 1;
    else conflicts += 1;
  }

  return { matches, conflicts };
}

function fallbackEditionMatch(
  input: BookInput,
  candidate: CatalogEditionIdentity | CatalogBookIdentity,
) {
  const wanted = editionDetails(input);
  const current = editionCandidateDetails(candidate);
  const wantedIsbn = normalizedIsbn(getValue(input, "isbn"));
  const candidateIsbn = normalizedIsbn(candidate.isbn);
  const wantedSource = sourceKey(
    getValue(input, "provider"),
    getValue(input, "source_id") || getValue(input, "sourceId"),
  );
  const candidateSource = sourceKey(candidate.provider, candidate.source_id);
  const { matches, conflicts } = editionMetadataComparison(wanted, current);

  if (wantedIsbn && candidateIsbn && wantedIsbn !== candidateIsbn) return false;
  if (wantedSource && candidateSource && wantedSource !== candidateSource) return false;
  if (conflicts > 0) return false;

  if (!wanted.hasExplicitEdition) {
    return current.isPrimary;
  }

  const explicitMatch =
    (wanted.titleHasEditionMarker && wanted.title === current.title) ||
    (Boolean(wanted.edition) && wanted.edition === current.edition) ||
    (Boolean(wanted.binding) && wanted.binding === current.binding);

  return explicitMatch && (matches > 0 || wanted.title === current.title);
}

function exactEditionBookId(
  input: BookInput,
  books: CatalogBookIdentity[],
  editions: CatalogEditionIdentity[],
) {
  const wantedSource = sourceKey(
    getValue(input, "provider"),
    getValue(input, "source_id") || getValue(input, "sourceId"),
  );
  const wantedIsbn = normalizedIsbn(getValue(input, "isbn"));

  if (wantedSource) {
    const edition = editions.find(
      (candidate) => sourceKey(candidate.provider, candidate.source_id) === wantedSource,
    );
    if (edition) return edition.book_id;

    const legacyBook = books.find(
      (candidate) => sourceKey(candidate.provider, candidate.source_id) === wantedSource,
    );
    if (legacyBook) return legacyBook.id;
  }

  if (wantedIsbn) {
    const edition = editions.find(
      (candidate) => normalizedIsbn(candidate.isbn) === wantedIsbn,
    );
    if (edition) return edition.book_id;

    const legacyBook = books.find(
      (candidate) => normalizedIsbn(candidate.isbn) === wantedIsbn,
    );
    if (legacyBook) return legacyBook.id;
  }

  const workIds = new Set(exactWorkMatches(input, books).map((book) => book.id));

  if (workIds.size === 0) return null;

  const matchingEdition = editions.find(
    (candidate) => workIds.has(candidate.book_id) && fallbackEditionMatch(input, candidate),
  );
  if (matchingEdition) return matchingEdition.book_id;

  const matchingLegacyBook = books.find(
    (candidate) => workIds.has(candidate.id) && fallbackEditionMatch(input, candidate),
  );

  return matchingLegacyBook?.id || null;
}

function isConfidentNewEdition(
  input: BookInput,
  bookId: string,
  books: CatalogBookIdentity[],
  editions: CatalogEditionIdentity[],
) {
  const wanted = editionDetails(input);
  const wantedIsbn = normalizedIsbn(getValue(input, "isbn"));
  const wantedSource = sourceKey(
    getValue(input, "provider"),
    getValue(input, "source_id") || getValue(input, "sourceId"),
  );
  const candidates: Array<CatalogEditionIdentity | CatalogBookIdentity> = [
    ...editions.filter((edition) => edition.book_id === bookId),
    ...books.filter((book) => book.id === bookId),
  ];

  if (
    wantedIsbn &&
    candidates.some((candidate) => {
      const candidateIsbn = normalizedIsbn(candidate.isbn);
      return Boolean(candidateIsbn && candidateIsbn !== wantedIsbn);
    })
  ) {
    return true;
  }

  if (
    wantedSource &&
    wanted.hasExplicitEdition &&
    candidates.some((candidate) => {
      const candidateSource = sourceKey(candidate.provider, candidate.source_id);
      return Boolean(candidateSource && candidateSource !== wantedSource);
    })
  ) {
    return true;
  }

  if (
    wanted.binding &&
    candidates.some((candidate) => {
      const binding = editionCandidateDetails(candidate).binding;
      return Boolean(binding && binding !== wanted.binding);
    })
  ) {
    return true;
  }

  if (
    wanted.edition &&
    candidates.some((candidate) => {
      const edition = editionCandidateDetails(candidate).edition;
      return Boolean(edition && edition !== wanted.edition);
    })
  ) {
    return true;
  }

  return wanted.titleHasEditionMarker && Boolean(wantedIsbn || wantedSource);
}

function exactWorkMatches(input: BookInput, books: CatalogBookIdentity[]) {
  const wantedKey = workIdentityKey(
    getValue(input, "title"),
    getValue(input, "author"),
    asText(getValue(input, "title_base")),
  );

  if (!wantedKey) return [];

  return books.filter(
    (book) => workIdentityKey(book.title, book.author) === wantedKey,
  );
}

function possibleWorkMatches(input: BookInput, books: CatalogBookIdentity[]) {
  const wantedTitle = deriveBaseTitle(
    getValue(input, "title"),
    asText(getValue(input, "title_base")),
  );
  const wantedAuthor = normalizedAuthorIdentity(getValue(input, "author"));

  if (!wantedTitle || !wantedAuthor) return [];

  return books.filter((book) => {
    if (normalizedAuthorIdentity(book.author) !== wantedAuthor) return false;

    const candidateTitle = deriveBaseTitle(book.title);
    const left = normalizedIdentity(wantedTitle);
    const right = normalizedIdentity(candidateTitle);

    return (
      titleSimilarity(wantedTitle, candidateTitle) >= 0.82 ||
      (left.length >= 8 && right.length >= 8 && (left.includes(right) || right.includes(left)))
    );
  });
}

function previewItem(
  input: BookInput,
  books: CatalogBookIdentity[],
  editions: CatalogEditionIdentity[],
) {
  const rowId = asText(getValue(input, "row_id")) || asText(getValue(input, "rowId"));
  const title = asText(getValue(input, "title"));
  const author = asText(getValue(input, "author"));
  const titleBase = deriveBaseTitle(title, asText(getValue(input, "title_base")));

  if (!title || !author) {
    return {
      row_id: rowId,
      status: "blocked",
      title_base: titleBase,
      matched_book_id: null,
      matched_book_title: null,
      message: "Faltan datos obligatorios para comparar este registro.",
    };
  }

  const existingEditionBookId = exactEditionBookId(input, books, editions);

  if (existingEditionBookId) {
    const matchedBook = books.find((book) => book.id === existingEditionBookId);
    return {
      row_id: rowId,
      status: "existing_edition",
      title_base: titleBase,
      matched_book_id: existingEditionBookId,
      matched_book_title: matchedBook?.title || titleBase,
      message: "Esta edición ya existe en Librélula y quedará desmarcada.",
    };
  }

  const exactMatches = exactWorkMatches(input, books);

  if (exactMatches.length === 1) {
    const confidentNewEdition = isConfidentNewEdition(
      input,
      exactMatches[0].id,
      books,
      editions,
    );

    return {
      row_id: rowId,
      status: confidentNewEdition ? "new_edition" : "ambiguous",
      title_base: titleBase,
      matched_book_id: exactMatches[0].id,
      matched_book_title: exactMatches[0].title,
      message: confidentNewEdition
        ? `Se añadirá como una edición nueva de «${exactMatches[0].title}».`
        : `Coincide con «${exactMatches[0].title}», pero faltan diferencias fiables para asegurar que sea otra edición.`,
    };
  }

  if (exactMatches.length > 1) {
    return {
      row_id: rowId,
      status: "ambiguous",
      title_base: titleBase,
      matched_book_id: null,
      matched_book_title: null,
      message: "Hay varias obras iguales en el catálogo. Revisa este registro manualmente.",
    };
  }

  const possibleMatches = possibleWorkMatches(input, books);

  if (possibleMatches.length > 0) {
    return {
      row_id: rowId,
      status: "ambiguous",
      title_base: titleBase,
      matched_book_id: possibleMatches.length === 1 ? possibleMatches[0].id : null,
      matched_book_title: possibleMatches.length === 1 ? possibleMatches[0].title : null,
      message:
        possibleMatches.length === 1
          ? `Podría ser otra edición de «${possibleMatches[0].title}». Revísalo antes de importar.`
          : "Se parece a varias obras existentes. Revísalo antes de importar.",
    };
  }

  return {
    row_id: rowId,
    status: "new_work",
    title_base: titleBase,
    matched_book_id: null,
    matched_book_title: null,
    message: "No coincide con ninguna obra actual: se creará un libro principal nuevo.",
  };
}

export async function previewExternalCatalogBooks(inputs: Record<string, unknown>[]) {
  const profile = await getCurrentProfile();

  if (!profile.is_admin) {
    throw apiError("Solo una administradora puede comprobar importaciones masivas.", 403);
  }

  const safeInputs = Array.isArray(inputs) ? inputs.slice(0, 500) : [];
  const { books, editions } = await catalogIdentities();

  return {
    ok: true,
    items: safeInputs.map((input) => previewItem(input, books, editions)),
  };
}

export async function getCatalogBookEditions(bookIdValue: unknown) {
  const bookId = asText(bookIdValue);

  if (!bookId) {
    throw apiError("Falta el libro del que quieres consultar las ediciones.", 400);
  }

  const { data, error } = await supabase
    .from("book_editions")
    .select(EDITION_SELECT)
    .eq("book_id", bookId)
    .order("is_primary", { ascending: false })
    .order("year", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw editionTableError(error);

  return {
    ok: true,
    editions: data || [],
  };
}

async function findBookById(bookId: string | null) {
  if (!bookId) return null;

  const { data, error } = await supabase
    .from("books")
    .select(BOOK_SELECT)
    .eq("id", bookId)
    .maybeSingle();

  if (error) throw apiError("No se pudo comprobar la obra principal.", 500);
  return data;
}

async function resolveExistingEdition(input: BookInput) {
  const { books, editions } = await catalogIdentities();
  const bookId = exactEditionBookId(input, books, editions);
  return bookId ? findBookById(bookId) : null;
}

async function resolveExistingWork(input: BookInput) {
  const requestedBookId =
    textOrNull(getValue(input, "matched_book_id")) ||
    textOrNull(getValue(input, "matchedBookId"));

  if (requestedBookId) {
    const requestedBook = await findBookById(requestedBookId);

    if (
      requestedBook &&
      workIdentityKey(requestedBook.title, requestedBook.author) ===
        workIdentityKey(
          getValue(input, "title"),
          getValue(input, "author"),
          asText(getValue(input, "title_base")),
        )
    ) {
      return requestedBook;
    }
  }

  const { data: books, error } = await supabase
    .from("books")
    .select(BOOK_SELECT);

  if (error) throw apiError("No se pudo comprobar la obra principal.", 500);

  const matches = exactWorkMatches(input, (books || []) as CatalogBookIdentity[]);

  if (matches.length > 1) {
    throw apiError(
      "Hay varias obras iguales en el catálogo. Revisa el registro antes de importarlo.",
      409,
    );
  }

  return matches[0] || null;
}

export async function createCatalogBook(input: BookInput) {
  const profile = await getCurrentProfile();

  const basePayload = buildBookPayload(input);
  basePayload.cover = await uploadCoverFile(input, basePayload.id, basePayload.title);
  const payload = applyModerationFields(basePayload, profile);

  const { data: book, error } = await supabase
    .from("books")
    .insert(payload)
    .select(BOOK_SELECT)
    .single();

  if (error) {
    throw apiError(error.message || "No se pudo crear el libro.", 500);
  }

  try {
    await insertEdition(editionInputFromSavedBook(input, book), book.id, true);
    await saveTaxonomy(input, book.id);
  } catch (saveError) {
    await supabase.from("books").delete().eq("id", book.id);
    throw saveError;
  }

  return {
    ok: true,
    book,
  };
}

export async function importExternalCatalogBook(input: BookInput) {
  const profile = await getCurrentProfile();

  const existingEditionBook = await resolveExistingEdition(input);

  if (existingEditionBook) {
    return {
      ok: true,
      already_exists: true,
      result_type: "existing_edition",
      book: existingEditionBook,
    };
  }

  const existingWork = await resolveExistingWork(input);

  if (existingWork) {
    if (!profile.is_admin) {
      return {
        ok: true,
        already_exists: true,
        result_type: "existing_work",
        edition_skipped: true,
        book: existingWork,
      };
    }

    const { books, editions } = await catalogIdentities();

    if (!isConfidentNewEdition(input, existingWork.id, books, editions)) {
      throw apiError(
        "La obra ya existe, pero no hay diferencias suficientes para crear otra edición con seguridad. Revísala antes de importar.",
        409,
      );
    }

    try {
      const edition = await insertEdition(input, existingWork.id, false);

      return {
        ok: true,
        already_exists: false,
        result_type: "edition_created",
        book: existingWork,
        edition,
      };
    } catch (error) {
      const duplicate = await resolveExistingEdition(input);

      if (duplicate) {
        return {
          ok: true,
          already_exists: true,
          result_type: "existing_edition",
          book: duplicate,
        };
      }

      throw error;
    }
  }

  const sourceTitle = asText(getValue(input, "title"));
  const workTitle = deriveBaseTitle(sourceTitle, asText(getValue(input, "title_base")));
  const importedHeroColor = textOrNull(getValue(input, "hero_color")) ||
    textOrNull(getValue(input, "heroColor")) ||
    (textOrNull(getValue(input, "cover"))
      ? await extractHeroColor(textOrNull(getValue(input, "cover")))
      : FALLBACK_HERO_COLOR);
  const workInput: Record<string, unknown> = {
    ...(hasFormData(input) ? {} : input),
    title: workTitle || sourceTitle,
    hero_color: importedHeroColor || FALLBACK_HERO_COLOR,
  };

  const basePayload = buildBookPayload(workInput);
  const payload = applyModerationFields(basePayload, profile);

  const { data: book, error } = await supabase
    .from("books")
    .insert(payload)
    .select(BOOK_SELECT)
    .single();

  if (error) {
    throw apiError(error.message || "No se pudo importar el libro.", 500);
  }

  try {
    await insertEdition(input, book.id, true);
    await saveTaxonomy(input, book.id);
  } catch (saveError) {
    await supabase.from("books").delete().eq("id", book.id);
    throw saveError;
  }

  return {
    ok: true,
    already_exists: false,
    result_type: "work_created",
    book,
  };
}

export async function updateCatalogBook(input: BookInput) {
  const profile = await getCurrentProfile();

  if (!profile.is_admin) {
    throw apiError("Solo una administradora puede editar libros.", 403);
  }

  const bookId =
    textOrNull(getValue(input, "id")) ||
    textOrNull(getValue(input, "book_id"));

  if (!bookId) {
    throw apiError("No se recibió el libro que quieres editar.", 400);
  }

  const { data: existing, error: existingError } = await supabase
    .from("books")
    .select(BOOK_SELECT)
    .eq("id", bookId)
    .maybeSingle();

  if (existingError) {
    throw apiError("No se pudo cargar el libro para editarlo.", 500);
  }

  if (!existing) {
    throw apiError("No encontramos ese libro.", 404);
  }

  const basePayload = buildBookPayload(input);
  const payload: Partial<ReturnType<typeof buildBookPayload>> = {
    ...basePayload,
  };

  delete payload.id;

  if (!textOrNull(getValue(input, "language"))) {
    delete payload.language;
  }

  if (!textOrNull(getValue(input, "provider"))) {
    delete payload.provider;
  }

  if (
    !textOrNull(getValue(input, "source_id")) &&
    !textOrNull(getValue(input, "sourceId"))
  ) {
    delete payload.source_id;
  }

  const removeCover = asText(getValue(input, "remove_cover")) === "1";

  if (removeCover) {
    payload.cover = null;
  } else {
    const uploadedCover = await uploadCoverFile(input, bookId, basePayload.title);

    if (uploadedCover) {
      payload.cover = uploadedCover;
    } else {
      delete payload.cover;
    }
  }

  const removePdf = asText(getValue(input, "remove_pdf")) === "1";
  const removeEpub = asText(getValue(input, "remove_epub")) === "1";

  if (removePdf) {
    payload.pdf_file = null;
  } else if (!payload.pdf_file) {
    delete payload.pdf_file;
  }

  if (removeEpub) {
    payload.epub_file = null;
  } else if (!payload.epub_file) {
    delete payload.epub_file;
  }

  const { data: book, error } = await supabase
    .from("books")
    .update(payload)
    .eq("id", bookId)
    .select(BOOK_SELECT)
    .single();

  if (error) {
    throw apiError(error.message || "No se pudo actualizar el libro.", 500);
  }

  await syncPrimaryEdition(
    {
      ...(hasFormData(input) ? {} : input),
      title: book.title,
      publisher: book.publisher,
      year: book.year,
      pages: book.pages,
      language: book.language,
      isbn: book.isbn,
      cover: book.cover,
      provider: book.provider,
      source_id: book.source_id,
    },
    bookId,
    existing.title,
  );
  await replaceTaxonomy(input, bookId);

  return {
    ok: true,
    book,
  };
}


export async function deleteCatalogBook(input: BookInput) {
  const profile = await getCurrentProfile();

  if (!profile.is_admin) {
    throw apiError("Solo una administradora puede eliminar libros.", 403);
  }

  const bookId =
    textOrNull(getValue(input, "id")) ||
    textOrNull(getValue(input, "book_id"));

  if (!bookId) {
    throw apiError("No se recibi? el libro que quieres eliminar.", 400);
  }

  const { data: existing, error: existingError } = await supabase
    .from("books")
    .select("id, title")
    .eq("id", bookId)
    .maybeSingle();

  if (existingError) {
    throw apiError("No se pudo comprobar el libro antes de eliminarlo.", 500);
  }

  if (!existing) {
    throw apiError("No encontramos ese libro.", 404);
  }

  const { error } = await supabase
    .from("books")
    .delete()
    .eq("id", bookId);

  if (error) {
    throw apiError(error.message || "No se pudo eliminar el libro.", 500);
  }

  return {
    ok: true,
    deleted: true,
    id: bookId,
  };
}

