import { supabase } from "./supabase.js";

const AUTHOR_BOOK_FIELDS = `
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
  hero_color
`;

function escapeIlike(value) {
  return String(value || "").replace(/[\\%_]/g, "\\$&");
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es-ES");
}

function parseReleaseDate(value) {
  const clean = String(value || "").trim();
  let match = clean.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);

  if (match) {
    const [, day, month, year] = match;
    const date = new Date(`${year}-${month}-${day}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const date = new Date(`${clean}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function cleanBiography(value) {
  const values = Array.isArray(value) ? value : [value];

  return values
    .map((item) => {
      if (item && typeof item === "object") return item.value || item.text || "";
      return item || "";
    })
    .join(" ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(value, maxLength = 520) {
  const text = cleanBiography(value);
  if (text.length <= maxLength) return text;

  const shortened = text.slice(0, maxLength - 1).trim();
  const lastSpace = shortened.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.7 ? shortened.slice(0, lastSpace) : shortened).trim()}…`;
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function splitBookValues(value) {
  return String(value || "")
    .split(/[,|/;·]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinSpanish(values) {
  const cleanValues = uniqueValues(values);
  if (!cleanValues.length) return "";
  if (cleanValues.length === 1) return cleanValues[0];
  if (cleanValues.length === 2) return `${cleanValues[0]} y ${cleanValues[1]}`;
  return `${cleanValues.slice(0, -1).join(", ")} y ${cleanValues.at(-1)}`;
}

function buildSpanishCatalogBiography(authorName, profile) {
  const books = Array.isArray(profile?.books) ? profile.books : [];
  const count = books.length;
  const title = String(authorName || "Este autor").trim();
  const genres = uniqueValues(books.flatMap((book) => splitBookValues(book.genre))).slice(0, 3);
  const sagas = uniqueValues(
    books
      .map((book) => book.saga_name)
      .filter(Boolean),
  ).slice(0, 3);
  const sampleTitles = uniqueValues(books.map((book) => book.title)).slice(0, 2);
  const bookLabel = count === 1 ? "título" : "títulos";
  const genreSentence = genres.length
    ? `Su catálogo se mueve entre ${joinSpanish(genres)}.`
    : "Su obra reúne distintas líneas y géneros literarios.";
  const sagaSentence = sagas.length
    ? `Entre sus series destacan ${joinSpanish(sagas)}.`
    : "También puedes consultar sus obras independientes.";
  const sampleSentence = sampleTitles.length
    ? `En Librélula encontrarás ${joinSpanish(sampleTitles)}${count > sampleTitles.length ? " y más obras" : ""}.`
    : "";

  if (!count) {
    return `La ficha de ${title} está en construcción. Pronto reuniremos aquí su trayectoria y sus obras disponibles en Librélula.`;
  }

  return `La obra de ${title} reúne ${count} ${bookLabel} en el catálogo de Librélula. ${genreSentence} ${sagaSentence} ${sampleSentence}`
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const data = await response.json();
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

async function loadExternalAuthorPhoto(authorName) {
  const searchUrl = new URL("https://openlibrary.org/search/authors.json");
  searchUrl.searchParams.set("q", authorName);
  searchUrl.searchParams.set("limit", "8");

  const searchData = await fetchJson(searchUrl);
  const documents = Array.isArray(searchData?.docs) ? searchData.docs : [];
  const normalizedAuthor = normalizeName(authorName);
  const match = documents.find((document) => normalizeName(document?.name) === normalizedAuthor)
    || documents[0];
  const key = String(match?.key || "").replace(/^\/authors\//, "").trim();

  if (!key) return { biography: "", photo_url: "" };

  const detail = await fetchJson(`https://openlibrary.org/authors/${encodeURIComponent(key)}.json`);
  const photoId = Array.isArray(detail?.photos)
    ? detail.photos.find((photo) => Number.isFinite(Number(photo)))
    : null;

  return photoId ? `https://covers.openlibrary.org/a/id/${photoId}-M.jpg` : "";
}

async function loadSpanishWikipediaBiography(authorName) {
  const searchUrl = new URL("https://es.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("srsearch", authorName);
  searchUrl.searchParams.set("srnamespace", "0");
  searchUrl.searchParams.set("srlimit", "6");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("formatversion", "2");
  searchUrl.searchParams.set("origin", "*");

  const searchData = await fetchJson(searchUrl);
  const results = Array.isArray(searchData?.query?.search) ? searchData.query.search : [];
  const normalizedAuthor = normalizeName(authorName);
  const match = results.find((result) => normalizeName(result?.title) === normalizedAuthor)
    || results.find((result) => normalizeName(result?.title).includes(normalizedAuthor));

  if (!match?.pageid) return { biography: "", photo_url: "" };

  const detailUrl = new URL("https://es.wikipedia.org/w/api.php");
  detailUrl.searchParams.set("action", "query");
  detailUrl.searchParams.set("pageids", String(match.pageid));
  detailUrl.searchParams.set("prop", "extracts|pageimages");
  detailUrl.searchParams.set("exintro", "1");
  detailUrl.searchParams.set("exchars", "1400");
  detailUrl.searchParams.set("explaintext", "1");
  detailUrl.searchParams.set("pithumbsize", "320");
  detailUrl.searchParams.set("redirects", "1");
  detailUrl.searchParams.set("format", "json");
  detailUrl.searchParams.set("formatversion", "2");
  detailUrl.searchParams.set("origin", "*");

  const detailData = await fetchJson(detailUrl);
  const page = Array.isArray(detailData?.query?.pages) ? detailData.query.pages[0] : null;
  const biography = excerpt(page?.extract, 880);
  const lowerBiography = biography.toLocaleLowerCase("es-ES");

  if (!biography || lowerBiography.includes("puede referirse a") || lowerBiography.includes("desambiguación")) {
    return { biography: "", photo_url: "" };
  }

  return {
    biography,
    photo_url: page?.thumbnail?.source || page?.original?.source || "",
  };
}

async function loadUpcomingEditions(books) {
  const bookIds = [...new Set(books.map((book) => String(book.id || "")).filter(Boolean))];
  if (!bookIds.length) return [];

  const { data: editions, error } = await supabase
    .from("book_editions")
    .select(`
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
      source_url,
      is_primary
    `)
    .in("book_id", bookIds)
    .not("publication_date", "is", null)
    .neq("publication_date", "")
    .limit(600);

  if (error) {
    console.warn("No se pudieron cargar las próximas ediciones del autor:", error);
    return [];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const booksById = new Map(books.map((book) => [String(book.id), book]));

  return (editions || [])
    .map((edition) => ({ edition, releaseDate: parseReleaseDate(edition.publication_date) }))
    .filter(({ edition, releaseDate }) => releaseDate && releaseDate >= today && booksById.has(String(edition.book_id)))
    .sort((left, right) => left.releaseDate - right.releaseDate)
    .slice(0, 8)
    .map(({ edition, releaseDate }) => ({
      ...booksById.get(String(edition.book_id)),
      edition_id: edition.id,
      edition_title: edition.title,
      edition_label: edition.edition_label,
      binding: edition.binding,
      publisher: edition.publisher || booksById.get(String(edition.book_id))?.publisher,
      publication_date: releaseDate.toISOString().slice(0, 10),
      publication_date_label: edition.publication_date,
      pages: edition.pages || booksById.get(String(edition.book_id))?.pages,
      language: edition.language || booksById.get(String(edition.book_id))?.language,
      isbn: edition.isbn || booksById.get(String(edition.book_id))?.isbn,
      cover: edition.cover || booksById.get(String(edition.book_id))?.cover,
      source_url: edition.source_url,
      is_primary: edition.is_primary,
    }));
}

export async function getAuthorProfile(authorName) {
  const cleanAuthor = String(authorName || "").trim();
  if (!cleanAuthor) throw new Error("No se ha indicado ningún autor.");

  const { data: books, error } = await supabase
    .from("books")
    .select(AUTHOR_BOOK_FIELDS)
    .eq("review_status", "approved")
    .ilike("author", escapeIlike(cleanAuthor))
    .order("saga_name", { ascending: true, nullsFirst: false })
    .order("saga_number", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true })
    .limit(300);

  if (error) {
    console.error("Error cargando la bibliografía del autor:", error);
    throw new Error("No se pudo cargar la bibliografía de este autor.");
  }

  const visibleBooks = Array.isArray(books) ? books.filter((book) => book?.id) : [];
  const upcoming = await loadUpcomingEditions(visibleBooks);

  return {
    author: visibleBooks[0]?.author || cleanAuthor,
    books: visibleBooks,
    upcoming,
  };
}

export async function getAuthorBiography(authorName, profile = null) {
  const cleanAuthor = String(authorName || "").trim();
  if (!cleanAuthor) return { biography: "", photo_url: "", source: "" };

  const [spanishWikipedia, openLibraryPhoto] = await Promise.all([
    loadSpanishWikipediaBiography(cleanAuthor),
    loadExternalAuthorPhoto(cleanAuthor),
  ]);

  return {
    biography: spanishWikipedia.biography || buildSpanishCatalogBiography(cleanAuthor, profile),
    photo_url: spanishWikipedia.photo_url || openLibraryPhoto,
    source: spanishWikipedia.biography ? "wikipedia-es" : "catalogo",
  };
}
