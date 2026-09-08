import { useEffect, useMemo, useRef, useState } from "react";
import { publicUrl } from "./api.js";
import { getProfileOverview, uploadProfileCover } from "./lib/profileApi.js";
import { getProfileActivityFeed } from "./lib/profileFeedApi.js";
import "./PerfilSupabase.css";
import "./ProfileSummaryV2.css";

const PROFILE_TABS = [
  { id: "summary", label: "Resumen" },
  { id: "shelf", label: "Estantería" },
  { id: "activity", label: "Actividad" },
  { id: "favorites", label: "Favoritos" },
  { id: "reviews", label: "Reseñas" },
];

function formatNumber(value) {
  return new Intl.NumberFormat("es-ES").format(Number(value) || 0);
}

function clampProgress(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function assetUrl(path, fallback = "images/librelula.png") {
  const clean = String(path || "").trim();
  if (!clean || clean === "default.jpg") return publicUrl(fallback);
  if (/^https?:\/\//i.test(clean) || clean.startsWith("blob:")) return clean;
  return publicUrl(clean);
}

function relativeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) return "";

  const diff = Math.max(0, Date.now() - time);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `hace ${weeks} sem`;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(date);
}

function SectionHeading({ eyebrow, title, action, onAction }) {
  return (
    <div className="profile-v2-section-heading">
      <div>
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h2>{title}</h2>
      </div>
      {action ? <button type="button" onClick={onAction}>{action}</button> : null}
    </div>
  );
}

function FavoriteShelf({ books, onSelectBook, onFavorites }) {
  const visible = (books || []).slice(0, 6);
  return (
    <section className="profile-v2-module profile-v2-shelf-module">
      <SectionHeading eyebrow="Su estantería esencial" title="Libros favoritos" action="Ver todos →" onAction={onFavorites} />
      {visible.length ? (
        <div className="profile-v2-bookshelf">
          <div className="profile-v2-bookshelf-books">
            {visible.map((book, index) => (
              <button
                type="button"
                key={book.id}
                onClick={() => onSelectBook?.(book)}
                title={`${book.title || "Libro favorito"}${book.author ? ` · ${book.author}` : ""}`}
                style={{ "--book-tilt": `${index % 3 === 0 ? -1.5 : index % 3 === 1 ? 0.8 : -0.3}deg` }}
              >
                <img
                  src={assetUrl(book.cover)}
                  alt={book.title ? `Portada de ${book.title}` : "Portada de libro favorito"}
                  loading="lazy"
                  onError={(event) => { event.currentTarget.src = publicUrl("images/librelula.png"); }}
                />
              </button>
            ))}
          </div>
          <div className="profile-v2-bookshelf-wood" aria-hidden="true" />
        </div>
      ) : <p className="profile-v2-soft-empty">Todavía no ha elegido sus libros favoritos.</p>}
    </section>
  );
}

function AnnualChallenge({ books, goal }) {
  const year = new Date().getFullYear();
  const completed = useMemo(() => (books || []).filter((book) => {
    if (book.status !== "completed") return false;
    const rawDate = book.finished_at || book.activity_date || book.added_at;
    if (!rawDate) return false;
    const date = new Date(rawDate);
    return Number.isFinite(date.getTime()) && date.getFullYear() === year;
  }).length, [books, year]);

  const safeGoal = Math.max(0, Number(goal) || 0);
  const progress = safeGoal > 0 ? Math.min(100, Math.round((completed / safeGoal) * 100)) : null;

  return (
    <section className="profile-v2-module profile-v2-challenge-module">
      <SectionHeading eyebrow={`Desafío ${year}`} title="Objetivo anual" />
      <div className="profile-v2-challenge-copy">
        <strong>{formatNumber(completed)}</strong>
        <span>{completed === 1 ? "libro terminado" : "libros terminados"}</span>
      </div>
      {progress !== null ? (
        <>
          <div className="profile-v2-challenge-progress" aria-label={`${completed} de ${safeGoal} libros`}><span style={{ width: `${progress}%` }} /></div>
          <div className="profile-v2-challenge-meta"><span>{progress}%</span><span>Meta: {safeGoal}</span></div>
        </>
      ) : (
        <div className="profile-v2-challenge-unset">
          <span className="profile-v2-challenge-progress is-unset" aria-hidden="true"><i /></span>
          <small>La meta anual todavía no está fijada.</small>
        </div>
      )}
    </section>
  );
}

