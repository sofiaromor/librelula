import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { publicUrl } from "./api.js";
import {
  awardClubBookmark,
  createClubMeeting,
  createClubPost,
  createReadingClub,
  deleteClubMeeting,
  deleteReadingClub,
  finishClubReading,
  startClubReading,
  getClubDetail,
  getClubsHub,
  joinReadingClub,
  joinReadingClubByCode,
  leaveReadingClub,
  moderateClubPost,
  markClubGeneralChatRead,
  removeClubMember,
  revokeClubBookmark,
  replaceClubChapters,
  searchClubBooks,
  setClubMemberRole,
  toggleClubPostReaction,
  updateClubMeeting,
  updateClubProgress,
  updateClubReadingPlan,
  updateClubSettings,
  uploadClubAsset,
} from "./lib/clubsApi.js";
import "./ClubesLectura.css";

const DEFAULT_AVATAR = "images/avatar/avatar1.png";
const DIALOG_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

function useDialogBehavior(open, onClose, dialogRef) {
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const previousActiveElement = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current?.();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll(DIALOG_FOCUSABLE_SELECTOR)];
      if (!focusable.length) return;

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
    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.querySelector(DIALOG_FOCUSABLE_SELECTOR)?.focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      if (previousActiveElement instanceof HTMLElement) previousActiveElement.focus();
    };
  }, [dialogRef, open]);
}

function assetUrl(value, fallback = "images/librelula.png") {
  const clean = String(value || "").trim();
  const normalized = clean.toLowerCase();
  if (
    !clean ||
    normalized === "default.jpg" ||
    normalized === "default.png" ||
    normalized === "images/avatar/default.jpg"
  ) {
    return publicUrl(fallback);
  }
  if (/^(?:https?:\/\/|data:|blob:)/i.test(clean)) return clean;
  return publicUrl(clean);
}

function displayName(profile) {
  return profile?.display_name || profile?.username || "Lectora de Librélula";
}

function AvatarImage({ profile, className = "", loading = "lazy" }) {
  const fallback = publicUrl(DEFAULT_AVATAR);
  return (
    <img
      className={className}
      src={assetUrl(profile?.avatar, DEFAULT_AVATAR)}
      alt={`Avatar de ${displayName(profile)}`}
      loading={loading}
      onError={(event) => {
        if (event.currentTarget.src !== fallback) {
          event.currentTarget.src = fallback;
        }
      }}
    />
  );
}

function memberProgress(member, totalPages = 0) {
  const saved = Number(member?.progress);
  if (Number.isFinite(saved) && saved >= 0) {
    return Math.max(0, Math.min(100, Math.round(saved)));
  }
  const page = Math.max(0, Number(member?.current_page) || 0);
  const pages = Math.max(0, Number(totalPages) || 0);
  return pages > 0 ? Math.max(0, Math.min(100, Math.round((page / pages) * 100))) : 0;
}

function formatDateTime(value) {
  if (!value) return "Todavía sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Todavía sin fecha";
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function compactDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    day: new Intl.DateTimeFormat("es-ES", { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("es-ES", { month: "short" })
      .format(date)
      .replace(".", "")
      .toUpperCase(),
    time: new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
    weekday: new Intl.DateTimeFormat("es-ES", { weekday: "long" }).format(date),
  };
}

function relativeTime(value) {
  if (!value) return "ahora";
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} día${days === 1 ? "" : "s"}`;
}

function chatDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [date.getFullYear(), date.getMonth(), date.getDate()].join("-");
}

function chatDayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Conversación";

  const today = new Date();
  const todayKey = chatDateKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dateKey = chatDateKey(date);

  if (dateKey === todayKey) return "Hoy";
  if (dateKey === chatDateKey(yesterday)) return "Ayer";

  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(date).replace(".", "");
}

function chatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function chatPreviewText(post) {
  if (!post) return "Todavía no hay mensajes";
  if (post.image_url) return "▧ Imagen compartida";
  if (post.quote_text) return `❞ ${post.quote_text}`;
  return post.content || "Mensaje compartido";
}

function clubBackground(club) {
  const bookCover = club?.book?.cover;
  const custom = club?.banner_asset_url || club?.banner_url;
  const image = custom || bookCover;
  const accent = club?.accent_color || "#68442f";
  return {
    "--club-accent": accent,
    backgroundImage: image
      ? `linear-gradient(90deg, rgba(33, 19, 10, .94), rgba(55, 31, 17, .78), rgba(32, 18, 10, .9)), url("${assetUrl(image)}")`
      : "linear-gradient(120deg, #2f1d13, #7a4b2c 55%, #342116)",
  };
}

function AvatarStack({ members = [], limit = 5, extra = 0 }) {
  const visible = members.slice(0, limit);
  return (
    <div className="clubs-avatar-stack" aria-label={`${members.length + extra} miembros`}>
      {visible.map((member) => (
        <AvatarImage
          key={member.user_id || member.profile?.id}
          profile={member.profile}
        />
      ))}
      {members.length + extra > limit && (
        <span>+{members.length + extra - limit}</span>
      )}
    </div>
  );
}

function BookCover({ book, className = "", onOpen = null }) {
  const clickable = Boolean(book && onOpen);

  if (!book) {
    return (
      <div
        className={`${className} club-empty-book-cover`.trim()}
        aria-label="Todavía no hay una próxima lectura seleccionada"
      >
        <span className="club-empty-book-mark" aria-hidden="true">
          <i />
          <i />
        </span>
        <small>Próxima lectura</small>
      </div>
    );
  }

  return (
    <img
      className={`${className}${clickable ? " is-book-link" : ""}`}
      src={assetUrl(book.cover)}
      alt={`Portada de ${book.title || "este libro"}`}
      loading="lazy"
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Abrir ficha de ${book.title || "este libro"}` : undefined}
      onClick={clickable ? () => onOpen(book) : undefined}
      onKeyDown={clickable ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(book);
        }
      } : undefined}
      onError={(event) => {
        event.currentTarget.src = publicUrl("images/librelula.png");
      }}
    />
  );
}

function ClubIcon({ club, className = "" }) {
  const fallback = club?.book?.cover || "images/librelula.png";
  return (
    <img
      className={className}
      src={assetUrl(club?.icon_asset_url || club?.icon_url, fallback)}
      alt={`Imagen de perfil de ${club?.name || "club"}`}
      loading="lazy"
      onError={(event) => {
        const next = assetUrl(fallback);
        if (event.currentTarget.src !== next) event.currentTarget.src = next;
      }}
    />
  );
}

function ChatAvatar({ club, chapterNumber = null }) {
  if (chapterNumber !== null) {
    return <span className="club-chat-list-avatar is-chapter" aria-hidden="true">{chapterNumber}</span>;
  }

  return <ClubIcon club={club} className="club-chat-list-avatar" />;
}

