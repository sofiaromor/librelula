import { lazy, Suspense, useEffect, useRef, useState } from "react";
import "./Navbar.css";
import Inicio from "./Inicio.jsx";
import BookDetail from "./BookDetail.jsx";
import BooksCatalog from "./BooksCatalog.jsx";
import MiBiblioteca from "./MiBiblioteca.jsx";
import PerfilSupabase from "./PerfilSupabase.jsx";
import LoginSupabase from "./LoginSupabase.jsx";
import AddFriends from "./AddFriends.jsx";
import EditBook from "./EditBook.jsx";
import GoodreadsImport from "./GoodreadsImport.jsx";
import SagaBooks from "./SagaBooks.jsx";
import ReaderCollectionPage from "./ReaderCollectionPage.jsx";
import { appUrl, publicUrl } from "./api.js";
import { searchReaderPostBooks } from "./lib/homeDashboardApi.js";
import {
  EMPTY_SUPABASE_SESSION,
  getSupabaseAppSession,
  onSupabaseAuthChange,
  signOutSupabase,
} from "./lib/session.js";

const EMPTY_SESSION = EMPTY_SUPABASE_SESSION;
const PROFILE_TABS = new Set(["summary", "shelf", "activity", "favorites", "reviews"]);
const CatalogJsonImport = lazy(() => import("./CatalogJsonImport.jsx"));
const ClubesLectura = lazy(() => import("./ClubesLectura.jsx"));
const AutoresPage = lazy(() => import("./AutoresPage.jsx"));