function ReadingPulse({ streak, days, onActivity }) {
  const visibleDays = (days || []).slice(-84);
  return (
    <section className="profile-v2-module profile-v2-pulse-module">
      <SectionHeading eyebrow="Ritmo lector" title={`${formatNumber(streak)} días de racha`} action="Actividad →" onAction={onActivity} />
      <div className="profile-v2-heatmap" aria-label="Actividad lectora de las últimas doce semanas">
        {visibleDays.map((day) => <i key={day.date} className={`level-${Math.max(0, Math.min(3, Number(day.level) || 0))}`} title={`${day.label}: ${day.points || 0}`} />)}
      </div>
      <div className="profile-v2-heatmap-legend" aria-hidden="true"><span>menos</span><i /><i className="level-1" /><i className="level-2" /><i className="level-3" /><span>más</span></div>
    </section>
  );
}

function FavoriteGenres({ genres }) {
  const visible = (genres || []).slice(0, 5);
  return (
    <section className="profile-v2-module profile-v2-genres-module">
      <SectionHeading eyebrow="Afinidades" title="Géneros favoritos" />
      {visible.length ? (
        <div className="profile-v2-genre-list">
          {visible.map((genre) => (
            <div key={genre.name}>
              <span><strong>{genre.name}</strong><small>{formatNumber(genre.count)} lecturas</small></span>
              <i><b style={{ width: `${Math.max(8, Math.min(100, Number(genre.share) || 0))}%` }} /></i>
            </div>
          ))}
        </div>
      ) : <p className="profile-v2-soft-empty">Todavía no hay géneros destacados.</p>}
    </section>
  );
}

function FavoriteAuthors({ authors, onFavorites }) {
  const visible = (authors || []).slice(0, 8);
  return (
    <section className="profile-v2-module profile-v2-authors-module">
      <SectionHeading eyebrow="Voces imprescindibles" title="Autores favoritos" action="Favoritos →" onAction={onFavorites} />
      {visible.length ? (
        <div className="profile-v2-author-list">
          {visible.map((author, index) => <span key={author}><i>{String(index + 1).padStart(2, "0")}</i><strong>{author}</strong></span>)}
        </div>
      ) : <p className="profile-v2-soft-empty">Sus autores favoritos aparecerán aquí.</p>}
    </section>
  );
}

function ClubBookmarks({ achievements }) {
  const visible = (achievements || []).slice(0, 6);
  return (
    <section className="profile-v2-module profile-v2-bookmarks-module">
      <SectionHeading eyebrow="Clubes de lectura" title="Marcapáginas" />
      {visible.length ? (
        <div className="profile-v2-bookmark-grid">
          {visible.map((achievement) => (
            <div key={achievement.id} title={achievement.description || achievement.label}>
              <i aria-hidden="true">❧</i>
              <span><strong>{achievement.label}</strong><small>{achievement.club?.name || "Club de lectura"}</small></span>
            </div>
          ))}
        </div>
      ) : <div className="profile-v2-bookmark-empty"><i aria-hidden="true">❧</i><span><strong>Aún sin marcapáginas</strong><small>Los logros de sus clubes aparecerán aquí.</small></span></div>}
    </section>
  );
}