function ClubChatPanel({ kicker, title, onClose, children, className = "" }) {
  const dialogRef = useRef(null);

  useDialogBehavior(true, onClose, dialogRef);

  return (
    <div className="clubs-modal-backdrop club-chat-panel-backdrop" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={`club-chat-panel ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="club-chat-panel-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="clubs-kicker">{kicker}</span>
            <h2 id="club-chat-panel-title">{title}</h2>
          </div>
          <button type="button" className="clubs-icon-button" onClick={onClose} aria-label={`Cerrar ${title}`}>
            ×
          </button>
        </header>
        <div className="club-chat-panel-content">{children}</div>
      </section>
    </div>
  );
}

function ClubChatList({
  club,
  chapters = [],
  visibleChapters = chapters,
  posts = [],
  members = [],
  selectedChannel = "general",
  selectedChapter = 1,
  generalUnreadCount = 0,
  currentChapter = 1,
  unlockedChapter = 1,
  isAdmin = false,
  myProgress = 0,
  collectiveProgress = 0,
  meeting = null,
  nextPlanSession = null,
  libraryCount = 0,
  achievementCount = 0,
  mobileOpen = false,
  onCloseMobile,
  onSelect,
  onOpenPanel,
  onSelectBook,
}) {
  const [query, setQuery] = useState("");
  const selectedKey = selectedChannel === "general" ? "general" : `chapter:${selectedChapter}`;
  const nextEvent = meeting || (nextPlanSession ? { starts_at: nextPlanSession } : null);
  const nextEventDate = compactDate(nextEvent?.starts_at);
  const nextEventLabel = nextEventDate
    ? `${nextEventDate.day} ${nextEventDate.month} · ${nextEventDate.time}`
    : "Sin fecha todavía";

  const conversations = useMemo(() => {
    const latestPost = (rows) => [...rows]
      .sort((first, second) => new Date(first.created_at).getTime() - new Date(second.created_at).getTime())
      .at(-1) || null;
    const generalPosts = posts.filter((post) => post.channel === "general");
    const generalLastPost = latestPost(generalPosts);

    const chapterConversations = visibleChapters.map((chapter) => {
      const chapterNumber = Number(chapter.chapter_number);
      const chapterPosts = posts.filter(
        (post) => post.channel === "chapter" && Number(post.chapter_number) === chapterNumber,
      );
      const planLocked = chapterNumber > unlockedChapter;
      const progressLocked = !isAdmin && chapterNumber > currentChapter;

      return {
        key: `chapter:${chapterNumber}`,
        channel: "chapter",
        chapterNumber,
        title: `Capítulo ${chapterNumber}`,
        subtitle: chapter.title || "Conversación de lectura",
        preview: chapterPosts.length
          ? `${displayName(latestPost(chapterPosts)?.profile)}: ${chatPreviewText(latestPost(chapterPosts))}`
          : "Todavía no hay mensajes",
        timestamp: latestPost(chapterPosts)?.created_at || null,
        count: chapterPosts.length,
        locked: planLocked || progressLocked,
      };
    });

    return [
      {
        key: "general",
        channel: "general",
        chapterNumber: null,
        title: "Chat general",
        subtitle: `${members.length} miembros · conversación abierta`,
        preview: generalLastPost
          ? `${displayName(generalLastPost.profile)}: ${chatPreviewText(generalLastPost)}`
          : "Da la bienvenida al club",
        timestamp: generalLastPost?.created_at || null,
        count: generalPosts.length,
        unread: generalUnreadCount,
        locked: false,
      },
      ...chapterConversations,
    ];
  }, [currentChapter, generalUnreadCount, isAdmin, members.length, posts, unlockedChapter, visibleChapters]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredConversations = normalizedQuery
    ? conversations.filter((conversation) => [conversation.title, conversation.subtitle, conversation.preview]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery))
    : conversations;

  return (
    <aside
      className={`club-chat-list-panel${mobileOpen ? " is-mobile-open" : ""}`}
      aria-label="Conversaciones del club"
    >
      <header className="club-chat-list-header">
        <div>
          <span className="clubs-kicker">La mesa lectora</span>
          <h2>Conversaciones</h2>
          <p>{conversations.length} espacios para hablar sin perder el hilo.</p>
        </div>
        <button
          type="button"
          className="club-chat-mobile-close"
          onClick={onCloseMobile}
          aria-label="Cerrar lista de conversaciones"
        >
          ×
        </button>
      </header>

      <label className="club-chat-search">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar conversación"
          aria-label="Buscar conversación"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda">
            ×
          </button>
        )}
      </label>

      <div className="club-chat-list-context" aria-label="Contexto de lectura">
        <button
          type="button"
          className="club-chat-book-card"
          onClick={() => club.book ? onSelectBook?.(club.book) : onOpenPanel?.("shelf")}
        >
          <BookCover book={club.book} className="club-chat-book-cover" />
          <span>
            <small>{club.book ? "Lectura actual" : "Próxima lectura"}</small>
            <strong>{club.book?.title || "Elegir un libro para el club"}</strong>
            <em>{club.book?.author || "La conversación puede empezar igualmente."}</em>
            <i><b style={{ width: `${myProgress}%` }} /></i>
            <span>{club.book ? `Tu avance · ${myProgress}%` : "Abrir estantería"}</span>
          </span>
          <b aria-hidden="true">→</b>
        </button>

        <div className="club-chat-quick-grid">
          <button type="button" onClick={() => onOpenPanel?.("progress")}>
            <span aria-hidden="true">◔</span>
            <small>Mi avance</small>
            <strong>{myProgress}%</strong>
          </button>
          <button type="button" onClick={() => onOpenPanel?.("calendar")}>
            <span aria-hidden="true">◷</span>
            <small>Próxima cita</small>
            <strong>{nextEventLabel}</strong>
          </button>
          <button type="button" onClick={() => onOpenPanel?.("members")}>
            <span aria-hidden="true">♧</span>
            <small>El círculo</small>
            <strong>{members.length} miembros</strong>
          </button>
          <button type="button" onClick={() => onOpenPanel?.("shelf")}>
            <span aria-hidden="true">⌑</span>
            <small>Estantería</small>
            <strong>{libraryCount} {libraryCount === 1 ? "lectura" : "lecturas"}</strong>
          </button>
        </div>

        <div className="club-chat-context-footer">
          <button type="button" onClick={() => onOpenPanel?.("achievements")}>
            ❧ {achievementCount ? `${achievementCount} marcapáginas` : "Marcapáginas del club"}
          </button>
          <span>Avance colectivo · {collectiveProgress}%</span>
        </div>
      </div>

      <div className="club-chat-list-heading">
        <span>Conversaciones</span>
        <small>{filteredConversations.length} disponibles</small>
      </div>
      <div className="club-chat-list" role="list" aria-label="Lista de chats">
        {filteredConversations.map((conversation) => {
          const active = conversation.key === selectedKey;
          return (
            <button
              type="button"
              key={conversation.key}
              className={`club-chat-list-item${active ? " is-active" : ""}${conversation.locked ? " is-locked" : ""}`}
              onClick={() => !conversation.locked && onSelect(conversation)}
              aria-current={active ? "page" : undefined}
              disabled={conversation.locked}
            >
              <ChatAvatar club={club} chapterNumber={conversation.chapterNumber} />
              <span className="club-chat-list-copy">
                <span className="club-chat-list-title-row">
                  <strong>{conversation.title}</strong>
                  {conversation.timestamp && <time dateTime={conversation.timestamp}>{chatTime(conversation.timestamp)}</time>}
                </span>
                <span className="club-chat-list-subtitle">{conversation.subtitle}</span>
                <span className="club-chat-list-preview">{conversation.locked ? "▣ Disponible cuando avances en la lectura" : conversation.preview}</span>
              </span>
              <span className="club-chat-list-meta">
                {conversation.locked && <span className="club-chat-lock" aria-label="Conversación bloqueada">▣</span>}
                {!conversation.locked && conversation.unread > 0 && (
                  <span className="club-chat-unread" aria-label={`${conversation.unread} mensajes sin leer`}>
                    {conversation.unread > 99 ? "99+" : conversation.unread}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        {filteredConversations.length === 0 && (
          <div className="club-chat-list-empty">
            <span aria-hidden="true">⌕</span>
            <strong>No encontramos ese chat</strong>
            <p>Prueba con «general» o con el nombre de un capítulo.</p>
          </div>
        )}
      </div>

      <footer className="club-chat-list-reading">
        <ChatAvatar club={club} />
        <span>
          <small>Lectura actual</small>
          <strong>{club.book?.title || "Aún sin libro elegido"}</strong>
        </span>
      </footer>
    </aside>
  );
}

function ClubChatReadingBar({
  club,
  myProgress = 0,
  currentChapter = 1,
  unlockedChapter = 1,
  collectiveProgress = 0,
  meeting = null,
  nextPlanSession = null,
  onOpenPanel,
  onSelectBook,
}) {
  const nextEvent = meeting || (nextPlanSession ? { starts_at: nextPlanSession } : null);
  const nextEventDate = compactDate(nextEvent?.starts_at);
  const nextEventLabel = nextEventDate
    ? `${nextEventDate.day} ${nextEventDate.month} · ${nextEventDate.time}`
    : "Sin fecha";

  return (
    <div className="club-chat-reading-bar">
      <button
        type="button"
        className={`club-chat-reading-book${club.book ? "" : " is-empty"}`}
        onClick={() => club.book ? onSelectBook?.(club.book) : onOpenPanel?.("shelf")}
        aria-label={club.book ? `Abrir la ficha de ${club.book.title}` : "Abrir la estantería para elegir una lectura"}
      >
        <BookCover book={club.book} className="club-chat-reading-cover" />
        <span>
          <small>{club.book ? "Lectura actual" : "Próxima lectura"}</small>
          <strong>{club.book?.title || "Aún no hay libro elegido"}</strong>
          <em>{club.book?.author || "La mesa puede seguir conversando mientras lo decide."}</em>
          <i><b style={{ width: `${myProgress}%` }} /></i>
          <span>{club.book ? `Capítulo ${currentChapter} · ${myProgress}%` : "Abrir estantería"}</span>
        </span>
        <b aria-hidden="true">→</b>
      </button>

      <div className="club-chat-reading-actions" aria-label="Accesos de la lectura">
        <button type="button" onClick={() => onOpenPanel?.("progress")}>
          <small>Mi avance</small>
          <strong>{myProgress}%</strong>
        </button>
        <button type="button" onClick={() => onOpenPanel?.("calendar")}>
          <small>Próxima cita</small>
          <strong>{nextEventLabel}</strong>
        </button>
        <button type="button" onClick={() => onOpenPanel?.("members")}>
          <small>Ritmo del club</small>
          <strong>{collectiveProgress}% colectivo</strong>
        </button>
        <button type="button" onClick={() => onOpenPanel?.("shelf")}>
          <small>Capítulo abierto</small>
          <strong>Hasta el {unlockedChapter}</strong>
        </button>
      </div>
    </div>
  );
}

function ClubChatAboutContent({
  club,
  membership,
  members,
  chapters,
  collectiveProgress = 0,
  unlockedChapter = 1,
  meeting = null,
  nextPlanSession = null,
  onOpenPanel,
  onSelectBook,
}) {
  const rules = (club.rules || []).map((rule) => String(rule || "").trim()).filter(Boolean);
  const nextEvent = club.reading_plan_enabled ? nextPlanSession : meeting?.starts_at;

  return (
    <div className="club-chat-about-content">
      <article className="club-chat-about-book">
        <BookCover book={club.book} className="club-chat-about-cover" />
        <div>
          <span className="clubs-kicker">{club.book ? "Lectura actual" : "Próxima lectura"}</span>
          <h3>{club.book?.title || "Aún no hay un libro elegido"}</h3>
          <p>{club.book?.author || "Podéis seguir conversando mientras decidís la siguiente historia."}</p>
          {club.book && (
            <button type="button" className="clubs-secondary-button" onClick={() => onSelectBook?.(club.book)}>
              Ver ficha del libro
            </button>
          )}
        </div>
      </article>

      <div className="club-chat-about-stats">
        <article><strong>{membership?.progress || 0}%</strong><span>tu avance</span></article>
        <article><strong>{collectiveProgress}%</strong><span>avance colectivo</span></article>
        <article><strong>{members.length}</strong><span>miembros</span></article>
        <article><strong>{unlockedChapter}</strong><span>capítulos abiertos</span></article>
      </div>

      <div className="club-chat-about-actions">
        <button type="button" onClick={() => onOpenPanel?.("progress")}>
          <span aria-hidden="true">◔</span>
          <strong>Actualizar mi avance</strong>
          <small>Guarda página y capítulo</small>
        </button>
        <button type="button" onClick={() => onOpenPanel?.("shelf")}>
          <span aria-hidden="true">⌑</span>
          <strong>Abrir estantería</strong>
          <small>Lecturas anteriores y reseñas</small>
        </button>
        <button type="button" onClick={() => onOpenPanel?.("calendar")}>
          <span aria-hidden="true">◷</span>
          <strong>Ver próxima sesión</strong>
          <small>{formatDateTime(nextEvent)}</small>
        </button>
        <button type="button" onClick={() => onOpenPanel?.("members")}>
          <span aria-hidden="true">♧</span>
          <strong>Conocer al círculo</strong>
          <small>Perfiles y ritmo de lectura</small>
        </button>
      </div>

      <section className="club-chat-about-section">
        <header>
          <div>
            <span className="clubs-kicker">La mesa lectora</span>
            <h3>Cómo funciona este club</h3>
          </div>
          <AvatarStack members={members} />
        </header>
        <p>{club.description || "Un espacio para compartir lecturas, avances y conversaciones sin perder el hilo."}</p>
        <div className="club-chat-about-reading-note">
          <span>♧</span>
          <p>Los capítulos se abren según el ritmo del club. Las conversaciones futuras permanecen protegidas para evitar spoilers.</p>
        </div>
      </section>

      {rules.length > 0 && (
        <section className="club-chat-about-section">
          <span className="clubs-kicker">Antes de escribir</span>
          <h3>Normas de la conversación</h3>
          <ul>{rules.map((rule, index) => <li key={`${rule}-${index}`}>{rule}</li>)}</ul>
        </section>
      )}

      <button type="button" className="club-chat-about-chapters" onClick={() => onOpenPanel?.("shelf")}>
        <span><strong>{chapters.length}</strong> capítulos en el mapa de lectura</span>
        <span>Ver estantería y detalles →</span>
      </button>
    </div>
  );
}

function CreateClubPanel({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    visibility: "public",
    chapterCount: 10,
    nextMeetingAt: "",
  });
  const [bookSearch, setBookSearch] = useState("");
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef(null);

  useDialogBehavior(true, onClose, dialogRef);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const rows = await searchClubBooks(bookSearch);
        if (!cancelled) setBooks(rows);
      } catch (nextError) {
        if (!cancelled) setError(nextError.message || "No se pudieron buscar libros.");
      } finally {
        if (!cancelled) setLoadingBooks(false);
      }
    }, bookSearch ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bookSearch]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const club = await createReadingClub({
        ...form,
        bookId: selectedBook?.id,
        nextMeetingAt: form.nextMeetingAt
          ? new Date(form.nextMeetingAt).toISOString()
          : null,
      });
      onCreated(club);
    } catch (nextError) {
      setError(nextError.message || "No se pudo crear el club.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="clubs-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="clubs-create-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clubs-create-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="clubs-kicker">Una nueva mesa lectora</span>
            <h2 id="clubs-create-title">Crear un club</h2>
          </div>
          <button type="button" className="clubs-icon-button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <label>
            Nombre del club
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="El salón de medianoche"
              maxLength={80}
              required
            />
          </label>

          <label>
            Descripción
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="¿Qué tipo de lecturas y conversaciones tendrá este club?"
              rows={3}
            />
          </label>

          <div className="clubs-form-grid">
            <label>
              Privacidad
              <select
                value={form.visibility}
                onChange={(event) =>
                  setForm((current) => ({ ...current, visibility: event.target.value }))
                }
              >
                <option value="public">Público · cualquiera puede unirse</option>
                <option value="private">Privado · requiere código</option>
              </select>
            </label>
            <label>
              Capítulos iniciales
              <input
                type="number"
                min="1"
                max="80"
                value={form.chapterCount}
                onChange={(event) =>
                  setForm((current) => ({ ...current, chapterCount: event.target.value }))
                }
              />
            </label>
          </div>

          <label>
            Próxima reunión (opcional)
            <input
              type="datetime-local"
              value={form.nextMeetingAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, nextMeetingAt: event.target.value }))
              }
            />
          </label>

          <fieldset className="clubs-book-picker">
            <legend>Libro con el que empieza el club</legend>
            <input
              type="search"
              value={bookSearch}
              onChange={(event) => {
                setLoadingBooks(true);
                setBookSearch(event.target.value);
              }}
              placeholder="Buscar por título, autora o ISBN…"
            />
            <div className="clubs-book-results">
              {loadingBooks && <p>Buscando en el catálogo…</p>}
              {!loadingBooks && books.length === 0 && <p>No encontramos libros con esa búsqueda.</p>}
              {books.map((book) => (
                <button
                  type="button"
                  key={book.id}
                  className={selectedBook?.id === book.id ? "is-selected" : ""}
                  onClick={() => setSelectedBook(book)}
                >
                  <BookCover book={book} />
                  <span>
                    <strong>{book.title}</strong>
                    <small>{book.author}</small>
                  </span>
                  <i aria-hidden="true">{selectedBook?.id === book.id ? "✓" : "+"}</i>
                </button>
              ))}
            </div>
          </fieldset>

          {error && <p className="clubs-form-error">{error}</p>}

          <footer>
            <button type="button" className="clubs-secondary-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="clubs-primary-button" disabled={saving || !selectedBook}>
              {saving ? "Preparando el club…" : "Crear el club"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function ClubCard({ club, onSelect, isSelected = false }) {
  const meeting = compactDate(club.next_meeting_at);
  const progress = Math.max(0, Math.min(100, Number(club.membership?.progress) || 0));
  return (
    <button
      type="button"
      className={`clubs-my-card${isSelected ? " is-selected" : ""}`}
      style={clubBackground(club)}
      onClick={() => onSelect(club)}
      aria-pressed={isSelected}
    >
      <ClubIcon club={club} className="clubs-my-card-icon" />
      <span className="clubs-my-card-copy">
        <small>Leyendo ahora</small>
        <strong>{club.name}</strong>
        <span>{club.book?.title || "Lectura por escoger"}</span>
        <em>{club.book?.author || ""}</em>
        <span className="clubs-card-progress-label">Tu progreso · {progress}%</span>
        <span className="clubs-card-progress">
          <i style={{ width: `${progress}%` }} />
        </span>
      </span>
      <span className="clubs-my-card-meta">
        <b>{club.member_count} miembros</b>
        {meeting && <b>{meeting.weekday} · {meeting.time}</b>}
      </span>
    </button>
  );
}

function ClubPreview({ club, onEnter, onSelectBook, isBusy = false }) {
  const meeting = compactDate(club.next_meeting_at);
  const isMember = Boolean(club.is_member);
  const progress = Math.max(0, Math.min(100, Number(club.membership?.progress) || 0));
  return (
    <section className="clubs-featured clubs-featured-refresh" id="selected-club-preview">
      <header className="clubs-featured-hero" style={clubBackground(club)}>
        <div className="clubs-featured-emblem">
          <ClubIcon club={club} />
        </div>
        <div className="clubs-featured-title">
          <span>{club.visibility === "private" ? "▣ Club privado" : "◌ Club público"}</span>
          <h2>{club.name}</h2>
          <p>{club.description || "Un lugar para leer sin prisa y conversar sin adelantos."}</p>
          <small>{club.member_count} miembros</small>
        </div>
        <div className="clubs-featured-actions">
          <button type="button" className="clubs-primary-button" onClick={() => onEnter(club)} disabled={isBusy}>
            {isBusy ? "Abriendo…" : isMember ? "Continuar leyendo" : "Unirme al club"}
          </button>
        </div>
      </header>

      <div className="clubs-preview-tabs" aria-label="Lo que encontrarás dentro del club">
        <span className="is-active">Lectura compartida</span>
        <span>Conversaciones</span>
        <span>Ritmo sin spoilers</span>
        <span>Calendario</span>
      </div>

      <div className="clubs-preview-grid">
        <article className="clubs-preview-reading">
          <h3>Lectura del mes</h3>
          <div>
            <BookCover book={club.book} onOpen={onSelectBook} />
            <span>
              <strong>{club.book?.title || "Sin lectura seleccionada"}</strong>
              <small>{club.book?.author || ""}</small>
              {isMember ? (
                <>
                  <label>Tu progreso</label>
                  <i><b style={{ width: `${progress}%` }} /></i>
                  <em>{progress}%</em>
                </>
              ) : (
                <small className="clubs-preview-membership-note">Únete para guardar tu avance y ver los capítulos disponibles.</small>
              )}
              {club.book && (
                <button type="button" onClick={() => onSelectBook?.(club.book)}>
                  Ver ficha del libro
                </button>
              )}
            </span>
          </div>
        </article>

        <article className="clubs-preview-meeting">
          <h3>Próxima reunión</h3>
          {meeting ? (
            <div className="clubs-meeting-date">
              <span><b>{meeting.month}</b><strong>{meeting.day}</strong></span>
              <p><strong>{meeting.time}</strong><small>{meeting.weekday}</small></p>
            </div>
          ) : (
            <p className="clubs-soft-empty">El club todavía no ha fijado su próxima cita.</p>
          )}
          <button type="button" onClick={() => onEnter(club)}>Ver calendario</button>
        </article>

        <article className="clubs-preview-action-card">
          <h3>Conversaciones sin spoilers</h3>
          <p className="clubs-soft-empty">Debates generales y por capítulo, con los adelantos protegidos para que cada persona avance a su ritmo.</p>
          <button type="button" onClick={() => onEnter(club)}>Ver conversaciones →</button>
        </article>

        <article className="clubs-preview-action-card">
          <h3>Ritmo compartido</h3>
          <p className="clubs-soft-empty">Consulta el avance de la mesa, descubre las reflexiones del grupo y prepara la próxima reunión.</p>
          <button type="button" onClick={() => onEnter(club)}>Abrir el círculo →</button>
        </article>
      </div>
    </section>
  );
}

function ClubPost({
  post,
  currentChapter,
  onReact,
  onReveal,
  isRevealed,
  canModerate = false,
  onModerate,
  onReply,
  replyCount = 0,
  replies = [],
  threadOpen = false,
  onToggleThread,
  revealedPosts = new Set(),
  isReply = false,
  currentUserId = null,
  isMine = false,
}) {
  const futureLocked = post.channel === "chapter" && Number(post.chapter_number) > currentChapter;
  const spoilerHidden = post.contains_spoilers && !isRevealed;
  const profile = post.profile;

  if (futureLocked && !canModerate) {
    return (
      <article className="club-post club-post-locked">
        <span className="club-post-lock">▣</span>
        <div>
          <strong>Mensaje de un capítulo futuro</strong>
          <p>Avanza hasta el capítulo {post.chapter_number} para desbloquearlo.</p>
        </div>
      </article>
    );
  }

  return (
    <article className={`club-post${isReply ? " club-post-reply" : ""}${isMine ? " is-mine" : ""}`}>
      <AvatarImage className="club-post-avatar" profile={profile} />
      <div className="club-post-body">
        <header>
          <strong>{displayName(profile)}</strong>
          <span>{relativeTime(post.created_at)}</span>
          {post.channel === "chapter" && <em>Cap. {post.chapter_number}</em>}
          {canModerate && (
            <div className="club-post-moderation">
              <button
                type="button"
                onClick={() => onModerate?.(post, post.contains_spoilers ? "safe" : "spoiler")}
              >
                {post.contains_spoilers ? "Quitar spoiler" : "Marcar spoiler"}
              </button>
              <button type="button" className="is-danger" onClick={() => onModerate?.(post, "delete")}>
                Eliminar
              </button>
            </div>
          )}
        </header>

        {spoilerHidden ? (
          <button type="button" className="club-spoiler-cover" onClick={() => onReveal(post.id)}>
            <b>◉ Spoiler del capítulo {post.chapter_number || "actual"}</b>
            <span>Este contenido puede revelar detalles importantes.</span>
            <i>Mostrar</i>
          </button>
        ) : (
          <>
            {post.content && <p>{post.content}</p>}
            {post.quote_text && <blockquote>“{post.quote_text}”</blockquote>}
            {post.image_url && <img className="club-post-image" src={post.image_url} alt="Imagen compartida" />}
          </>
        )}

        <footer>
          <button
            type="button"
            className={post.liked_by_me ? "is-active" : ""}
            onClick={() => onReact(post.id, "heart")}
            aria-pressed={post.liked_by_me}
            aria-label={`${post.liked_by_me ? "Quitar" : "Añadir"} me gusta${post.heart_count ? ` · ${post.heart_count}` : ""}`}
          >
            ♥ <span>{post.heart_count || 0}</span>
          </button>
          <button
            type="button"
            className={post.leafed_by_me ? "is-active" : ""}
            onClick={() => onReact(post.id, "leaf")}
            aria-pressed={post.leafed_by_me}
            aria-label={`${post.leafed_by_me ? "Quitar" : "Añadir"} brote${post.leaf_count ? ` · ${post.leaf_count}` : ""}`}
          >
            ❧ <span>{post.leaf_count || 0}</span>
          </button>
          {!isReply && (
            <>
              <button
                type="button"
                className="club-reply-button"
                onClick={() => onReply?.(post)}
                aria-label={`Responder a ${displayName(profile)}`}
              >
                ↩ Responder{replyCount > 0 && <span>{replyCount}</span>}
              </button>
              {replyCount > 0 && (
                <button
                  type="button"
                  className="club-thread-toggle"
                  onClick={() => onToggleThread?.(post.id)}
                  aria-expanded={threadOpen}
                >
                  {threadOpen ? "Ocultar respuestas" : `Ver ${replyCount} ${replyCount === 1 ? "respuesta" : "respuestas"}`}
                </button>
              )}
            </>
          )}
        </footer>
        {!isReply && threadOpen && replies.length > 0 && (
          <div className="club-post-replies" aria-label={`Respuestas a ${displayName(profile)}`}>
            {replies.map((reply) => (
              <ClubPost
                key={reply.id}
                post={reply}
                currentChapter={currentChapter}
                onReact={onReact}
                onReveal={onReveal}
                canModerate={canModerate}
                onModerate={onModerate}
                revealedPosts={revealedPosts}
                isRevealed={revealedPosts.has(reply.id)}
                currentUserId={currentUserId}
                isMine={String(reply.user_id) === String(currentUserId)}
                isReply
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function ClubComposer({
  clubId,
  channel,
  chapterNumber,
  parentPostId = null,
  replyTo = null,
  onCancelReply,
  onPublished,
}) {
  const [content, setContent] = useState("");
  const [quoteText, setQuoteText] = useState("");
  const [showQuote, setShowQuote] = useState(false);
  const [containsSpoilers, setContainsSpoilers] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createClubPost({
        clubId,
        channel,
        chapterNumber,
        parentPostId,
        content,
        quoteText,
        imageFile,
        containsSpoilers,
      });
      setContent("");
      setQuoteText("");
      setShowQuote(false);
      setImageFile(null);
      setContainsSpoilers(false);
      if (inputRef.current) inputRef.current.value = "";
      await onPublished();
    } catch (nextError) {
      setError(nextError.message || "No se pudo publicar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="club-composer"
      onSubmit={submit}
      aria-label={replyTo ? `Responder a ${displayName(replyTo.profile)}` : "Escribir un mensaje"}
    >
      {replyTo && (
        <div className="club-reply-context">
          <span>Respondiendo a <strong>{displayName(replyTo.profile)}</strong></span>
          <button type="button" onClick={onCancelReply} aria-label="Cancelar respuesta">×</button>
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={replyTo ? "Escribe tu respuesta…" : channel === "chapter" ? "Escribe sobre este capítulo…" : "Comparte una idea con el club…"}
        aria-label={replyTo ? "Escribe tu respuesta" : "Escribe un mensaje"}
        rows={2}
        maxLength={2000}
      />
      {showQuote && (
        <input
          value={quoteText}
          onChange={(event) => setQuoteText(event.target.value)}
          placeholder="Añade una cita del libro…"
          aria-label="Cita del libro"
          maxLength={500}
        />
      )}
      {imageFile && <span className="club-file-chip">Imagen: {imageFile.name}</span>}
      {error && <p className="clubs-form-error">{error}</p>}
      <footer>
        <label className="club-composer-tool">
          ▧ Imagen
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => setImageFile(event.target.files?.[0] || null)}
          />
        </label>
        <button type="button" onClick={() => setShowQuote((value) => !value)} aria-pressed={showQuote}>❞ Cita</button>
        <label className={containsSpoilers ? "is-active" : ""}>
          ◉ Spoiler
          <input
            type="checkbox"
            checked={containsSpoilers}
            onChange={(event) => setContainsSpoilers(event.target.checked)}
          />
        </label>
        <button type="submit" className="club-send-button" disabled={saving || (!content.trim() && !quoteText.trim() && !imageFile)}>
          {saving ? "…" : "➤"}<span className="sr-only">Enviar</span>
        </button>
      </footer>
    </form>
  );
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function meetingTypeLabel(type) {
  return {
    meeting: "Reunión",
    reading: "Lectura conjunta",
    debate: "Debate",
    deadline: "Meta de lectura",
    other: "Otro evento",
  }[type] || "Evento";
}

function chapterForPage(chapters, page) {
  const mapped = (chapters || []).filter((item) => Number(item.end_page) > 0);
  if (!mapped.length) return null;
  const safePage = Math.max(0, Number(page) || 0);
  return (
    mapped.find((item) => Number(item.end_page) >= safePage)?.chapter_number
    || mapped[mapped.length - 1]?.chapter_number
    || 1
  );
}

function toLocalDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function planNextSession(club, referenceTime = Date.now()) {
  if (!club?.reading_plan_enabled || !club?.reading_plan_next_unlock_at) return null;
  const first = new Date(club.reading_plan_next_unlock_at).getTime();
  if (!Number.isFinite(first)) return null;
  const intervalMs = Math.max(1, Number(club.reading_plan_interval_days) || 7) * 86400000;
  if (first > referenceTime) return new Date(first);
  const periods = Math.floor((referenceTime - first) / intervalMs) + 1;
  return new Date(first + periods * intervalMs);
}

function ClubProgressEditor({ club, membership, chapters, onSaved, compact = false }) {
  const totalPages = Math.max(0, Number(club?.book?.pages) || 0);
  const initialPage = Math.max(0, Number(membership?.current_page) || 0);
  const [chapter, setChapter] = useState(Math.max(1, Number(membership?.current_chapter) || 1));
  const [page, setPage] = useState(initialPage);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const hasPageMap = chapters.some((item) => Number(item.end_page) > 0);

  const percentage = totalPages > 0
    ? Math.min(100, Math.round((Math.min(page, totalPages) / totalPages) * 100))
    : Math.max(0, Math.min(100, Number(membership?.progress) || 0));

  function changePage(value) {
    const nextPage = Math.max(0, Number(value) || 0);
    setPage(nextPage);
    const detected = chapterForPage(chapters, nextPage);
    if (detected) setChapter(detected);
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      await updateClubProgress(club.id, chapter, page, percentage);
      setMessage("Tu avance se ha guardado también en Inicio y Mi biblioteca.");
      await onSaved?.();
    } catch (error) {
      setMessage(error.message || "No se pudo guardar el avance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={`club-progress-editor club-progress-editor-v2 ${compact ? "is-compact" : ""}`}>
      <div className="club-progress-editor-heading">
        <div>
          <span className="clubs-kicker">Tu ritmo, sin adelantos</span>
          <h2>Mi progreso</h2>
        </div>
        <strong>{percentage}%</strong>
      </div>
      <div className="club-progress-page-summary">
        <b>{Math.min(page, totalPages || page)}</b>
        <span>{totalPages > 0 ? `de ${totalPages} páginas` : "páginas leídas"}</span>
      </div>
      <i className="club-progress-track"><span style={{ width: `${percentage}%` }} /></i>
      <div className="club-progress-fields">
        <label>
          Página actual
          <input
            type="number"
            min="0"
            max={totalPages || undefined}
            value={page}
            onChange={(event) => changePage(event.target.value)}
          />
        </label>
        <label>
          Capítulo actual
          <select value={chapter} onChange={(event) => setChapter(Number(event.target.value))}>
            {chapters.map((item) => (
              <option key={item.id} value={item.chapter_number}>
                {item.chapter_number}. {item.title || `Capítulo ${item.chapter_number}`}
              </option>
            ))}
          </select>
          {hasPageMap && <small>Calculado automáticamente según la página.</small>}
        </label>
      </div>
      <button type="button" className="clubs-primary-button" onClick={save} disabled={saving}>
        {saving ? "Guardando…" : "Guardar progreso"}
      </button>
      {message && <p className="club-inline-message">{message}</p>}
    </article>
  );
}

function ClubCalendar({ club, meetings, isAdmin, onReload }) {
  const initial = meetings[0]?.starts_at ? new Date(meetings[0].starts_at) : new Date();
  const [viewDate, setViewDate] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(localDateKey(new Date()));
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    title: "Reunión del club",
    startsAt: "",
    endsAt: "",
    location: "",
    description: "",
    eventType: "meeting",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const monthLabel = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(viewDate);
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
  const eventsByDay = useMemo(() => {
    const map = new Map();
    meetings.forEach((meeting) => {
      const key = localDateKey(meeting.starts_at);
      const rows = map.get(key) || [];
      rows.push(meeting);
      map.set(key, rows);
    });
    return map;
  }, [meetings]);
  const selectedEvents = eventsByDay.get(selectedDay) || [];

  function openCreate(day = selectedDay) {
    const date = day || localDateKey(new Date());
    setEditing(null);
    setForm({
      title: "Reunión del club",
      startsAt: `${date}T20:00`,
      endsAt: "",
      location: "",
      description: "",
      eventType: "meeting",
    });
    setFormOpen(true);
    setMessage("");
  }

  function openEdit(meeting) {
    const toLocalInput = (value) => {
      if (!value) return "";
      const date = new Date(value);
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      return local.toISOString().slice(0, 16);
    };
    setEditing(meeting);
    setForm({
      title: meeting.title || "Reunión del club",
      startsAt: toLocalInput(meeting.starts_at),
      endsAt: toLocalInput(meeting.ends_at),
      location: meeting.location || "",
      description: meeting.description || "",
      eventType: meeting.event_type || "meeting",
    });
    setFormOpen(true);
    setMessage("");
  }

  async function saveEvent(event) {
    event.preventDefault();
    if (!form.startsAt) return;
    setSaving(true);
    setMessage("");
    try {
      const values = {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      };
      if (editing) await updateClubMeeting(editing.id, values);
      else await createClubMeeting({ clubId: club.id, ...values });
      setFormOpen(false);
      setEditing(null);
      setMessage(editing ? "Evento actualizado." : "Evento añadido al calendario.");
      await onReload?.();
    } catch (error) {
      setMessage(error.message || "No se pudo guardar el evento.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(meeting) {
    if (!window.confirm(`¿Eliminar “${meeting.title}” del calendario?`)) return;
    try {
      await deleteClubMeeting(meeting.id);
      setMessage("Evento eliminado.");
      await onReload?.();
    } catch (error) {
      setMessage(error.message || "No se pudo eliminar el evento.");
    }
  }

  return (
    <div className="club-calendar-v2">
      <header className="club-calendar-toolbar">
        <div>
          <span className="clubs-kicker">Fechas compartidas</span>
          <h2>Calendario del club</h2>
        </div>
        {isAdmin && <button type="button" className="clubs-primary-button" onClick={() => openCreate()}>＋ Añadir evento</button>}
      </header>
      <div className="club-calendar-shell">
        <section className="club-calendar-month">
          <header>
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}>←</button>
            <h3>{monthLabel}</h3>
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}>→</button>
          </header>
          <div className="club-calendar-weekdays">{["L", "M", "X", "J", "V", "S", "D"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="club-calendar-grid">
            {days.map((day) => {
              const key = localDateKey(day);
              const dayEvents = eventsByDay.get(key) || [];
              const outside = day.getMonth() !== viewDate.getMonth();
              const today = key === localDateKey(new Date());
              return (
                <button
                  type="button"
                  key={key}
                  className={`${selectedDay === key ? "is-selected" : ""} ${outside ? "is-outside" : ""} ${today ? "is-today" : ""}`}
                  onClick={() => setSelectedDay(key)}
                >
                  <b>{day.getDate()}</b>
                  <span>{dayEvents.slice(0, 2).map((item) => <i key={item.id}>{item.title}</i>)}</span>
                  {dayEvents.length > 2 && <small>+{dayEvents.length - 2}</small>}
                </button>
              );
            })}
          </div>
        </section>
        <aside className="club-calendar-day-panel">
          <span className="clubs-kicker">{new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${selectedDay}T12:00:00`))}</span>
          <h3>{selectedEvents.length ? `${selectedEvents.length} evento${selectedEvents.length === 1 ? "" : "s"}` : "Día libre"}</h3>
          {selectedEvents.length === 0 && <p>Este día todavía no tiene ninguna cita del club.</p>}
          {selectedEvents.map((meeting) => (
            <article key={meeting.id}>
              <span>{meetingTypeLabel(meeting.event_type)}</span>
              <h4>{meeting.title}</h4>
              <b>{new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(meeting.starts_at))}</b>
              <p>{meeting.location || "Lugar por confirmar"}</p>
              {meeting.description && <small>{meeting.description}</small>}
              {isAdmin && <div><button type="button" onClick={() => openEdit(meeting)}>Editar</button><button type="button" onClick={() => removeEvent(meeting)}>Eliminar</button></div>}
            </article>
          ))}
          {isAdmin && <button type="button" className="clubs-secondary-button" onClick={() => openCreate(selectedDay)}>Añadir en este día</button>}
        </aside>
      </div>
      {message && <p className="club-inline-message">{message}</p>}

      {formOpen && (
        <div className="clubs-modal-backdrop" onMouseDown={() => setFormOpen(false)}>
          <form className="club-event-form" role="dialog" aria-modal="true" aria-labelledby="club-event-title" onSubmit={saveEvent} onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span className="clubs-kicker">Calendario</span><h2 id="club-event-title">{editing ? "Editar evento" : "Nueva cita"}</h2></div><button type="button" aria-label="Cerrar" onClick={() => setFormOpen(false)}>×</button></header>
            <label>Título<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required /></label>
            <div className="club-form-columns">
              <label>Empieza<input type="datetime-local" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} required /></label>
              <label>Termina<input type="datetime-local" value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} /></label>
            </div>
            <div className="club-form-columns">
              <label>Tipo<select value={form.eventType} onChange={(event) => setForm((current) => ({ ...current, eventType: event.target.value }))}><option value="meeting">Reunión</option><option value="reading">Lectura conjunta</option><option value="debate">Debate</option><option value="deadline">Meta de lectura</option><option value="other">Otro</option></select></label>
              <label>Lugar o enlace<input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} /></label>
            </div>
            <label>Descripción<textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
            <footer><button type="button" onClick={() => setFormOpen(false)}>Cancelar</button><button type="submit" className="clubs-primary-button" disabled={saving}>{saving ? "Guardando…" : "Guardar evento"}</button></footer>
          </form>
        </div>
      )}
    </div>
  );
}

