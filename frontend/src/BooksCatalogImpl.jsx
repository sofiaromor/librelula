import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./BookDiscovery.css";
import { apiFetch, publicUrl, readJsonResponse } from "./api.js";
import {
  BOOK_GENRE_GROUPS,
  BOOK_GENRES,
  QUICK_BOOK_GENRES,
  normalizeBookGenres,
  normalizedGenreText,
} from "./bookGenres.js";
import { inferTaxonomyFromSubjects } from "./bookTaxonomy.js";
import ReadingStatusControl from "./ReadingStatusControl.jsx";
import { getMyBookProposals } from "./lib/myBookProposalsApi.js";
import {
  approveBookProposal,
  getPendingBookProposals,
  rejectBookProposal,
} from "./lib/bookModerationApi.js";
import { READING_STATUS_BY_VALUE } from "./readingStatuses.js";

const CATALOG_PAGE_SIZE = 25;


function releaseDateLabel(value) {
  if (!value) return "Fecha por confirmar";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function releaseCountdown(value) {
  if (!value) return "Próximamente";
  const releaseDate = new Date(`${value}T12:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  releaseDate.setHours(0, 0, 0, 0);
  if (Number.isNaN(releaseDate.getTime())) return "Próximamente";

  const days = Math.ceil((releaseDate - today) / (24 * 60 * 60 * 1000));
  if (days < 0) return "Ya disponible";
  if (days === 0) return "Sale hoy";
  if (days === 1) return "Falta 1 día";
  return `Faltan ${days} días`;
}

function releaseCountdownParts(value) {
  if (!value) return { value: "—", suffix: "Próximamente", detail: "", state: "pending" };

  const releaseDate = new Date(`${value}T12:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  releaseDate.setHours(0, 0, 0, 0);

  if (Number.isNaN(releaseDate.getTime())) {
    return { value: "—", suffix: "Próximamente", detail: "", state: "pending" };
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const days = Math.ceil((releaseDate - today) / millisecondsPerDay);
  if (days < 0) return { value: "✓", suffix: "Ya disponible", detail: "", state: "available" };
  if (days === 0) return { value: "HOY", suffix: "Sale hoy", detail: "", state: "today" };

  if (days <= 31) {
    return {
      value: String(days),
      suffix: days === 1 ? "día" : "días",
      detail: "",
      state: "future",
    };
  }

  let months = (releaseDate.getFullYear() - today.getFullYear()) * 12
    + releaseDate.getMonth() - today.getMonth();
  let monthAnchor = new Date(today);
  monthAnchor.setMonth(today.getMonth() + months);

  if (monthAnchor > releaseDate) {
    months -= 1;
    monthAnchor = new Date(today);
    monthAnchor.setMonth(today.getMonth() + months);
  }

  const remainingDays = Math.max(
    0,
    Math.ceil((releaseDate - monthAnchor) / millisecondsPerDay),
  );

  return {
    value: String(Math.max(1, months)),
    suffix: months === 1 ? "mes" : "meses",
    detail: remainingDays > 0
      ? `+ ${remainingDays} ${remainingDays === 1 ? "día" : "días"}`
      : "",
    state: "future",
    longWait: true,
  };
}

function compactSynopsis(value, limit = 210) {
  const cleanValue = String(value || "").replace(/\s+/g, " ").trim();
  if (!cleanValue) return "Una historia esperando a que abras su ficha.";
  return cleanValue.length > limit ? `${cleanValue.slice(0, limit).trim()}…` : cleanValue;
}

function BellIcon({ active = false }) {
  return (
    <svg
      className="catalog-bell-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M10 21h4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CatalogPagination({ page, totalPages, onPageChange, position = "bottom" }) {
  if (totalPages <= 1) return null;
  const items = paginationItems(page, totalPages);

  return (
    <nav className={`catalog-pagination is-${position}`} aria-label={`Páginas del catálogo (${position === "top" ? "arriba" : "abajo"})`}>
      <button
        type="button"
        className="catalog-pagination-step"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        ← Anterior
      </button>

      <div className="catalog-pagination-pages">
        {items.map((item) => (
          typeof item === "number" ? (
            <button
              type="button"
              key={item}
              className={item === page ? "is-current" : ""}
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          ) : (
            <span key={item} aria-hidden="true">…</span>
          )
        ))}
      </div>

      <button
        type="button"
        className="catalog-pagination-step"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        Siguiente →
      </button>
    </nav>
  );
}

function initialPage() {
  const value = Number.parseInt(new URLSearchParams(window.location.search).get("page") || "1", 10);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function paginationItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) items.push("start-ellipsis");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < totalPages - 1) items.push("end-ellipsis");
  items.push(totalPages);
  return items;
}

function initialSearch() {
  return new URLSearchParams(window.location.search).get("q") || "";
}

function initialGenreFilters() {
  const params = new URLSearchParams(window.location.search);
  const combined = params.get("genres") || params.get("genre") || "";
  return normalizeBookGenres(combined.split("|")).slice(0, 8);
}

function initialGenreMode() {
  return new URLSearchParams(window.location.search).get("genre_mode") === "all"
    ? "all"
    : "any";
}

function initialYearFilter() {
  const value = new URLSearchParams(window.location.search).get("year") || "";
  return /^\d{1,4}$/.test(value) ? value : "";
}

function resultKey(book) {
  return `${book.provider || "external"}:${book.source_id || book.id || book.isbn || book.title}`;
}

function providerLabel(book) {
  if (book?.provider_label) return book.provider_label;
  if (book?.provider === "open_library") return "Open Library";
  if (book?.provider === "google_books") return "Google Books";
  return "Fuente externa";
}

function externalGenres(book) {
  return normalizeBookGenres(book?.genres || book?.genre)
    .filter((genre) => BOOK_GENRES.includes(genre))
    .slice(0, 8);
}

function normalizedIsbn(value) {
  return String(value || "").toUpperCase().replace(/[^0-9X]/g, "");
}

function normalizedIdentity(value) {
  return String(value || "").trim().toLocaleLowerCase("es-ES");
}

function matchingCatalogBook(externalBook, catalogBooks) {
  const isbn = normalizedIsbn(externalBook?.isbn);

  if (isbn) {
    const isbnMatch = catalogBooks.find(
      (book) => normalizedIsbn(book?.isbn) === isbn,
    );
    if (isbnMatch) return isbnMatch;
  }

  const title = normalizedIdentity(externalBook?.title);
  const author = normalizedIdentity(externalBook?.author);

  if (!title || !author) return null;

  return catalogBooks.find(
    (book) => normalizedIdentity(book?.title) === title
      && normalizedIdentity(book?.author) === author,
  ) || null;
}

export default function BooksCatalog({
  isAdmin = false,
  isLoggedIn = false,
  onAddBook,
  onImportCatalog,
  onSelectBook,
}) {
  const [books, setBooks] = useState([]);
  const [discovery, setDiscovery] = useState({ latest: [], weekly: [], upcoming: [], recommendations: [] });
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [discoveryError, setDiscoveryError] = useState("");
  const [releaseAlertIds, setReleaseAlertIds] = useState([]);
  const [expectedIndex, setExpectedIndex] = useState(0);
  const [expectedPaused, setExpectedPaused] = useState(false);
  const [releaseAlertFeedback, setReleaseAlertFeedback] = useState("");
  const [savingReleaseAlertId, setSavingReleaseAlertId] = useState("");
  const [selectedShowcaseId, setSelectedShowcaseId] = useState("");
  const catalogBrowserRef = useRef(null);
  const [page, setPage] = useState(initialPage);
  const [totalBooks, setTotalBooks] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(() => initialSearch().trim());
  const [genreFilters, setGenreFilters] = useState(initialGenreFilters);
  const [genreMode, setGenreMode] = useState(initialGenreMode);
  const [genrePickerOpen, setGenrePickerOpen] = useState(false);
  const [genrePickerSearch, setGenrePickerSearch] = useState("");
  const [yearFilter, setYearFilter] = useState(initialYearFilter);
  const [publicationYears, setPublicationYears] = useState([]);
  const [genreCounts, setGenreCounts] = useState(() => (
    Object.fromEntries(BOOK_GENRES.map((genre) => [genre, 0]))
  ));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [externalResults, setExternalResults] = useState([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState("");
  const [externalSearchedQuery, setExternalSearchedQuery] = useState("");
  const [importingKey, setImportingKey] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [userBookItems, setUserBookItems] = useState({});
  const [userBooksLoading, setUserBooksLoading] = useState(false);
  const [savingStatusBookId, setSavingStatusBookId] = useState("");
  const [statusFeedback, setStatusFeedback] = useState(null);
  const [bookProposals, setBookProposals] = useState([]);
  const [bookProposalsLoading, setBookProposalsLoading] = useState(false);
  const [bookProposalsError, setBookProposalsError] = useState("");
  const [adminProposals, setAdminProposals] = useState([]);
  const [adminProposalsLoading, setAdminProposalsLoading] = useState(false);
  const [adminProposalsError, setAdminProposalsError] = useState("");
  const [moderatingBookId, setModeratingBookId] = useState("");
  const [expandedAdminProposalId, setExpandedAdminProposalId] = useState("");
  const directBookHandled = useRef(false);
  const expectedBooks = useMemo(
    () => discovery.upcoming.filter((book) => releaseAlertIds.includes(String(book.edition_id))),
    [discovery.upcoming, releaseAlertIds],
  );
  const expectedBookIds = expectedBooks.map((book) => String(book.edition_id)).join("|");

  useEffect(() => {
    if (expectedPaused || expectedBooks.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setExpectedIndex((current) => (current + 1) % expectedBooks.length);
    }, 6500);

    return () => window.clearInterval(timer);
  }, [expectedBookIds, expectedBooks.length, expectedPaused]);

  useEffect(() => {
    let cancelled = false;

    async function loadDiscovery() {
      try {
        setDiscoveryLoading(true);
        setDiscoveryError("");

        const [discoveryResponse, alertsResponse] = await Promise.all([
          apiFetch("catalog_discovery.php").then(readJsonResponse),
          isLoggedIn
            ? apiFetch("release_alerts.php").then(readJsonResponse)
            : Promise.resolve({ authenticated: false, edition_ids: [] }),
        ]);

        if (cancelled) return;
        const nextDiscovery = {
          latest: Array.isArray(discoveryResponse.latest) ? discoveryResponse.latest : [],
          weekly: Array.isArray(discoveryResponse.weekly) ? discoveryResponse.weekly : [],
          upcoming: Array.isArray(discoveryResponse.upcoming) ? discoveryResponse.upcoming : [],
          recommendations: Array.isArray(discoveryResponse.recommendations) ? discoveryResponse.recommendations : [],
          recommendationsAuthenticated: Boolean(discoveryResponse.recommendations_authenticated),
          recommendationsReady: Boolean(discoveryResponse.recommendations_ready),
        };

        setDiscovery(nextDiscovery);
        setReleaseAlertIds(Array.isArray(alertsResponse.edition_ids) ? alertsResponse.edition_ids.map(String) : []);
        setSelectedShowcaseId((current) => current || String(nextDiscovery.weekly[0]?.id || ""));
      } catch (requestError) {
        if (!cancelled) setDiscoveryError(requestError.message);
      } finally {
        if (!cancelled) setDiscoveryLoading(false);
      }
    }

    loadDiscovery();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 350);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    async function loadFilterOptions() {
      try {
        const response = await apiFetch("get_books.php?mode=filters");
        const data = await readJsonResponse(response);
        if (cancelled) return;

        setPublicationYears(Array.isArray(data.years) ? data.years : []);
        setGenreCounts({
          ...Object.fromEntries(BOOK_GENRES.map((genre) => [genre, 0])),
          ...(data.genre_counts && typeof data.genre_counts === "object"
            ? data.genre_counts
            : {}),
        });
      } catch (requestError) {
        if (!cancelled) {
          console.error("No se pudieron cargar las opciones del catálogo:", requestError);
        }
      }
    }

    loadFilterOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadBooks() {
      try {
        setLoading(true);
        setError("");

        const params = new URLSearchParams({
          page: String(page),
          page_size: String(CATALOG_PAGE_SIZE),
        });
        if (debouncedSearch) params.set("q", debouncedSearch);
        if (genreFilters.length) params.set("genres", genreFilters.join("|"));
        if (genreFilters.length > 1 && genreMode === "all") {
          params.set("genre_mode", "all");
        }
        if (yearFilter) params.set("year", yearFilter);

        const response = await apiFetch(`get_books.php?${params.toString()}`);
        const data = await readJsonResponse(response);
        if (cancelled) return;

        const nextTotalPages = Math.max(0, Number(data.total_pages || 0));
        if (nextTotalPages > 0 && page > nextTotalPages) {
          setPage(nextTotalPages);
          return;
        }

        setBooks(Array.isArray(data.books) ? data.books : []);
        setTotalBooks(Math.max(0, Number(data.total || 0)));
        setTotalPages(nextTotalPages);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadBooks();
    return () => {
      cancelled = true;
    };
  }, [catalogRefreshKey, debouncedSearch, genreFilters, genreMode, page, yearFilter]);

  useEffect(() => {
    if (!genrePickerOpen || typeof document === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") setGenrePickerOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [genrePickerOpen]);

  useEffect(() => {
    if (!isLoggedIn) return undefined;

    let cancelled = false;

    async function loadUserBooks() {
      try {
        setUserBooksLoading(true);
        const response = await apiFetch("catalog_user_books.php");
        const data = await readJsonResponse(response);
        if (!cancelled) {
          setUserBookItems(data.items && typeof data.items === "object" ? data.items : {});
        }
      } catch (requestError) {
        if (!cancelled) {
          setStatusFeedback({ type: "error", text: requestError.message });
        }
      } finally {
        if (!cancelled) setUserBooksLoading(false);
      }
    }

    loadUserBooks();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || isAdmin) return undefined;

    let cancelled = false;

    async function loadBookProposals() {
      try {
        setBookProposalsLoading(true);
        setBookProposalsError("");
        const items = await getMyBookProposals();

        if (!cancelled) {
          setBookProposals(Array.isArray(items) ? items : []);
        }
      } catch (requestError) {
        if (!cancelled) {
          setBookProposalsError(requestError.message);
        }
      } finally {
        if (!cancelled) setBookProposalsLoading(false);
      }
    }

    loadBookProposals();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) return undefined;

    let cancelled = false;

    async function loadAdminProposals() {
      try {
        setAdminProposalsLoading(true);
        setAdminProposalsError("");
        const items = await getPendingBookProposals();

        if (!cancelled) {
          setAdminProposals(Array.isArray(items) ? items : []);
        }
      } catch (requestError) {
        if (!cancelled) {
          setAdminProposalsError(requestError.message);
        }
      } finally {
        if (!cancelled) setAdminProposalsLoading(false);
      }
    }

    loadAdminProposals();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, isLoggedIn]);

  useEffect(() => {
    if (directBookHandled.current) return undefined;

    const requestedBookId = new URL(window.location.href).searchParams.get("book");
    if (!requestedBookId) {
      directBookHandled.current = true;
      return undefined;
    }

    let cancelled = false;

    async function loadDirectBook() {
      try {
        const params = new URLSearchParams({ book_id: requestedBookId });
        const response = await apiFetch(`get_books.php?${params.toString()}`);
        const data = await readJsonResponse(response);
        const requestedBook = Array.isArray(data.books) ? data.books[0] : null;

        if (!cancelled && requestedBook && typeof onSelectBook === "function") {
          onSelectBook(requestedBook);
        }
      } catch (requestError) {
        if (!cancelled) console.error("No se pudo abrir el libro enlazado:", requestError);
      } finally {
        directBookHandled.current = true;
      }
    }

    loadDirectBook();
    return () => {
      cancelled = true;
    };
  }, [onSelectBook]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const cleanSearch = search.trim();

    if (cleanSearch) url.searchParams.set("q", cleanSearch);
    else url.searchParams.delete("q");

    url.searchParams.delete("genre");
    if (genreFilters.length) url.searchParams.set("genres", genreFilters.join("|"));
    else url.searchParams.delete("genres");

    if (genreFilters.length > 1 && genreMode === "all") {
      url.searchParams.set("genre_mode", "all");
    } else {
      url.searchParams.delete("genre_mode");
    }

    if (yearFilter) url.searchParams.set("year", yearFilter);
    else url.searchParams.delete("year");

    if (page > 1) url.searchParams.set("page", String(page));
    else url.searchParams.delete("page");

    window.history.replaceState({}, "", url);
  }, [genreFilters, genreMode, page, search, yearFilter]);

  const availableGenres = useMemo(() => {
    const standard = BOOK_GENRES.filter(
      (genre) => genreCounts[genre] > 0 || genreFilters.includes(genre) || QUICK_BOOK_GENRES.includes(genre),
    );
    const custom = Object.keys(genreCounts)
      .filter((genre) => !BOOK_GENRES.includes(genre) && genreCounts[genre] > 0)
      .sort((left, right) => left.localeCompare(right, "es"));
    return [...standard, ...custom];
  }, [genreCounts, genreFilters]);

  const genreGroupsForPicker = useMemo(() => {
    const customGenres = availableGenres.filter((genre) => !BOOK_GENRES.includes(genre));
    return customGenres.length
      ? [...BOOK_GENRE_GROUPS, { key: "custom", label: "Otros géneros del catálogo", genres: customGenres }]
      : BOOK_GENRE_GROUPS;
  }, [availableGenres]);

  const filteredBooks = books;
  const visibleStart = totalBooks > 0 ? ((page - 1) * CATALOG_PAGE_SIZE) + 1 : 0;
  const visibleEnd = totalBooks > 0 ? Math.min(page * CATALOG_PAGE_SIZE, totalBooks) : 0;
  const showcaseBook = discovery.weekly.find((book) => String(book.id) === String(selectedShowcaseId))
    || discovery.weekly[0]
    || null;
  const safeExpectedIndex = expectedBooks.length ? expectedIndex % expectedBooks.length : 0;
  const primaryExpectedBook = expectedBooks[safeExpectedIndex] || null;
  const primaryExpectedCountdown = primaryExpectedBook
    ? releaseCountdownParts(primaryExpectedBook.publication_date)
    : null;

  function toggleGenreFilter(genre) {
    setPage(1);
    setGenreFilters((current) => {
      const key = normalizedGenreText(genre);
      const exists = current.some((item) => normalizedGenreText(item) === key);
      return exists
        ? current.filter((item) => normalizedGenreText(item) !== key)
        : [...current, genre].slice(0, 8);
    });
  }

  function selectQuickGenre(genre) {
    setPage(1);
    if (!genre) {
      setGenreFilters([]);
      setGenreMode("any");
      return;
    }

    setGenreFilters((current) => (
      current.length === 1 && current[0] === genre ? [] : [genre]
    ));
    setGenreMode("any");
  }

  function updateSearch(value) {
    setPage(1);
    setSearch(value);
    setExternalResults([]);
    setExternalError("");
    setExternalSearchedQuery("");
    setImportMessage("");
  }

  function clearCatalogFilters() {
    setPage(1);
    updateSearch("");
    setGenreFilters([]);
    setGenreMode("any");
    setYearFilter("");
  }

  function openBook(book) {
    if (typeof onSelectBook === "function") onSelectBook(book);
  }

  async function approveProposal(book) {
    if (!book?.id || moderatingBookId) return;

    try {
      setModeratingBookId(String(book.id));
      setAdminProposalsError("");
      await approveBookProposal(book.id);

      setAdminProposals((current) =>
        current.filter((item) => String(item.id) !== String(book.id)),
      );

      setPage(1);
      setCatalogRefreshKey((current) => current + 1);
    } catch (requestError) {
      setAdminProposalsError(requestError.message || "No se pudo aprobar la propuesta.");
    } finally {
      setModeratingBookId("");
    }
  }

  async function rejectProposal(book) {
    if (!book?.id || moderatingBookId) return;

    const note = window.prompt(
      `Motivo del rechazo para "${book.title}"`,
      "No encaja todavía con los criterios del catálogo.",
    );

    if (note === null) return;

    try {
      setModeratingBookId(String(book.id));
      setAdminProposalsError("");
      await rejectBookProposal(book.id, note);

      setAdminProposals((current) =>
        current.filter((item) => String(item.id) !== String(book.id)),
      );
    } catch (requestError) {
      setAdminProposalsError(requestError.message || "No se pudo rechazar la propuesta.");
    } finally {
      setModeratingBookId("");
    }
  }
  function startBookCreation() {
    if (!isLoggedIn || typeof onAddBook !== "function") return;
    onAddBook(search.trim());
  }

  function handleCardKeyDown(event, book) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openBook(book);
    }
  }

  async function searchOutsideCatalog() {
    const cleanSearch = search.trim();

    if (cleanSearch.length < 2) {
      setExternalError("Escribe al menos dos caracteres para buscar fuera del catálogo.");
      return;
    }

    setExternalLoading(true);
    setExternalError("");
    setExternalResults([]);
    setExternalSearchedQuery(cleanSearch);
    setImportMessage("");

    try {
      const response = await apiFetch(`search.php?q=${encodeURIComponent(cleanSearch)}`);
      const data = await readJsonResponse(response);
      setExternalResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      setExternalError(
        "No pudimos consultar Open Library. Puedes intentarlo de nuevo o crear la ficha directamente.",
      );
    } finally {
      setExternalLoading(false);
    }
  }

  async function ensureExternalBook(book, { openAfter = false } = {}) {
    const existingBook = matchingCatalogBook(book, books);
    if (existingBook) {
      if (openAfter) openBook(existingBook);
      return existingBook;
    }

    const key = resultKey(book);
    setImportingKey(key);
    setExternalError("");
    setImportMessage("");

    try {
      const inferredTaxonomy = inferTaxonomyFromSubjects(book?.genres || book?.genre);
      const response = await apiFetch("import_external_book.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...book,
          genres: externalGenres(book),
          ...inferredTaxonomy,
        }),
      });
      const data = await readJsonResponse(response);
      const importedBook = data.book;

      if (!importedBook) {
        throw new Error("No se recibió la ficha importada del libro.");
      }

      if (importedBook.review_status === "approved") {
        setPage(1);
        setCatalogRefreshKey((current) => current + 1);
      }

      setImportMessage(
        data.already_exists
          ? "Ese libro ya estaba en Librélula."
          : importedBook.review_status === "pending"
            ? "Propuesta enviada a revisión."
            : "Libro incorporado correctamente a Librélula.",
      );

      if (openAfter) openBook(importedBook);
      return importedBook;
    } finally {
      setImportingKey("");
    }
  }

  async function importExternalBook(book) {
    if (!isLoggedIn) return;

    try {
      await ensureExternalBook(book, { openAfter: true });
    } catch (requestError) {
      setExternalError(requestError.message);
    }
  }

  async function saveExternalStatus(book, status) {
    if (!isLoggedIn || importingKey || savingStatusBookId) return;

    const key = resultKey(book);
    setSavingStatusBookId(key);
    setStatusFeedback(null);

    try {
      const importedBook = await ensureExternalBook(book);
      const response = await apiFetch("catalog_user_books.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_id: String(importedBook.id), status }),
      });
      const data = await readJsonResponse(response);

      if (data.item) {
        setUserBookItems((current) => ({
          ...current,
          [String(importedBook.id)]: data.item,
        }));
      }

      const label = READING_STATUS_BY_VALUE[status]?.label || "Guardado";
      setStatusFeedback({
        type: "success",
        text: `«${importedBook.title}» se ha guardado como ${label.toLowerCase()}.`,
      });
    } catch (requestError) {
      setStatusFeedback({ type: "error", text: requestError.message });
    } finally {
      setSavingStatusBookId("");
    }
  }

  async function saveCatalogStatus(book, status) {
    const bookId = String(book?.id || "");
    if (!bookId || !isLoggedIn || savingStatusBookId) return;

    const label = READING_STATUS_BY_VALUE[status]?.label || "Guardado";
    setSavingStatusBookId(bookId);
    setStatusFeedback(null);

    try {
      const response = await apiFetch("catalog_user_books.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_id: bookId, status }),
      });
      const data = await readJsonResponse(response);

      if (data.item) {
        setUserBookItems((current) => ({
          ...current,
          [bookId]: data.item,
        }));
      }

      setStatusFeedback({
        type: "success",
        text: `«${book.title}» se ha añadido como ${label.toLowerCase()}.`,
      });
    } catch (requestError) {
      setStatusFeedback({ type: "error", text: requestError.message });
    } finally {
      setSavingStatusBookId("");
    }
  }


  async function toggleReleaseAlert(book) {
    const editionId = String(book?.edition_id || "");
    if (!editionId || savingReleaseAlertId) return;

    if (!isLoggedIn) {
      setReleaseAlertFeedback("Inicia sesión para guardar lanzamientos en Esperados.");
      return;
    }

    const active = !releaseAlertIds.includes(editionId);
    setSavingReleaseAlertId(editionId);
    setReleaseAlertFeedback("");

    try {
      const response = await apiFetch("release_alerts.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edition_id: editionId, active }),
      });
      await readJsonResponse(response);
      setReleaseAlertIds((current) => (
        active
          ? [...new Set([...current, editionId])]
          : current.filter((item) => item !== editionId)
      ));
      setReleaseAlertFeedback(active ? "Añadido a Esperados." : "Eliminado de Esperados.");
    } catch (requestError) {
      setReleaseAlertFeedback(requestError.message);
    } finally {
      setSavingReleaseAlertId("");
    }
  }

  function handleShowcaseBook(book) {
    if (String(selectedShowcaseId) === String(book.id)) {
      openBook(book);
      return;
    }
    setSelectedShowcaseId(String(book.id));
  }

  function showAllCatalogBooks() {
    clearCatalogFilters();
    window.requestAnimationFrame(() => {
      catalogBrowserRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function goToExpectedBook(nextIndex) {
    if (expectedBooks.length <= 1) return;
    setExpectedIndex((nextIndex + expectedBooks.length) % expectedBooks.length);
  }

  function goToPage(nextPage) {
    const safePage = Math.min(Math.max(1, nextPage), Math.max(1, totalPages));
    if (safePage === page) return;
    setPage(safePage);
    catalogBrowserRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loading && books.length === 0) {
    return <div className="catalog-message">Cargando el catálogo…</div>;
  }

  if (error) {
    return <div className="catalog-message is-error" role="alert">{error}</div>;
  }

  const hasSearch = search.trim().length > 0;
  const hasCatalogFilters = Boolean(hasSearch || genreFilters.length || yearFilter);
  const extraGenreFilterCount = genreFilters.filter((genre) => !QUICK_BOOK_GENRES.includes(genre)).length;
  const activeGenreSummary = genreFilters.length
    ? `Géneros activos: ${genreFilters.join(", ")}`
    : "Abrir todos los géneros literarios";
  const noLocalSearchMatch = hasSearch && !loading && totalBooks === 0;
  const externalSearchFinished = Boolean(
    externalSearchedQuery && !externalLoading,
  );

  const normalizedGenreSearch = normalizedGenreText(genrePickerSearch);
  const genrePickerPortal = genrePickerOpen && typeof document !== "undefined"
    ? createPortal(
        <div className="catalog-genre-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-genre-title">
          <button
            type="button"
            className="catalog-genre-backdrop"
            aria-label="Cerrar selector de géneros"
            onClick={() => setGenrePickerOpen(false)}
          />
          <section className="catalog-genre-sheet">
            <header>
              <div>
                <span>Filtrar el catálogo</span>
                <h2 id="catalog-genre-title">Géneros literarios</h2>
                <p>Elige uno o varios. Las sensaciones, los temas y la estética no se mezclan aquí.</p>
              </div>
              <button type="button" onClick={() => setGenrePickerOpen(false)} aria-label="Cerrar">×</button>
            </header>

            <label className="catalog-genre-search">
              <span className="sr-only">Buscar género literario</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                type="search"
                value={genrePickerSearch}
                onChange={(event) => setGenrePickerSearch(event.target.value)}
                placeholder="Buscar género…"
                autoFocus
              />
              {genrePickerSearch && <button type="button" onClick={() => setGenrePickerSearch("")}>×</button>}
            </label>

            <div className="catalog-genre-groups">
              {genreGroupsForPicker.map((group) => {
                const visibleGenres = group.genres.filter((genre) => (
                  availableGenres.includes(genre)
                  && (!normalizedGenreSearch || normalizedGenreText(genre).includes(normalizedGenreSearch))
                ));
                if (!visibleGenres.length) return null;

                return (
                  <section key={group.key}>
                    <h3>{group.label}</h3>
                    <div>
                      {visibleGenres.map((genre) => {
                        const active = genreFilters.includes(genre);
                        return (
                          <button
                            type="button"
                            key={genre}
                            className={active ? "is-selected" : ""}
                            onClick={() => toggleGenreFilter(genre)}
                            aria-pressed={active}
                          >
                            <span>{active ? "✓" : "+"}</span>
                            {genre}
                            <small>{genreCounts[genre] || 0}</small>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            <footer>
              <button type="button" className="is-ghost" onClick={() => { setPage(1); setGenreFilters([]); setGenreMode("any"); }}>
                Limpiar
              </button>
              {genreFilters.length > 1 && (
                <label>
                  <input
                    type="checkbox"
                    checked={genreMode === "all"}
                    onChange={(event) => { setPage(1); setGenreMode(event.target.checked ? "all" : "any"); }}
                  />
                  Debe contener todos
                </label>
              )}
              <button type="button" className="is-primary" onClick={() => setGenrePickerOpen(false)}>
                Ver {totalBooks} {totalBooks === 1 ? "libro" : "libros"}
              </button>
            </footer>
          </section>
        </div>,
        document.body,
      )
    : null;

  const catalogFilterPanel = (
    <div className="catalog-filter-stack" aria-label="Filtros del catálogo">
      <div className="catalog-filter-heading">
        <span>Afina tu búsqueda</span>
        <strong>Filtros</strong>
      </div>

      <div className="catalog-quick-genres" aria-label="Géneros literarios frecuentes">
        <span>Géneros</span>
        <button
          type="button"
          className={genreFilters.length === 0 ? "is-active" : ""}
          onClick={() => selectQuickGenre("")}
        >
          Todos <small>{genreFilters.length === 0 ? totalBooks : ""}</small>
        </button>
        {QUICK_BOOK_GENRES.map((genre) => (
          <button
            type="button"
            key={genre}
            className={genreFilters.includes(genre) ? "is-active" : ""}
            onClick={() => selectQuickGenre(genre)}
            aria-pressed={genreFilters.includes(genre)}
          >
            {genre}
            <small>{genreCounts[genre] || 0}</small>
          </button>
        ))}
        <button
          type="button"
          className={`catalog-more-genres${extraGenreFilterCount > 0 ? " is-active" : ""}`}
          onClick={() => setGenrePickerOpen(true)}
          title={activeGenreSummary}
          aria-label={activeGenreSummary}
        >
          Más géneros
          {extraGenreFilterCount > 0 && <small>{extraGenreFilterCount}</small>}
        </button>
      </div>

      <label className="catalog-select-filter">
        <span>Año de publicación</span>
        <select
          value={yearFilter}
          onChange={(event) => { setPage(1); setYearFilter(event.target.value); }}
        >
          <option value="">Todos los años</option>
          {publicationYears.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </label>

      {genreFilters.length > 1 && (
        <label className="catalog-sidebar-mode">
          <input
            type="checkbox"
            checked={genreMode === "all"}
            onChange={(event) => { setPage(1); setGenreMode(event.target.checked ? "all" : "any"); }}
          />
          Debe contener todos los géneros
        </label>
      )}

      <button
        type="button"
        className="catalog-clear-filters"
        onClick={clearCatalogFilters}
        disabled={!hasCatalogFilters}
        aria-disabled={!hasCatalogFilters}
      >
        Limpiar filtros
      </button>
    </div>
  );

  return (
    <>
    <main className="books-page">
      <section className="catalog-discovery" aria-label="Descubrir libros">
        <div className="catalog-discovery-heading">
          <div>
            <span className="catalog-kicker">Tu librería personal</span>
            <h1>Encuentra tu próxima historia</h1>
          </div>
        </div>

        {discoveryError && <p className="catalog-discovery-error" role="alert">{discoveryError}</p>}

        <div className="catalog-discovery-grid">
          <article className="catalog-editorial-panel catalog-latest-panel">
            <header>
              <div>
                <span>Recién llegados</span>
                <h2>Últimos añadidos</h2>
              </div>
              <button type="button" className="catalog-view-all" onClick={showAllCatalogBooks}>
                Ver todos
              </button>
            </header>

            <div className="catalog-latest-list">
              {discoveryLoading && <p className="catalog-discovery-muted">Preparando novedades…</p>}
              {!discoveryLoading && discovery.latest.slice(0, 5).map((book, index) => (
                <button type="button" key={book.id} onClick={() => openBook(book)}>
                  <span className="catalog-latest-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="catalog-latest-cover">
                    {book.cover ? <img src={publicUrl(book.cover)} alt="" loading="lazy" /> : <i>Sin portada</i>}
                  </span>
                  <span className="catalog-latest-copy">
                    <strong>{book.title}</strong>
                    <small>{book.author || "Autor desconocido"}</small>
                  </span>
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          </article>

          <article
            className="catalog-editorial-panel catalog-expected-panel"
            onMouseEnter={() => setExpectedPaused(true)}
            onMouseLeave={() => setExpectedPaused(false)}
          >
            <header>
              <div>
                <span>Cuenta atrás</span>
                <h2>Esperados</h2>
              </div>
              <span className="catalog-bell-mark" aria-hidden="true"><BellIcon active /></span>
            </header>

            {primaryExpectedBook ? (
              <div className="catalog-expected-slider">
                <div className="catalog-expected-book" key={primaryExpectedBook.edition_id}>
                  <button type="button" className="catalog-expected-cover" onClick={() => openBook(primaryExpectedBook)}>
                    {primaryExpectedBook.cover ? (
                      <img src={publicUrl(primaryExpectedBook.cover)} alt={`Portada de ${primaryExpectedBook.title}`} />
                    ) : <span>Sin portada</span>}
                  </button>
                  <div className="catalog-expected-copy">
                    {primaryExpectedCountdown && (
                      <span className={`catalog-expected-countdown is-${primaryExpectedCountdown.state}${primaryExpectedCountdown.longWait ? " is-long-wait" : ""}`}>
                        {primaryExpectedCountdown.state === "future" && <small>Faltan</small>}
                        <strong>{primaryExpectedCountdown.value}</strong>
                        <span>{primaryExpectedCountdown.suffix}</span>
                        {primaryExpectedCountdown.detail && (
                          <em>{primaryExpectedCountdown.detail}</em>
                        )}
                      </span>
                    )}
                    <h3>{primaryExpectedBook.title}</h3>
                    <p>{primaryExpectedBook.author}</p>
                    <small>{releaseDateLabel(primaryExpectedBook.publication_date)}</small>
                    <button type="button" className="catalog-expected-alert-button is-active" onClick={() => toggleReleaseAlert(primaryExpectedBook)}>
                      <BellIcon active />
                      Quitar de Esperados
                    </button>
                  </div>
                </div>

                {expectedBooks.length > 1 && (
                  <div className="catalog-expected-controls" aria-label="Cambiar libro esperado">
                    <button type="button" onClick={() => goToExpectedBook(safeExpectedIndex - 1)} aria-label="Libro esperado anterior">←</button>
                    <div>
                      {expectedBooks.map((book, index) => (
                        <button
                          type="button"
                          key={book.edition_id}
                          className={index === safeExpectedIndex ? "is-active" : ""}
                          onClick={() => goToExpectedBook(index)}
                          aria-label={`Ver ${book.title}`}
                          aria-current={index === safeExpectedIndex ? "true" : undefined}
                        />
                      ))}
                    </div>
                    <button type="button" onClick={() => goToExpectedBook(safeExpectedIndex + 1)} aria-label="Siguiente libro esperado">→</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="catalog-expected-empty">
                <span aria-hidden="true"><BellIcon /></span>
                <h3>Tu próxima obsesión empieza aquí</h3>
                <p>Pulsa la campanita de un próximo lanzamiento y aparecerá en este escaparate con su cuenta atrás.</p>
                {discovery.upcoming[0] && (
                  <button type="button" className="catalog-expected-alert-button" onClick={() => toggleReleaseAlert(discovery.upcoming[0])}>
                    <BellIcon />
                    Añadir «{discovery.upcoming[0].title}»
                  </button>
                )}
              </div>
            )}
          </article>

          <article className="catalog-editorial-panel catalog-recommendations-panel">
            <header>
              <div>
                <span>Tu mapa lector</span>
                <h2>Recomendados para ti</h2>
              </div>
              <small>Personal</small>
            </header>

            {discovery.recommendations.length > 0 ? (
              <div className="catalog-recommendations-list">
                {discovery.recommendations.slice(0, 3).map((book) => (
                  <button type="button" key={book.id} onClick={() => openBook(book)}>
                    <span className="catalog-recommendation-cover">
                      {book.cover ? <img src={publicUrl(book.cover)} alt="" loading="lazy" /> : <i>Sin portada</i>}
                    </span>
                    <span>
                      <strong>{book.title}</strong>
                      <small>{book.recommendation_reason}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="catalog-recommendations-empty">
                <span aria-hidden="true">✦</span>
                <h3>{isLoggedIn ? "Todavía estamos aprendiendo tus gustos" : "Haz tu catálogo verdaderamente tuyo"}</h3>
                <p>
                  {isLoggedIn
                    ? "Puntúa algunos libros con 4 o 5 estrellas y Librélula empezará a conectar géneros, autores, temas y vibras."
                    : "Inicia sesión, añade libros y deja reseñas para recibir recomendaciones cada vez más precisas."}
                </p>
              </div>
            )}
          </article>
        </div>

        <article className="catalog-weekly-showcase">
          <header>
            <div>
              <span>Los libros que están moviendo Librélula</span>
              <h2>Escaparate de la semana</h2>
            </div>
            <small>Haz clic una vez para descubrirlo y otra para abrir su ficha</small>
          </header>

          <div className="catalog-showcase-layout">
            <div className="catalog-showcase-books" role="list" aria-label="Libros del escaparate semanal">
              {discovery.weekly.map((book, index) => {
                const selected = String(showcaseBook?.id) === String(book.id);
                return (
                  <button
                    type="button"
                    key={book.id}
                    className={selected ? "is-selected" : ""}
                    onClick={() => handleShowcaseBook(book)}
                    role="listitem"
                    aria-pressed={selected}
                  >
                    <span>{index + 1}</span>
                    {book.cover ? <img src={publicUrl(book.cover)} alt={`Portada de ${book.title}`} loading="lazy" /> : <i>Sin portada</i>}
                  </button>
                );
              })}
            </div>

            {showcaseBook && (
              <div className="catalog-showcase-detail">
                <span className="catalog-showcase-label">Selección semanal</span>
                <h3>{showcaseBook.title}</h3>
                <p className="catalog-showcase-author">{showcaseBook.author}</p>
                <p>{compactSynopsis(showcaseBook.synopsis)}</p>
                <div>
                  {showcaseBook.genre && <span>{normalizeBookGenres(showcaseBook.genre)[0]}</span>}
                  {showcaseBook.year && <span>{showcaseBook.year}</span>}
                  {showcaseBook.pages && <span>{showcaseBook.pages} págs.</span>}
                </div>
                <button type="button" onClick={() => openBook(showcaseBook)}>Ver ficha completa →</button>
              </div>
            )}
          </div>
        </article>
      </section>

      <header className="books-hero">
        <div>
          <span className="catalog-kicker">La biblioteca completa</span>
          <h1>Busca entre todos los libros</h1>
          <p>
            {totalBooks} {totalBooks === 1 ? "libro" : "libros"}
            {hasCatalogFilters ? " filtrados" : " disponibles"}
          </p>
        </div>

        <div className="catalog-hero-actions">
          <label className="catalog-search">
            <span className="sr-only">Buscar en el catálogo</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              type="search"
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter"
                  && noLocalSearchMatch
                  && search.trim().length >= 2
                ) {
                  event.preventDefault();
                  searchOutsideCatalog();
                }
              }}
              placeholder="Título, autor, ISBN, género o saga"
            />
            {search && (
              <button type="button" onClick={() => updateSearch("")} aria-label="Limpiar búsqueda">×</button>
            )}
          </label>

          {isAdmin && (
            <div className="catalog-admin-actions">
              <button
                type="button"
                className="catalog-goodreads-button"
                onClick={onImportCatalog}
              >
                Importar JSON del scraper
              </button>
              <button
                type="button"
                className="catalog-create-button"
                onClick={() => onAddBook?.("")}
              >
                Añadir un libro
              </button>
            </div>
          )}
        </div>
      </header>

      {hasSearch && search.trim().length >= 2 && !externalSearchedQuery && (
        <section className="external-search-callout is-compact" aria-labelledby="outside-search-title">
          <div>
            <span className="external-search-kicker">Buscar en Open Library</span>
            <h2 id="outside-search-title">
              {noLocalSearchMatch
                ? "¿Lo buscamos fuera del catálogo?"
                : "¿No ves la edición o el libro que buscas?"}
            </h2>
            <p>
              Consultaremos Open Library y, cuando haga falta, completaremos los resultados con Google Books.
            </p>
          </div>

          <button
            type="button"
            onClick={searchOutsideCatalog}
            disabled={externalLoading || search.trim().length < 2}
          >
            {noLocalSearchMatch ? "Buscar" : "Buscar también"} «{search.trim()}»
          </button>
        </section>
      )}

      {externalLoading && (
        <section className="external-loading-card" aria-live="polite">
          <span className="external-loading-dot" aria-hidden="true" />
          Buscando «{externalSearchedQuery}» fuera de Librélula…
        </section>
      )}

      {importMessage && (
        <p className="external-feedback is-success" role="status">{importMessage}</p>
      )}

      {statusFeedback && (
        <p
          className={`external-feedback ${statusFeedback.type === "error" ? "is-error" : "is-success"}`}
          role={statusFeedback.type === "error" ? "alert" : "status"}
        >
          {statusFeedback.text}
        </p>
      )}

      {isLoggedIn && isAdmin && (
        adminProposalsLoading || adminProposalsError || adminProposals.length > 0
      ) && (
        <section className="book-proposals-panel admin-proposals-panel" aria-labelledby="admin-proposals-title">
          <div className="book-proposals-heading">
            <div>
              <span className="external-search-kicker">Moderación</span>
              <h2 id="admin-proposals-title">Propuestas pendientes</h2>
              <p>
                Revisa las fichas enviadas por lectoras antes de publicarlas en el catálogo.
              </p>
            </div>
          </div>

          {adminProposalsLoading && (
            <p className="book-proposals-muted">Cargando propuestas pendientes…</p>
          )}

          {adminProposalsError && (
            <p className="external-feedback is-error" role="alert">{adminProposalsError}</p>
          )}

          {!adminProposalsLoading && !adminProposalsError && adminProposals.length > 0 && (
            <div className="admin-proposals-list">
              {adminProposals.map((proposal) => {
                const isModerating = String(moderatingBookId) === String(proposal.id);
                const isExpanded = String(expandedAdminProposalId) === String(proposal.id);
                const proposalText =
                  proposal.description ||
                  proposal.summary ||
                  proposal.synopsis ||
                  proposal.notes ||
                  proposal.review ||
                  "";

                return (
                  <article className="admin-proposal-card" key={proposal.id}>
                    <div className="book-proposal-cover">
                      {proposal.cover ? (
                        <img
                          src={publicUrl(proposal.cover)}
                          alt={`Portada de ${proposal.title}`}
                          loading="lazy"
                        />
                      ) : (
                        <span>Sin portada</span>
                      )}
                    </div>

                    <div className="admin-proposal-main">
                      <span className="book-proposal-badge">Pendiente</span>
                      <h3>{proposal.title}</h3>
                      <p>{proposal.author || "Autor desconocido"}</p>
                      {proposalText && (
                        <small>{proposalText.slice(0, 180)}{proposalText.length > 180 ? "…" : ""}</small>
                      )}

                      {isExpanded && (
                        <dl className="admin-proposal-details">
                          <div>
                            <dt>ID</dt>
                            <dd>{proposal.id}</dd>
                          </div>
                          <div>
                            <dt>Año</dt>
                            <dd>{proposal.year || "Sin año"}</dd>
                          </div>
                          <div>
                            <dt>Origen</dt>
                            <dd>{proposal.provider || "Manual"}</dd>
                          </div>
                          <div>
                            <dt>Estado</dt>
                            <dd>{proposal.review_status}</dd>
                          </div>
                          {proposalText && (
                            <div className="admin-proposal-details-wide">
                              <dt>Texto enviado</dt>
                              <dd>{proposalText}</dd>
                            </div>
                          )}
                        </dl>
                      )}
                    </div>

                    <div className="admin-proposal-actions">
                      <button
                        type="button"
                        className="admin-proposal-view"
                        onClick={(event) => {
                          event.preventDefault();
                          setExpandedAdminProposalId((current) =>
                            String(current) === String(proposal.id) ? "" : String(proposal.id),
                          );
                        }}
                      >
                        {isExpanded ? "Ocultar ficha" : "Ver ficha"}
                      </button>
                      <button
                        type="button"
                        className="admin-proposal-approve"
                        onClick={(event) => {
                          event.preventDefault();
                          approveProposal(proposal);
                        }}
                        disabled={isModerating}
                      >
                        {isModerating ? "Guardando…" : "Aprobar"}
                      </button>
                      <button
                        type="button"
                        className="admin-proposal-reject"
                        onClick={(event) => {
                          event.preventDefault();
                          rejectProposal(proposal);
                        }}
                        disabled={isModerating}
                      >
                        Rechazar
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {isLoggedIn && !isAdmin && (
        bookProposalsLoading || bookProposalsError || bookProposals.length > 0
      ) && (
        <section className="book-proposals-panel" aria-labelledby="book-proposals-title">
          <div className="book-proposals-heading">
            <div>
              <span className="external-search-kicker">Tus propuestas</span>
              <h2 id="book-proposals-title">Libros en revisión</h2>
              <p>
                Estas fichas ya se han enviado, pero todavía no aparecen en el catálogo público.
              </p>
            </div>
          </div>

          {bookProposalsLoading && (
            <p className="book-proposals-muted">Cargando tus propuestas…</p>
          )}

          {bookProposalsError && (
            <p className="external-feedback is-error" role="alert">{bookProposalsError}</p>
          )}

          {!bookProposalsLoading && !bookProposalsError && bookProposals.length > 0 && (
            <div className="book-proposals-list">
              {bookProposals.map((proposal) => (
                <article className="book-proposal-card" key={proposal.id}>
                  <div className="book-proposal-cover">
                    {proposal.cover ? (
                      <img
                        src={publicUrl(proposal.cover)}
                        alt={`Portada de ${proposal.title}`}
                        loading="lazy"
                      />
                    ) : (
                      <span>Sin portada</span>
                    )}
                  </div>

                  <div>
                    <span className={`book-proposal-badge is-${proposal.review_status}`}>
                      {proposal.review_status === "rejected" ? "Rechazada" : "En revisión"}
                    </span>
                    <h3>{proposal.title}</h3>
                    <p>{proposal.author || "Autor desconocido"}</p>
                    {proposal.moderation_note && (
                      <small>{proposal.moderation_note}</small>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {externalSearchFinished && externalResults.length > 0 && !externalError && (
        <section className="external-results" aria-labelledby="external-results-title">
          <div className="external-results-heading">
            <div>
              <span className="external-search-kicker">Open Library y otras fuentes</span>
              <h2 id="external-results-title">
                {externalResults.length} {externalResults.length === 1 ? "opción" : "opciones"} para «{externalSearchedQuery}»
              </h2>
            </div>
          </div>

          <div className="external-results-grid">
            {externalResults.map((book) => {
              const key = resultKey(book);
              const importing = importingKey === key;
              const genres = normalizeBookGenres(book.genres || book.genre);
              const catalogMatch = matchingCatalogBook(book, books);
              const catalogBookId = catalogMatch ? String(catalogMatch.id) : "";
              const currentStatus = catalogBookId
                ? userBookItems[catalogBookId]?.status || ""
                : "";
              const savingExternalStatus = savingStatusBookId === key
                || (catalogBookId && savingStatusBookId === catalogBookId);

              return (
                <article className="external-book-card" key={key}>
                  <div className="external-book-cover">
                    {book.cover ? (
                      <img
                        src={book.cover}
                        alt={`Portada de ${book.title}`}
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                          event.currentTarget.parentElement?.classList.add("is-missing");
                        }}
                      />
                    ) : (
                      <span>Sin portada</span>
                    )}
                  </div>

                  <div className="external-book-info">
                    <span className="external-provider">{providerLabel(book)}</span>
                    <h3>{book.title}</h3>
                    <p className="external-author">{book.author || "Autor desconocido"}</p>

                    <div className="external-meta">
                      {book.year && <span>{book.year}</span>}
                      {book.pages && <span>{book.pages} págs.</span>}
                    </div>

                    {genres.length > 0 && (
                      <div className="external-genres" aria-label="Géneros">
                        {genres.slice(0, 4).map((genre) => (
                          <span key={genre}>{genre}</span>
                        ))}
                        {genres.length > 4 && <span>+{genres.length - 4}</span>}
                      </div>
                    )}

                    <div className="external-book-actions">
                      <ReadingStatusControl
                        currentStatus={currentStatus}
                        isLoggedIn={isLoggedIn}
                        loading={userBooksLoading}
                        saving={Boolean(importing || savingExternalStatus)}
                        emptyLabel="+ Guardar en mi biblioteca"
                        onSelect={(status) => {
                          if (catalogMatch) {
                            saveCatalogStatus(catalogMatch, status);
                          } else {
                            saveExternalStatus(book, status);
                          }
                        }}
                      />

                      {isLoggedIn && !catalogMatch && (
                        <button
                          type="button"
                          className="external-import-only"
                          onClick={() => importExternalBook(book)}
                          disabled={Boolean(importingKey || savingStatusBookId)}
                        >
                          {importing
                            ? "Añadiendo…"
                            : isAdmin
                              ? "Añadir solo al catálogo"
                              : "Proponer al catálogo"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {isLoggedIn && (
            <div className="external-results-footer">
              <div>
                <strong>¿No es ninguno de estos?</strong>
                <span>
                  {isAdmin
                    ? "Crea una ficha manualmente o pega el texto de una librería, editorial u otra fuente."
                    : "Propón una ficha y una administradora la revisará antes de publicarla."}
                </span>
              </div>
              <button type="button" onClick={startBookCreation}>
                {isAdmin ? "Crear libro" : "Proponer libro"}
              </button>
            </div>
          )}
        </section>
      )}

      {externalSearchFinished && (externalResults.length === 0 || externalError) && (
        <section className="external-fallback" aria-labelledby="create-missing-book-title">
          <span className="external-fallback-icon" aria-hidden="true">＋</span>
          <div>
            <span className="external-search-kicker">No lo hemos encontrado</span>
            <h2 id="create-missing-book-title">Crea la ficha de «{externalSearchedQuery}»</h2>
            <p>
              {externalError || "No hay resultados externos para esta búsqueda."}
              {isLoggedIn && (
                isAdmin
                  ? " Podrás rellenarla a mano o completar los campos pegando el texto de otra fuente."
                  : " Puedes proponerla para revisión."
              )}
            </p>
          </div>
          {isLoggedIn && (
            <button type="button" onClick={startBookCreation}>
              {isAdmin ? "Crear libro" : "Proponer libro"}
            </button>
          )}
        </section>
      )}

      <section className="catalog-browser-layout" ref={catalogBrowserRef}>
        <aside className="catalog-sidebar">
          {catalogFilterPanel}
        </aside>

        <div className="catalog-browser-main">
          <div className="catalog-browser-heading">
            <div>
              <span>Catálogo completo</span>
              <h2>Todos los libros</h2>
            </div>
            <p>25 libros por página para que explorar siga siendo ligero incluso cuando Librélula tenga miles.</p>
          </div>

      {!loading && totalBooks > 0 && (
        <div className="catalog-page-summary" aria-live="polite">
          <span>Mostrando {visibleStart}–{visibleEnd} de {totalBooks} libros</span>
          {totalPages > 1 && <small>Página {page} de {totalPages}</small>}
        </div>
      )}

      <CatalogPagination
        page={page}
        totalPages={totalPages}
        onPageChange={goToPage}
        position="top"
      />

      {filteredBooks.length === 0 ? (
        !noLocalSearchMatch && (
          <section className="catalog-empty">
            <span>📚</span>
            <h2>No hay libros con estos filtros</h2>
            <p>
              Cambia los géneros, el año o la búsqueda para ver más resultados.
            </p>
            <div className="catalog-empty-actions">
              <button type="button" className="is-ghost" onClick={clearCatalogFilters}>
                Ver catálogo completo
              </button>
            </div>
          </section>
        )
      ) : (
        <section className="books-grid">
          {filteredBooks.map((book) => {
            const genres = normalizeBookGenres(book.genre);
            const userBook = isLoggedIn
              ? userBookItems[String(book.id)] || null
              : null;
            const currentStatus = userBook?.status || "";
            const currentStatusLabel = READING_STATUS_BY_VALUE[currentStatus]?.label || "";

            return (
              <article
                className="book-card"
                key={book.id}
                role="button"
                tabIndex={0}
                onClick={() => openBook(book)}
                onKeyDown={(event) => handleCardKeyDown(event, book)}
              >
                <div className="book-cover">
                  {book.cover ? (
                    <img
                      src={publicUrl(book.cover)}
                      alt={`Portada de ${book.title}`}
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                        event.currentTarget.parentElement?.classList.add("is-missing");
                      }}
                    />
                  ) : (
                    <span>Sin portada</span>
                  )}
                  {book.saga_name && <small className="book-saga">{book.saga_name}</small>}
                  {currentStatusLabel && (
                    <span className={`book-status-badge status-${currentStatus}`}>
                      {currentStatusLabel}
                    </span>
                  )}
                </div>

                <div className="book-card-body">
                  {genres.length > 0 && (
                    <div className="book-genres-list" aria-label="Géneros">
                      {genres.slice(0, 3).map((genre) => (
                        <span className="book-genre" key={genre}>{genre}</span>
                      ))}
                      {genres.length > 3 && (
                        <span className="book-genre is-more">+{genres.length - 3}</span>
                      )}
                    </div>
                  )}
                  <h2>{book.title}</h2>
                  <p className="book-author">{book.author || "Autor desconocido"}</p>

                  <div className="book-meta">
                    {book.year && <span>{book.year}</span>}
                    {book.pages && <span>{book.pages} págs.</span>}
                  </div>

                  <div className="book-card-actions">
                    <ReadingStatusControl
                      currentStatus={currentStatus}
                      isLoggedIn={isLoggedIn}
                      loading={userBooksLoading}
                      saving={savingStatusBookId === String(book.id)}
                      onSelect={(status) => saveCatalogStatus(book, status)}
                    />

                    <div className="book-resources">
                      {isAdmin && book.pdf_file && (
                        <a
                          href={publicUrl(book.pdf_file)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                        >
                          PDF
                        </a>
                      )}
                      {isAdmin && book.epub_file && (
                        <a
                          href={publicUrl(book.epub_file)}
                          download
                          onClick={(event) => event.stopPropagation()}
                        >
                          EPUB
                        </a>
                      )}
                      <strong>Ver ficha →</strong>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <CatalogPagination
        page={page}
        totalPages={totalPages}
        onPageChange={goToPage}
        position="bottom"
      />
        </div>
      </section>

      {discovery.upcoming.length > 0 && (
        <section className="catalog-upcoming-section" aria-labelledby="catalog-upcoming-title">
          <header>
            <div>
              <span>Marca la campanita para guardarlos</span>
              <h2 id="catalog-upcoming-title">Próximos lanzamientos</h2>
            </div>
            <p>Las fechas proceden de la edición concreta. Tu selección aparecerá arriba, en Esperados.</p>
          </header>

          <div className="catalog-upcoming-track">
            {discovery.upcoming.map((book) => {
              const alertActive = releaseAlertIds.includes(String(book.edition_id));
              const saving = savingReleaseAlertId === String(book.edition_id);
              return (
                <article key={book.edition_id}>
                  <button type="button" className="catalog-upcoming-cover" onClick={() => openBook(book)}>
                    {book.cover ? <img src={publicUrl(book.cover)} alt={`Portada de ${book.title}`} loading="lazy" /> : <span>Sin portada</span>}
                  </button>
                  <div>
                    <span className="catalog-countdown">{releaseCountdown(book.publication_date)}</span>
                    <h3>{book.title}</h3>
                    <p>{book.author}</p>
                    <small>{releaseDateLabel(book.publication_date)}</small>
                  </div>
                  <button
                    type="button"
                    className={`catalog-release-bell${alertActive ? " is-active" : ""}`}
                    onClick={() => toggleReleaseAlert(book)}
                    disabled={saving}
                    aria-pressed={alertActive}
                    aria-label={alertActive ? `Quitar ${book.title} de Esperados` : `Avisarme cuando salga ${book.title}`}
                  >
                    {saving ? <span className="catalog-bell-saving">…</span> : <BellIcon active={alertActive} />}
                    {alertActive && <span className="catalog-bell-check" aria-hidden="true">✓</span>}
                  </button>
                </article>
              );
            })}
          </div>
          {releaseAlertFeedback && <p className="catalog-release-feedback" role="status">{releaseAlertFeedback}</p>}
        </section>
      )}
    </main>
    {genrePickerPortal}
    </>
  );
}