function feedAction(item, isOwner) {
  const ownerText = {
    progress: "Actualizaste tu progreso en",
    review: "Publicaste una reseña de",
    completed: "Terminaste",
    started: item?.status === "rereading" ? "Empezaste a releer" : "Empezaste a leer",
    planned: "Añadiste a pendientes",
    paused: "Pausaste",
    dropped: "Marcaste como abandonado",
  };
  const publicText = {
    progress: "Actualizó su progreso en",
    review: "Publicó una reseña de",
    completed: "Terminó",
    started: item?.status === "rereading" ? "Empezó a releer" : "Empezó a leer",
    planned: "Añadió a pendientes",
    paused: "Pausó",
    dropped: "Marcó como abandonado",
  };
  return (isOwner ? ownerText : publicText)[item?.type] || (isOwner ? "Actualizaste" : "Actualizó");
}

function Comment({ comment }) {
  const profile = comment?.profile || {};
  const displayName = profile.display_name || profile.username || "Lectora";
  const handle = String(profile.username || "lectora").replace(/^@/, "");
  return (
    <div className="profile-v2-feed-comment">
      <img
        src={assetUrl(profile.avatar, "images/avatar/avatar1.png")}
        alt={`Avatar de ${displayName}`}
        loading="lazy"
        onError={(event) => { event.currentTarget.src = publicUrl("images/avatar/avatar1.png"); }}
      />
      <div>
        <div><strong>{displayName}</strong><span>@{handle}</span><time>· {relativeDate(comment.created_at)}</time></div>
        <p>{comment.body}</p>
      </div>
    </div>
  );
}

function FeedBook({ item, onSelectBook }) {
  const book = item?.book;
  if (!book) return null;
  const progress = clampProgress(item.progress);
  const score = Math.max(0, Math.min(5, Number(item.score) || 0));

  return (
    <button type="button" className="profile-v2-feed-book" onClick={() => onSelectBook?.(book)}>
      <img src={assetUrl(book.cover)} alt={book.title ? `Portada de ${book.title}` : "Portada del libro"} loading="lazy" onError={(event) => { event.currentTarget.src = publicUrl("images/librelula.png"); }} />
      <span>
        <strong>{book.title || "Libro sin título"}</strong>
        <small>{book.author || "Autor desconocido"}</small>
        {progress > 0 && item.type === "progress" ? <span className="profile-v2-feed-progress"><i><b style={{ width: `${progress}%` }} /></i><em>{progress}%</em></span> : null}
        {score > 0 ? <span className="profile-v2-feed-score" aria-label={`${score} de 5 estrellas`}>{"★".repeat(score)}{"☆".repeat(5 - score)}</span> : null}
      </span>
    </button>
  );
}