export default function App() {
  const [page, setPage] = useState("home");
  const [selectedBook, setSelectedBook] = useState(null);
  const [bookThreadTarget, setBookThreadTarget] = useState(null);
  const [selectedSaga, setSelectedSaga] = useState(null);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [selectedAuthor, setSelectedAuthor] = useState("");
  const [authorBackPage, setAuthorBackPage] = useState("catalog");
  const [detailBackPage, setDetailBackPage] = useState("catalog");
  const [profileTab, setProfileTab] = useState("summary");
  const [profileUserId, setProfileUserId] = useState(null);
  const [profileReturnClubId, setProfileReturnClubId] = useState(null);
  const [newBookTitle, setNewBookTitle] = useState("");
  const [bookReviewIntent, setBookReviewIntent] = useState(false);
  const [catalogSearchKey, setCatalogSearchKey] = useState(0);
  const [navBookSearch, setNavBookSearch] = useState(
    () => new URLSearchParams(window.location.search).get("q") || "",
  );
  const [navBookSuggestions, setNavBookSuggestions] = useState([]);
  const [navBookSuggestionsOpen, setNavBookSuggestionsOpen] = useState(false);
  const [navBookSuggestionsLoading, setNavBookSuggestionsLoading] = useState(false);
  const [session, setSession] = useState(EMPTY_SESSION);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const navBookSearchRef = useRef(null);

  const isAdmin = Boolean(session.is_admin);
  const isLoggedIn = Boolean(session.authenticated);
  const username = session.user?.username || "Mi perfil";
  const avatarValue = String(session.user?.avatar || "").trim();
  const defaultAvatar = publicUrl("images/avatar/avatar1.png");
  const avatarUrl =
    avatarValue === "" || avatarValue === "default.jpg"
      ? defaultAvatar
      : publicUrl(avatarValue);

useEffect(() => {
    function closeFloatingMenus(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
      if (navBookSearchRef.current && !navBookSearchRef.current.contains(event.target)) {
        setNavBookSuggestionsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeFloatingMenus);
    return () => document.removeEventListener("pointerdown", closeFloatingMenus);
  }, []);

  useEffect(() => {
    const cleanSearch = navBookSearch.trim();

    if (cleanSearch.length < 2) {
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setNavBookSuggestionsLoading(true);
      try {
        const books = await searchReaderPostBooks(cleanSearch);
        if (!cancelled) {
          setNavBookSuggestions(books.slice(0, 6));
        }
      } catch {
        if (!cancelled) {
          setNavBookSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setNavBookSuggestionsLoading(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [navBookSearch]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [page]);
  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const nextSession = await getSupabaseAppSession();

        if (!cancelled) {
          setSession(nextSession);
        }
      } catch {
        if (!cancelled) {
          setSession(EMPTY_SESSION);
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    }

    loadSession();

    const unsubscribe = onSupabaseAuthChange((nextSession) => {
      if (!cancelled) {
        setSession(nextSession);
        setSessionLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    function handleProfileUpdated(event) {
      const details = event.detail || {};
      setSession((current) => current.authenticated
        ? { ...current, user: { ...current.user, ...details } }
        : current);
    }
    window.addEventListener("librelula:profile-updated", handleProfileUpdated);
    return () => window.removeEventListener("librelula:profile-updated", handleProfileUpdated);
  }, []);

  function closeNavigation() {
    setNavOpen(false);
    setUserMenuOpen(false);
  }

  function updateBookQuery(bookId = null) {
    const url = new URL(window.location.href);

    if (bookId) {
      url.searchParams.set("book", String(bookId));
      url.searchParams.delete("q");
    } else {
      url.searchParams.delete("book");
    }

    window.history.replaceState({}, "", url);
  }

  function openHome() {

    closeNavigation();

    updateBookQuery();

    setSelectedBook(null);

    setSelectedSaga(null);
    setSelectedAuthor("");

    setNewBookTitle("");

    setDetailBackPage("catalog");

    setPage("home");

  }


  function openCatalog() {
    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setSelectedCollection(null);
    setSelectedAuthor("");
    setNewBookTitle("");
    setDetailBackPage("catalog");
    setPage("catalog");
  }

  function openCollection(collection) {
    if (!collection) return;
    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setSelectedAuthor("");
    setSelectedCollection(collection);
    setDetailBackPage("catalog");
    setPage("collection");
  }

  function openClubs(clubId = null) {
    if (!isLoggedIn) {
      openLogin();
      return;
    }

    const requestedClubId = ["string", "number"].includes(typeof clubId)
      ? String(clubId)
      : null;

    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setSelectedAuthor("");
    setNewBookTitle("");
    setProfileReturnClubId(requestedClubId);
    setDetailBackPage("clubs");
    setPage("clubs");
  }

  function openProfile(tab = "summary") {
    const nextTab =
      typeof tab === "string" && PROFILE_TABS.has(tab) ? tab : "summary";

    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setSelectedAuthor("");
    setNewBookTitle("");
    setDetailBackPage("catalog");
    setProfileUserId(null);
    setProfileReturnClubId(null);
    setProfileTab(nextTab);
    setPage("profile");
  }

  function openUserProfile(userId, clubId = null) {
    if (!isLoggedIn || !userId) return;
    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setSelectedAuthor("");
    setNewBookTitle("");
    setDetailBackPage("clubs");
    setProfileReturnClubId(clubId ? String(clubId) : null);
    setProfileUserId(String(userId));
    setProfileTab("summary");
    setPage("profile");
  }

  function returnToClubFromProfile() {
    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setSelectedAuthor("");
    setNewBookTitle("");
    setProfileUserId(null);
    setProfileTab("summary");
    setPage("clubs");
  }

  function openAddFriends() {
    if (!isLoggedIn) {
      openLogin();
      return;
    }

    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setSelectedAuthor("");
    setNewBookTitle("");
    setDetailBackPage("catalog");
    setPage("add-friends");
  }

  function openLibrary() {
    if (!isLoggedIn) return;
    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setSelectedAuthor("");
    setNewBookTitle("");
    setDetailBackPage("library");
    setPage("library");
  }

  function openMyReviews() {
    if (!isLoggedIn) return;
    openProfile("reviews");
  }

  function openLogin() {
    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setSelectedAuthor("");
    setNewBookTitle("");
    setDetailBackPage("catalog");
    setPage("login");
  }

  function handleLoginSuccess(nextSession) {
    setSession(nextSession);
    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setSelectedAuthor("");
    setNewBookTitle("");
    setDetailBackPage("library");
    setPage("library");
  }

  async function handleSignOut() {
    await signOutSupabase();
    setSession(EMPTY_SESSION);
    openHome();
  }

  function openAddBook(initialTitle = "") {
    if (!isLoggedIn) {
      openLogin();
      return;
    }

    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setSelectedAuthor("");
    setNewBookTitle(String(initialTitle || "").trim());
    setPage("add-book");
  }

  function openCatalogImport() {
    if (!isAdmin) return;

    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setSelectedAuthor("");
    setNewBookTitle("");
    setDetailBackPage("catalog");
    setPage("catalog-import");
  }

  function openBookDetail(book, backPage = "catalog") {
    closeNavigation();
    updateBookQuery(book?.id || null);
    setSelectedBook(book);
    setBookThreadTarget(null);
    setBookReviewIntent(false);
    setDetailBackPage(backPage);
    setPage("detail");
  }

  function openAuthor(authorName, backPage = "catalog") {
    const cleanAuthor = String(authorName || "").trim();
    if (!cleanAuthor) return;

    closeNavigation();
    updateBookQuery();
    setBookThreadTarget(null);
    setBookReviewIntent(false);
    setSelectedSaga(null);
    setSelectedAuthor(cleanAuthor);
    setAuthorBackPage(backPage);
    setPage("author");
  }

  function openBookReview(book, backPage = "home") {
    if (!book?.id) return;
    closeNavigation();
    updateBookQuery(book.id);
    setSelectedBook(book);
    setBookThreadTarget(null);
    setBookReviewIntent(true);
    setDetailBackPage(backPage);
    setPage("detail");
  }

  function openBookThread(book, profile, backPage = "clubs", clubId = null) {
    if (!book?.id || !profile?.id) return;

    closeNavigation();
    updateBookQuery(book.id);
    setSelectedBook(book);
    setBookReviewIntent(false);
    setBookThreadTarget({
      id: String(profile.id),
      username: profile.display_name || profile.username || "Lectora de Librélula",
      avatar: profile.avatar || "",
    });
    setProfileReturnClubId(clubId ? String(clubId) : null);
    setDetailBackPage(backPage);
    setPage("detail");
  }

  function openNavBookSuggestion(book) {
    if (!book?.id) return;

    setNavBookSearch(book.title || "");
    setNavBookSuggestions([]);
    setNavBookSuggestionsOpen(false);

    const backPage =
      page === "home"
        ? "home"
        : page === "library"
          ? "library"
          : page === "clubs"
            ? "clubs"
            : page === "profile"
              ? "profile"
              : "catalog";

    openBookDetail(book, backPage);
  }

  function submitNavBookSearch(event) {
    event.preventDefault();

    const cleanSearch = navBookSearch.trim();
    setNavBookSuggestionsOpen(false);
    const url = new URL(window.location.href);

    url.searchParams.delete("book");
    url.searchParams.delete("page");
    url.searchParams.delete("genre");
    url.searchParams.delete("genres");
    url.searchParams.delete("genre_mode");
    url.searchParams.delete("year");

    if (cleanSearch) {
      url.searchParams.set("q", cleanSearch);
    } else {
      url.searchParams.delete("q");
    }

    window.history.replaceState({}, "", url);
    closeNavigation();
    setSelectedBook(null);
    setBookThreadTarget(null);
    setBookReviewIntent(false);
    setSelectedSaga(null);
    setSelectedAuthor("");
    setNewBookTitle("");
    setDetailBackPage("catalog");
    setCatalogSearchKey((current) => current + 1);
    setPage("catalog");
  }

  function openEditBook(book) {
    if (!isAdmin) return;
    closeNavigation();
    setSelectedBook(book);
    setPage("edit");
  }

  function handleBookUpdated(updatedBook) {
    setSelectedBook(updatedBook);
    setPage("detail");
  }

  function handleBookCreated(createdBook) {
    setSelectedSaga(null);
    setNewBookTitle("");

    if (createdBook?.review_status === "pending") {
      setSelectedBook(null);
      setDetailBackPage("catalog");
      updateBookQuery();
      setPage("catalog");
      return;
    }

    setSelectedBook(createdBook);
    setDetailBackPage("catalog");
    updateBookQuery(createdBook?.id || null);
    setPage("detail");
  }

  function openSaga(sagaKey, sagaName) {
    const cleanKey = String(sagaKey || "").trim();
    const cleanName = String(sagaName || "").trim();
    if (!cleanKey && !cleanName) return;
    closeNavigation();
    updateBookQuery();
    setSelectedSaga({ key: cleanKey, name: cleanName });
    setPage("saga");
  }

  function backFromDetail() {
    if (detailBackPage === "home") {
      openHome();
      return;
    }

    if (detailBackPage === "saga" && selectedSaga) {
      updateBookQuery();
      setPage("saga");
      return;
    }

    if (detailBackPage === "library") {
      updateBookQuery();
      setPage("library");
      return;
    }

    if (detailBackPage === "profile") {
      updateBookQuery();
      setPage("profile");
      return;
    }

    if (detailBackPage === "clubs") {
      updateBookQuery();
      setPage("clubs");
      return;
    }

    if (detailBackPage === "profile-reviews") {
      updateBookQuery();
      setProfileTab("reviews");
      setPage("profile");
      return;
    }

    if (detailBackPage === "author" && selectedAuthor) {
      updateBookQuery();
      setPage("author");
      return;
    }

    openCatalog();
  }

  function backFromAuthor() {
    const backPage = authorBackPage;
    setSelectedAuthor("");

    if (backPage === "detail" && selectedBook) {
      setPage("detail");
      return;
    }

    if (backPage === "profile") {
      setPage("profile");
      return;
    }

    if (backPage === "library") {
      setPage("library");
      return;
    }

    if (backPage === "home") {
      setPage("home");
      return;
    }

    if (backPage === "collection" && selectedCollection) {
      setPage("collection");
      return;
    }

    if (backPage === "clubs") {
      setPage("clubs");
      return;
    }

    openCatalog();
  }

  function backFromSaga() {
    if (selectedBook) {
      updateBookQuery(selectedBook.id);
      setPage("detail");
      return;
    }
    openCatalog();
  }

  return (
    <div className="catalog-app">
      <header className="site-header">
        <nav className="site-nav" aria-label="Navegación principal">
          <a
            className="site-brand"
            href={appUrl("index.php")}
              onClick={(event) => {
                event.preventDefault();
                openHome();
              }}
            aria-label="Ir al inicio de Librélula"
          >
            <img src={publicUrl("images/librelula-font.png")} alt="Librélula" />
          </a>

          <button
            className="site-nav-toggle"
            type="button"
            aria-expanded={navOpen}
            aria-controls="site-nav-panel"
            aria-label={navOpen ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setNavOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
            <span className="sr-only">{navOpen ? "Cerrar menú" : "Abrir menú"}</span>
          </button>

          <div
            className={`site-nav-panel${navOpen ? " is-open" : ""}`}
            id="site-nav-panel"
          >
            <div className="site-nav-links">
              <button
              type="button"
              className={page === "home" ? "is-active" : ""}
              onClick={openHome}
            >
              Inicio
            </button>
              <button
                type="button"
                className={(
                  ["catalog", "catalog-import", "saga"].includes(page)
                  || (page === "author" && authorBackPage === "catalog")
                  || (page === "detail" && !["library", "profile-reviews", "clubs", "profile", "author"].includes(detailBackPage))
                ) ? "is-active" : ""}
                onClick={openCatalog}
              >
                Catálogo
              </button>

              {isLoggedIn && (
                <>
                  <button
                    type="button"
                    className={page === "clubs" || (page === "detail" && detailBackPage === "clubs") ? "is-active" : ""}
                    onClick={openClubs}
                  >
                    Clubes
                  </button>
                  <button
                    type="button"
                    className={page === "library" ? "is-active" : ""}
                    onClick={openLibrary}
                  >
                    Mi biblioteca
                  </button>
                </>
              )}
            </div>

            <form
              className="site-nav-book-search"
              role="search"
              onSubmit={submitNavBookSearch}
              ref={navBookSearchRef}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                type="search"
                value={navBookSearch}
                onChange={(event) => {
                  const value = event.target.value;
                  setNavBookSearch(value);
                  if (value.trim().length < 2) {
                    setNavBookSuggestions([]);
                    setNavBookSuggestionsLoading(false);
                    setNavBookSuggestionsOpen(false);
                  } else {
                    setNavBookSuggestionsOpen(true);
                  }
                }}
                onFocus={() => {
                  if (navBookSearch.trim().length >= 2) setNavBookSuggestionsOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setNavBookSuggestionsOpen(false);
                }}
                placeholder="Buscar libros…"
                aria-label="Buscar libros"
                aria-autocomplete="list"
                aria-expanded={navBookSuggestionsOpen}
                aria-controls="site-nav-book-suggestions"
              />
              <button type="submit" aria-label="Buscar en el catálogo">
                Buscar
              </button>

              {navBookSuggestionsOpen && navBookSearch.trim().length >= 2 && (
                <div
                  className="site-nav-book-suggestions"
                  id="site-nav-book-suggestions"
                  role="listbox"
                  aria-label="Sugerencias de libros"
                >
                  {navBookSuggestionsLoading ? (
                    <div className="site-nav-book-suggestions-state">
                      Buscando en tu estantería infinita…
                    </div>
                  ) : navBookSuggestions.length ? (
                    navBookSuggestions.map((book) => (
                      <button
                        key={book.id}
                        type="button"
                        className="site-nav-book-suggestion"
                        role="option"
                        onClick={() => openNavBookSuggestion(book)}
                      >
                        <span className="site-nav-book-suggestion-cover">
                          {book.cover ? (
                            <img
                              src={book.cover}
                              alt=""
                              loading="lazy"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <span aria-hidden="true">⌑</span>
                          )}
                        </span>
                        <span className="site-nav-book-suggestion-copy">
                          <strong>{book.title || "Libro sin título"}</strong>
                          <small>{book.author || "Autor desconocido"}</small>
                        </span>
                        <span className="site-nav-book-suggestion-arrow" aria-hidden="true">→</span>
                      </button>
                    ))
                  ) : (
                    <div className="site-nav-book-suggestions-state">
                      No encontramos coincidencias. Pulsa Buscar para ver el catálogo.
                    </div>
                  )}
                </div>
              )}
            </form>

            <div className="site-nav-actions">
              {!sessionLoading && isLoggedIn && (
                <div className="user-menu" ref={userMenuRef}>
                  <button
                    className="user-btn"
                    type="button"
                    aria-expanded={userMenuOpen}
                    aria-controls="catalog-user-dropdown"
                    onClick={() => setUserMenuOpen((open) => !open)}
                  >
                    <img
                      src={avatarUrl}
                      alt={`Avatar de ${username}`}
                      className="user-avatar"
                      title="Abrir mi perfil"
                      onClick={(event) => {
                        event.stopPropagation();
                        openProfile();
                      }}
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = defaultAvatar;
                      }}
                    />
                    <span>{username}</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>

                  <div
                    className={`dropdown-menu${userMenuOpen ? " show" : ""}`}
                    id="catalog-user-dropdown"
                  >
                    <button type="button" onClick={openProfile}>
                      Mi rincón
                    </button>
                    <button type="button" onClick={openAddFriends}>
                      Añadir amigos
                    </button>
                    <button type="button" onClick={openClubs}>
                      Clubes de lectura
                    </button>
                    <button type="button" onClick={openLibrary}>
                      Mi biblioteca
                    </button>
                    <button type="button" onClick={openMyReviews}>
                      Mis reseñas
                    </button>
                    <button type="button" onClick={openCatalog}>
                      Explorar catálogo
                    </button>
                    {isAdmin && (
                      <>
                        <button type="button" onClick={() => openAddBook()}>
                          Añadir un libro
                        </button>
                        <button type="button" onClick={openCatalogImport}>
                          Importar JSON del scraper
                        </button>
                      </>
                    )}
                    <div className="dropdown-divider" />
                    <button type="button" onClick={handleSignOut}>
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              )}

              {!sessionLoading && !isLoggedIn && (
                <button type="button" className="btn-signin" onClick={openLogin}>
                  Iniciar sesión
                </button>
              )}
            </div>
          </div>
        </nav>
      </header>

      <div className="catalog-content">

        {sessionLoading && (
          <section className="lector-empty-state">
            <h3>Cargando tu sesión…</h3>
            <p>Estamos preparando tu rincón lector.</p>
          </section>
        )}

{!sessionLoading && page === "home" && (
          <Inicio
            isLoggedIn={isLoggedIn}
            onExplore={openCatalog}
            onLogin={openLogin}
            onProfile={openProfile}
            onReviews={openMyReviews}
            onReviewBook={(book) => openBookReview(book, "home")}
            onClubs={openClubs}
            onSelectBook={(book) => openBookDetail(book, "home")}
            onSelectAuthor={(author) => openAuthor(author, "home")}
            onSelectProfile={(userId) => openUserProfile(userId)}
            onOpenBookThread={(book, profile) => openBookThread(book, profile, "home")}
          />
        )}

        {!sessionLoading && page === "catalog" && (
          <BooksCatalog
            key={`catalog-${catalogSearchKey}`}
            isAdmin={isAdmin}
            isLoggedIn={isLoggedIn}
            onAddBook={openAddBook}
            onImportCatalog={openCatalogImport}
            onSelectBook={(book) => openBookDetail(book, "catalog")}
            onSelectAuthor={(author) => openAuthor(author, "catalog")}
            onSelectCollection={openCollection}
          />
        )}

        {!sessionLoading && page === "collection" && selectedCollection && (
          <ReaderCollectionPage
            collection={selectedCollection}
            onBack={openCatalog}
            onSelectBook={(book) => openBookDetail(book, "collection")}
          />
        )}

        {!sessionLoading && page === "author" && selectedAuthor && (
          <Suspense
            fallback={
              <section className="lector-empty-state">
                <h3>Abriendo la ficha de autor…</h3>
                <p>Estamos reuniendo su bibliografía.</p>
              </section>
            }
          >
            <AutoresPage
              author={selectedAuthor}
              onBack={backFromAuthor}
              onSelectBook={(book) => openBookDetail(book, "author")}
            />
          </Suspense>
        )}

        {!sessionLoading && page === "clubs" && isLoggedIn && (
          <Suspense
            fallback={
              <section className="lector-empty-state">
                <h3>Preparando los clubes…</h3>
                <p>Estamos colocando las mesas y abriendo los libros.</p>
              </section>
            }
          >
            <ClubesLectura
              isLoggedIn={isLoggedIn}
              onLogin={openLogin}
              onSelectBook={(book) => openBookDetail(book, "clubs")}
              onOpenBookThread={(book, profile, clubId) => openBookThread(book, profile, "clubs", clubId)}
              onHome={openHome}
              onCatalog={openCatalog}
              onProfile={openProfile}
              onOpenProfile={openUserProfile}
              initialClubId={profileReturnClubId}
              onInitialClubConsumed={() => setProfileReturnClubId(null)}
            />
          </Suspense>
        )}

        {!sessionLoading && page === "profile" && isLoggedIn && (
          <PerfilSupabase
            activeTab={profileTab}
            onTabChange={setProfileTab}
            onOpenLibrary={openLibrary}
            onOpenCatalog={openCatalog}
            onSelectBook={(book) => openBookDetail(book, "profile")}
            onSelectAuthor={(author) => openAuthor(author, "profile")}
            onSelectReviewBook={(book) =>
              openBookDetail(book, "profile-reviews")
            }
            profileId={profileUserId}
            onOpenOwnProfile={() => openProfile("summary")}
            onBackToClub={profileReturnClubId ? returnToClubFromProfile : null}
            onSelectProfile={openUserProfile}
          />
        )}

        {!sessionLoading && page === "add-friends" && isLoggedIn && (
          <AddFriends onOpenProfile={openProfile} />
        )}

        {!sessionLoading && page === "library" && isLoggedIn && (
          <MiBiblioteca
            onOpenCatalog={openCatalog}
            onSelectBook={(book) => openBookDetail(book, "library")}
            onSelectAuthor={(author) => openAuthor(author, "library")}
          />
        )}

        {!sessionLoading && page === "login" && !isLoggedIn && (
          <LoginSupabase
            onLoginSuccess={handleLoginSuccess}
            onOpenCatalog={openCatalog}
          />
        )}

        {!sessionLoading && page === "add-book" && isLoggedIn && (
          <GoodreadsImport
            initialTitle={newBookTitle}
            isAdmin={isAdmin}
            onCancel={openCatalog}
            onCreated={handleBookCreated}
          />
        )}

        {!sessionLoading && page === "catalog-import" && isAdmin && (
          <Suspense
            fallback={
              <section className="lector-empty-state">
                <h3>Preparando el importador…</h3>
                <p>Estamos abriendo la mesa de revisión del catálogo.</p>
              </section>
            }
          >
            <CatalogJsonImport onCancel={openCatalog} />
          </Suspense>
        )}

        {page === "detail" && (
          <BookDetail
            key={selectedBook?.id || "detail"}
            book={selectedBook}
            onBack={backFromDetail}
            onEdit={openEditBook}
            onOpenSaga={openSaga}
            onSelectAuthor={(author) => openAuthor(author, "detail")}
            onOpenMyReviews={openMyReviews}
            isAdmin={isAdmin}
            isLoggedIn={isLoggedIn}
            threadTarget={bookThreadTarget}
            openReviewOnLoad={bookReviewIntent}
          />
        )}

        {!sessionLoading && page === "edit" && isAdmin && (
          <EditBook
            key={selectedBook?.id || "edit"}
            book={selectedBook}
            onCancel={() => setPage("detail")}
            onSaved={handleBookUpdated}
          />
        )}

        {!sessionLoading && page === "saga" && selectedSaga && (
          <SagaBooks
            sagaKey={selectedSaga.key}
            sagaName={selectedSaga.name}
            onBack={backFromSaga}
            onSelectBook={(book) => openBookDetail(book, "saga")}
          />
        )}
      </div>
    </div>
  );
}
