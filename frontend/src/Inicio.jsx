import { useEffect, useMemo, useRef, useState } from "react";
import "./Inicio.css";
import { getProfileOverview } from "./lib/profileApi.js";
import { saveCatalogUserBookProgress } from "./lib/catalogApi.js";
import {
  addActivityComment,
  getHomeDashboardData,
  publishReaderPost,
  recordReadingProgress,
  saveWeeklyPageGoal,
  searchReaderPostBooks,
  toggleActivityLike,
} from "./lib/homeDashboardApi.js";
import AuthorLink from "./AuthorLink.jsx";

const landing = {
  brand: "Librélula",
  eyebrow: "Tu biblioteca virtual",
  titleA: "Donde los libros",
  titleB: "están a tu ",
  titleC: "alcance",
  lede:
    "Miles de historias, un vuelo de distancia. Organiza tus lecturas, guarda reseñas y encuentra tu próxima obsesión literaria.",
};

const landingStats = [];

const landingFeatures = [
  {
    number: "01",
    title: "Catálogo personal",
    text: "Explora tus libros con una estética cálida, clara y muy tuya.",
  },
  {
    number: "02",
    title: "Reseñas y notas",
    text: "Guarda estrellas, opiniones y pequeños post-its literarios.",
  },
  {
    number: "03",
    title: "Rincón lector",
    text: "Reúne biblioteca, actividad y favoritos en un espacio propio.",
  },
];

const COVER_GRADIENTS = [
  "linear-gradient(160deg, #687e67, #34483d)",
  "linear-gradient(160deg, #c4865d, #8b5739)",
  "linear-gradient(160deg, #7d6a97, #473957)",
  "linear-gradient(160deg, #b9a454, #75672e)",
];

function asText(value) {
  return String(value || "").trim();
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const COMPLETION_CONFETTI = Array.from({ length: 46 }, (_, index) => index);

function completionPalette(book) {
  const seed = String(book?.title || book?.author || book?.id || "librelula");
  const palettes = [
    ["#2b1b3d", "#7f5fc9", "#f2d98a"],
    ["#2f2455", "#9c7edb", "#f2d98a"],
    ["#2b3f5f", "#8ab3d6", "#f6d7a7"],
    ["#513044", "#d487a6", "#f3d9a4"],
    ["#294d45", "#8bbd99", "#f2d98a"],
    ["#4a3427", "#c08a55", "#f1d6a2"],
  ];

  let total = 0;
  for (const character of seed) total += character.charCodeAt(0);

  return palettes[total % palettes.length];
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(asNumber(value))));
}

function cleanName(value) {
  const text = asText(value);
  if (!text) return "Sofía";
  return text.includes("@") ? text.split("@")[0] : text;
}


function normalizeAssetUrl(value) {
  const text = asText(value);
  if (!text) return "";
  if (/^(https?:|data:|blob:|\/)/i.test(text)) return text;
  return `/${text.replace(/^\.\//, "")}`;
}

function formatDate(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time) || time <= 0) return "recientemente";

  const diff = Date.now() - time;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "justo ahora";
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} día${days === 1 ? "" : "s"}`;

  return new Date(time).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

function formatClubMeetingDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Fecha por confirmar";

  const day = date.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${day.replace(/^[a-záéíóúñ]/, (letter) => letter.toUpperCase())} · ${time}`;
}

function buildBookCoverStyle(book, index) {
  const cover = normalizeAssetUrl(book?.cover);

  if (cover) {
    return {
      backgroundImage: `linear-gradient(160deg, rgba(47, 32, 27, 0.18), rgba(47, 32, 27, 0.04)), url("${cover}")`,
    };
  }

  return {
    background: COVER_GRADIENTS[index % COVER_GRADIENTS.length],
  };
}

function readingMeta(book, progressOverride = null) {
  const progress = clampPercent(progressOverride ?? book?.progress);
  const totalPages = asNumber(book?.pages);
  const currentPage = totalPages > 0 ? Math.round((totalPages * progress) / 100) : null;

  return {
    progress,
    totalPages,
    currentPage,
    finished: progress >= 100 || book?.status === "completed",
  };
}

export default function Inicio({
  isLoggedIn = false,
  onExplore,
  onLogin,
  onProfile,
  onReviews,
  onReviewBook,
  onClubs,
  onSelectBook,
  onSelectAuthor,
  onSelectProfile,
  onOpenBookThread,
}) {
  if (isLoggedIn) {
    return (
      <LoggedInHome
        onExplore={onExplore}
        onProfile={onProfile}
        onReviews={onReviews || onProfile}
        onReviewBook={onReviewBook}
        onClubs={onClubs}
        onSelectBook={onSelectBook}
        onSelectAuthor={onSelectAuthor}
        onSelectProfile={onSelectProfile}
        onOpenBookThread={onOpenBookThread}
      />
    );
  }

  return <LandingHome onExplore={onExplore} onLogin={onLogin} />;
}