function ActivityItem({ item, isOwner, onSelectBook }) {
  const profile = item?.profile || {};
  const displayName = profile.display_name || profile.username || "Lectora";
  const handle = String(profile.username || "lectora").replace(/^@/, "");
  const avatar = assetUrl(profile.avatar, "images/avatar/avatar1.png");
  const hasBody = Boolean(String(item?.body || "").trim());
  const body = String(item?.body || "").trim();
  const isPost = item?.type === "post";

  return (
    <article className="profile-v2-feed-item">
      <img className="profile-v2-feed-avatar" src={avatar} alt={`Avatar de ${displayName}`} onError={(event) => { event.currentTarget.src = publicUrl("images/avatar/avatar1.png"); }} />
      <div className="profile-v2-feed-content">
        <div className="profile-v2-feed-meta">
          <strong>{displayName}</strong><span>@{handle}</span>{item.created_at ? <time>· {relativeDate(item.created_at)}</time> : null}
        </div>

        {isPost ? null : (
          <p className="profile-v2-feed-action"><span>{feedAction(item, isOwner)}</span>{item.book?.title ? <> <strong>{item.book.title}</strong></> : null}</p>
        )}

        {hasBody ? (
          item.spoiler ? (
            <details className="profile-v2-feed-spoiler">
              <summary>Mostrar contenido con spoiler</summary>
              <p>{body}</p>
              {item.image_url ? <img src={item.image_url} alt="Imagen de la publicación" loading="lazy" /> : null}
            </details>
          ) : (
            <>
              <p className={isPost ? "profile-v2-feed-post-copy" : "profile-v2-feed-body-copy"}>{body}</p>
              {item.image_url ? <img className="profile-v2-feed-post-image" src={item.image_url} alt="Imagen de la publicación" loading="lazy" /> : null}
            </>
          )
        ) : null}

        <FeedBook item={item} onSelectBook={onSelectBook} />

        <div className="profile-v2-feed-reactions" aria-label="Interacciones de la actividad">
          <span className={item.liked ? "is-liked" : ""}><b aria-hidden="true">{item.liked ? "♥" : "♡"}</b> {formatNumber(item.likes)} {Number(item.likes) === 1 ? "like" : "likes"}</span>
          <span><b aria-hidden="true">◌</b> {formatNumber(item.comments_count)} {Number(item.comments_count) === 1 ? "comentario" : "comentarios"}</span>
        </div>

        {item.comments?.length ? (
          <div className="profile-v2-feed-comments">
            {item.comments.map((comment) => <Comment key={comment.id} comment={comment} />)}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ActivityFeed({ items, loading, error, isOwner, onSelectBook }) {
  return (
    <section className="profile-v2-activity-column">
      <div className="profile-v2-activity-title">
        <div><span>Feed del perfil</span><h2>Actividad</h2><p>Publicaciones, lecturas y las conversaciones que generan.</p></div>
      </div>

      {loading ? (
        <div className="profile-v2-feed-loading" aria-label="Cargando actividad">
          {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
        </div>
      ) : error ? (
        <p className="profile-v2-soft-empty">{error}</p>
      ) : items?.length ? (
        <div className="profile-v2-feed">
          {items.map((item) => <ActivityItem key={item.key} item={item} isOwner={isOwner} onSelectBook={onSelectBook} />)}
        </div>
      ) : <p className="profile-v2-soft-empty">Todavía no hay actividad en este perfil.</p>}
    </section>
  );
}

export default function ProfileSummaryV2({
  activeTab = "summary",
  onTabChange,
  onOpenCatalog,
  onSelectBook,
  profileId = null,
  onBackToClub,
}) {
  const fileInputRef = useRef(null);
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [coverState, setCoverState] = useState({ saving: false, error: "" });
  const [feedState, setFeedState] = useState({ loading: true, error: "", items: [] });

  useEffect(() => {
    let cancelled = false;
    getProfileOverview(profileId)
      .then((data) => { if (!cancelled) setState({ loading: false, error: "", data }); })
      .catch((error) => { if (!cancelled) setState({ loading: false, error: error?.message || "No se pudo cargar el perfil.", data: null }); });
    return () => { cancelled = true; };
  }, [profileId]);

  const loadedProfile = state.data?.profile || null;
  const loadedProfileId = loadedProfile?.id || "";
  const loadedLegacyId = loadedProfile?.legacy_id || "";

  useEffect(() => {
    if (!loadedProfileId || !loadedLegacyId || !loadedProfile) {
      setFeedState({ loading: false, error: "", items: [] });
      return undefined;
    }

    let cancelled = false;
    setFeedState({ loading: true, error: "", items: [] });
    getProfileActivityFeed(loadedProfile)
      .then((items) => { if (!cancelled) setFeedState({ loading: false, error: "", items }); })
      .catch((error) => { if (!cancelled) setFeedState({ loading: false, error: error?.message || "No se pudo cargar la actividad social.", items: [] }); });
    return () => { cancelled = true; };
  }, [loadedProfileId, loadedLegacyId]);

  async function handleCoverSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setCoverState({ saving: true, error: "" });
    try {
      const coverImage = await uploadProfileCover(file);
      setState((current) => ({ ...current, data: current.data ? { ...current.data, profile: { ...current.data.profile, cover_image: coverImage } } : current.data }));
      setCoverState({ saving: false, error: "" });
    } catch (error) {
      setCoverState({ saving: false, error: error?.message || "No se pudo cambiar la portada." });
    }
  }

  if (state.loading) {
    return <main className="reader-profile profile-redesign"><section className="profile-shell"><div className="profile-loading-card"><span className="profile-loader" /><p>Cargando su rincón literario…</p></div></section></main>;
  }

  const data = state.data;
  const profile = data?.profile;
  if (state.error || !data?.authenticated || !profile) {
    return (
      <main className="reader-profile profile-redesign"><section className="profile-shell"><div className="profile-error-card"><h1>No se pudo abrir este rincón</h1><p>{state.error || "Este perfil no está disponible."}</p><button type="button" onClick={onOpenCatalog}>Volver al catálogo</button></div></section></main>
    );
  }

  const avatarUrl = assetUrl(profile.avatar, "images/avatar/avatar1.png");
  const coverUrl = assetUrl(profile.cover_image, "images/fondo.png");
  const displayName = profile.display_name || profile.username || "Mi rincón";
  const handle = String(profile.username || "lectora").replace(/^@/, "");
  const annualGoal = data.annualChallenge?.goal || null;

  return (
    <main className="reader-profile profile-redesign profile-summary-page-v2">
      <section className="profile-shell">
        {onBackToClub ? <button type="button" className="profile-back-to-club" onClick={onBackToClub}><span aria-hidden="true">←</span> Volver al club</button> : null}

        <header className="profile-hero" style={{ "--profile-cover": `url("${coverUrl}")` }}>
          <div className="profile-hero-overlay" />
          {data.isOwner ? (
            <>
              <button type="button" className="profile-change-cover" onClick={() => fileInputRef.current?.click()} disabled={coverState.saving} aria-label={coverState.saving ? "Guardando portada" : "Ajustes de portada"}><span aria-hidden="true">▣</span>{coverState.saving ? "Guardando…" : "Cambiar portada"}</button>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleCoverSelected} />
            </>
          ) : null}
          <div className="profile-identity">
            <div className="profile-avatar-frame"><img src={avatarUrl} alt={`Avatar de ${displayName}`} onError={(event) => { event.currentTarget.src = publicUrl("images/avatar/avatar1.png"); }} /></div>
            <div className="profile-identity-copy">
              <h1>{displayName}</h1><span>@{handle}</span><p>{profile.bio || "Lecturas, favoritos y pequeñas huellas de mi biblioteca personal."}</p>
              <div className="profile-social-counts"><button type="button"><strong>{formatNumber(data.social.followers)}</strong> seguidores</button><button type="button"><strong>{formatNumber(data.social.following)}</strong> siguiendo</button></div>
            </div>
          </div>
        </header>

        {coverState.error ? <p className="profile-inline-error">{coverState.error}</p> : null}

        <nav className="profile-tabs" aria-label="Secciones del perfil" role="tablist">
          {PROFILE_TABS.map((tab) => <button key={tab.id} id={`profile-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => onTabChange?.(tab.id)}>{tab.label}</button>)}
        </nav>

        <section className="profile-summary-anilist" id="profile-panel-summary" role="tabpanel">
          <div className="profile-v2-summary-stats">
            <AnnualChallenge books={data.shelfBooks} goal={annualGoal} />
            <ReadingPulse streak={data.streak} days={data.activityDays} onActivity={() => onTabChange?.("activity")} />
          </div>

          <div className="profile-summary-anilist-body">
            <aside className="profile-v2-insights-column">
              <FavoriteShelf books={data.favoriteBooks} onSelectBook={onSelectBook} onFavorites={() => onTabChange?.("favorites")} />
              <FavoriteGenres genres={data.favoriteGenres} />
              <FavoriteAuthors authors={data.favoriteAuthors} onFavorites={() => onTabChange?.("favorites")} />
              <ClubBookmarks achievements={data.clubAchievements} />
            </aside>

            <ActivityFeed items={feedState.items} loading={feedState.loading} error={feedState.error} isOwner={data.isOwner} onSelectBook={onSelectBook} />
          </div>
        </section>
      </section>
    </main>
  );
}