function ClubSettingsPanel({ club, chapters, membership, onReload, onClose, onExitClub }) {
  const isOwner = membership?.role === "owner";
  const isAdmin = isOwner || membership?.role === "moderator";
  const bannerInput = useRef(null);
  const iconInput = useRef(null);
  const initialInterval = Math.max(1, Number(club.reading_plan_interval_days) || 7);
  const [form, setForm] = useState({
    name: club.name || "",
    description: club.description || "",
    visibility: club.visibility || "public",
    bannerUrl: club.banner_url || "",
    iconUrl: club.icon_url || "",
    rulesText: (club.rules || []).join("\n"),
  });
  const [chapterRows, setChapterRows] = useState(() =>
    chapters.map((item) => ({
      key: String(item.id || item.chapter_number),
      title: item.title || `Capítulo ${item.chapter_number}`,
      endPage: item.end_page || "",
    })),
  );
  const [plan, setPlan] = useState({
    enabled: Boolean(club.reading_plan_enabled),
    unlockedChapter: Math.max(1, Number(club.reading_plan_unlocked_chapter) || 1),
    nextUnlockAt: toLocalDateTimeInput(club.reading_plan_next_unlock_at),
    frequency: initialInterval === 7 ? "weekly" : initialInterval === 14 ? "fortnightly" : "custom",
    intervalDays: initialInterval,
    chaptersPerPeriod: Math.max(1, Number(club.reading_plan_chapters_per_period) || 1),
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [message, setMessage] = useState("");

  function changeFrequency(frequency) {
    setPlan((current) => ({
      ...current,
      frequency,
      intervalDays: frequency === "weekly" ? 7 : frequency === "fortnightly" ? 14 : current.intervalDays,
    }));
  }

  function updateChapter(index, field, value) {
    setChapterRows((rows) => rows.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )));
  }

  function addChapter() {
    setChapterRows((rows) => [
      ...rows,
      { key: crypto.randomUUID(), title: `Capítulo ${rows.length + 1}`, endPage: "" },
    ]);
  }

  function removeChapter(index) {
    setChapterRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  }

  async function upload(kind, file) {
    if (!file) return;
    setUploading(kind);
    setMessage("");
    try {
      const url = await uploadClubAsset(club.id, file, kind);
      setForm((current) => ({ ...current, [kind === "banner" ? "bannerUrl" : "iconUrl"]: url }));
      setMessage("Imagen preparada. Pulsa Guardar cambios para aplicarla.");
    } catch (error) {
      setMessage(error.message || "No se pudo subir la imagen.");
    } finally {
      setUploading("");
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await updateClubSettings({
        clubId: club.id,
        name: form.name,
        description: form.description,
        visibility: form.visibility,
        bannerUrl: form.bannerUrl,
        iconUrl: form.iconUrl,
        rules: form.rulesText.split("\n"),
      });
      await replaceClubChapters(club.id, chapterRows);
      await updateClubReadingPlan({
        clubId: club.id,
        enabled: plan.enabled,
        unlockedChapter: Math.min(Math.max(1, plan.unlockedChapter), Math.max(1, chapterRows.length)),
        nextUnlockAt: plan.enabled && plan.nextUnlockAt
          ? new Date(plan.nextUnlockAt).toISOString()
          : null,
        intervalDays: plan.frequency === "weekly" ? 7 : plan.frequency === "fortnightly" ? 14 : plan.intervalDays,
        chaptersPerPeriod: plan.chaptersPerPeriod,
      });
      setMessage("Ajustes, capítulos y plan de lectura guardados.");
      await onReload?.();
    } catch (error) {
      setMessage(error.message || "No se pudieron guardar los ajustes.");
    } finally {
      setSaving(false);
    }
  }

  async function leave() {
    if (!window.confirm("¿Abandonar el club? Perderás los marcapáginas y logros obtenidos dentro de él.")) return;
    try {
      await leaveReadingClub(club.id);
      onExitClub?.("Has abandonado el club.");
    } catch (error) {
      setMessage(error.message || "No se pudo abandonar el club.");
    }
  }

  async function removeClub() {
    const confirmation = window.prompt(`Escribe ${club.name} para eliminar definitivamente el club.`);
    if (confirmation !== club.name) return;
    try {
      await deleteReadingClub(club.id);
      onExitClub?.("El club se ha eliminado.");
    } catch (error) {
      setMessage(error.message || "No se pudo eliminar el club.");
    }
  }

  return (
    <div className="clubs-modal-backdrop" onMouseDown={onClose}>
      <form className="club-settings-panel club-settings-panel-v3" role="dialog" aria-modal="true" aria-labelledby="club-settings-title" onSubmit={saveSettings} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span className="clubs-kicker">Gestión del club</span><h2 id="club-settings-title">{isAdmin ? "Ajustes" : "Opciones"}</h2></div>
          <button type="button" aria-label="Cerrar" onClick={onClose}>×</button>
        </header>
        {isAdmin ? (
          <>
            <section className="club-settings-section">
              <div className="club-image-settings">
                <button type="button" onClick={() => bannerInput.current?.click()}>{uploading === "banner" ? "Subiendo…" : "▣ Cambiar portada"}</button>
                <button type="button" onClick={() => iconInput.current?.click()}>{uploading === "icon" ? "Subiendo…" : "◉ Cambiar icono"}</button>
                <input ref={bannerInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => upload("banner", event.target.files?.[0])} />
                <input ref={iconInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => upload("icon", event.target.files?.[0])} />
              </div>
              {isOwner ? (
                <>
                  <label>Nombre<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label>
                  <label>Descripción<textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
                  <label>Privacidad<select value={form.visibility} onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value }))}><option value="public">Público</option><option value="private">Privado</option></select></label>
                </>
              ) : (
                <p className="club-permission-note">Como moderadora puedes gestionar imágenes, normas, capítulos, sesiones y conversaciones. La creadora conserva el nombre, la privacidad, el libro y los roles.</p>
              )}
              <label>Normas del club <small>Una norma por línea</small><textarea rows="6" value={form.rulesText} onChange={(event) => setForm((current) => ({ ...current, rulesText: event.target.value }))} /></label>
            </section>

            <section className="club-settings-section club-reading-plan-settings">
              <header>
                <div><span className="clubs-kicker">Ritmo compartido</span><h3>Sesiones y desbloqueo</h3></div>
                <label className="club-switch"><input type="checkbox" checked={plan.enabled} onChange={(event) => setPlan((current) => ({ ...current, enabled: event.target.checked }))} /><span />Activar plan</label>
              </header>
              <p>Determina cuántos capítulos se abren ahora y cuántos se añadirán automáticamente en cada sesión.</p>
              <div className="club-form-columns">
                <label>Capítulos abiertos ahora<input type="number" min="1" max={Math.max(1, chapterRows.length)} value={plan.unlockedChapter} onChange={(event) => setPlan((current) => ({ ...current, unlockedChapter: Math.max(1, Number(event.target.value) || 1) }))} /></label>
                <label>Capítulos por periodo<input type="number" min="1" max="50" value={plan.chaptersPerPeriod} onChange={(event) => setPlan((current) => ({ ...current, chaptersPerPeriod: Math.max(1, Number(event.target.value) || 1) }))} /></label>
              </div>
              <div className="club-form-columns">
                <label>Próxima sesión<input type="datetime-local" value={plan.nextUnlockAt} onChange={(event) => setPlan((current) => ({ ...current, nextUnlockAt: event.target.value }))} /></label>
                <label>Frecuencia<select value={plan.frequency} onChange={(event) => changeFrequency(event.target.value)}><option value="weekly">Cada semana</option><option value="fortnightly">Cada quince días</option><option value="custom">Intervalo personalizado</option></select></label>
              </div>
              {plan.frequency === "custom" && <label>Días entre sesiones<input type="number" min="1" max="365" value={plan.intervalDays} onChange={(event) => setPlan((current) => ({ ...current, intervalDays: Math.max(1, Number(event.target.value) || 1) }))} /></label>}
            </section>

            <section className="club-settings-section club-chapter-editor-v3">
              <header><div><span className="clubs-kicker">Mapa del libro</span><h3>Capítulos y páginas</h3></div><button type="button" onClick={addChapter}>＋ Añadir capítulo</button></header>
              <p>La página final es opcional. Si la completas, Librélula detectará automáticamente el capítulo al guardar una página.</p>
              <div className="club-chapter-editor-list">
                {chapterRows.map((row, index) => (
                  <div key={row.key}>
                    <b>{index + 1}</b>
                    <input aria-label={`Nombre del capítulo ${index + 1}`} value={row.title} onChange={(event) => updateChapter(index, "title", event.target.value)} />
                    <label>Termina en pág.<input type="number" min="1" value={row.endPage} onChange={(event) => updateChapter(index, "endPage", event.target.value)} /></label>
                    <button type="button" onClick={() => removeChapter(index)} disabled={chapterRows.length <= 1} aria-label={`Eliminar capítulo ${index + 1}`}>×</button>
                  </div>
                ))}
              </div>
            </section>

            <button type="submit" className="clubs-primary-button" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button>
          </>
        ) : <p>Desde aquí puedes abandonar el club. Tus mensajes se conservarán, pero perderás los marcapáginas y logros exclusivos del club.</p>}
        {message && <p className="club-inline-message">{message}</p>}
        <footer className="club-danger-zone">
          {!isOwner && <button type="button" onClick={leave}>Abandonar club</button>}
          {isOwner && <button type="button" className="is-danger" onClick={removeClub}>Eliminar club definitivamente</button>}
        </footer>
      </form>
    </div>
  );
}