function LandingHome({ onExplore, onLogin }) {
  return (
    <main className="inicio-editorial-shell">
      <section className="inicio-editorial-hero">
        <div className="inicio-editorial-copy">
          <div className="inicio-logo-lockup">
            <img src="/images/librelula-font.png" alt={landing.brand} />
            <span aria-hidden="true" />
          </div>

          <p className="inicio-editorial-eyebrow">{landing.eyebrow}</p>

          <h1 className="inicio-editorial-title">
            {landing.titleA}
            <br />
            {landing.titleB}
            <em>{landing.titleC}</em>
          </h1>

          <p className="inicio-editorial-lede">{landing.lede}</p>

          <div className="inicio-editorial-actions">
            <button type="button" className="inicio-primary-action" onClick={onExplore}>
              Explorar catálogo
              <span aria-hidden="true">→</span>
            </button>

            <button type="button" className="inicio-secondary-action" onClick={onLogin}>
              Iniciar sesión
            </button>

            <a className="inicio-text-link" href="#inicio-editorial-features">
              Conocer más <span aria-hidden="true">→</span>
            </a>
          </div>

          {landingStats.length > 0 ? (
            <div className="inicio-editorial-stats">
              {landingStats.map((item) => (
                <article key={item.label}>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </article>
              ))}
            </div>
          ) : null}
        </div>

        <div className="inicio-art-panel" aria-hidden="true">
          <div className="inicio-art-image" />
          <div className="inicio-art-glow" />
          <span className="inicio-firefly inicio-firefly--one" />
          <span className="inicio-firefly inicio-firefly--two" />
          <span className="inicio-firefly inicio-firefly--three" />
        </div>
      </section>

      <section className="inicio-editorial-features" id="inicio-editorial-features">
        {landingFeatures.map((item) => (
          <article key={item.number}>
            <span>{item.number}</span>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function daypartGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

function feedTime(value) {
  return formatDate(value);
}

function scoreStars(score) {
  const cleanScore = Math.max(0, Math.min(5, Math.round(asNumber(score))));
  return `${"★".repeat(cleanScore)}${"☆".repeat(5 - cleanScore)}`;
}


function FeedIcon({ name }) {
  const paths = {
    comment: <path d="M20.5 11.5a8.5 8.5 0 0 1-9.4 8.45 9.7 9.7 0 0 1-3.9-1.25L3 20l1.4-3.8A8.5 8.5 0 1 1 20.5 11.5Z" />,
    heart: <path d="M20.8 5.8c-1.8-2-4.9-2-6.8 0L12 8l-2-2.2c-1.9-2-5-2-6.8 0-1.8 2-1.6 5 .3 6.8L12 21l8.5-8.4c1.9-1.8 2.1-4.8.3-6.8Z" />,
    image: <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="8.5" cy="9" r="1.5" /><path d="m5.5 17 4.3-4.4 3.2 3 2.4-2.2 3.1 3.6" /></>,
    book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22Z" /><path d="M4 5.5V22" /></>,
    close: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function LoggedInHome({ onExplore, onProfile, onReviews, onReviewBook, onClubs, onSelectBook, onSelectAuthor, onSelectProfile, onOpenBookThread }) {
  const [homeData, setHomeData] = useState(null);
  const [socialData, setSocialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socialLoading, setSocialLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [draft, setDraft] = useState("");
  const [draftSpoiler, setDraftSpoiler] = useState(false);
  const [draftBook, setDraftBook] = useState(null);
  const [bookSearch, setBookSearch] = useState("");
  const [bookSearchResults, setBookSearchResults] = useState([]);
  const [bookSearching, setBookSearching] = useState(false);
  const [bookPickerOpen, setBookPickerOpen] = useState(false);
  const [draftImage, setDraftImage] = useState(null);
  const [draftImagePreview, setDraftImagePreview] = useState("");
  const imageInputRef = useRef(null);
  const [feedTab, setFeedTab] = useState("for-you");
  const [commentDrafts, setCommentDrafts] = useState({});
  const [openComments, setOpenComments] = useState({});
  const [revealedSpoilers, setRevealedSpoilers] = useState({});
  const [expandedReviews, setExpandedReviews] = useState({});
  const [goalEditing, setGoalEditing] = useState(false);
  const [goalDraft, setGoalDraft] = useState(150);
  const [savingGoal, setSavingGoal] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [busyActivities, setBusyActivities] = useState({});
  const [progressDrafts, setProgressDrafts] = useState({});
  const [progressNotes, setProgressNotes] = useState({});
  const [progressSpoilers, setProgressSpoilers] = useState({});
  const [progressComposerBookId, setProgressComposerBookId] = useState(null);
  const [savingProgress, setSavingProgress] = useState({});
  const [completedBook, setCompletedBook] = useState(null);
  const [readingPickerOpen, setReadingPickerOpen] = useState(false);
  const [readingSearch, setReadingSearch] = useState("");
  const [readingSearchResults, setReadingSearchResults] = useState([]);
  const [readingSearching, setReadingSearching] = useState(false);
  const [addingReadingBookId, setAddingReadingBookId] = useState("");

  async function loadSocialData({ silent = false } = {}) {
    if (!silent) setSocialLoading(true);

    try {
      const data = await getHomeDashboardData();
      setSocialData(data);
      setGoalDraft(data?.weekly?.pageGoal || 150);
    } catch (error) {
      setMessage(error.message || "No se pudo cargar la parte social de tu inicio.");
    } finally {
      if (!silent) setSocialLoading(false);
    }
  }

  useEffect(() => {
    let ignore = false;

    async function loadHomeData() {
      setLoading(true);
      setSocialLoading(true);
      setMessage(null);

      const [profileResult, socialResult] = await Promise.allSettled([
        getProfileOverview(),
        getHomeDashboardData(),
      ]);

      if (ignore) return;

      if (profileResult.status === "fulfilled") {
        setHomeData(profileResult.value);
      } else {
        setMessage(profileResult.reason?.message || "No se pudo cargar tu inicio lector.");
      }

      if (socialResult.status === "fulfilled") {
        setSocialData(socialResult.value);
        setGoalDraft(socialResult.value?.weekly?.pageGoal || 150);
      } else {
        setMessage((current) => current || socialResult.reason?.message || "No se pudo cargar tu actividad lectora.");
      }

      setLoading(false);
      setSocialLoading(false);
    }

    loadHomeData();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => () => {
    if (draftImagePreview) URL.revokeObjectURL(draftImagePreview);
  }, [draftImagePreview]);

  useEffect(() => {
    if (!bookPickerOpen || bookSearch.trim().length < 2) return undefined;

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setBookSearching(true);
      try {
        const books = await searchReaderPostBooks(bookSearch);
        if (!cancelled) setBookSearchResults(books);
      } catch (error) {
        if (!cancelled) setMessage(error.message || "No se pudieron buscar libros.");
      } finally {
        if (!cancelled) setBookSearching(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [bookPickerOpen, bookSearch]);

  useEffect(() => {
    if (!readingPickerOpen || readingSearch.trim().length < 2) return undefined;

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setReadingSearching(true);
      try {
        const books = await searchReaderPostBooks(readingSearch);
        if (!cancelled) setReadingSearchResults(books);
      } catch (error) {
        if (!cancelled) {
          setReadingSearchResults([]);
          setMessage(error.message || "No se pudieron buscar libros.");
        }
      } finally {
        if (!cancelled) setReadingSearching(false);
      }
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [readingPickerOpen, readingSearch]);

  const profileName = homeData?.profile
    ? cleanName(homeData.profile.username || homeData.profile.email)
    : socialData?.context?.username || "lectora";
  const currentReadingBooks = homeData?.currentReadingBooks || [];
  const weekly = socialData?.weekly || {
    pageGoal: 150,
    pagesRead: 0,
    sessions: 0,
    booksTouched: 0,
    progress: 0,
    days: [],
  };
  const friendsReading = socialData?.friendsReading || [];
  const clubSummary = socialData?.clubs || { total: 0, items: [], featured: null };
  const featuredClub = clubSummary.featured || null;

  function closeReadingPicker() {
    setReadingPickerOpen(false);
    setReadingSearch("");
    setReadingSearchResults([]);
    setReadingSearching(false);
  }

  async function addBookToReading(book) {
    const bookId = String(book?.id || "");
    if (!bookId || addingReadingBookId) return;

    if (currentReadingBooks.some((item) => String(item.id) === bookId)) {
      return;
    }

    setAddingReadingBookId(bookId);
    setMessage(null);

    try {
      const response = await saveCatalogUserBookProgress({
        book_id: bookId,
        progress: 0,
        progress_mode: "percentage",
      });
      const saved = response?.item || {};
      const nextBook = {
        ...book,
        ...saved,
        id: book.id,
        status: saved.status || "reading",
        progress: saved.progress ?? 0,
      };

      setHomeData((current) => {
        if (!current) return current;

        return {
          ...current,
          currentReadingBooks: [
            nextBook,
            ...(current.currentReadingBooks || []).filter((item) => String(item.id) !== bookId),
          ].slice(0, 8),
        };
      });
      closeReadingPicker();
      setMessage(`«${book.title}» está ahora en leyendo.`);
    } catch (error) {
      setMessage(error.message || "No se pudo añadir el libro a leyendo.");
    } finally {
      setAddingReadingBookId("");
    }
  }

  const visibleFeed = useMemo(() => {
    const items = socialData?.feed || [];

    if (feedTab === "friends") {
      return items.filter((item) => item.is_friend);
    }

    if (feedTab === "global") {
      return items;
    }

    if (feedTab === "mine") {
      return items.filter((item) => item.is_mine);
    }

    return [...items].sort((left, right) => {
      const leftPriority = left.is_friend ? 0 : left.is_mine ? 1 : 2;
      const rightPriority = right.is_friend ? 0 : right.is_mine ? 1 : 2;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
  }, [feedTab, socialData?.feed]);

  function displayedProgress(book) {
    const key = String(book?.id || "");
    return clampPercent(progressDrafts[key] ?? book?.progress);
  }

  function changeBookProgress(book, value) {
    const key = String(book?.id || "");
    if (!key) return;

    setProgressDrafts((items) => ({
      ...items,
      [key]: clampPercent(value),
    }));
  }

  function requestProgressSave(book, value) {
    const key = String(book?.id || "");
    if (!key) return;

    const cleanProgress = clampPercent(value);
    if (cleanProgress === clampPercent(book?.progress)) {
      setProgressComposerBookId(null);
      return;
    }

    setProgressDrafts((items) => ({ ...items, [key]: cleanProgress }));
    setProgressComposerBookId(key);
  }

  function cancelProgressSave(book) {
    const key = String(book?.id || "");
    setProgressDrafts((items) => {
      const next = { ...items };
      delete next[key];
      return next;
    });
    setProgressNotes((items) => ({ ...items, [key]: "" }));
    setProgressSpoilers((items) => ({ ...items, [key]: false }));
    setProgressComposerBookId(null);
  }

  async function persistBookProgress(book, value) {
    const key = String(book?.id || "");
    if (!key || savingProgress[key]) return;

    const cleanProgress = clampPercent(value);
    const previousProgress = clampPercent(book?.progress);

    setMessage(null);
    setProgressDrafts((items) => ({ ...items, [key]: cleanProgress }));
    setSavingProgress((items) => ({ ...items, [key]: true }));

    try {
      const response = await saveCatalogUserBookProgress({
        book_id: key,
        progress: cleanProgress,
        progress_mode: "percentage",
        total_minutes: book?.total_minutes || 0,
        minutes_read: book?.minutes_read || 0,
        total_chapters: book?.total_chapters || 0,
        current_chapter: book?.current_chapter || 0,
      });
      const saved = response.item;

      const progressLog = await recordReadingProgress({
        bookId: key,
        previousProgress,
        newProgress: cleanProgress,
        totalPages: book.pages,
        note: progressNotes[key] || "",
        spoiler: Boolean(progressSpoilers[key]),
      });

      // El estado de la biblioteca y el feed social se guardan en tablas
      // distintas. Reflejamos el avance recién creado inmediatamente para
      // que aparezca tanto en «Tu círculo» como en «Mi actividad».
      if (progressLog?.id) {
        setSocialData((current) => {
          const activityKey = `progress:${progressLog.id}`;
          if (!current?.feed || current.feed.some((item) => item.key === activityKey)) {
            return current;
          }

          const activity = {
            key: activityKey,
            type: "progress",
            profile: {
              id: current.context?.authId,
              username: current.context?.username || "Tú",
              avatar: current.context?.avatar || "/images/avatar/avatar1.png",
            },
            book,
            created_at: new Date().toISOString(),
            spoiler: Boolean(progressSpoilers[key]),
            previous_progress: previousProgress,
            progress: cleanProgress,
            pages_delta: book.pages > 0
              ? Math.max(0, Math.round((book.pages * (cleanProgress - previousProgress)) / 100))
              : 0,
            body: String(progressNotes[key] || "").trim(),
            is_mine: true,
            is_friend: false,
            likes: 0,
            liked: false,
            comments: [],
            comments_count: 0,
          };

          return { ...current, feed: [activity, ...current.feed] };
        });
      }

      if (cleanProgress >= 100 && previousProgress < 100) {
        setCompletedBook({
          ...book,
          status: saved?.status || "completed",
          progress: saved?.progress ?? cleanProgress,
          finished_at: saved?.finished_at || null,
          read_count: saved?.read_count || book?.read_count || 1,
        });
      }

      setHomeData((current) => {
        if (!current || !saved) return current;

        return {
          ...current,
          currentReadingBooks: (current.currentReadingBooks || [])
            .map((item) =>
              String(item.id) === String(saved.book_id)
                ? {
                    ...item,
                    status: saved.status,
                    progress: saved.progress,
                    started_at: saved.started_at,
                    finished_at: saved.finished_at,
                    read_count: saved.read_count,
                    progress_mode: saved.progress_mode,
                    total_minutes: saved.total_minutes,
                    minutes_read: saved.minutes_read,
                    total_chapters: saved.total_chapters,
                    current_chapter: saved.current_chapter,
                  }
                : item,
            )
            .filter((item) => !["completed", "finished"].includes(String(item.status || ""))),
        };
      });

      await loadSocialData({ silent: true });
    } catch (error) {
      setMessage(error.message || "No se pudo guardar tu progreso.");
    } finally {
      setProgressDrafts((items) => {
        const next = { ...items };
        delete next[key];
        return next;
      });
      setProgressNotes((items) => ({ ...items, [key]: "" }));
      setProgressSpoilers((items) => ({ ...items, [key]: false }));
      setProgressComposerBookId(null);
      setSavingProgress((items) => ({ ...items, [key]: false }));
    }
  }

  async function submitGoal(event) {
    event.preventDefault();
    setSavingGoal(true);
    setMessage(null);

    try {
      const savedGoal = await saveWeeklyPageGoal(goalDraft);
      setSocialData((current) => ({
        ...current,
        weekly: {
          ...current.weekly,
          pageGoal: savedGoal,
          progress: Math.min(100, Math.round((current.weekly.pagesRead / savedGoal) * 100)),
        },
      }));
      setGoalDraft(savedGoal);
      setGoalEditing(false);
    } catch (error) {
      setMessage(error.message || "No se pudo guardar la meta semanal.");
    } finally {
      setSavingGoal(false);
    }
  }

  async function publishPost(event) {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && !draftImage) || publishing) return;

    setPublishing(true);
    setMessage(null);

    try {
      await publishReaderPost({
        body: text,
        spoiler: draftSpoiler,
        bookId: draftBook?.id || null,
        imageFile: draftImage,
      });
      setDraft("");
      setDraftSpoiler(false);
      setDraftBook(null);
      setBookSearch("");
      setBookSearchResults([]);
      setBookPickerOpen(false);
      setDraftImage(null);
      setDraftImagePreview("");
      if (imageInputRef.current) imageInputRef.current.value = "";
      await loadSocialData({ silent: true });
    } catch (error) {
      setMessage(error.message || "No se pudo publicar tu actividad.");
    } finally {
      setPublishing(false);
    }
  }

  async function toggleLike(item) {
    if (busyActivities[item.key]) return;
    setBusyActivities((current) => ({ ...current, [item.key]: true }));

    try {
      await toggleActivityLike(item.key);
      setSocialData((current) => ({
        ...current,
        feed: current.feed.map((feedItem) =>
          feedItem.key === item.key
            ? {
                ...feedItem,
                liked: !feedItem.liked,
                likes: Math.max(0, feedItem.likes + (feedItem.liked ? -1 : 1)),
              }
            : feedItem,
        ),
      }));
    } catch (error) {
      setMessage(error.message || "No se pudo actualizar el me gusta.");
    } finally {
      setBusyActivities((current) => ({ ...current, [item.key]: false }));
    }
  }

  async function submitComment(item, event) {
    event.preventDefault();
    const body = String(commentDrafts[item.key] || "").trim();
    if (!body || busyActivities[item.key]) return;

    setBusyActivities((current) => ({ ...current, [item.key]: true }));

    try {
      await addActivityComment(item.key, body);
      setCommentDrafts((current) => ({ ...current, [item.key]: "" }));
      await loadSocialData({ silent: true });
    } catch (error) {
      setMessage(error.message || "No se pudo publicar el comentario.");
    } finally {
      setBusyActivities((current) => ({ ...current, [item.key]: false }));
    }
  }

  const completedMeta = completedBook ? readingMeta(completedBook, 100) : null;
  const completionColors = completedBook ? completionPalette(completedBook) : null;
  const maxDayPages = Math.max(1, ...weekly.days.map((day) => day.pages));

  return (
    <main className="home-reader-shell">
      <header className="home-reader-greeting">
        <div>
          <p>Tu refugio lector</p>
          <h1>{loading && !profileName ? "Preparando tu inicio…" : `${daypartGreeting()}, ${profileName}`}</h1>
        </div>
        <button type="button" onClick={onProfile}>Mi rincón</button>
      </header>

      {message && <p className="home-reader-message">{message}</p>}

      <section className="home-reader-grid">
        <div className="home-reader-main">
          <article
            className="home-panel home-reading-panel home-module-card"
          >
            <div className="home-panel-heading">
              <div>
                <p>Tu lectura ahora</p>
                <h2>Continúa leyendo</h2>
                <span>Tus lecturas activas, siempre a mano.</span>
              </div>
              <button
                type="button"
                className="home-reading-add-button"
                aria-label="Añadir un libro a leyendo"
                aria-expanded={readingPickerOpen}
                aria-controls="home-reading-picker"
                title="Añadir un libro a leyendo"
                onClick={() => {
                  if (readingPickerOpen) {
                    closeReadingPicker();
                    return;
                  }
                  setReadingPickerOpen(true);
                }}
              >
                <span aria-hidden="true">+</span>
              </button>
            </div>

            {readingPickerOpen && (
              <section className="home-reading-picker" id="home-reading-picker" aria-labelledby="home-reading-picker-title">
                <div className="home-reading-picker-heading">
                  <div>
                    <span>Añadir a leyendo</span>
                    <h3 id="home-reading-picker-title">¿Qué leerás después?</h3>
                  </div>
                  <button type="button" className="home-reading-picker-close" aria-label="Cerrar búsqueda" onClick={closeReadingPicker}>×</button>
                </div>
                <label htmlFor="home-reading-search">Buscar en el catálogo</label>
                <input
                  id="home-reading-search"
                  type="search"
                  value={readingSearch}
                  onChange={(event) => {
                    const value = event.target.value;
                    setReadingSearch(value);
                    if (value.trim().length < 2) {
                      setReadingSearchResults([]);
                      setReadingSearching(false);
                    }
                  }}
                  placeholder="Título, autora o ISBN…"
                  autoComplete="off"
                  autoFocus
                />
                {readingSearching && <small role="status">Buscando…</small>}
                {!readingSearching && readingSearch.trim().length >= 2 && readingSearchResults.length === 0 && <small>No hay coincidencias.</small>}
                {readingSearchResults.length > 0 && (
                  <div className="home-reading-picker-results">
                    {readingSearchResults.map((book) => {
                      const alreadyReading = currentReadingBooks.some((item) => String(item.id) === String(book.id));
                      const isAdding = addingReadingBookId === String(book.id);

                      return (
                        <button
                          type="button"
                          className="home-reading-picker-result"
                          key={book.id}
                          disabled={alreadyReading || Boolean(addingReadingBookId)}
                          onClick={() => addBookToReading(book)}
                        >
                          <img src={book.cover || "/images/fondo.png"} alt="" />
                          <span>
                            <strong>{book.title}</strong>
                            <small>{book.author || "Autor desconocido"}</small>
                          </span>
                          <em>{isAdding ? "Añadiendo…" : alreadyReading ? "En leyendo" : "+"}</em>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {loading ? (
              <div className="home-empty-card">
                <h3>Cargando tus lecturas…</h3>
                <p>Estamos buscando los libros que tienes entre manos.</p>
              </div>
            ) : currentReadingBooks.length > 0 ? (
              <div className="home-reading-list">
                {currentReadingBooks.map((book, index) => {
                  const bookKey = String(book.id);
                  const progressValue = displayedProgress(book);
                  const meta = readingMeta(book, progressValue);
                  const isSavingBookProgress = Boolean(savingProgress[bookKey]);

                  return (
                    <article className="home-reading-item" key={book.id}>
                      <button
                        type="button"
                        className="home-reading-cover home-book-cover-link"
                        style={buildBookCoverStyle(book, index)}
                        onClick={() => onSelectBook?.(book)}
                        aria-label={`Abrir ficha de ${book.title}`}
                      >
                        {!book.cover ? book.title : null}
                      </button>

                      <div className="home-reading-info">
                        <div className="home-reading-title-row">
                          <div>
                            <h3>{book.title}</h3>
                            <AuthorLink author={book.author} onSelectAuthor={onSelectAuthor} />
                          </div>
                          <div className="home-reading-percent">
                            <strong>{meta.progress}%</strong>
                            <span>leído</span>
                          </div>
                        </div>

                        <div className="home-reading-slider" style={{ "--progress": `${meta.progress}%` }}>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={meta.progress}
                            aria-label={`Progreso de lectura de ${book.title}`}
                            disabled={isSavingBookProgress}
                            onChange={(event) => changeBookProgress(book, event.target.value)}
                            onPointerUp={(event) => requestProgressSave(book, event.currentTarget.value)}
                            onKeyUp={(event) => {
                              if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Enter"].includes(event.key)) {
                                requestProgressSave(book, event.currentTarget.value);
                              }
                            }}
                          />
                        </div>

                        <div className="home-reading-meta">
                          <span>
                            {meta.totalPages > 0
                              ? `${meta.currentPage} / ${meta.totalPages} páginas`
                              : "Páginas no indicadas"}
                          </span>
                        </div>

                        {progressComposerBookId === bookKey && (
                          <div className="home-progress-composer">
                            <div>
                              <strong>Guardar avance al {meta.progress}%</strong>
                              <span>{meta.totalPages > 0 ? `Página ${meta.currentPage} de ${meta.totalPages}` : "Progreso por porcentaje"}</span>
                            </div>
                            <textarea
                              rows="2"
                              maxLength="1200"
                              value={progressNotes[bookKey] || ""}
                              onChange={(event) => setProgressNotes((items) => ({ ...items, [bookKey]: event.target.value }))}
                              placeholder="¿Qué ha pasado en estas páginas? Puedes dejar una reflexión para tu hilo lector…"
                            />
                            <footer>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={Boolean(progressSpoilers[bookKey])}
                                  onChange={(event) => setProgressSpoilers((items) => ({ ...items, [bookKey]: event.target.checked }))}
                                />
                                {progressSpoilers[bookKey] ? "Contiene spoilers" : "Sin spoilers"}
                              </label>
                              <div>
                                <button type="button" className="is-secondary" onClick={() => cancelProgressSave(book)}>Cancelar</button>
                                <button type="button" onClick={() => persistBookProgress(book, meta.progress)} disabled={isSavingBookProgress}>
                                  {isSavingBookProgress ? "Guardando…" : "Guardar progreso"}
                                </button>
                              </div>
                            </footer>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="home-empty-card">
                <h3>No tienes libros marcados como leyendo.</h3>
                <p>Cuando empieces uno, aparecerá aquí con su progreso.</p>
                <button type="button" onClick={onExplore}>Explorar catálogo</button>
              </div>
            )}
          </article>

          <article
            className="home-panel home-feed-panel home-module-card"
          >
            <div className="home-feed-header">
              <div>
                <p>La plaza de Librélula</p>
                <h2>Actividad lectora</h2>
              </div>
              <nav aria-label="Filtros de actividad lectora">
                {[
                  ["for-you", "Tu círculo"],
                  ["friends", "Amigos"],
                  ["mine", "Mi actividad"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={feedTab === value ? "is-active" : ""}
                    onClick={() => setFeedTab(value)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>

            <form className="home-feed-composer" onSubmit={publishPost}>
              <img src={socialData?.context?.avatar || "/images/avatar/avatar1.png"} alt="" />
              <div className="home-feed-composer-body">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                    placeholder="¿Qué estás leyendo?"
                  rows="3"
                  maxLength="1200"
                />

                {draftImagePreview && (
                  <div className="home-composer-image-preview">
                    <img src={draftImagePreview} alt="Vista previa de la publicación" />
                    <button
                      type="button"
                      aria-label="Quitar imagen"
                      onClick={() => {
                        setDraftImage(null);
                        setDraftImagePreview("");
                        if (imageInputRef.current) imageInputRef.current.value = "";
                      }}
                    ><FeedIcon name="close" /></button>
                  </div>
                )}

                {draftBook && (
                  <div className="home-composer-selected-book">
                    <img src={draftBook.cover || "/images/fondo.png"} alt="" />
                    <div><strong>{draftBook.title}</strong><span>{draftBook.author}</span></div>
                    <button type="button" aria-label="Quitar libro" onClick={() => setDraftBook(null)}><FeedIcon name="close" /></button>
                  </div>
                )}

                {bookPickerOpen && (
                  <div className="home-book-picker">
                    <label htmlFor="home-book-reference">Escoge un libro disponible del catálogo</label>
                    <input
                      id="home-book-reference"
                      type="search"
                      value={bookSearch}
                      onChange={(event) => {
                        const value = event.target.value;
                        setBookSearch(value);
                        if (value.trim().length < 2) {
                          setBookSearchResults([]);
                          setBookSearching(false);
                        }
                      }}
                      placeholder="Busca por título, autora o ISBN…"
                      autoComplete="off"
                    />
                    {bookSearching && <small>Buscando…</small>}
                    {!bookSearching && bookSearch.trim().length >= 2 && bookSearchResults.length === 0 && <small>No hay coincidencias.</small>}
                    {bookSearchResults.length > 0 && (
                      <div className="home-book-picker-results">
                        {bookSearchResults.map((book) => (
                          <button
                            key={book.id}
                            type="button"
                            onClick={() => {
                              setDraftBook(book);
                              setBookPickerOpen(false);
                              setBookSearch("");
                              setBookSearchResults([]);
                            }}
                          >
                            <img src={book.cover || "/images/fondo.png"} alt="" />
                            <span><strong>{book.title}</strong><small>{book.author}</small></span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <footer>
                  <div className="home-composer-tools">
                    <button
                      type="button"
                      className={bookPickerOpen ? "is-active" : ""}
                      onClick={() => {
                        const nextOpen = !bookPickerOpen;
                        setBookPickerOpen(nextOpen);
                        if (!nextOpen) {
                          setBookSearch("");
                          setBookSearchResults([]);
                          setBookSearching(false);
                        }
                      }}
                    >
                      <FeedIcon name="book" /><span>Libro</span>
                    </button>
                    <button type="button" onClick={() => imageInputRef.current?.click()}>
                      <FeedIcon name="image" /><span>Imagen</span>
                    </button>
                    <input
                      ref={imageInputRef}
                      className="home-hidden-file-input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setDraftImage(file);
                        setDraftImagePreview(file ? URL.createObjectURL(file) : "");
                      }}
                    />
                    <label className="home-spoiler-toggle">
                      <input
                        type="checkbox"
                        checked={draftSpoiler}
                        onChange={(event) => setDraftSpoiler(event.target.checked)}
                      />
                      {draftSpoiler ? "Con spoilers" : "Sin spoilers"}
                    </label>
                  </div>
                  <button className="home-publish-button" type="submit" disabled={(!draft.trim() && !draftImage) || publishing}>{publishing ? "Publicando…" : "Publicar"}</button>
                </footer>
              </div>
            </form>

            <div className="home-feed-list">
              {socialLoading ? (
                <div className="home-feed-empty"><strong>Cargando actividad…</strong></div>
              ) : visibleFeed.length > 0 ? (
                visibleFeed.map((item) => {
                  const spoilerHidden = item.spoiler && !revealedSpoilers[item.key];
                  const reviewBody = asText(item.body);
                  const reviewExpanded = Boolean(expandedReviews[item.key]);
                  const reviewIsLong = item.type === "review" && reviewBody.length > 320;

                  return (
                    <article className="home-feed-item" key={item.key}>
                      <img className="home-feed-avatar" src={item.profile.avatar} alt="" />
                      <div className="home-feed-content">
                        <header>
                          <div>
                            <strong>{item.profile.username}</strong>
                            <span>{feedTime(item.created_at)}</span>
                          </div>
                          <span className={item.spoiler ? "is-spoiler" : "is-safe"}>
                            {item.spoiler ? "⚠ Con spoilers" : "✓ Sin spoilers"}
                          </span>
                        </header>

                        {item.type === "post" && (
                          <p className={spoilerHidden ? "home-spoiler-text" : ""}>{spoilerHidden ? "Contenido oculto por spoilers" : item.body}</p>
                        )}

                        {item.image_url && (
                          <div className={spoilerHidden ? "home-feed-image home-spoiler-text" : "home-feed-image"}>
                            <img src={item.image_url} alt="Imagen compartida en la actividad lectora" />
                          </div>
                        )}

                        {item.type === "progress" && (
                          <>
                            <p>Avanzó del <strong>{item.previous_progress}%</strong> al <strong>{item.progress}%</strong> de <em>{item.book?.title}</em>{item.pages_delta ? ` · ${item.pages_delta} páginas` : ""}.</p>
                            {item.body && <blockquote className={spoilerHidden ? "home-spoiler-text" : ""}>{spoilerHidden ? "Comentario oculto por spoilers" : item.body}</blockquote>}
                          </>
                        )}

                        {item.type === "review" && (
                          <>
                            <p>Publicó una reseña de <em>{item.book?.title}</em>.</p>
                            <div className="home-review-stars">{scoreStars(item.score)} <small>{item.score || "—"}</small></div>
                            <blockquote
                              className={[
                                "home-review-body",
                                spoilerHidden ? "home-spoiler-text" : "",
                                !spoilerHidden && reviewIsLong && !reviewExpanded ? "is-collapsed" : "",
                              ].filter(Boolean).join(" ")}
                            >
                              {spoilerHidden ? "Reseña oculta por spoilers" : item.body}
                            </blockquote>
                            {!spoilerHidden && reviewIsLong && (
                              <button
                                type="button"
                                className="home-review-expand"
                                aria-expanded={reviewExpanded}
                                onClick={() =>
                                  setExpandedReviews((current) => ({
                                    ...current,
                                    [item.key]: !current[item.key],
                                  }))
                                }
                              >
                                {reviewExpanded ? "Ver menos" : "Ver más"}
                              </button>
                            )}
                          </>
                        )}

                        {item.type === "completed" && <p>Terminó <em>{item.book?.title}</em>.</p>}
                        {item.type === "started" && <p>Empezó a leer <em>{item.book?.title}</em>.</p>}

                        {item.spoiler && (
                          <button
                            type="button"
                            className="home-reveal-spoiler"
                            onClick={() => setRevealedSpoilers((current) => ({ ...current, [item.key]: !current[item.key] }))}
                          >
                            {spoilerHidden ? "Mostrar contenido" : "Ocultar spoilers"}
                          </button>
                        )}

                        {item.book && (
                          <button
                            type="button"
                            className="home-feed-book home-book-cover-link"
                            onClick={() => onSelectBook?.(item.book)}
                            aria-label={`Abrir ficha de ${item.book.title}`}
                          >
                            <img src={item.book.cover || "/images/fondo.png"} alt="" />
                            <div><strong>{item.book.title}</strong><span>{item.book.author}</span></div>
                            {item.progress !== undefined && <b>{item.progress}%</b>}
                          </button>
                        )}

                        <footer className="home-feed-actions">
                          <button type="button" className="is-comment" onClick={() => setOpenComments((current) => ({ ...current, [item.key]: !current[item.key] }))}>
                            <span className="home-feed-action-icon"><FeedIcon name="comment" /></span>
                            <span>{item.comments_count}</span>
                            <small>Comentar</small>
                          </button>
                          <button type="button" className={item.liked ? "is-liked" : ""} disabled={busyActivities[item.key]} onClick={() => toggleLike(item)}>
                            <span className="home-feed-action-icon"><FeedIcon name="heart" /></span>
                            <span>{item.likes}</span>
                            <small>{item.liked ? "Te gusta" : "Me gusta"}</small>
                          </button>
                        </footer>

                        {item.comments.length > 0 && (
                          <div className="home-comments-preview">
                            {item.comments.map((comment) => (
                              <article key={comment.id}>
                                <img src={comment.profile.avatar} alt="" />
                                <div><p><strong>{comment.profile.username}</strong> {comment.body}</p><time>{feedTime(comment.created_at)}</time></div>
                              </article>
                            ))}
                          </div>
                        )}

                        {openComments[item.key] && (
                          <form className="home-comment-form" onSubmit={(event) => submitComment(item, event)}>
                            <input
                              value={commentDrafts[item.key] || ""}
                              onChange={(event) => setCommentDrafts((current) => ({ ...current, [item.key]: event.target.value }))}
                              placeholder="Escribe un comentario…"
                            />
                            <button type="submit" disabled={!String(commentDrafts[item.key] || "").trim() || busyActivities[item.key]}>Enviar</button>
                          </form>
                        )}
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="home-feed-empty">
                  <strong>Aún no hay actividad en esta pestaña.</strong>
                  <p>Publica algo o sigue a otras lectoras para empezar a llenarla.</p>
                </div>
              )}
            </div>
          </article>
        </div>

        <aside className="home-reader-side">
          <article
            className="home-panel home-week-panel home-module-card"
          >
            <div className="home-small-heading">
              <div>
                <p>Tu ritmo</p>
                <h2>Esta semana</h2>
              </div>
              <button type="button" onClick={() => setGoalEditing((value) => !value)}>Meta</button>
            </div>

            <div className="home-week-numbers">
              <span><strong>{weekly.pagesRead}</strong> páginas</span>
              <span><strong>{weekly.sessions}</strong> sesiones</span>
              <span><strong>{weekly.booksTouched}</strong> libros</span>
            </div>

            <div className="home-week-chart" aria-label="Páginas leídas esta semana">
              {weekly.days.map((day) => (
                <div key={day.date}>
                  <span style={{ height: `${Math.max(6, (day.pages / maxDayPages) * 70)}px` }} title={`${day.pages} páginas`} />
                  <small>{day.label}</small>
                </div>
              ))}
            </div>

            {goalEditing ? (
              <form className="home-goal-form" onSubmit={submitGoal}>
                <label>
                  Meta semanal de páginas
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={goalDraft}
                    onChange={(event) => setGoalDraft(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={savingGoal}>{savingGoal ? "Guardando…" : "Guardar"}</button>
              </form>
            ) : (
              <div className="home-goal-progress">
                <div><span>Meta semanal</span><strong>{weekly.progress}%</strong></div>
                <div className="home-goal-track"><span style={{ width: `${weekly.progress}%` }} /></div>
                <small>{weekly.pagesRead} de {weekly.pageGoal} páginas</small>
              </div>
            )}
          </article>

          <article
            className="home-panel home-club-panel home-module-card"
          >
            <div className="home-small-heading">
              <div>
                <p>Clubes de lectura</p>
                <h2>{featuredClub?.meeting ? "Próxima cita" : "Tu club activo"}</h2>
              </div>
              <span title={`${clubSummary.total} club${clubSummary.total === 1 ? "" : "es"}`}>
                {clubSummary.total}
              </span>
            </div>

            {socialLoading ? (
              <p className="home-side-loading">Cargando clubes…</p>
            ) : featuredClub ? (
              <div className="home-club-card">
                <header>
                  <button
                    type="button"
                    className="home-club-book-cover home-book-cover-link"
                    style={featuredClub.book?.cover
                      ? { backgroundImage: `url("${featuredClub.book.cover}")` }
                      : undefined}
                    onClick={() => featuredClub.book && onSelectBook?.(featuredClub.book)}
                    aria-label={featuredClub.book ? `Abrir ficha de ${featuredClub.book.title}` : "Lectura del club todavía sin libro"}
                    disabled={!featuredClub.book}
                  >
                    {!featuredClub.book?.cover ? "⌑" : null}
                  </button>
                  <div>
                    <strong>{featuredClub.name}</strong>
                    <span>{featuredClub.book?.title || "Lectura por elegir"}</span>
                    {featuredClub.book?.author && (
                      <AuthorLink author={featuredClub.book.author} onSelectAuthor={onSelectAuthor} />
                    )}
                  </div>
                </header>

                {featuredClub.meeting ? (
                  <div className="home-club-meeting">
                    <small>{featuredClub.meeting.title}</small>
                    <strong>{formatClubMeetingDate(featuredClub.meeting.starts_at)}</strong>
                    {featuredClub.meeting.location && <span>{featuredClub.meeting.location}</span>}
                  </div>
                ) : (
                  <p className="home-club-no-meeting">Aún no hay una cita futura programada.</p>
                )}

                <div className="home-club-progress">
                  <div>
                    <span>Tu progreso compartido</span>
                    <strong>{featuredClub.progress}%</strong>
                  </div>
                  <div className="home-goal-track">
                    <span style={{ width: `${featuredClub.progress}%` }} />
                  </div>
                  <small>
                    Capítulo {featuredClub.current_chapter}
                    {featuredClub.current_page > 0 ? ` · pág. ${featuredClub.current_page}` : ""}
                  </small>
                </div>

                <button type="button" className="home-club-open" onClick={() => onClubs?.(featuredClub.id)}>
                  Abrir club
                </button>
              </div>
            ) : (
              <div className="home-club-empty">
                <strong>Aún no perteneces a ningún club</strong>
                <p>Explora los clubes de lectura o crea uno para compartir el próximo libro.</p>
                {onClubs && (
                  <button type="button" className="home-club-open" onClick={() => onClubs()}>Explorar clubes</button>
                )}
              </div>
            )}
          </article>

          <article
            className="home-panel home-friends-panel home-module-card"
          >
            <div className="home-small-heading">
              <div>
                <p>Tu círculo</p>
                <h2>Amigos leyendo</h2>
              </div>
              <span>{friendsReading.length}</span>
            </div>

            {socialLoading ? (
              <p className="home-side-loading">Cargando amigos…</p>
            ) : friendsReading.length > 0 ? (
              <div className="home-friends-list">
                {friendsReading.map((item) => (
                  <article key={`${item.profile.id}-${item.book.id}`}>
                    <button type="button" className="home-friend-avatar-button" onClick={() => onSelectProfile?.(item.profile.id)} aria-label={`Abrir el perfil de ${item.profile.username}`}><img className="home-friend-avatar" src={item.profile.avatar} alt="" /></button>
                    <button
                      type="button"
                      className="home-friend-cover home-book-cover-link"
                      onClick={() => onSelectBook?.(item.book)}
                      aria-label={`Abrir ficha de ${item.book.title}`}
                    >
                      <img src={item.book.cover || "/images/fondo.png"} alt="" />
                    </button>
                    <div>
                      <strong>{item.profile.username}</strong>
                      <span>{item.book.title}</span>
                      <div className="home-friend-progress"><span style={{ width: `${item.progress}%` }} /></div>
                      <small>{item.progress}% leído</small>
                      {item.latest_update && (
                        <button
                          type="button"
                          className={`home-friend-update${item.latest_update.spoiler ? " is-spoiler" : ""}`}
                          onClick={() => onOpenBookThread?.(item.book, item.profile)}
                        >
                          <span>
                            {item.latest_update.spoiler
                              ? "Actualización con spoilers"
                              : item.latest_update.body}
                          </span>
                          <small>Ver hilo · {feedTime(item.latest_update.created_at)}</small>
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="home-club-empty">
                <strong>Tus amigos aparecerán aquí</strong>
                <p>Cuando sigas a otras lectoras y estén leyendo, verás su libro y progreso.</p>
              </div>
            )}
          </article>
        </aside>
      </section>

      {completedBook && completedMeta && (
        <div className="lector-completion-overlay" role="dialog" aria-modal="true" aria-labelledby="lector-completion-title">
          <div className="lector-confetti" aria-hidden="true">
            {COMPLETION_CONFETTI.map((piece) => (
              <span
                key={piece}
                style={{
                  "--x": `${(piece * 17) % 100}%`,
                  "--delay": `${(piece % 9) * 0.12}s`,
                  "--duration": `${2.4 + (piece % 7) * 0.18}s`,
                  "--spin": `${piece % 2 === 0 ? "" : "-"}${240 + piece * 13}deg`,
                }}
              />
            ))}
          </div>

          <article
            className="lector-completion-card"
            style={{
              "--completion-a": completionColors[0],
              "--completion-b": completionColors[1],
              "--completion-c": completionColors[2],
            }}
          >
            <button type="button" className="lector-completion-close" aria-label="Cerrar celebración" onClick={() => setCompletedBook(null)}>×</button>
            <header className="lector-completion-hero">
              <div className="lector-completion-glow" style={buildBookCoverStyle(completedBook, 0)} aria-hidden="true" />
              <button
                type="button"
                className="lector-completion-cover home-book-cover-link"
                style={{
                  ...buildBookCoverStyle(completedBook, 0),
                  backgroundSize: "contain",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                }}
                onClick={() => {
                  setCompletedBook(null);
                  onSelectBook?.(completedBook);
                }}
                aria-label={`Abrir ficha de ${completedBook.title}`}
              >
                {!completedBook.cover ? completedBook.title : null}
              </button>
              <div className="lector-completion-check" aria-hidden="true">✓</div>
            </header>

            <div className="lector-completion-body">
              <p className="lector-completion-kicker">Lectura completada</p>
              <h2 id="lector-completion-title">¡Libro terminado!</h2>
              <p>
                Has terminado <strong>{completedBook.title}</strong>
                {completedBook.author ? ` de ${completedBook.author}` : ""}. Un libro más en tu estantería.
              </p>
              <div className="lector-completion-stats" aria-label="Resumen de lectura">
                <span><strong>{completedMeta.totalPages || completedMeta.currentPage || completedBook.pages || "—"}</strong>páginas</span>
                <span><strong>100%</strong>leído</span>
                <span><strong>{completedBook.read_count || 1}</strong>{Number(completedBook.read_count || 1) === 1 ? "vez leído" : "veces leído"}</span>
              </div>
              <div className="lector-completion-actions">
                <button type="button" onClick={() => setCompletedBook(null)}>Cerrar</button>
                <button type="button" className="is-primary" onClick={() => { const book = completedBook; setCompletedBook(null); if (onReviewBook) onReviewBook(book); else onReviews?.(); }}>Escribir reseña</button>
              </div>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}