function ClubMembersPanel({ club, membership, members, achievements = [], onReload, onOpenProfile }) {
  const isOwner = membership?.role === "owner";
  const isAdmin = isOwner || membership?.role === "moderator";
  const [message, setMessage] = useState("");

  async function changeRole(member) {
    const nextRole = member.role === "moderator" ? "member" : "moderator";
    try {
      await setClubMemberRole(club.id, member.user_id, nextRole);
      setMessage(nextRole === "moderator" ? "Moderadora añadida." : "Rol de moderación retirado.");
      await onReload?.();
    } catch (error) {
      setMessage(error.message || "No se pudo cambiar el rol.");
    }
  }

  async function remove(member) {
    if (!window.confirm(`¿Retirar a ${displayName(member.profile)} del club? Perderá sus logros del club.`)) return;
    try {
      await removeClubMember(club.id, member.user_id);
      setMessage("La persona ya no pertenece al club.");
      await onReload?.();
    } catch (error) {
      setMessage(error.message || "No se pudo retirar a la persona.");
    }
  }

  async function award(member) {
    const label = window.prompt(`Nombre del marcapáginas para ${displayName(member.profile)}:`);
    if (!label?.trim()) return;
    const description = window.prompt("Descripción opcional del marcapáginas:") || "";
    try {
      await awardClubBookmark(club.id, member.user_id, label, description);
      setMessage("Marcapáginas concedido.");
      await onReload?.();
    } catch (error) {
      setMessage(error.message || "No se pudo conceder el marcapáginas.");
    }
  }

  async function revoke(achievement) {
    if (!window.confirm(`¿Retirar el marcapáginas “${achievement.label}”?`)) return;
    try {
      await revokeClubBookmark(achievement.id);
      setMessage("Marcapáginas retirado.");
      await onReload?.();
    } catch (error) {
      setMessage(error.message || "No se pudo retirar el marcapáginas.");
    }
  }

  return (
    <div className="club-simple-panel club-members-panel-v2 club-members-panel-v3">
      <span className="clubs-kicker">Personas que comparten esta historia</span>
      <h2>{members.length} miembros</h2>
      <p className="club-panel-intro">Pulsa sobre una persona para visitar su perfil lector.</p>
      {message && <p className="club-inline-message">{message}</p>}
      <div className="club-members-grid club-members-grid-v2 club-members-grid-v3">
        {members.map((member) => {
          const canRemove =
            isAdmin
            && member.role !== "owner"
            && !(membership?.role === "moderator" && member.role === "moderator");
          const progress = memberProgress(member, club.book?.pages);
          const roleLabel =
            member.role === "owner"
              ? "Creadora"
              : member.role === "moderator"
                ? "Moderadora"
                : "Miembro";
          const memberAchievements = achievements.filter((item) => item.user_id === member.user_id);
          return (
            <article key={member.user_id}>
              <button
                type="button"
                className="club-member-profile-button"
                onClick={() => onOpenProfile?.(member.user_id, club.id)}
              >
                <AvatarImage profile={member.profile} />
                <div className="club-member-main">
                  <div className="club-member-identity">
                    <h3>{displayName(member.profile)}</h3>
                    <p>@{member.profile?.username || "lectora"}</p>
                    <small>{roleLabel}</small>
                  </div>
                  <div className="club-member-progress-v3">
                    <i><em style={{ width: `${progress}%` }} /></i>
                    <small>
                      <span>Capítulo {member.current_chapter || 1}</span>
                      <span>{member.current_page || 0} {club.book?.pages ? `de ${club.book.pages}` : ""} páginas</span>
                    </small>
                  </div>
                </div>
                <b className="club-member-percentage">{progress}%</b>
              </button>

              {memberAchievements.length > 0 && (
                <div className="club-member-bookmarks">
                  {memberAchievements.map((achievement) => (
                    <span key={achievement.id}>
                      ❧ {achievement.label}
                      {isAdmin && <button type="button" onClick={() => revoke(achievement)} aria-label={`Retirar ${achievement.label}`}>×</button>}
                    </span>
                  ))}
                </div>
              )}

              {(isAdmin || canRemove) && (
                <footer>
                  {isAdmin && <button type="button" onClick={() => award(member)}>Dar marcapáginas</button>}
                  {isOwner && member.role !== "owner" && (
                    <button type="button" onClick={() => changeRole(member)}>
                      {member.role === "moderator" ? "Quitar moderación" : "Hacer moderadora"}
                    </button>
                  )}
                  {canRemove && <button type="button" onClick={() => remove(member)}>Retirar</button>}
                </footer>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ClubBookmarks({ achievements, membership }) {
  const mine = achievements.filter((item) => item.user_id === membership?.user_id);
  return (
    <div className="club-simple-panel club-bookmarks-panel">
      <span className="clubs-kicker">Recuerdos de esta lectura compartida</span>
      <h2>Marcapáginas del club</h2>
      <p>Los logros se convertirán en marcapáginas coleccionables. La estructura ya está preparada, pero su colección se diseñará más adelante.</p>
      {mine.length > 0 ? <div className="club-bookmark-grid">{mine.map((item) => <article key={item.id}><span>❧</span><h3>{item.label}</h3><p>{item.description}</p></article>)}</div> : <div className="club-bookmark-placeholder"><span>❧</span><strong>Tu primer marcapáginas aparecerá aquí</strong><small>Se conservará en tu perfil mientras pertenezcas al club.</small></div>}
    </div>
  );
}

function readingDate(value, options = {}) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...options,
  }).format(date);
}

function ShelfStars({ value, count = null, compact = false }) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0));
  const width = `${(rating / 5) * 100}%`;
  const label = rating > 0 ? rating.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null;

  return (
    <span className={`club-shelf-stars${compact ? " is-compact" : ""}`} aria-label={rating > 0 ? `${label} de 5 estrellas` : "Sin valoraciones"}>
      <span className="club-shelf-stars-glyphs" aria-hidden="true">
        <span>★★★★★</span>
        <b style={{ width }}>★★★★★</b>
      </span>
      {label ? <em>{label}{count !== null ? ` · ${count}` : ""}</em> : <em>Sin valorar</em>}
    </span>
  );
}

function FinishClubReadingPanel({ club, onClose, onFinished, mode = "finish" }) {
  const isStartMode = mode === "start";
  const [bookSearch, setBookSearch] = useState("");
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [chapterCount, setChapterCount] = useState(10);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const rows = await searchClubBooks(bookSearch);
        if (!cancelled) {
          setBooks(rows.filter((book) => String(book.id) !== String(club.current_book_id || "")));
        }
      } catch (nextError) {
        if (!cancelled) setError(nextError.message || "No se pudieron buscar libros.");
      } finally {
        if (!cancelled) setLoadingBooks(false);
      }
    }, bookSearch ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bookSearch, club.current_book_id]);

  async function submit(event) {
    event.preventDefault();
    if (isStartMode && !selectedBook) {
      setError("Elige el libro con el que empezará la nueva lectura.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (isStartMode) {
        await startClubReading({
          clubId: club.id,
          bookId: selectedBook.id,
          chapterCount,
        });
      } else {
        await finishClubReading({
          clubId: club.id,
          nextBookId: selectedBook?.id || null,
          chapterCount,
        });
      }
      await onFinished?.(selectedBook || null);
    } catch (nextError) {
      setError(nextError.message || (isStartMode ? "No se pudo empezar la nueva lectura." : "No se pudo cerrar esta lectura."));
    } finally {
      setSaving(false);
    }
  }

  const primaryLabel = isStartMode
    ? (saving ? "Empezando la lectura…" : "Empezar esta lectura")
    : selectedBook
      ? (saving ? "Cerrando y preparando…" : "Guardar y empezar la siguiente")
      : (saving ? "Guardando en la estantería…" : "Guardar en la estantería");

  return (
    <div className="clubs-modal-backdrop" onMouseDown={onClose}>
        <section className="club-finish-reading-dialog" role="dialog" aria-modal="true" aria-labelledby="club-finish-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="clubs-kicker">{isStartMode ? "Abrir una historia nueva" : "Cerrar una historia"}</span>
            <h2 id="club-finish-title">{isStartMode ? "Elegir la próxima lectura" : "Terminar la lectura del club"}</h2>
          </div>
          <button type="button" className="clubs-icon-button" onClick={onClose} aria-label="Cerrar">×</button>
        </header>

        {!isStartMode && club.book && (
          <div className="club-finish-current-book">
            <BookCover book={club.book} className="club-finish-current-cover" />
            <div>
              <small>Pasará a la estantería del club</small>
              <strong>{club.book.title}</strong>
              <span>{club.book.author}</span>
            </div>
          </div>
        )}

        <p className="club-finish-explainer">
          {isStartMode
            ? "Cuando el club ya tenga clara su siguiente lectura, elígela aquí. Empezará con un progreso nuevo y sus propios capítulos."
            : "Guardaremos esta lectura, quién participó y sus reseñas. Puedes elegir el siguiente libro ahora o dejar al club entre lecturas y decidirlo más adelante."}
        </p>

        <form onSubmit={submit}>
          <fieldset className="clubs-book-picker club-next-book-picker">
            <legend>{isStartMode ? "¿Qué vamos a leer?" : "Siguiente lectura · opcional"}</legend>
            {!isStartMode && (
              <p className="club-next-book-optional-note">Si todavía no lo habéis decidido, deja esta parte vacía y guarda el libro actual en la estantería.</p>
            )}
            <input
              type="search"
              value={bookSearch}
              onChange={(event) => {
                setLoadingBooks(true);
                setBookSearch(event.target.value);
              }}
              placeholder="Buscar por título, autora o ISBN…"
            />
            <div className="clubs-book-results club-next-book-results">
              {loadingBooks && <p>Buscando en el catálogo…</p>}
              {!loadingBooks && books.length === 0 && <p>No encontramos otra lectura con esa búsqueda.</p>}
              {books.map((book) => (
                <button
                  type="button"
                  key={book.id}
                  className={selectedBook?.id === book.id ? "is-selected" : ""}
                  onClick={() => setSelectedBook((current) => current?.id === book.id ? null : book)}
                >
                  <BookCover book={book} />
                  <span><strong>{book.title}</strong><small>{book.author}</small></span>
                  <i aria-hidden="true">{selectedBook?.id === book.id ? "✓" : "+"}</i>
                </button>
              ))}
            </div>
          </fieldset>

          {selectedBook && (
            <label className="club-next-chapters-field">
              Capítulos iniciales de la nueva lectura
              <input
                type="number"
                min="1"
                max="160"
                value={chapterCount}
                onChange={(event) => setChapterCount(Math.max(1, Number(event.target.value) || 1))}
              />
              <small>Después podrás renombrarlos y añadir las páginas finales desde Ajustes.</small>
            </label>
          )}

          {error && <p className="clubs-form-error">{error}</p>}

          <footer>
            <button type="button" className="clubs-secondary-button" onClick={onClose}>{isStartMode ? "Ahora no" : "Seguir leyendo"}</button>
            <button type="submit" className="clubs-primary-button" disabled={saving || (isStartMode && !selectedBook)}>
              {primaryLabel}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function ClubShelfReadingDetail({ reading, onClose, onSelectBook }) {
  const [expandedReviews, setExpandedReviews] = useState(() => new Set());
  if (!reading) return null;
  const participants = reading.reviews || [];
  const withWrittenReview = participants.filter((item) => String(item.review || "").trim());

  function toggleReview(key) {
    setExpandedReviews((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="clubs-modal-backdrop" onMouseDown={onClose}>
        <section className="club-shelf-reading-dialog" role="dialog" aria-modal="true" aria-labelledby="club-shelf-reading-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="clubs-kicker">La memoria de esta lectura</span>
            <h2 id="club-shelf-reading-title">{reading.book.title}</h2>
            <p>{reading.book.author}</p>
          </div>
          <button type="button" className="clubs-icon-button" onClick={onClose} aria-label="Cerrar">×</button>
        </header>

        <div className="club-shelf-reading-hero">
          <BookCover book={reading.book} className="club-shelf-reading-cover" />
          <div>
            <span>Terminada {reading.finished_at ? `el ${readingDate(reading.finished_at)}` : "por el club"}</span>
            <ShelfStars value={reading.avg_rating} count={reading.rating_count} />
            <p>{reading.participant_count} {reading.participant_count === 1 ? "persona participó" : "personas participaron"} en esta lectura.</p>
          </div>
        </div>

        <section className="club-shelf-participant-reviews">
          <header>
            <div>
              <span className="clubs-kicker">Después de la última página</span>
              <h3>Reseñas y puntuaciones del club</h3>
            </div>
            <span>{withWrittenReview.length} {withWrittenReview.length === 1 ? "reseña" : "reseñas"}</span>
          </header>

          <div className="club-shelf-participant-list">
            {participants.map((participant) => (
              <article key={`${reading.id}-${participant.profile_id}`}>
                <AvatarImage profile={participant.profile} />
                <div>
                  <header>
                    <strong>{displayName(participant.profile)}</strong>
                    {participant.score ? <ShelfStars value={participant.score} compact /> : <span className="club-shelf-unrated">Sin puntuación</span>}
                  </header>
                  {String(participant.review || "").trim() ? (() => {
                    const reviewText = String(participant.review || "").trim();
                    const reviewKey = `${reading.id}-${participant.profile_id}`;
                    const canCollapse = reviewText.length > 260;
                    const isExpanded = expandedReviews.has(reviewKey);

                    if (!canCollapse) return <p>{reviewText}</p>;

                    return (
                      <button
                        type="button"
                        className={`club-shelf-review-copy${isExpanded ? " is-expanded" : ""}`}
                        onClick={() => toggleReview(reviewKey)}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? "Recoger reseña" : `Leer la reseña completa de ${displayName(participant.profile)}`}
                      >
                        <p>{reviewText}</p>
                        <span aria-hidden="true">{isExpanded ? "Recoger" : "···"}</span>
                      </button>
                    );
                  })()
                    : <p className="is-empty-review">Participó en esta lectura, pero todavía no ha escrito una reseña final.</p>}
                </div>
              </article>
            ))}
            {participants.length === 0 && (
              <p className="club-shelf-no-reviews">No hay participantes guardadas para esta lectura.</p>
            )}
          </div>
        </section>

        <footer>
          <button type="button" className="clubs-secondary-button" onClick={() => onSelectBook?.(reading.book)}>Ver ficha pública del libro</button>
          <button type="button" className="clubs-primary-button" onClick={onClose}>Volver a la estantería</button>
        </footer>
      </section>
    </div>
  );
}

function ClubShelf({ club, membership, library = [], members = [], onReload, onSelectBook }) {
  const [finishOpen, setFinishOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [selectedReading, setSelectedReading] = useState(null);
  const [message, setMessage] = useState("");
  const isOwner = membership?.role === "owner";
  const canChooseNextReading = isOwner || membership?.role === "moderator";
  const currentReading = library.find((reading) => reading.status === "current") || null;
  const completedReadings = library.filter((reading) => reading.status === "completed");
  const averageProgress = Math.round(
    members.reduce((sum, member) => sum + Number(member.progress || 0), 0) / Math.max(1, members.length),
  );

  async function finished(nextBook) {
    setFinishOpen(false);
    setStartOpen(false);
    setMessage(nextBook
      ? `El club empieza ahora “${nextBook.title}”. La lectura anterior ya está en la estantería.`
      : `“${club.book?.title || "La lectura"}” ya está en la estantería. Podéis elegir la próxima cuando queráis.`);
    await onReload?.();
  }

  return (
    <div className="club-shelf-tab">
      {club.book ? (
        <section className="club-shelf-current">
          <div className="club-shelf-current-copy">
            <span className="clubs-kicker">Leyendo ahora</span>
            <h2>{club.book.title}</h2>
            <p>{club.book.author}</p>
            <div className="club-shelf-current-stats">
              <span><strong>{members.length}</strong> lectoras</span>
              <span><strong>{averageProgress}%</strong> avance medio</span>
              {currentReading?.started_at && <span>Desde <strong>{readingDate(currentReading.started_at, { year: undefined })}</strong></span>}
            </div>
            <div className="club-shelf-current-actions">
              <button type="button" className="clubs-secondary-button" onClick={() => onSelectBook?.(club.book)}>Ver ficha del libro</button>
              {isOwner && <button type="button" className="clubs-primary-button" onClick={() => setFinishOpen(true)}>✓ Dar esta lectura por terminada</button>}
            </div>
            {!isOwner && <small>La creadora del club decide cuándo se cierra una lectura.</small>}
          </div>
          <BookCover book={club.book} className="club-shelf-current-cover" onOpen={onSelectBook} />
        </section>
      ) : (
        <section className="club-shelf-current club-shelf-between-readings">
          <div className="club-shelf-current-copy">
            <span className="clubs-kicker">Próxima lectura</span>
            <h2>Aún no tenemos libro para nuestra próxima reunión</h2>
            <p>La lectura anterior ya descansa en la estantería. Podemos decidir con calma qué historia viene después.</p>
            {canChooseNextReading
              ? <button type="button" className="clubs-primary-button" onClick={() => setStartOpen(true)}>＋ Elegir próxima lectura</button>
              : <small>Cuando la creadora o una moderadora elija un nuevo libro, aparecerá aquí.</small>}
          </div>
          <div className="club-shelf-between-mark" aria-hidden="true">⌑</div>
        </section>
      )}

      {message && <p className="club-inline-message">{message}</p>}

      <section className="club-shelf-history">
        <header>
          <div><span className="clubs-kicker">La memoria del club</span><h2>Libros que hemos leído</h2></div>
          <span>{completedReadings.length} {completedReadings.length === 1 ? "lectura" : "lecturas"}</span>
        </header>

        {completedReadings.length === 0 ? (
          <div className="club-shelf-empty">
            <span>⌑</span>
            <h3>La primera balda está esperando</h3>
            <p>Cuando la creadora cierre la lectura actual, aparecerá aquí con las valoraciones y reseñas de quienes la compartieron.</p>
          </div>
        ) : (
          <div className="club-bookshelf-display">
            <div className="club-bookshelf-row">
              {completedReadings.map((reading) => (
                <button
                  type="button"
                  className="club-bookshelf-volume"
                  key={reading.id}
                  onClick={() => setSelectedReading(reading)}
                  aria-label={`Abrir reseñas del club sobre ${reading.book.title}`}
                >
                  <span className="club-bookshelf-cover-wrap">
                    <BookCover book={reading.book} className="club-bookshelf-cover" />
                    <span className="club-bookshelf-rating-badge">
                      <ShelfStars value={reading.avg_rating} />
                    </span>
                  </span>
                  <strong title={reading.book.title}>{reading.book.title}</strong>
                </button>
              ))}
            </div>
            <div className="club-bookshelf-board" aria-hidden="true" />
          </div>
        )}
      </section>

      {finishOpen && (
        <FinishClubReadingPanel
          club={club}
          onClose={() => setFinishOpen(false)}
          onFinished={finished}
        />
      )}
      {startOpen && (
        <FinishClubReadingPanel
          club={club}
          mode="start"
          onClose={() => setStartOpen(false)}
          onFinished={finished}
        />
      )}
      {selectedReading && (
        <ClubShelfReadingDetail
          reading={selectedReading}
          onClose={() => setSelectedReading(null)}
          onSelectBook={onSelectBook}
        />
      )}
    </div>
  );
}

function ClubInside({ data, tab, onTab, onBack, onReload, onSelectBook, onInvite, onOpenProfile, onExitClub }) {
  const { club, membership, profile, members, chapters, posts, meetings, achievements = [], library = [] } = data;
  const currentChapter = Math.max(1, Number(membership?.current_chapter) || 1);
  const clubUnlockedChapter = Math.max(1, Number(club?.unlocked_chapter) || chapters.length || 1);
  const isAdmin = membership?.role === "owner" || membership?.role === "moderator";
  const accessibleChapter = isAdmin ? clubUnlockedChapter : Math.min(currentChapter, clubUnlockedChapter);
  const [selectedChapter, setSelectedChapter] = useState(() => Math.min(currentChapter, clubUnlockedChapter));
  const [revealed, setRevealed] = useState(() => new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [openThreads, setOpenThreads] = useState(() => new Set());
  const [mobileChatListOpen, setMobileChatListOpen] = useState(false);
  const [conversationPanel, setConversationPanel] = useState(null);
  const [notice, setNotice] = useState("");
  const selectedChapterInfo = chapters.find((item) => item.chapter_number === selectedChapter);
  const visibleChapters = chapters.filter((item) => item.chapter_number <= clubUnlockedChapter + 1);
  const [renderReferenceTime] = useState(() => Date.now());
  const futureMeetings = meetings.filter((item) => new Date(item.starts_at).getTime() >= renderReferenceTime - 3600000);
  const meeting = futureMeetings[0] || null;
  const nextPlanSession = planNextSession(club, renderReferenceTime);
  const collectiveProgress = Math.round(members.reduce((sum, item) => sum + Number(item.progress || 0), 0) / Math.max(1, members.length));
  const chatChannel = tab === "chapters" ? "chapter" : "general";
  const myProgress = Math.max(0, Math.min(100, Number(membership?.progress) || 0));

  const chapterPosts = useMemo(
    () => posts.filter((post) => post.channel === "chapter" && post.chapter_number === selectedChapter),
    [posts, selectedChapter],
  );
  const generalPosts = useMemo(() => posts.filter((post) => post.channel === "general"), [posts]);
  const latestGeneralPostId = generalPosts.at(-1)?.id || null;
  const [readThroughGeneralPostId, setReadThroughGeneralPostId] = useState(null);
  const serverGeneralUnreadCount = Math.max(0, Number(data.generalUnreadCount) || 0);
  const generalUnreadCount = latestGeneralPostId
    && String(readThroughGeneralPostId) === String(latestGeneralPostId)
    ? 0
    : serverGeneralUnreadCount;

  useEffect(() => {
    if (chatChannel !== "general" || generalUnreadCount <= 0) return undefined;
    let cancelled = false;

    async function markRead() {
      try {
        await markClubGeneralChatRead(club.id);
        if (!cancelled) setReadThroughGeneralPostId(latestGeneralPostId);
      } catch {
        // El chat puede seguir usándose aunque falle la marca de lectura.
      }
    }

    markRead();
    return () => {
      cancelled = true;
    };
  }, [chatChannel, club.id, generalUnreadCount, latestGeneralPostId]);

  async function react(postId, reaction) {
    try {
      await toggleClubPostReaction(postId, reaction);
      await onReload();
    } catch (error) {
      setNotice(error.message || "No se pudo guardar la reacción.");
    }
  }

  async function moderate(post, action) {
    if (action === "delete" && !window.confirm("¿Eliminar este mensaje del club?")) return;
    try {
      await moderateClubPost(post.id, action);
      setNotice(action === "delete" ? "Mensaje eliminado." : action === "spoiler" ? "Mensaje marcado como spoiler." : "Marca de spoiler retirada.");
      await onReload();
    } catch (error) {
      setNotice(error.message || "No se pudo moderar el mensaje.");
    }
  }

  function reveal(postId) {
    setRevealed((current) => new Set(current).add(postId));
  }

  const feed = chatChannel === "general" ? generalPosts : chapterPosts;
  const rootFeed = useMemo(
    () => feed.filter((post) => !post.parent_post_id),
    [feed],
  );
  const repliesByPostId = useMemo(() => {
    const grouped = new Map();
    feed.forEach((post) => {
      if (!post.parent_post_id) return;
      const key = String(post.parent_post_id);
      const replies = grouped.get(key) || [];
      replies.push(post);
      grouped.set(key, replies);
    });
    return grouped;
  }, [feed]);

  function toggleThread(postId) {
    setOpenThreads((current) => {
      const next = new Set(current);
      const key = String(postId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function publishClubPost() {
    setReplyingTo(null);
    setOpenThreads(new Set());
    await onReload();
  }

  function openConversationPanel(panel) {
    setReplyingTo(null);
    setOpenThreads(new Set());
    setMobileChatListOpen(false);
    setConversationPanel(panel);
  }

  function selectChat(conversation) {
    setReplyingTo(null);
    setOpenThreads(new Set());
    setMobileChatListOpen(false);
    if (conversation.channel === "general") {
      onTab?.("general");
      return;
    }
    setSelectedChapter(conversation.chapterNumber);
    onTab?.("chapters");
  }

  const chatTitle = chatChannel === "general"
    ? "Chat general"
    : `Capítulo ${selectedChapter} · ${selectedChapterInfo?.title || "Conversación"}`;
  const chatSubtitle = chatChannel === "general"
    ? `${members.length} miembros · conversación abierta`
    : `${members.filter((member) => member.current_chapter === selectedChapter).length} personas leyendo · sin spoilers`;

  return (
    <section className="club-inside club-inside-v2 club-inside-conversation">
      <header className="club-conversation-topbar">
        <button type="button" className="clubs-back-button" onClick={onBack}>← Todos mis clubes</button>
        <div className="club-conversation-identity">
          <ClubIcon club={club} className="club-conversation-avatar" />
          <div>
            <span className="clubs-kicker">{club.visibility === "private" ? "Club privado" : "Club público"}</span>
            <h1>{club.name}</h1>
            <p>{members.length} miembros · una conversación para toda la lectura</p>
          </div>
        </div>
        <div className="club-conversation-actions">
          <button type="button" onClick={() => openConversationPanel("about")} aria-label="Abrir información del club" title="Información">ⓘ</button>
          <button type="button" onClick={() => onInvite(club)} aria-label="Invitar al club" title="Invitar">♙</button>
          <button type="button" onClick={() => setSettingsOpen(true)} aria-label={isAdmin ? "Abrir ajustes" : "Abrir opciones"} title={isAdmin ? "Ajustes" : "Opciones"}>⚙</button>
        </div>
      </header>

      {notice && <div className="clubs-notice is-inline">{notice}<button type="button" onClick={() => setNotice("")}>×</button></div>}

      <div className="club-chat-shell">
          <ClubChatList
            club={club}
            chapters={chapters}
            visibleChapters={visibleChapters}
            posts={posts}
            members={members}
            selectedChannel={chatChannel}
            selectedChapter={selectedChapter}
            generalUnreadCount={generalUnreadCount}
            currentChapter={currentChapter}
            unlockedChapter={clubUnlockedChapter}
            isAdmin={isAdmin}
            myProgress={myProgress}
            collectiveProgress={collectiveProgress}
            meeting={meeting}
            nextPlanSession={nextPlanSession}
            libraryCount={library.length}
            achievementCount={achievements.filter((item) => item.user_id === membership?.user_id).length}
            mobileOpen={mobileChatListOpen}
            onCloseMobile={() => setMobileChatListOpen(false)}
            onSelect={selectChat}
            onOpenPanel={openConversationPanel}
            onSelectBook={onSelectBook}
          />
          <main className="club-chat-window">
            <header className="club-chat-header">
              <button
                type="button"
                className="club-chat-list-toggle"
                onClick={() => setMobileChatListOpen(true)}
                aria-label="Abrir conversaciones"
              >
                <span aria-hidden="true">☰</span>
                <span>Conversaciones</span>
              </button>
              <ChatAvatar club={club} chapterNumber={chatChannel === "chapter" ? selectedChapter : null} />
              <div className="club-chat-header-copy">
                <span className="clubs-kicker">{chatChannel === "general" ? club.name : "Lectura por capítulos"}</span>
                <h2>{chatTitle}</h2>
                <p>{chatSubtitle}</p>
              </div>
              <div className="club-chat-header-actions">
                <button type="button" onClick={() => openConversationPanel("about")} aria-label="Abrir información del club" title="Información del club">ⓘ</button>
                <button type="button" onClick={() => onInvite(club)} aria-label="Invitar al club" title="Invitar">♙</button>
              </div>
            </header>

            <ClubChatReadingBar
              club={club}
              myProgress={myProgress}
              currentChapter={currentChapter}
              unlockedChapter={clubUnlockedChapter}
              collectiveProgress={collectiveProgress}
              meeting={meeting}
              nextPlanSession={nextPlanSession}
              onOpenPanel={openConversationPanel}
              onSelectBook={onSelectBook}
            />

            {chatChannel === "chapter" && (
              <article className="club-spoiler-mode club-chat-spoiler-mode">
                <span>♧</span>
                <div>
                  <strong>Modo sin spoilers activado</strong>
                  <p>Puedes conversar hasta el capítulo {accessibleChapter}; el club ha abierto hasta el {clubUnlockedChapter}.</p>
                </div>
                <button type="button" onClick={() => openConversationPanel("progress")}>Pág. {membership?.current_page || 0} · cap. {currentChapter}</button>
              </article>
            )}

            <div className="club-chat-messages" role="log" aria-live="polite" aria-label={chatTitle}>
              {rootFeed.length === 0 && (
                <div className="club-chat-empty">
                  <span aria-hidden="true">☕</span>
                  <h3>Aún no hay mensajes</h3>
                  <p>Abre la conversación y deja la primera idea de la mesa.</p>
                </div>
              )}
              {rootFeed.map((post, index) => {
                const previousPost = rootFeed[index - 1];
                const replies = repliesByPostId.get(String(post.id)) || [];
                const showDay = !previousPost || chatDateKey(previousPost.created_at) !== chatDateKey(post.created_at);
                return (
                  <div className="club-chat-message-group" key={post.id}>
                    {showDay && <div className="club-chat-day-separator"><span>{chatDayLabel(post.created_at)}</span></div>}
                    <ClubPost
                      post={post}
                      currentChapter={accessibleChapter}
                      currentUserId={profile?.id}
                      isMine={String(post.user_id) === String(profile?.id)}
                      onReact={react}
                      onReveal={reveal}
                      isRevealed={revealed.has(post.id)}
                      revealedPosts={revealed}
                      canModerate={isAdmin}
                      onModerate={moderate}
                      onReply={setReplyingTo}
                      replyCount={replies.length}
                      replies={replies}
                      threadOpen={openThreads.has(String(post.id))}
                      onToggleThread={toggleThread}
                    />
                  </div>
                );
              })}
            </div>
            {chatChannel === "general" || selectedChapter <= accessibleChapter ? (
              <ClubComposer
                clubId={club.id}
                channel={chatChannel === "general" ? "general" : "chapter"}
                chapterNumber={chatChannel === "general" ? null : selectedChapter}
                parentPostId={replyingTo?.id || null}
                replyTo={replyingTo}
                onCancelReply={() => setReplyingTo(null)}
                onPublished={publishClubPost}
              />
            ) : (
              <div className="club-composer-locked">▣ Este capítulo todavía no está disponible para ti.</div>
            )}
          </main>
        </div>

      {conversationPanel === "about" && (
        <ClubChatPanel
          kicker="El club"
          title="Información de la mesa"
          onClose={() => setConversationPanel(null)}
          className="is-wide"
        >
          <ClubChatAboutContent
            club={club}
            membership={membership}
            members={members}
            chapters={chapters}
            collectiveProgress={collectiveProgress}
            unlockedChapter={clubUnlockedChapter}
            meeting={meeting}
            nextPlanSession={nextPlanSession}
            onOpenPanel={openConversationPanel}
            onSelectBook={onSelectBook}
          />
        </ClubChatPanel>
      )}

      {conversationPanel === "progress" && (
        <ClubChatPanel
          kicker="Tu ritmo de lectura"
          title="Mi progreso"
          onClose={() => setConversationPanel(null)}
        >
          {club.book ? (
            <ClubProgressEditor
              club={club}
              membership={membership}
              chapters={chapters}
              onSaved={onReload}
            />
          ) : (
            <div className="club-chat-panel-empty">
              <span aria-hidden="true">◔</span>
              <h3>Primero elegid una lectura</h3>
              <p>Cuando haya un libro en la mesa podrás guardar aquí tu página y capítulo.</p>
              <button type="button" className="clubs-primary-button" onClick={() => setConversationPanel("shelf")}>Abrir estantería</button>
            </div>
          )}
        </ClubChatPanel>
      )}

      {conversationPanel === "shelf" && (
        <ClubChatPanel
          kicker="Memoria de la mesa"
          title="Estantería del club"
          onClose={() => setConversationPanel(null)}
          className="is-wide"
        >
          <ClubShelf
            club={club}
            membership={membership}
            library={library}
            members={members}
            onReload={onReload}
            onSelectBook={onSelectBook}
          />
        </ClubChatPanel>
      )}

      {conversationPanel === "calendar" && (
        <ClubChatPanel
          kicker="Fechas compartidas"
          title="Calendario del club"
          onClose={() => setConversationPanel(null)}
          className="is-wide"
        >
          <ClubCalendar club={club} meetings={meetings} isAdmin={isAdmin} onReload={onReload} />
        </ClubChatPanel>
      )}

      {conversationPanel === "members" && (
        <ClubChatPanel
          kicker="La mesa lectora"
          title="Miembros del club"
          onClose={() => setConversationPanel(null)}
          className="is-wide"
        >
          <ClubMembersPanel
            club={club}
            membership={membership}
            members={members}
            achievements={achievements}
            onReload={onReload}
            onOpenProfile={onOpenProfile}
          />
        </ClubChatPanel>
      )}

      {conversationPanel === "achievements" && (
        <ClubChatPanel
          kicker="Recuerdos de lectura"
          title="Marcapáginas del club"
          onClose={() => setConversationPanel(null)}
        >
          <ClubBookmarks achievements={achievements} membership={membership} />
        </ClubChatPanel>
      )}


      {settingsOpen && <ClubSettingsPanel club={club} chapters={chapters} membership={membership} onReload={onReload} onClose={() => setSettingsOpen(false)} onExitClub={onExitClub} />}
    </section>
  );
}


export default function ClubesLectura({
  isLoggedIn,
  onLogin,
  onSelectBook,
  onHome,
  onCatalog,
  onProfile,
  onOpenProfile,
  initialClubId = null,
  onInitialClubConsumed,
}) {
  const [state, setState] = useState({ loading: true, error: "", hub: null });
  const [selectedClubId, setSelectedClubId] = useState(null);
  const [insideClub, setInsideClub] = useState(false);
  const [clubData, setClubData] = useState(null);
  const [clubLoading, setClubLoading] = useState(false);
  const [clubTab, setClubTab] = useState("general");
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteClub, setInviteClub] = useState(null);
  const [inviteCode, setInviteCode] = useState("");
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);
  const [shareInviteClub, setShareInviteClub] = useState(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverSort, setDiscoverSort] = useState("featured");
  const [joiningClubId, setJoiningClubId] = useState(null);
  const [renderReferenceTime] = useState(() => Date.now());
  const initialClubHandledRef = useRef(false);

  const loadHub = useCallback(async () => {
    if (!isLoggedIn) {
      setState({ loading: false, error: "", hub: null });
      return;
    }
    try {
      const hub = await getClubsHub();
      setState({ loading: false, error: "", hub });
      setSelectedClubId((current) => current || hub.myClubs[0]?.id || hub.discoverClubs[0]?.id || null);
    } catch (error) {
      setState({ loading: false, error: error.message || "No se pudieron cargar los clubes.", hub: null });
    }
  }, [isLoggedIn]);

  useEffect(() => {
    let cancelled = false;

    async function initialHubLoad() {
      if (!isLoggedIn) {
        if (!cancelled) setState({ loading: false, error: "", hub: null });
        return;
      }

      try {
        const hub = await getClubsHub();
        if (!cancelled) {
          setState({ loading: false, error: "", hub });
          setSelectedClubId((current) =>
            current || hub.myClubs[0]?.id || hub.discoverClubs[0]?.id || null,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: error.message || "No se pudieron cargar los clubes.",
            hub: null,
          });
        }
      }
    }

    initialHubLoad();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const selectedClub = useMemo(() => {
    const all = [...(state.hub?.myClubs || []), ...(state.hub?.discoverClubs || [])];
    return all.find((club) => String(club.id) === String(selectedClubId)) || all[0] || null;
  }, [selectedClubId, state.hub]);

  const loadDetail = useCallback(async (clubId) => {
    setClubLoading(true);
    setNotice("");
    try {
      const detail = await getClubDetail(clubId);
      setClubData(detail);
      return detail;
    } catch (error) {
      setNotice(error.message || "No se pudo abrir el club.");
      return null;
    } finally {
      setClubLoading(false);
    }
  }, []);

  useEffect(() => {
    if (
      !initialClubId ||
      initialClubHandledRef.current ||
      state.loading ||
      !state.hub
    ) {
      return undefined;
    }

    initialClubHandledRef.current = true;
    let cancelled = false;

    async function reopenClub() {
      const detail = await loadDetail(initialClubId);
      if (!cancelled && detail?.membership) {
        setSelectedClubId(String(initialClubId));
        setInsideClub(true);
        setClubTab("general");
        window.scrollTo({ top: 0, behavior: "auto" });
      }
      onInitialClubConsumed?.();
    }

    reopenClub();
    return () => {
      cancelled = true;
    };
  }, [initialClubId, loadDetail, onInitialClubConsumed, state.hub, state.loading]);

  async function enterClub(club) {
    if (!club) return;
    setJoiningClubId(String(club.id));
    try {
      if (!club.is_member) {
        if (club.visibility === "private") {
          setInviteClub(club);
          return;
        }
        try {
          await joinReadingClub(club.id);
          await loadHub();
        } catch (error) {
          setNotice(error.message || "No se pudo entrar en el club.");
          return;
        }
      }
      const detail = await loadDetail(club.id);
      if (detail?.membership) {
        setSelectedClubId(club.id);
        setInsideClub(true);
        setClubTab("general");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } finally {
      setJoiningClubId(null);
    }
  }

  async function joinPrivate() {
    if (!inviteClub) return;
    try {
      await joinReadingClub(inviteClub.id, inviteCode);
      setInviteClub(null);
      setInviteCode("");
      await loadHub();
      const detail = await loadDetail(inviteClub.id);
      if (detail?.membership) {
        setSelectedClubId(inviteClub.id);
        setInsideClub(true);
      }
    } catch (error) {
      setNotice(error.message || "No se pudo usar la invitación.");
    }
  }

  async function joinByCode() {
    try {
      const clubId = await joinReadingClubByCode(inviteCode);
      setCodeDialogOpen(false);
      setInviteCode("");
      await loadHub();
      const detail = await loadDetail(clubId);
      if (detail?.membership) {
        setSelectedClubId(clubId);
        setClubData(detail);
        setInsideClub(true);
      }
    } catch (error) {
      setNotice(error.message || "No se pudo usar la invitación.");
    }
  }

  function openInviteShare(club) {
    if (!club?.invite_code) {
      setNotice("Este club todavía no tiene un código de invitación disponible.");
      return;
    }
    setInviteCopied(false);
    setShareInviteClub(club);
  }

  async function copyInviteCode() {
    const code = shareInviteClub?.invite_code || "";
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setInviteCopied(true);
    } catch {
      const input = document.getElementById("clubs-share-invite-code");
      input?.focus();
      input?.select();
      setInviteCopied(false);
    }
  }

  async function reloadCurrentClub() {
    if (!selectedClubId) return;
    await loadDetail(selectedClubId);
  }

  if (!isLoggedIn) {
    return (
      <main className="clubs-page">
        <section className="clubs-login-card">
          <span>☾</span>
          <h1>Clubes de lectura</h1>
          <p>Inicia sesión para leer en compañía, conversar por capítulos y avanzar sin spoilers.</p>
          <button type="button" className="clubs-primary-button" onClick={onLogin}>Iniciar sesión</button>
        </section>
      </main>
    );
  }

  if (state.loading) {
    return <main className="clubs-page"><section className="clubs-loading"><span /><p>Preparando las mesas de lectura…</p></section></main>;
  }

  if (state.error) {
    return <main className="clubs-page"><section className="clubs-login-card"><h1>No se pudieron abrir los clubes</h1><p>{state.error}</p><button type="button" onClick={loadHub}>Reintentar</button></section></main>;
  }

  if (insideClub && clubData) {
    return (
      <main className="clubs-page clubs-page-inside">
        {notice && <div className="clubs-notice" role="status" aria-live="polite">{notice}<button type="button" aria-label="Cerrar aviso" onClick={() => setNotice("")}>×</button></div>}
        <ClubInside
          key={`${clubData.club?.id || "club"}:${clubData.club?.current_book_id || "book"}`}
          data={clubData}
          tab={clubTab}
          onTab={setClubTab}
          onBack={() => { setInsideClub(false); setClubData(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onReload={reloadCurrentClub}
          onSelectBook={onSelectBook}
          onInvite={openInviteShare}
          onOpenProfile={onOpenProfile}
          onExitClub={async (message) => {
            setNotice(message || "");
            setInsideClub(false);
            setClubData(null);
            setSelectedClubId(null);
            await loadHub();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
        {shareInviteClub && (
          <div className="clubs-modal-backdrop" onMouseDown={() => setShareInviteClub(null)}>
            <section className="clubs-share-invite-dialog" onMouseDown={(event) => event.stopPropagation()}>
              <button type="button" className="clubs-dialog-close" onClick={() => setShareInviteClub(null)} aria-label="Cerrar">×</button>
              <span className="clubs-share-invite-icon">✦</span>
              <span className="clubs-kicker">Invitación al club</span>
              <h2>Abre un sitio en {shareInviteClub.name}</h2>
              <p>Comparte este código con la persona que quieras invitar. Podrá pegarlo desde «Tengo un código».</p>
              <label htmlFor="clubs-share-invite-code">Código de invitación</label>
              <div className="clubs-share-code-row">
                <input
                  id="clubs-share-invite-code"
                  readOnly
                  value={shareInviteClub.invite_code || ""}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label="Código de invitación del club"
                />
                <button type="button" className="clubs-primary-button" onClick={copyInviteCode}>
                  {inviteCopied ? "✓ Copiado" : "Copiar código"}
                </button>
              </div>
              <small aria-live="polite">{inviteCopied ? "El código ya está en tu portapapeles." : "El código no permite acceder a ningún otro club."}</small>
            </section>
          </div>
        )}
        <nav className="clubs-mobile-bottom-nav" aria-label="Navegación móvil">
          <button type="button" onClick={onHome}>⌂<span>Inicio</span></button>
          <button type="button" onClick={onCatalog}>⌕<span>Buscar</span></button>
          <button type="button" className="is-create" onClick={() => setCreateOpen(true)}>＋<span>Crear</span></button>
          <button type="button" className="is-active">♟<span>Clubes</span></button>
          <button type="button" onClick={onProfile}>♙<span>Perfil</span></button>
        </nav>
        {createOpen && <CreateClubPanel onClose={() => setCreateOpen(false)} onCreated={async (club) => { setCreateOpen(false); await loadHub(); await enterClub({ ...club, is_member: true }); }} />}
      </main>
    );
  }

  const myClubs = state.hub?.myClubs || [];
  const discover = state.hub?.discoverClubs || [];
  const discoverSearch = discoverQuery.trim().toLocaleLowerCase("es");
  const filteredDiscover = discover.filter((club) => {
    if (!discoverSearch) return true;
    const haystack = [club.name, club.description, club.book?.title, club.book?.author]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("es");
    return haystack.includes(discoverSearch);
  });
  if (discoverSort === "active") {
    filteredDiscover.sort((first, second) => (Number(second.member_count) || 0) - (Number(first.member_count) || 0));
  } else if (discoverSort === "newest") {
    filteredDiscover.sort((first, second) => new Date(second.created_at || 0).getTime() - new Date(first.created_at || 0).getTime());
  }
  const nextMeetingClub = [...myClubs]
    .filter((club) => club.next_meeting_at && new Date(club.next_meeting_at).getTime() >= renderReferenceTime)
    .sort((first, second) => new Date(first.next_meeting_at).getTime() - new Date(second.next_meeting_at).getTime())[0] || null;
  const nextMeeting = compactDate(nextMeetingClub?.next_meeting_at);
  const activeReadings = myClubs.filter((club) => club.book).length;
  const totalMembers = myClubs.reduce((sum, club) => sum + Math.max(0, Number(club.member_count) || 0), 0);

  function selectClub(club) {
    setSelectedClubId(club.id);
    window.requestAnimationFrame(() => {
      document.getElementById("selected-club-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <main className="clubs-page clubs-page-hub clubs-refresh-v1">
      {notice && <div className="clubs-notice" role="status" aria-live="polite">{notice}<button type="button" aria-label="Cerrar aviso" onClick={() => setNotice("")}>×</button></div>}
      <header className="clubs-page-heading">
        <div>
          <span className="clubs-kicker">La comunidad de Librélula</span>
          <h1>Clubes de lectura</h1>
          <p>Lee y conversa en compañía, a tu ritmo y sin perderte en el camino.</p>
        </div>
        <div>
          <button type="button" className="clubs-primary-button" onClick={() => setCreateOpen(true)}>♙ Crear un club</button>
          <button type="button" className="clubs-secondary-button" onClick={() => setCodeDialogOpen(true)}>▣ Tengo un código</button>
          <button type="button" className="clubs-secondary-button" onClick={() => document.getElementById("discover-clubs")?.scrollIntoView({ behavior: "smooth" })}>◉ Explorar</button>
        </div>
      </header>

      <section className="clubs-hub-pulse" aria-label="Resumen de tus clubes">
        <article>
          <span aria-hidden="true">♧</span>
          <div><strong>{myClubs.length}</strong><small>{myClubs.length === 1 ? "club en tu círculo" : "clubes en tu círculo"}</small></div>
        </article>
        <article>
          <span aria-hidden="true">▤</span>
          <div><strong>{activeReadings}</strong><small>{activeReadings === 1 ? "lectura en marcha" : "lecturas en marcha"}</small></div>
        </article>
        <article>
          <span aria-hidden="true">◎</span>
          <div><strong>{totalMembers}</strong><small>{totalMembers === 1 ? "miembro en tus clubes" : "miembros entre tus clubes"}</small></div>
        </article>
        <article className="clubs-hub-pulse-next">
          <span aria-hidden="true">◷</span>
          <div><strong>{nextMeeting ? `${nextMeeting.day} ${nextMeeting.month}` : "Sin fecha"}</strong><small>{nextMeetingClub ? `Próxima cita · ${nextMeetingClub.name}` : "Añade una cita al club"}</small></div>
        </article>
      </section>

      <section className="clubs-my-section">
        <header><h2>Mis clubes</h2><span>{myClubs.length} en tu estantería social</span></header>
        {myClubs.length > 0 ? (
          <div className="clubs-my-grid">
            {myClubs.map((club) => <ClubCard key={club.id} club={club} onSelect={selectClub} isSelected={String(club.id) === String(selectedClubId)} />)}
          </div>
        ) : (
          <div className="clubs-empty-card clubs-empty-wide">
            <span>☕</span><h3>Tu primera mesa está esperando</h3><p>Crea un club o únete a uno público para empezar.</p><button type="button" onClick={() => setCreateOpen(true)}>Crear mi primer club</button>
          </div>
        )}
      </section>

      {selectedClub && (
        <ClubPreview club={selectedClub} onEnter={enterClub} onSelectBook={onSelectBook} isBusy={joiningClubId === String(selectedClub.id)} />
      )}

      <section className="clubs-discover" id="discover-clubs">
        <div className="clubs-discover-main">
          <header><div><span className="clubs-kicker">Encuentra tu próxima conversación</span><h2>Descubre nuevos clubes</h2></div><span>{filteredDiscover.length} de {discover.length} públicos</span></header>
          {discover.length > 0 && (
            <div className="clubs-discover-tools">
              <label className="clubs-discover-search">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={discoverQuery}
                  onChange={(event) => setDiscoverQuery(event.target.value)}
                  placeholder="Buscar por club, libro o autora…"
                  aria-label="Buscar clubes públicos"
                />
                {discoverQuery && <button type="button" onClick={() => setDiscoverQuery("")} aria-label="Borrar búsqueda">×</button>}
              </label>
              <div className="clubs-discover-filters" role="group" aria-label="Ordenar clubes públicos">
                {[ ["featured", "Todos"], ["active", "Más activos"], ["newest", "Más nuevos"] ].map(([id, label]) => (
                  <button type="button" key={id} className={discoverSort === id ? "is-active" : ""} onClick={() => setDiscoverSort(id)} aria-pressed={discoverSort === id}>{label}</button>
                ))}
              </div>
            </div>
          )}
          {filteredDiscover.length > 0 ? (
            <div className="clubs-discover-grid">
              {filteredDiscover.map((club) => (
                <article key={club.id}>
                  <BookCover book={club.book} onOpen={onSelectBook} />
                  <div><span>{club.visibility === "public" ? "◌ Club público" : "▣ Club privado"}</span><h3>{club.name}</h3><p>Leyendo ahora</p><strong>{club.book?.title || "Próxima lectura por elegir"}</strong><small>{club.member_count} miembros</small></div>
                  <button type="button" onClick={() => enterClub(club)} disabled={joiningClubId === String(club.id)}>{joiningClubId === String(club.id) ? "Entrando…" : "Unirme"}</button>
                </article>
              ))}
            </div>
          ) : discover.length > 0 ? (
            <div className="clubs-empty-card"><span>⌕</span><h3>No encontramos ese club</h3><p>Prueba con otro nombre, libro o autora.</p><button type="button" onClick={() => { setDiscoverQuery(""); setDiscoverSort("featured"); }}>Limpiar filtros</button></div>
          ) : (
            <div className="clubs-empty-card"><span>❧</span><h3>No hay clubes públicos todavía</h3><p>El primero puede ser el tuyo.</p></div>
          )}
        </div>

        <aside className="clubs-recommended">
          <span className="clubs-kicker">Una pequeña selección</span>
          <h2>Para empezar</h2>
          {(discover.length ? discover.slice(0, 4) : myClubs.slice(0, 4)).map((club) => (
            <article className="clubs-recommended-row" key={club.id}>
              <BookCover book={club.book} onOpen={onSelectBook} />
              <button type="button" onClick={() => selectClub(club)}>
                <span><strong>{club.name}</strong><small>{club.member_count} miembros</small></span><i>→</i>
              </button>
            </article>
          ))}
          {discover.length === 0 && myClubs.length === 0 && <p>Cuando haya clubes, aparecerán aquí los más cercanos a tus gustos.</p>}
        </aside>
      </section>

      <nav className="clubs-mobile-bottom-nav" aria-label="Navegación móvil">
        <button type="button" onClick={onHome}>⌂<span>Inicio</span></button>
        <button type="button" onClick={onCatalog}>⌕<span>Buscar</span></button>
        <button type="button" className="is-create" onClick={() => setCreateOpen(true)}>＋<span>Crear</span></button>
        <button type="button" className="is-active">♟<span>Clubes</span></button>
        <button type="button" onClick={onProfile}>♙<span>Perfil</span></button>
      </nav>

      {createOpen && <CreateClubPanel onClose={() => setCreateOpen(false)} onCreated={async (club) => { setCreateOpen(false); await loadHub(); setSelectedClubId(club.id); const detail = await loadDetail(club.id); if (detail) { setClubData(detail); setInsideClub(true); } }} />}

      {inviteClub && (
        <div className="clubs-modal-backdrop" onMouseDown={() => setInviteClub(null)}>
          <section className="clubs-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="private-club-title" onMouseDown={(event) => event.stopPropagation()}>
            <span>▣</span><h2 id="private-club-title">Este club es privado</h2><p>Introduce el código que te ha enviado una persona del club.</p>
            <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="CÓDIGO DE INVITACIÓN" />
            <div><button type="button" onClick={() => setInviteClub(null)}>Cancelar</button><button type="button" className="clubs-primary-button" onClick={joinPrivate}>Entrar</button></div>
          </section>
        </div>
      )}

      {codeDialogOpen && (
        <div className="clubs-modal-backdrop" onMouseDown={() => setCodeDialogOpen(false)}>
          <section className="clubs-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-club-title" onMouseDown={(event) => event.stopPropagation()}>
            <span>✦</span><h2 id="invite-club-title">Entrar con una invitación</h2><p>Pega el código del club privado que te han compartido.</p>
            <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="CÓDIGO DE INVITACIÓN" />
            <div><button type="button" onClick={() => setCodeDialogOpen(false)}>Cancelar</button><button type="button" className="clubs-primary-button" onClick={joinByCode}>Entrar</button></div>
          </section>
        </div>
      )}

      {clubLoading && <div className="clubs-overlay-loading"><span /><p>Abriendo el club…</p></div>}
    </main>
  );
}
