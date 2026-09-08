import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { apiFetch, appUrl, publicUrl, readJsonResponse } from "./api.js";
import { normalizeBookGenres } from "./bookGenres.js";
import { parseTaxonomyItems } from "./bookTaxonomy.js";
import ReadingStatusControl from "./ReadingStatusControl.jsx";
import { getBookProgressThread } from "./lib/homeDashboardApi.js";
import { removeCatalogUserBook, saveCatalogUserBookProgress } from "./lib/catalogApi.js";
import { READING_STATUS_BY_VALUE } from "./readingStatuses.js";
import AuthorLink from "./AuthorLink.jsx";
import {
  FALLBACK_HERO_COLOR,
  lighten,
  normalizeHeroColor,
} from "./heroColor.js";
import { canonicalSagaIdentity } from "./lib/sagaIdentity.js";

function isMissing(value) {
  return (
    value === null ||
    value === undefined ||
    String(value).trim() === "" ||
    value === "[]"
  );
}

function showValue(value) {
  return isMissing(value) ? "No disponible" : value;
}

function languageName(language) {
  const languages = {
    es: "Español",
    spa: "Español",
    en: "Inglés",
    eng: "Inglés",
    ca: "Catalán",
    cat: "Catalán",
    fr: "Francés",
    fre: "Francés",
    de: "Alemán",
    ger: "Alemán",
    it: "Italiano",
    ita: "Italiano",
    pt: "Portugués",
    por: "Portugués",
  };

  return languages[language] || showValue(language);
}

function editionName(edition) {
  if (edition?.edition_label) return edition.edition_label;
  if (edition?.binding) return edition.binding;
  return edition?.is_primary ? "Edición principal" : "Otra edición";
}

function editionMetadata(edition) {
  return [
    edition?.binding,
    edition?.publisher,
    edition?.year,
    edition?.pages ? `${edition.pages} páginas` : null,
  ].filter(Boolean);
}

function bookTitleWithoutSaga(book) {
  const title = String(book?.title || "").trim();
  const sagaName = String(book?.saga_name || "").trim();

  if (!sagaName) return title;

  const numberedMarker = ` (${sagaName}, #`;
  const simpleMarker = ` (${sagaName})`;
  const numberedIndex = title.lastIndexOf(numberedMarker);

  if (numberedIndex > 0 && title.endsWith(")")) {
    return title.slice(0, numberedIndex).trim();
  }

  const simpleIndex = title.lastIndexOf(simpleMarker);

  if (simpleIndex > 0 && title.endsWith(simpleMarker)) {
    return title.slice(0, simpleIndex).trim();
  }

  const genericSeriesMarker = title.match(
    /\s+\((?:[^()]*#\s*\d[^()]*)\)$/iu,
  );
  if (genericSeriesMarker?.index > 0) {
    return title.slice(0, genericSeriesMarker.index).trim();
  }

  return title;
}

function readingStatusIsFinished(item, book = null) {
  return Boolean(
    item?.status === "completed"
      || Number(item?.progress) >= 100
      || item?.finished_at
      || book?.status === "completed"
      || Number(book?.progress) >= 100
      || book?.finished_at,
  );
}

function safeExternalUrl(value) {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) return "";

  try {
    const parsedUrl = new URL(rawUrl);
    return ["http:", "https:"].includes(parsedUrl.protocol) ? parsedUrl.href : "";
  } catch {
    return "";
  }
}

function isCasaDelLibroUrl(value) {
  const safeUrl = safeExternalUrl(value);
  if (!safeUrl) return false;

  try {
    const hostname = new URL(safeUrl).hostname.toLowerCase();
    return hostname === "casadellibro.com" || hostname.endsWith(".casadellibro.com");
  } catch {
    return false;
  }
}

function casaDelLibroSearchUrl(edition, book) {
  const isbn = String(
    edition?.isbn || (edition?.is_primary ? book?.isbn : "") || "",
  ).replace(/[^0-9X]/giu, "");
  const title = String(
    edition?.title || bookTitleWithoutSaga(book) || book?.title || "",
  ).trim();
  const author = String(book?.author || "").trim();
  const query = isbn || [title, author].filter(Boolean).join(" ");

  if (!query) return "";

  const search = new URL("https://www.casadellibro.com/busqueda-generica");
  search.searchParams.set("busqueda", query);
  search.searchParams.set("nivel", "5");
  search.searchParams.set("auto", "0");
  search.searchParams.set("maxresultados", "-1");
  return search.href;
}

function editionPurchaseUrl(edition, book) {
  if (isCasaDelLibroUrl(edition?.source_url)) {
    return safeExternalUrl(edition.source_url);
  }

  return casaDelLibroSearchUrl(edition, book);
}

function parseGenres(value) {
  return normalizeBookGenres(value).slice(0, 8);
}

const POSTIT_COLORS = {
  yellow: {
    bg: "#FFF4B8",
    tape: "#E8C760",
    text: "#5C4A2F",
    page: "#8B7248",
  },
  pink: {
    bg: "#FCE4EC",
    tape: "#E7A5B8",
    text: "#744154",
    page: "#A8687E",
  },
  blue: {
    bg: "#E5F1FB",
    tape: "#91BDE0",
    text: "#35546D",
    page: "#6388A6",
  },
  green: {
    bg: "#E5F4E8",
    tape: "#91C49B",
    text: "#365D40",
    page: "#62906C",
  },
  lilac: {
    bg: "#EEE6F7",
    tape: "#B6A0D0",
    text: "#55406B",
    page: "#806A99",
  },
};

function postitPalette(color) {
  return POSTIT_COLORS[color] || POSTIT_COLORS.yellow;
}

const VIBE_CATEGORIES = [
  { key: "rhythm", label: "Ritmo y enganche" },
  { key: "emotion", label: "Emoción" },
  { key: "setting", label: "Ambiente" },
  { key: "relationships", label: "Relaciones y química" },
  { key: "impact", label: "Ideas y huella" },
];

const VIBE_OPTIONS = [
  { key: "addictive", label: "Adictivo", description: "No puedes dejarlo", category: "rhythm" },
  { key: "agile", label: "Ágil", description: "Se lee con facilidad", category: "rhythm" },
  { key: "slow_burn", label: "Pausado", description: "Se disfruta sin prisas", category: "rhythm" },
  { key: "unpredictable", label: "Impredecible", description: "Sorprende continuamente", category: "rhythm" },
  { key: "dense", label: "Denso", description: "Pide atención y tiempo", category: "rhythm" },

  { key: "cozy", label: "Acogedor", description: "Como una manta cálida", category: "emotion" },
  { key: "emotional", label: "Emotivo", description: "Deja huella", category: "emotion" },
  { key: "devastating", label: "Devastador", description: "Rompe por dentro", category: "emotion" },
  { key: "funny", label: "Divertido", description: "Te hace sonreír", category: "emotion" },
  { key: "nostalgic", label: "Nostálgico", description: "Deja una dulce melancolía", category: "emotion" },
  { key: "hopeful", label: "Esperanzador", description: "Terminas con luz", category: "emotion" },

  { key: "immersive", label: "Inmersivo", description: "Te lleva a otro mundo", category: "setting" },
  { key: "dark", label: "Oscuro", description: "Tiene un tono sombrío", category: "setting" },
  { key: "unsettling", label: "Inquietante", description: "Produce desasosiego", category: "setting" },
  { key: "dreamlike", label: "Onírico", description: "Parece un sueño", category: "setting" },
  { key: "nocturnal", label: "Nocturno", description: "Ideal para leer de noche", category: "setting" },
  { key: "luminous", label: "Luminoso", description: "Transmite ligereza", category: "setting" },

  { key: "romantic", label: "Romántico", description: "El amor es importante", category: "relationships" },
  { key: "tender", label: "Tierno", description: "Vínculos dulces y cuidados", category: "relationships" },
  { key: "romantic_tension", label: "Tensión romántica", description: "Miradas, espera y deseo", category: "relationships" },
  { key: "spicy", label: "Picante", description: "Química intensa o explícita", category: "relationships" },
  { key: "heartbreaking", label: "Desgarrador", description: "Relaciones que duelen", category: "relationships" },

  { key: "reflective", label: "Reflexivo", description: "Invita a pensar", category: "impact" },
  { key: "inspiring", label: "Inspirador", description: "Despierta ganas de actuar", category: "impact" },
  { key: "philosophical", label: "Filosófico", description: "Plantea grandes preguntas", category: "impact" },
  { key: "disturbing", label: "Perturbador", description: "Sigue rondando la cabeza", category: "impact" },
  { key: "revealing", label: "Revelador", description: "Cambia alguna perspectiva", category: "impact" },
];

const ATMOSPHERE_FIELDS = [
  { key: "pace", label: "Ritmo", left: "Contemplativo", right: "Vertiginoso", color: "#8d72b2" },
  { key: "tension", label: "Tensión", left: "Sereno", right: "Intenso", color: "#c47a4d" },
  { key: "darkness", label: "Oscuridad", left: "Luminoso", right: "Sombrío", color: "#775b6f" },
  { key: "warmth", label: "Calidez", left: "Frío", right: "Acogedor", color: "#d09a51" },
  { key: "emotion", label: "Emoción", left: "Contenido", right: "Desbordante", color: "#c87f91" },
  { key: "immersion", label: "Inmersión", left: "Distante", right: "Envolvente", color: "#62a58f" },
];

const EMPTY_ATMOSPHERE = Object.fromEntries(
  ATMOSPHERE_FIELDS.map(({ key }) => [key, 50]),
);

function atmosphereTone(field, value) {
  const numeric = Number(value) || 0;
  if (numeric <= 42) return field.left;
  if (numeric >= 58) return field.right;
  return "Equilibrado";
}

const STAR_PATH =
  "M12 2.7l2.76 5.59 6.17.9-4.47 4.35 1.06 6.14L12 16.78l-5.52 2.9 1.06-6.14-4.47-4.35 6.17-.9L12 2.7Z";

function StarMeter({ fill = 0, size = 22 }) {
  const percentage = `${Math.max(0, Math.min(1, Number(fill) || 0)) * 100}%`;

  return (
    <span
      className="detail-star-meter"
      style={{ "--star-fill": percentage, "--star-size": `${size}px`, width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24"><path d={STAR_PATH} /></svg>
      <span>
        <svg viewBox="0 0 24 24"><path d={STAR_PATH} /></svg>
      </span>
    </span>
  );
}

function AverageStarRow({ score, size = 21 }) {
  const numeric = Number(score);
  const safeScore = Number.isFinite(numeric) ? Math.max(0, Math.min(5, numeric)) : 0;

  return (
    <span className="detail-average-stars" aria-label={`${safeScore} de 5 estrellas`}>
      {[0, 1, 2, 3, 4].map((index) => (
        <StarMeter key={index} fill={safeScore - index} size={size} />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange, disabled = false, compact = false }) {
  const [hovered, setHovered] = useState(null);
  const visibleValue = hovered ?? value ?? 0;

  return (
    <div
      className={`detail-star-picker${compact ? " is-compact" : ""}`}
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHovered(star)}
          onFocus={() => setHovered(star)}
          onBlur={() => setHovered(null)}
          onClick={() => onChange(star)}
          disabled={disabled}
          aria-label={`${star} de 5 estrellas`}
          aria-pressed={value === star}
        >
          <StarMeter fill={star <= visibleValue ? 1 : 0} size={compact ? 23 : 29} />
        </button>
      ))}
    </div>
  );
}

function reviewAtmosphereDraft(data) {
  const source = data?.my_review?.atmosphere || data?.suggestions?.atmosphere;
  const result = { ...EMPTY_ATMOSPHERE };

  ATMOSPHERE_FIELDS.forEach(({ key }) => {
    const value = Number(source?.[key]);
    result[key] = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
  });

  return result;
}

function reviewVibeDraft(data) {
  return Array.isArray(data?.my_review?.vibes) ? data.my_review.vibes.slice(0, 5) : [];
}

function synopsisParagraphs(value) {
  const text = String(value || "").trim();
  if (!text) return ["No hay sinopsis disponible."];

  return text
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function sagaLabel(book) {
  const saga = canonicalSagaIdentity(book?.saga_key, book?.saga_name);
  const name = saga.name;
  const number = book?.saga_number;

  if (!name) return "";

  const numbered =
    number !== null && number !== undefined && String(number).trim() !== "";

  return numbered ? `${name} · libro ${number}` : name;
}

function Icon({ children, size = 16 }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <Icon size={14}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </Icon>
  );
}

function PdfIcon() {
  return (
    <Icon>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M7.5 16.5h1.2a1.3 1.3 0 0 0 0-2.6H7.5v4.2" />
      <path d="M11.7 18.1v-4.2h1.1a2.1 2.1 0 0 1 0 4.2Z" />
      <path d="M16.4 18.1v-4.2h2" />
      <path d="M16.4 16h1.6" />
    </Icon>
  );
}

function EpubIcon() {
  return (
    <Icon>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
    </Icon>
  );
}

function EditIcon() {
  return (
    <Icon>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Icon>
  );
}

function TrashIcon() {
  return (
    <Icon>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </Icon>
  );
}

function ChevronIcon() {
  return (
    <Icon size={12}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  );
}

function PlusIcon({ size = 24 }) {
  return (
    <Icon size={size}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  );
}

function NoteIcon() {
  return (
    <Icon size={18}>
      <path d="M5 3h10l4 4v14H5Z" />
      <path d="M15 3v5h5" />
      <path d="M8 12h8" />
      <path d="M8 16h6" />
    </Icon>
  );
}

function VibeIcon({ name }) {
  const groups = {
    flame: new Set(["addictive", "spicy"]),
    clock: new Set(["slow_burn", "nostalgic"]),
    bolt: new Set(["agile", "unpredictable", "romantic_tension"]),
    layers: new Set(["dense", "philosophical"]),
    heart: new Set(["cozy", "emotional", "romantic", "tender"]),
    brokenHeart: new Set(["devastating", "heartbreaking"]),
    smile: new Set(["funny", "hopeful", "luminous"]),
    eye: new Set(["immersive", "revealing"]),
    moon: new Set(["dark", "nocturnal", "unsettling"]),
    cloud: new Set(["dreamlike"]),
    bulb: new Set(["reflective", "inspiring"]),
    spiral: new Set(["disturbing"]),
  };

  let kind = "bulb";
  Object.entries(groups).some(([candidate, names]) => {
    if (!names.has(name)) return false;
    kind = candidate;
    return true;
  });

  const paths = {
    flame: <><path d="M13 2s1 4-2 6c-2 1.4-3 3.2-3 5.4A5 5 0 0 0 18 13c0-3.6-2.2-6.7-5-11Z" /><path d="M12 13c-1.5 1.1-2 2.3-2 3.5a2.5 2.5 0 0 0 5 0c0-1.4-.9-2.7-3-3.5Z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    bolt: <><path d="m13 2-8 12h7l-1 8 8-12h-7Z" /></>,
    layers: <><path d="m12 2 9 5-9 5-9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
    heart: <><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" /></>,
    brokenHeart: <><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" /><path d="m13 6-3 5 4 1-3 5" /></>,
    smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01M15 9h.01" /></>,
    eye: <><path d="M2 12s3.7-6 10-6 10 6 10 6-3.7 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.7" /></>,
    moon: <><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" /></>,
    cloud: <><path d="M7 18h10a4 4 0 0 0 .8-7.9A6 6 0 0 0 6.3 8.5 4.8 4.8 0 0 0 7 18Z" /><path d="m9 21 1-2m3 2 1-2" /></>,
    bulb: <><path d="M9 18h6" /><path d="M10 22h4" /><path d="M8.5 14.5A6 6 0 1 1 15.5 14.5c-1 .8-1.5 1.6-1.5 2.5h-4c0-.9-.5-1.7-1.5-2.5Z" /></>,
    spiral: <><path d="M12 21a9 9 0 1 1 9-9c0 4-3 6-6 6-2.8 0-5-1.8-5-4 0-2 1.6-3.5 3.5-3.5 1.7 0 3 1.1 3 2.5" /></>,
  };

  return <Icon size={22}>{paths[kind]}</Icon>;
}


function reviewDate(value) {
  if (!value) return "Sin fecha";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function progressDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function progressRelativeTime(value) {
  const date = new Date(value);
  const elapsed = Date.now() - date.getTime();
  if (Number.isNaN(elapsed)) return "ahora";

  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} día${days === 1 ? "" : "s"}`;

  return progressDateTime(value);
}

function readerAvatarUrl(value) {
  const clean = String(value || "").trim();
  const normalized = clean.toLowerCase();
  if (
    !clean ||
    normalized === "default.jpg" ||
    normalized === "default.png" ||
    normalized === "images/avatar/default.jpg"
  ) {
    return publicUrl("images/avatar/avatar1.png");
  }

  if (/^(?:https?:\/\/|data:|blob:)/i.test(clean)) return clean;
  return publicUrl(clean);
}

function RatingStars({ score, label = true }) {
  const numericScore = Number(score);
  const valid = Number.isFinite(numericScore);

  return (
    <span className="detail-rating-stars">
      <AverageStarRow score={valid ? numericScore : 0} size={16} />
      {label && valid && (
        <small>{numericScore.toLocaleString("es-ES")}</small>
      )}
    </span>
  );
}


export default function BookDetail({ book, onBack, onEdit, onOpenSaga, onSelectAuthor, onOpenMyReviews, isAdmin, isLoggedIn, threadTarget = null, openReviewOnLoad = false }) {
  const currentBook = book;
  const [coverFailed, setCoverFailed] = useState(false);
  const [editions, setEditions] = useState([]);
  const [editionsLoading, setEditionsLoading] = useState(true);
  const [editionsError, setEditionsError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [reviewData, setReviewData] = useState(null);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState("");
  const [reviewEditorOpen, setReviewEditorOpen] = useState(false);
  const [reviewScore, setReviewScore] = useState(null);
  const [reviewText, setReviewText] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewSaveError, setReviewSaveError] = useState("");
  const [reviewSaveMessage, setReviewSaveMessage] = useState("");
  const [reviewVibes, setReviewVibes] = useState([]);
  const [activeVibeCategory, setActiveVibeCategory] = useState("rhythm");
  const [reviewAtmosphere, setReviewAtmosphere] = useState({ ...EMPTY_ATMOSPHERE });
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingPromptOpen, setRatingPromptOpen] = useState(false);
  const [ratingPromptPosition, setRatingPromptPosition] = useState({
    top: 16,
    left: 16,
    placement: "below",
  });
  const [ratingSaveError, setRatingSaveError] = useState("");
  const [reviewDeleteOpen, setReviewDeleteOpen] = useState(false);
  const autoReviewHandledRef = useRef(false);
  const [reviewDeleting, setReviewDeleting] = useState(false);
  const [reviewDeleteError, setReviewDeleteError] = useState("");
  const [readingStatusItem, setReadingStatusItem] = useState(null);
  const [readingStatusLoading, setReadingStatusLoading] = useState(false);
  const [readingStatusSaving, setReadingStatusSaving] = useState(false);
  const [readingStatusError, setReadingStatusError] = useState("");
  const [readingStatusMessage, setReadingStatusMessage] = useState("");
  const [postits, setPostits] = useState([]);
  const [postitsAuthenticated, setPostitsAuthenticated] = useState(false);
  const [postitsLoading, setPostitsLoading] = useState(true);
  const [postitsError, setPostitsError] = useState("");
  const [postitComposerOpen, setPostitComposerOpen] = useState(false);
  const [postitText, setPostitText] = useState("");
  const [postitPage, setPostitPage] = useState("");
  const [postitColor, setPostitColor] = useState("yellow");
  const [postitSaving, setPostitSaving] = useState(false);
  const [postitDeletingId, setPostitDeletingId] = useState(null);
  const [progressThread, setProgressThread] = useState([]);
  const [progressThreadLoading, setProgressThreadLoading] = useState(false);
  const [progressThreadError, setProgressThreadError] = useState("");
  const [revealedProgressNotes, setRevealedProgressNotes] = useState({});
  const postitComposerRef = useRef(null);
  const ratingPromptAnchorRef = useRef(null);
  const canWriteReview = readingStatusIsFinished(readingStatusItem, currentBook);

  useEffect(() => {
    let cancelled = false;

    async function loadEditions() {
      if (!currentBook?.id) {
        setEditions([]);
        setEditionsLoading(false);
        return;
      }

      setEditionsLoading(true);
      setEditionsError("");

      try {
        const response = await apiFetch(
          `book_editions.php?book_id=${encodeURIComponent(currentBook.id)}`,
        );
        const data = await readJsonResponse(response);

        if (!cancelled) {
          setEditions(Array.isArray(data.editions) ? data.editions : []);
        }
      } catch (requestError) {
        if (!cancelled) {
          setEditions([]);
          setEditionsError(
            requestError instanceof Error
              ? requestError.message
              : "No se pudieron cargar las ediciones.",
          );
        }
      } finally {
        if (!cancelled) setEditionsLoading(false);
      }
    }

    loadEditions();

    return () => {
      cancelled = true;
    };
  }, [currentBook?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadReviews() {
      if (!currentBook?.id) {
        setReviewData(null);
        setReviewsLoading(false);
        return;
      }

      setReviewsLoading(true);
      setReviewsError("");

      try {
        const response = await apiFetch(
          `book_reviews.php?book_id=${encodeURIComponent(currentBook.id)}`,
        );
        const data = await readJsonResponse(response);

        if (!cancelled) {
          setReviewData(data);
          setReviewScore(data.my_review?.score ?? null);
          setReviewText(data.my_review?.review ?? "");
          setReviewVibes(reviewVibeDraft(data));
          setReviewAtmosphere(reviewAtmosphereDraft(data));
          setReviewEditorOpen(false);
          setRatingPromptOpen(false);
          setRatingSaveError("");
          setReviewSaveError("");
          setReviewSaveMessage("");
        }
      } catch (requestError) {
        if (!cancelled) {
          setReviewData(null);
          setReviewsError(
            requestError instanceof Error
              ? requestError.message
              : "No se pudieron cargar las reseñas.",
          );
        }
      } finally {
        if (!cancelled) setReviewsLoading(false);
      }
    }

    loadReviews();

    return () => {
      cancelled = true;
    };
  }, [currentBook?.id]);

  useEffect(() => {
    if (
      !openReviewOnLoad
      || autoReviewHandledRef.current
      || reviewsLoading
      || !reviewData?.authenticated
      || !canWriteReview
    ) {
      return;
    }

    autoReviewHandledRef.current = true;
    setReviewScore(reviewData?.my_review?.score ?? null);
    setReviewText(reviewData?.my_review?.review ?? "");
    setReviewVibes(reviewVibeDraft(reviewData));
    setReviewAtmosphere(reviewAtmosphereDraft(reviewData));
    setReviewSaveError("");
    setReviewSaveMessage("");
    setActiveVibeCategory("rhythm");
    setRatingPromptOpen(false);
    setReviewEditorOpen(true);
  }, [canWriteReview, openReviewOnLoad, reviewData, reviewsLoading]);

  useEffect(() => {
    let cancelled = false;

    async function loadReadingStatus() {
      setReadingStatusError("");
      setReadingStatusMessage("");

      if (!currentBook?.id || !isLoggedIn) {
        setReadingStatusItem(null);
        setReadingStatusLoading(false);
        return;
      }

      setReadingStatusLoading(true);

      try {
        const response = await apiFetch(
          `catalog_user_books.php?book_id=${encodeURIComponent(currentBook.id)}`,
        );
        const data = await readJsonResponse(response);

        if (!cancelled) {
          setReadingStatusItem(data.item || null);
        }
      } catch (requestError) {
        if (!cancelled) {
          setReadingStatusError(
            requestError instanceof Error
              ? requestError.message
              : "No se pudo consultar el estado de lectura.",
          );
        }
      } finally {
        if (!cancelled) setReadingStatusLoading(false);
      }
    }

    loadReadingStatus();

    return () => {
      cancelled = true;
    };
  }, [currentBook?.id, isLoggedIn]);

  useEffect(() => {
    let cancelled = false;

    async function loadPostits() {
      if (!currentBook?.id) {
        setPostits([]);
        setPostitsAuthenticated(false);
        setPostitsLoading(false);
        return;
      }

      setPostitsLoading(true);
      setPostitsError("");
      setPostitComposerOpen(false);

      try {
        const response = await apiFetch(
          `book_postits.php?book_id=${encodeURIComponent(currentBook.id)}`,
        );
        const data = await readJsonResponse(response);

        if (!cancelled) {
          setPostits(Array.isArray(data.postits) ? data.postits : []);
          setPostitsAuthenticated(Boolean(data.authenticated));
        }
      } catch (requestError) {
        if (!cancelled) {
          setPostits([]);
          setPostitsError(
            requestError instanceof Error
              ? requestError.message
              : "No se pudieron cargar tus post-its.",
          );
        }
      } finally {
        if (!cancelled) setPostitsLoading(false);
      }
    }

    loadPostits();

    return () => {
      cancelled = true;
    };
  }, [currentBook?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadProgressThread() {
      if (!currentBook?.id || !isLoggedIn) {
        setProgressThread([]);
        setProgressThreadLoading(false);
        setProgressThreadError("");
        return;
      }

      setProgressThreadLoading(true);
      setProgressThreadError("");

      try {
        const entries = await getBookProgressThread(currentBook.id, threadTarget?.id || null);
        if (!cancelled) setProgressThread(entries);
      } catch (error) {
        if (!cancelled) setProgressThreadError(error.message || "No se pudo cargar este recorrido lector.");
      } finally {
        if (!cancelled) setProgressThreadLoading(false);
      }
    }

    loadProgressThread();
    return () => { cancelled = true; };
  }, [currentBook?.id, isLoggedIn, threadTarget?.id]);

  useEffect(() => {
    if (!threadTarget?.id || progressThreadLoading) return undefined;

    const frame = window.requestAnimationFrame(() => {
      document.getElementById("book-progress-thread-title")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [progressThreadLoading, threadTarget?.id]);

  useEffect(() => {
    if (!postitComposerOpen) return undefined;

    function closeComposer(event) {
      if (
        event.type === "keydown" &&
        event.key !== "Escape"
      ) {
        return;
      }

      if (
        event.type === "pointerdown" &&
        postitComposerRef.current?.contains(event.target)
      ) {
        return;
      }

      setPostitComposerOpen(false);
      setPostitsError("");
    }

    document.addEventListener("pointerdown", closeComposer);
    document.addEventListener("keydown", closeComposer);

    return () => {
      document.removeEventListener("pointerdown", closeComposer);
      document.removeEventListener("keydown", closeComposer);
    };
  }, [postitComposerOpen]);

  useEffect(() => {
    if (!reviewEditorOpen && !reviewDeleteOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleReviewDialogKeydown(event) {
      if (event.key !== "Escape") return;

      if (reviewDeleteOpen) {
        setReviewDeleteOpen(false);
        setReviewDeleteError("");
        return;
      }

      setReviewEditorOpen(false);
      setReviewSaveError("");
    }

    document.addEventListener("keydown", handleReviewDialogKeydown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleReviewDialogKeydown);
    };
  }, [reviewEditorOpen, reviewDeleteOpen]);

  useEffect(() => {
    if (!ratingPromptOpen) return undefined;

    function placeRatingPrompt() {
      const anchor = ratingPromptAnchorRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 12;
      const promptWidth = Math.min(330, window.innerWidth - viewportPadding * 2);
      const promptHeight = reviewData?.authenticated ? 132 : 154;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const placement = spaceBelow < promptHeight + gap && spaceAbove > spaceBelow
        ? "above"
        : "below";
      const desiredTop = placement === "above"
        ? rect.top - promptHeight - gap
        : rect.bottom + gap;
      const top = Math.max(
        viewportPadding,
        Math.min(desiredTop, window.innerHeight - promptHeight - viewportPadding),
      );
      const left = Math.max(
        viewportPadding,
        Math.min(
          rect.right - promptWidth,
          window.innerWidth - promptWidth - viewportPadding,
        ),
      );

      setRatingPromptPosition({ top, left, placement });
    }

    function closeRatingPrompt(event) {
      if (event.key === "Escape") {
        setRatingPromptOpen(false);
      }
    }

    placeRatingPrompt();
    const frame = window.requestAnimationFrame(placeRatingPrompt);
    window.addEventListener("resize", placeRatingPrompt);
    window.addEventListener("scroll", placeRatingPrompt, true);
    document.addEventListener("keydown", closeRatingPrompt);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", placeRatingPrompt);
      window.removeEventListener("scroll", placeRatingPrompt, true);
      document.removeEventListener("keydown", closeRatingPrompt);
    };
  }, [ratingPromptOpen, reviewData?.authenticated, reviewData?.my_review?.review]);

  async function saveReadingStatus(status, readingSetup = null) {
    if (!currentBook?.id || !isLoggedIn || readingStatusSaving) return;

    setReadingStatusSaving(true);
    setReadingStatusError("");
    setReadingStatusMessage("");

    try {
      if (status === "remove") {
        await removeCatalogUserBook({ book_id: String(currentBook.id) });
        setReadingStatusItem(null);
        setReadingStatusMessage("Quitado de tu biblioteca.");
        return;
      }
      const response = await apiFetch("catalog_user_books.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          book_id: String(currentBook.id),
          status,
        }),
      });
      const data = await readJsonResponse(response);
      setReadingStatusItem(data.item || null);

      if (status === "reading" && readingSetup) {
        await saveCatalogUserBookProgress({
          book_id: String(currentBook.id),
          progress: 0,
          progress_mode: readingSetup.mode,
          total_minutes: readingSetup.totalMinutes,
          total_chapters: readingSetup.totalChapters,
        });
      }

      const label = READING_STATUS_BY_VALUE[status]?.label || "Guardado";
      setReadingStatusMessage(`Guardado como ${label.toLowerCase()}.`);
    } catch (requestError) {
      setReadingStatusError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo cambiar el estado de lectura.",
      );
    } finally {
      setReadingStatusSaving(false);
    }
  }

  function resetPostitComposer() {
    setPostitText("");
    setPostitPage("");
    setPostitColor("yellow");
    setPostitsError("");
  }

  async function handlePostitSubmit(event) {
    event.preventDefault();

    if (!currentBook?.id || postitSaving) return;

    const quote = postitText.trim();

    if (!quote) {
      setPostitsError("Escribe una frase antes de añadir el post-it.");
      return;
    }

    setPostitSaving(true);
    setPostitsError("");

    try {
      const response = await apiFetch("book_postits.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          book_id: currentBook.id,
          quote,
          page: postitPage.trim() || null,
          color: postitColor,
        }),
      });
      const data = await readJsonResponse(response);

      if (data.postit) {
        setPostits((current) => [...current, data.postit]);
      }

      resetPostitComposer();
      setPostitComposerOpen(false);
    } catch (requestError) {
      setPostitsError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo guardar el post-it.",
      );
    } finally {
      setPostitSaving(false);
    }
  }

  async function handlePostitDelete(postit) {
    if (!postit?.id || postitDeletingId !== null) return;

    const confirmed = window.confirm("¿Eliminar este post-it?");
    if (!confirmed) return;

    setPostitDeletingId(postit.id);
    setPostitsError("");

    try {
      const response = await apiFetch("book_postits.php", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: postit.id }),
      });
      await readJsonResponse(response);
      setPostits((current) => current.filter((item) => item.id !== postit.id));
    } catch (requestError) {
      setPostitsError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo eliminar el post-it.",
      );
    } finally {
      setPostitDeletingId(null);
    }
  }

  function openReviewEditor() {
    if (!canWriteReview) {
      setReviewSaveError("Podrás escribir la reseña cuando termines el libro.");
      return;
    }

    setReviewScore(reviewData?.my_review?.score ?? null);
    setReviewText(reviewData?.my_review?.review ?? "");
    setReviewVibes(reviewVibeDraft(reviewData));
    setReviewAtmosphere(reviewAtmosphereDraft(reviewData));
    setReviewSaveError("");
    setReviewSaveMessage("");
    setActiveVibeCategory("rhythm");
    setRatingPromptOpen(false);
    setReviewEditorOpen(true);
  }

  function closeReviewEditor() {
    setReviewScore(reviewData?.my_review?.score ?? null);
    setReviewText(reviewData?.my_review?.review ?? "");
    setReviewVibes(reviewVibeDraft(reviewData));
    setReviewAtmosphere(reviewAtmosphereDraft(reviewData));
    setReviewSaveError("");
    setReviewEditorOpen(false);
  }

  function toggleReviewVibe(vibe) {
    setReviewVibes((current) => {
      if (current.includes(vibe)) {
        return current.filter((item) => item !== vibe);
      }

      if (current.length >= 5) {
        setReviewSaveError("Puedes elegir un máximo de 5 sensaciones.");
        return current;
      }

      setReviewSaveError("");
      return [...current, vibe];
    });
  }

  async function handleHeaderRating(score) {
    if (!reviewData?.authenticated) {
      setRatingPromptOpen(true);
      setRatingSaveError("");
      return;
    }

    if (!currentBook?.id || ratingSaving) return;

    setRatingSaving(true);
    setRatingSaveError("");

    try {
      const response = await apiFetch("book_reviews.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          book_id: currentBook.id,
          score,
          rating_only: true,
        }),
      });
      const data = await readJsonResponse(response);

      setReviewData(data);
      setReviewScore(data.my_review?.score ?? score);
      setReviewText(data.my_review?.review ?? "");
      setReviewVibes(reviewVibeDraft(data));
      setReviewAtmosphere(reviewAtmosphereDraft(data));
      setRatingPromptOpen(true);
      setReviewSaveMessage(data.message || "Tu puntuación se ha guardado.");
    } catch (requestError) {
      setRatingSaveError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo guardar tu puntuación.",
      );
    } finally {
      setRatingSaving(false);
    }
  }

  function openReviewDelete() {
    setReviewDeleteError("");
    setReviewEditorOpen(false);
    setReviewDeleteOpen(true);
  }

  function closeReviewDelete() {
    if (reviewDeleting) return;
    setReviewDeleteError("");
    setReviewDeleteOpen(false);
  }

  async function handleReviewDelete(target) {
    if (!currentBook?.id || reviewDeleting) return;

    setReviewDeleting(true);
    setReviewDeleteError("");
    setReviewSaveMessage("");

    try {
      const response = await apiFetch("book_reviews.php", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          book_id: currentBook.id,
          target,
        }),
      });
      const data = await readJsonResponse(response);

      setReviewData(data);
      setReviewScore(data.my_review?.score ?? null);
      setReviewText(data.my_review?.review ?? "");
      setReviewVibes(reviewVibeDraft(data));
      setReviewAtmosphere(reviewAtmosphereDraft(data));
      setRatingPromptOpen(false);
      setReviewDeleteOpen(false);
      setReviewSaveMessage(data.message || "Tu opinión se ha borrado.");
    } catch (requestError) {
      setReviewDeleteError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo borrar tu opinión.",
      );
    } finally {
      setReviewDeleting(false);
    }
  }

  async function handleReviewSubmit(event) {
    event.preventDefault();

    if (!currentBook?.id || reviewSaving) return;

    if (!canWriteReview) {
      setReviewSaveError("Podrás escribir la reseña cuando termines el libro.");
      return;
    }

    const cleanReview = reviewText.trim();

    setReviewSaving(true);
    setReviewSaveError("");
    setReviewSaveMessage("");

    try {
      const response = await apiFetch("book_reviews.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          book_id: currentBook.id,
          score: reviewScore,
          review: cleanReview,
          vibes: reviewVibes,
          atmosphere: reviewAtmosphere,
        }),
      });
      const data = await readJsonResponse(response);

      setReviewData(data);
      setReviewScore(data.my_review?.score ?? null);
      setReviewText(data.my_review?.review ?? "");
      setReviewVibes(reviewVibeDraft(data));
      setReviewAtmosphere(reviewAtmosphereDraft(data));
      setReviewEditorOpen(false);
      setRatingPromptOpen(false);
      setReviewSaveMessage(
        data.message || "Tu reseña se ha guardado correctamente.",
      );
    } catch (requestError) {
      setReviewSaveError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo guardar la reseña.",
      );
    } finally {
      setReviewSaving(false);
    }
  }


  async function handleDelete() {
    if (!currentBook?.id || deleting) return;

    const confirmed = window.confirm(
      `¿Seguro que quieres eliminar "${currentBook.title}"?\n\n` +
        "Esta acción no se puede deshacer.",
    );

    if (!confirmed) return;

    setDeleting(true);
    setDeleteError("");

    try {
      const response = await apiFetch("delete_book.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentBook.id }),
      });
      const text = await response.text();
      let data;

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error("La API no devolvió un JSON válido.");
      }

      if (!response.ok || data.error) {
        throw new Error(data.error || "No se pudo eliminar el libro.");
      }

      onBack();
    } catch (requestError) {
      setDeleteError(requestError.message);
    } finally {
      setDeleting(false);
    }
  }

  if (!currentBook) {
    return (
      <main className="book-detail-page">
        <button type="button" className="detail-back-link" onClick={onBack}>
          <ArrowLeftIcon /> Volver al catálogo
        </button>
        <p>No se ha seleccionado ningún libro.</p>
      </main>
    );
  }

  const heroColor = coverFailed
    ? FALLBACK_HERO_COLOR
    : normalizeHeroColor(currentBook.hero_color || currentBook.heroColor);
  const sagaColor = lighten(heroColor, 0.55);
  const genres = parseGenres(currentBook.genre);
  const themes = parseTaxonomyItems(currentBook.themes, 12);
  const audiences = parseTaxonomyItems(currentBook.audiences, 4);
  const aesthetics = parseTaxonomyItems(currentBook.aesthetics, 8);
  const paragraphs = synopsisParagraphs(currentBook.synopsis);
  const compactMetadata = [
    currentBook.year || null,
    currentBook.pages ? `${currentBook.pages} páginas` : null,
  ].filter(Boolean);
  const insightVibes = Array.isArray(reviewData?.insights?.vibes)
    ? reviewData.insights.vibes.slice(0, 4).map((vibe) => {
        const canonical = VIBE_OPTIONS.find((option) => option.key === vibe?.key);
        return canonical ? { ...vibe, ...canonical } : vibe;
      })
    : [];
  const insightAtmosphere = reviewData?.insights?.atmosphere || EMPTY_ATMOSPHERE;
  const atmosphereDisplay = ATMOSPHERE_FIELDS.map((field) => ({
    ...field,
    value: Number(insightAtmosphere[field.key] ?? 50),
  }));
  const insightSource = reviewData?.insights?.source === "community" ? "community" : "synopsis";
  const myReviewHasScore = Number(reviewData?.my_review?.score) >= 1;
  const myReviewHasContent = Boolean(
    reviewData?.my_review?.review?.trim()
      || reviewData?.my_review?.vibes?.length
      || reviewData?.my_review?.atmosphere,
  );

  const ratingPromptPortal = ratingPromptOpen && typeof document !== "undefined"
    ? createPortal(
        <>
          <button
            type="button"
            className="hero-rating-prompt-backdrop"
            aria-label="Cerrar sugerencia de reseña"
            onClick={() => setRatingPromptOpen(false)}
          />
          <div
            className={`hero-rating-prompt is-floating is-${ratingPromptPosition.placement}`}
            role="status"
            style={{
              top: `${ratingPromptPosition.top}px`,
              left: `${ratingPromptPosition.left}px`,
            }}
          >
            {!reviewData?.authenticated ? (
              <>
                <strong>Inicia sesión para puntuar</strong>
                <p>Así podrás guardar tu valoración y escribir una reseña.</p>
                <div>
                  <button type="button" onClick={() => setRatingPromptOpen(false)}>Ahora no</button>
                  <a href={appUrl("login.php")}>Iniciar sesión</a>
                </div>
              </>
            ) : (
              canWriteReview ? (
                <>
                  <strong>Tu puntuación se ha guardado</strong>
                  <p>
                    {reviewData?.my_review?.review
                      ? "¿Quieres editar también tu reseña?"
                      : "¿Quieres escribir una reseña?"}
                  </p>
                  <div>
                    <button type="button" onClick={() => setRatingPromptOpen(false)}>Ahora no</button>
                    <button type="button" className="is-primary" onClick={openReviewEditor}>
                      {reviewData?.my_review?.review ? "Editar reseña" : "Escribir reseña"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <strong>Tu puntuación se ha guardado</strong>
                  <p>Podrás escribir tu reseña cuando termines el libro.</p>
                  <div>
                    <button type="button" onClick={() => setRatingPromptOpen(false)}>Cerrar</button>
                  </div>
                </>
              )
            )}
          </div>
        </>,
        document.body,
      )
    : null;

  return (
    <main className="book-detail-page">
      <button type="button" className="detail-back-link" onClick={onBack}>
        <ArrowLeftIcon /> Volver al catálogo
      </button>

      <article className="book-detail-hero" style={{ backgroundColor: heroColor }}>
        <div className="book-detail-cover-wrap">
          {currentBook.cover && !coverFailed ? (
            <img
              className="book-detail-cover"
              src={publicUrl(currentBook.cover)}
              alt={`Portada de ${currentBook.title}`}
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <div className="book-detail-cover-placeholder">
              <span>{bookTitleWithoutSaga(currentBook)}</span>
            </div>
          )}
        </div>

        <div className="book-detail-hero-copy">
          {currentBook.saga_name && (
            <button
              type="button"
              className="book-detail-saga"
              style={{ color: sagaColor }}
              onClick={() => {
                if (
                  typeof onOpenSaga === "function"
                  && (currentBook.saga_key || currentBook.saga_name)
                ) {
                  onOpenSaga(currentBook.saga_key, currentBook.saga_name);
                }
              }}
              disabled={!currentBook.saga_key && !currentBook.saga_name}
              title={
                currentBook.saga_key || currentBook.saga_name
                  ? `Ver todos los libros de ${currentBook.saga_name}`
                  : undefined
              }
            >
              {sagaLabel(currentBook)}
            </button>
          )}

          {genres.length > 0 && (
            <span className="book-detail-primary-genre">{genres[0]}</span>
          )}

          <h1>{bookTitleWithoutSaga(currentBook)}</h1>
          <p className="book-detail-meta">
            por <AuthorLink author={currentBook.author} onSelectAuthor={onSelectAuthor} />
            {compactMetadata.length ? ` · ${compactMetadata.join(" · ")}` : ""}
          </p>

          {genres.length > 0 && (
            <div className="book-detail-hero-genres" aria-label="Géneros">
              {genres.map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
            </div>
          )}

          <div className="book-detail-hero-rating">
            <div className="hero-rating-average">
              <span>Valoración media</span>
              <div>
                <AverageStarRow score={reviewData?.summary?.avg_rating ?? 0} size={20} />
                <strong>
                  {reviewData?.summary?.avg_rating === null || reviewData?.summary?.avg_rating === undefined
                    ? "—"
                    : Number(reviewData.summary.avg_rating).toLocaleString("es-ES", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                </strong>
                <small>
                  {Number(reviewData?.summary?.total_ratings || 0)} {Number(reviewData?.summary?.total_ratings || 0) === 1 ? "valoración" : "valoraciones"}
                </small>
              </div>
            </div>

            <div className="hero-rating-yours" ref={ratingPromptAnchorRef}>
              <span>Tu puntuación</span>
              <StarPicker
                value={reviewData?.my_review?.score ?? reviewScore}
                onChange={handleHeaderRating}
                disabled={ratingSaving || reviewsLoading}
                compact
              />
            </div>


            {ratingSaveError && <p className="hero-rating-error" role="alert">{ratingSaveError}</p>}
          </div>

          <div className="book-detail-reading-row">
            <div>
              <span>Estado de lectura</span>
              <small>Guárdalo o cambia dónde está en tu biblioteca.</small>
            </div>

            <ReadingStatusControl
              currentStatus={readingStatusItem?.status || ""}
              isLoggedIn={isLoggedIn}
              loading={readingStatusLoading}
              saving={readingStatusSaving}
              emptyLabel="+ Añadir a mi biblioteca"
              onSelect={(status, readingSetup) => saveReadingStatus(status, readingSetup)}
              className="book-detail-status-control"
            />

            {readingStatusMessage && (
              <p className="book-detail-reading-feedback is-success" role="status">
                {readingStatusMessage}
              </p>
            )}
            {readingStatusError && (
              <p className="book-detail-reading-feedback is-error" role="alert">
                {readingStatusError}
              </p>
            )}
          </div>

          <div className="book-detail-actions">
            {isAdmin && (currentBook.pdf_file || currentBook.epub_file) && (
              <div className="book-detail-action-group" aria-label="Descargas">
                {currentBook.pdf_file && (
                  <a
                    className="detail-action detail-action-primary"
                    href={publicUrl(currentBook.pdf_file)}
                    download
                  >
                    <PdfIcon /> Descargar PDF
                  </a>
                )}

                {currentBook.epub_file && (
                  <a
                    className="detail-action detail-action-secondary"
                    href={publicUrl(currentBook.epub_file)}
                    download
                  >
                    <EpubIcon /> Descargar EPUB
                  </a>
                )}
              </div>
            )}

            {isAdmin && (
              <>
                {(currentBook.pdf_file || currentBook.epub_file) && (
                  <span className="detail-action-separator" aria-hidden="true" />
                )}

                <div className="book-detail-action-group" aria-label="Gestión">
                  <button
                    type="button"
                    className="detail-icon-action"
                    aria-label="Editar libro"
                    title="Editar libro"
                    onClick={() => onEdit(currentBook)}
                  >
                    <EditIcon />
                  </button>

                  <button
                    type="button"
                    className="detail-icon-action detail-icon-action-danger"
                    aria-label="Eliminar libro"
                    title="Eliminar libro"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </article>

      <section className="book-detail-content">
        <div className="book-detail-section-heading">
          <h2>Sinopsis</h2>
        </div>

        <div className="book-detail-synopsis">
          {paragraphs.map((paragraph, index) => (
            <p key={`${currentBook.id}-synopsis-${index}`}>{paragraph}</p>
          ))}
        </div>

        {deleteError && (
          <p className="detail-feedback is-error" role="alert">
            {deleteError}
          </p>
        )}

        {(themes.length > 0 || audiences.length > 0 || aesthetics.length > 0) && (
          <section className="book-taxonomy-section" aria-label="Temas y estética del libro">
            {themes.length > 0 && (
              <div className="book-taxonomy-group">
                <div>
                  <span>Temas y representación</span>
                  <small>De qué trata el libro</small>
                </div>
                <div className="book-taxonomy-chips">
                  {themes.map((theme) => <span key={theme}>{theme}</span>)}
                </div>
              </div>
            )}
            {audiences.length > 0 && (
              <div className="book-taxonomy-group is-audience">
                <div>
                  <span>Público</span>
                  <small>Categoría de edad o etapa lectora</small>
                </div>
                <div className="book-taxonomy-chips">
                  {audiences.map((audience) => <span key={audience}>{audience}</span>)}
                </div>
              </div>
            )}
            {aesthetics.length > 0 && (
              <div className="book-taxonomy-group is-aesthetic">
                <div>
                  <span>Estética</span>
                  <small>Su imaginario visual y cultural</small>
                </div>
                <div className="book-taxonomy-chips">
                  {aesthetics.map((aesthetic) => <span key={aesthetic}>{aesthetic}</span>)}
                </div>
              </div>
            )}
          </section>
        )}

        {!reviewsLoading && reviewData && (
          <section className="book-insights-section" aria-label="Sensaciones y atmósfera del libro">
            <div className="book-vibes-block">
              <div className="book-insight-heading">
                <div>
                  <span>Este libro es perfectamente…</span>
                  <small>
                    {insightSource === "community"
                      ? "Según las opiniones de la comunidad"
                      : "Sugerencia basada en la sinopsis"}
                  </small>
                </div>
                {reviewData.authenticated && canWriteReview && (
                  <button type="button" onClick={openReviewEditor}>Añadir las tuyas</button>
                )}
              </div>

              <div className="book-vibes-grid">
                {insightVibes.map((vibe) => (
                  <article className="book-vibe-card" key={vibe.key}>
                    <VibeIcon name={vibe.key} />
                    <strong>{vibe.label}</strong>
                    <span>{vibe.description}</span>
                  </article>
                ))}
              </div>
            </div>

            <div className="book-atmosphere-block">
              <div className="book-insight-heading">
                <div>
                  <span>Atmósfera</span>
                  <small>
                    {insightSource === "community"
                      ? `Media de ${Number(reviewData.insights?.participant_count || 0)} lectores`
                      : "Estimación automática desde la sinopsis"}
                  </small>
                </div>
                {reviewData.authenticated && canWriteReview && (
                  <button type="button" onClick={openReviewEditor}>Ajustar en mi reseña</button>
                )}
              </div>

              <div className="book-atmosphere-list">
                {atmosphereDisplay.map((item) => (
                  <div className="book-atmosphere-row" key={item.key}>
                    <span className="book-atmosphere-name">
                      <strong>{item.label}</strong>
                      <small>{atmosphereTone(item, item.value)}</small>
                    </span>
                    <i><b style={{ width: `${item.value}%`, backgroundColor: item.color }} /></i>
                    <small className="book-atmosphere-value">{item.value}%</small>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {isLoggedIn && (
          <section className="book-progress-thread-section" aria-labelledby="book-progress-thread-title">
            <div className="book-detail-section-heading book-progress-thread-heading">
              <div>
                <span className="book-progress-thread-kicker">Privado para tu círculo</span>
                <h2 id="book-progress-thread-title">
                  {threadTarget?.id ? `Recorrido lector de ${threadTarget.username}` : "Mi recorrido lector"}
                </h2>
                <p>
                  {threadTarget?.id
                    ? "Puedes ver este hilo porque sois amigas en Librélula o compartís un club. Nunca aparece como contenido público."
                    : "Tus avances y publicaciones sobre este libro forman un hilo que solo pueden ver tus amigas y las personas con las que compartes club."}
                </p>
              </div>
              <span className="book-progress-thread-count">{progressThread.length} {progressThread.length === 1 ? "update" : "updates"}</span>
            </div>

            {threadTarget?.id && (
              <div className="book-progress-thread-owner">
                <img
                  src={readerAvatarUrl(threadTarget.avatar)}
                  alt={`Foto de perfil de ${threadTarget.username}`}
                  onError={(event) => {
                    event.currentTarget.src = publicUrl("images/avatar/avatar1.png");
                  }}
                />
                <span className="book-progress-thread-owner-copy">
                  <small>Hilo lector privado</small>
                  <strong>{threadTarget.username}</strong>
                  <span>Sobre <b>{currentBook.title}</b></span>
                </span>
              </div>
            )}

            {progressThreadLoading && <p className="book-progress-thread-message">Cargando hilo lector…</p>}
            {progressThreadError && <p className="book-progress-thread-message is-error">{progressThreadError}</p>}

            {!progressThreadLoading && !progressThreadError && progressThread.length === 0 && (
              <div className="book-progress-thread-empty">
                <strong>
                  {threadTarget?.id
                    ? `${threadTarget.username} todavía no ha compartido actualizaciones sobre este libro.`
                    : "Tu historia con este libro empieza aquí."}
                </strong>
                {!threadTarget?.id && <p>Actualiza el progreso desde Inicio o publica algo sobre el libro para empezar tu hilo.</p>}
              </div>
            )}

            {!progressThreadLoading && progressThread.length > 0 && (
              <div className="book-progress-thread-list">
                {progressThread.map((entry) => {
                  const hidden = entry.spoiler && !revealedProgressNotes[entry.id];
                  const isPost = entry.source === "post";

                  return (
                    <article className="book-progress-thread-item" key={entry.id}>
                      <span className="book-progress-thread-dot" aria-hidden="true" />
                      <div className={`book-progress-thread-card${entry.body ? " has-reflection" : " is-progress-only"}`}>
                        <header>
                          <div className="book-progress-thread-meta">
                            <span>{isPost ? "Reflexión" : "Avance"}</span>
                            {!isPost && (
                              <small>
                                {entry.previous_progress}% → {entry.new_progress}%
                                {entry.pages_delta > 0 ? ` · +${entry.pages_delta} páginas` : ""}
                              </small>
                            )}
                          </div>
                          <time title={progressDateTime(entry.created_at)}>
                            {progressRelativeTime(entry.created_at)}
                          </time>
                        </header>

                        {entry.body ? (
                          <p className={`book-progress-thread-reflection${hidden ? " is-hidden-spoiler" : ""}`}>
                            {hidden ? "Actualización oculta por spoilers" : entry.body}
                          </p>
                        ) : (
                          <p className="is-muted">
                            {isPost ? "Compartió una actualización sobre este libro." : "Actualizó su progreso."}
                          </p>
                        )}

                        {entry.spoiler && (
                          <button type="button" onClick={() => setRevealedProgressNotes((items) => ({ ...items, [entry.id]: !items[entry.id] }))}>
                            {hidden ? "Mostrar actualización" : "Ocultar spoilers"}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="book-postits-section" aria-labelledby="book-postits-title">
          <div className="book-detail-section-heading book-postits-heading">
            <div>
              <span className="book-postits-kicker">Frases que quieres guardar</span>
              <h2 id="book-postits-title">Mis post-its</h2>
            </div>
            {postitsAuthenticated && (
              <span className="book-postits-count">
                {postits.length} {postits.length === 1 ? "nota" : "notas"}
              </span>
            )}
          </div>

          {postitsLoading && (
            <p className="book-postits-message">Cargando tus post-its…</p>
          )}

          {!postitsLoading && !postitsAuthenticated && (
            <div className="book-postits-login">
              <NoteIcon />
              <div>
                <strong>Guarda tus frases favoritas</strong>
                <p>Inicia sesión para crear post-its privados en cada libro.</p>
              </div>
              <a href={appUrl("login.php")}>Iniciar sesión</a>
            </div>
          )}

          {!postitsLoading && postitsAuthenticated && (
            <div className="book-postits-grid">
              {postits.map((postit) => {
                const palette = postitPalette(postit.color);

                return (
                  <article
                    className="book-postit-note"
                    key={postit.id}
                    style={{
                      "--postit-bg": palette.bg,
                      "--postit-tape": palette.tape,
                      "--postit-text": palette.text,
                      "--postit-page": palette.page,
                    }}
                  >
                    <span className="book-postit-tape" aria-hidden="true" />
                    <button
                      type="button"
                      className="book-postit-delete"
                      onClick={() => handlePostitDelete(postit)}
                      disabled={postitDeletingId === postit.id}
                      aria-label="Eliminar post-it"
                      title="Eliminar post-it"
                    >
                      ×
                    </button>
                    <blockquote>“{postit.quote}”</blockquote>
                    {postit.page && <small>pág. {postit.page}</small>}
                  </article>
                );
              })}

              <div className="book-postit-add-shell" ref={postitComposerRef}>
                <button
                  type="button"
                  className="book-postit-add-card"
                  onClick={() => {
                    setPostitComposerOpen((open) => !open);
                    setPostitsError("");
                  }}
                  aria-expanded={postitComposerOpen}
                  aria-controls="book-postit-composer"
                >
                  <span><PlusIcon size={26} /></span>
                  <strong>Añadir post-it</strong>
                  <small>Guarda una frase o un momento</small>
                </button>

                {postitComposerOpen && (
                  <form
                    className="book-postit-composer"
                    id="book-postit-composer"
                    onSubmit={handlePostitSubmit}
                  >
                    <div className="book-postit-composer-top">
                      <div>
                        <span>Nuevo post-it</span>
                        <strong>¿Qué frase quieres recordar?</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPostitComposerOpen(false);
                          resetPostitComposer();
                        }}
                        aria-label="Cerrar"
                      >
                        ×
                      </button>
                    </div>

                    <textarea
                      value={postitText}
                      onChange={(event) => setPostitText(event.target.value)}
                      maxLength={1200}
                      rows={4}
                      autoFocus
                      placeholder="Escribe la frase o el momento que te haya marcado…"
                      style={{ backgroundColor: postitPalette(postitColor).bg }}
                    />

                    <div className="book-postit-composer-controls">
                      <fieldset>
                        <legend>Color</legend>
                        <div>
                          {Object.entries(POSTIT_COLORS).map(([name, palette]) => (
                            <button
                              type="button"
                              key={name}
                              className={postitColor === name ? "is-selected" : ""}
                              style={{ backgroundColor: palette.bg }}
                              onClick={() => setPostitColor(name)}
                              aria-label={`Color ${name}`}
                              aria-pressed={postitColor === name}
                            />
                          ))}
                        </div>
                      </fieldset>

                      <label>
                        <span>Página opcional</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="99999"
                          value={postitPage}
                          onChange={(event) => setPostitPage(event.target.value)}
                          placeholder="Ej. 112"
                        />
                      </label>
                    </div>

                    {postitsError && (
                      <p className="book-postit-error" role="alert">{postitsError}</p>
                    )}

                    <div className="book-postit-composer-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setPostitComposerOpen(false);
                          resetPostitComposer();
                        }}
                        disabled={postitSaving}
                      >
                        Cancelar
                      </button>
                      <button type="submit" disabled={postitSaving}>
                        {postitSaving ? "Guardando…" : "Añadir"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {postitsError && !postitComposerOpen && (
            <p className="detail-feedback is-error" role="alert">{postitsError}</p>
          )}
        </section>


        <section className="book-reviews-section" aria-labelledby="book-reviews-title">
          <div className="book-detail-section-heading book-reviews-heading">
            <div>
              <span className="book-reviews-kicker">La comunidad opina</span>
              <h2 id="book-reviews-title">Valoraciones y reseñas</h2>
            </div>
            {reviewData?.authenticated && (
              <button
                type="button"
                className="book-reviews-own-link"
                onClick={onOpenMyReviews}
              >
                Ver mis reseñas
              </button>
            )}
          </div>

          {reviewsLoading && (
            <p className="book-reviews-message">Cargando valoraciones…</p>
          )}

          {reviewsError && (
            <p className="detail-feedback is-error" role="alert">
              {reviewsError}
            </p>
          )}

          {!reviewsLoading && !reviewsError && reviewData && (
            <>
              {reviewSaveMessage && (
                <p className="review-editor-feedback is-success" role="status">
                  {reviewSaveMessage}
                </p>
              )}

              {!reviewData.authenticated && (
                <div className="book-review-login-callout">
                  <div>
                    <strong>¿Ya has leído este libro?</strong>
                    <p>Inicia sesión para puntuarlo y compartir tu reseña.</p>
                  </div>
                  <a href={appUrl("login.php")}>Iniciar sesión</a>
                </div>
              )}

              {reviewData.authenticated && !reviewEditorOpen && reviewData.my_review && (
                <article className="book-my-review">
                  <div className="book-review-topline">
                    <div>
                      <span>Tu valoración</span>
                      <RatingStars score={reviewData.my_review.score} label={false} />
                    </div>
                    <div className="book-own-review-actions">
                      <time>
                        {reviewDate(
                          reviewData.my_review.finished_at ||
                            reviewData.my_review.started_at,
                        )}
                      </time>
                      {canWriteReview && (
                        <button type="button" onClick={openReviewEditor}>
                          {reviewData.my_review.review
                            ? "Editar reseña"
                            : "Añadir reseña"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="is-danger"
                        onClick={openReviewDelete}
                      >
                        Borrar…
                      </button>
                    </div>
                  </div>
                  {reviewData.my_review.review ? (
                    <p>{reviewData.my_review.review}</p>
                  ) : (
                    <p className="is-muted">
                      Has puntuado este libro, pero todavía no escribiste una reseña.
                    </p>
                  )}
                </article>
              )}

              {reviewData.authenticated && canWriteReview && !reviewEditorOpen && !reviewData.my_review && (
                <div className="book-review-empty-callout">
                  <div>
                    <strong>¿Qué te ha parecido?</strong>
                    <p>Deja una puntuación, una reseña o ambas cosas.</p>
                  </div>
                  <button type="button" onClick={openReviewEditor}>
                    Escribir una reseña
                  </button>
                </div>
              )}

              <div className="community-reviews-heading">
                <h3>Reseñas de lectores</h3>
                <span>
                  {Number(reviewData.summary?.total_reviews || 0)}{" "}
                  {Number(reviewData.summary?.total_reviews || 0) === 1
                    ? "reseña"
                    : "reseñas"}
                </span>
              </div>

              {reviewData.reviews?.filter((review) => !review.is_mine).length > 0 ? (
                <div className="community-reviews-list">
                  {reviewData.reviews
                    .filter((review) => !review.is_mine)
                    .map((review) => (
                      <article
                        className="community-review-card"
                        key={`${review.user_id}-${review.finished_at || review.started_at || "review"}`}
                      >
                        <div className="community-review-author">
                          <img
                            src={publicUrl(review.avatar)}
                            alt={`Avatar de ${review.username}`}
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.onerror = null;
                              event.currentTarget.src = appUrl(
                                "images/avatar/avatar1.png",
                              );
                            }}
                          />
                          <div>
                            <strong>{review.username}</strong>
                            <time>
                              {reviewDate(review.finished_at || review.started_at)}
                            </time>
                          </div>
                          <RatingStars score={review.score} label={false} />
                        </div>
                        {review.review ? (
                          <p>{review.review}</p>
                        ) : (
                          <p className="is-muted">
                            Puntuó este libro sin escribir una reseña.
                          </p>
                        )}
                      </article>
                    ))}
                </div>
              ) : (
                <div className="book-reviews-empty">
                  <p>Todavía no hay otras reseñas para este libro.</p>
                </div>
              )}
            </>
          )}
        </section>

        <section className="book-editions-section" aria-labelledby="book-editions-title">
          <div className="book-editions-heading">
            <div>
              <span>La misma historia, distintos ejemplares</span>
              <h2 id="book-editions-title">Ediciones disponibles</h2>
            </div>
            {!editionsLoading && !editionsError && (
              <strong>{editions.length}</strong>
            )}
          </div>

          {editionsLoading ? (
            <p className="book-editions-feedback">Cargando ediciones…</p>
          ) : editionsError ? (
            <p className="book-editions-feedback is-error">{editionsError}</p>
          ) : editions.length > 0 ? (
            <div className="book-editions-grid">
              {editions.map((edition) => {
                const metadata = editionMetadata(edition);
                const editionCover = edition.cover || currentBook.cover;
                const purchaseUrl = editionPurchaseUrl(edition, currentBook);

                return (
                  <article className="book-edition-card" key={edition.id}>
                    <div className="book-edition-cover">
                      {editionCover && (
                        <img
                          src={publicUrl(editionCover)}
                          alt={`Portada de ${edition.title || currentBook.title}`}
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.hidden = true;
                            event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                          }}
                        />
                      )}
                      <span hidden={Boolean(editionCover)}>
                        {bookTitleWithoutSaga(currentBook)}
                      </span>
                    </div>
                    <div className="book-edition-copy">
                      <div className="book-edition-badges">
                        <span>{editionName(edition)}</span>
                        {edition.is_primary && <em>Principal</em>}
                      </div>
                      <h3>{edition.title || bookTitleWithoutSaga(currentBook)}</h3>
                      {metadata.length > 0 && <p>{metadata.join(" · ")}</p>}
                      <dl>
                        <div>
                          <dt>ISBN</dt>
                          <dd>{showValue(edition.isbn)}</dd>
                        </div>
                        <div>
                          <dt>Idioma</dt>
                          <dd>{languageName(edition.language)}</dd>
                        </div>
                        {edition.publication_date && (
                          <div>
                            <dt>Publicación</dt>
                            <dd>{edition.publication_date}</dd>
                          </div>
                        )}
                      </dl>
                      {purchaseUrl && (
                        <a
                          href={purchaseUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Abrir esta edición en Casa del Libro"
                        >
                          Comprar esta edición
                        </a>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="book-editions-feedback">
              Esta obra todavía no tiene ediciones registradas.
            </p>
          )}
        </section>

        <details className="book-technical-details">
          <summary>
            Ficha técnica completa <ChevronIcon />
          </summary>
          <dl>
            <div>
              <dt>Editorial</dt>
              <dd>{showValue(currentBook.publisher)}</dd>
            </div>
            <div>
              <dt>ISBN</dt>
              <dd>{showValue(currentBook.isbn)}</dd>
            </div>
            <div>
              <dt>Idioma</dt>
              <dd>{languageName(currentBook.language)}</dd>
            </div>
            <div>
              <dt>Año</dt>
              <dd>{showValue(currentBook.year)}</dd>
            </div>
            <div>
              <dt>Páginas</dt>
              <dd>{showValue(currentBook.pages)}</dd>
            </div>
            <div>
              <dt>Identificador</dt>
              <dd>{currentBook.id}</dd>
            </div>
          </dl>
        </details>
      </section>


      {reviewData?.authenticated && reviewDeleteOpen && (
        <div
          className="book-review-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeReviewDelete();
          }}
        >
          <section
            className="book-review-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-review-delete-title"
          >
            <button
              type="button"
              className="review-editor-close"
              onClick={closeReviewDelete}
              disabled={reviewDeleting}
              aria-label="Cerrar confirmación"
            >
              ×
            </button>
            <span className="book-review-delete-kicker">Tu opinión</span>
            <h3 id="book-review-delete-title">¿Qué quieres borrar?</h3>
            <p>
              Tu estado de lectura, progreso y fechas se conservarán. Solo se eliminará
              la información que elijas aquí.
            </p>

            <div className="book-review-delete-options">
              {myReviewHasScore && (
                <button
                  type="button"
                  onClick={() => handleReviewDelete("rating")}
                  disabled={reviewDeleting}
                >
                  <strong>Borrar solo la puntuación</strong>
                  <span>La reseña y sus sensaciones seguirán guardadas.</span>
                </button>
              )}

              {myReviewHasContent && (
                <button
                  type="button"
                  onClick={() => handleReviewDelete("review")}
                  disabled={reviewDeleting}
                >
                  <strong>Borrar solo la reseña</strong>
                  <span>También elimina sus sensaciones y atmósfera, pero conserva las estrellas.</span>
                </button>
              )}

              {myReviewHasScore && myReviewHasContent && (
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => handleReviewDelete("all")}
                  disabled={reviewDeleting}
                >
                  <strong>Borrar toda mi opinión</strong>
                  <span>Elimina la puntuación, la reseña, las sensaciones y la atmósfera.</span>
                </button>
              )}
            </div>

            {reviewDeleteError && (
              <p className="review-editor-feedback is-error" role="alert">
                {reviewDeleteError}
              </p>
            )}

            <div className="book-review-delete-footer">
              <button
                type="button"
                className="review-editor-secondary"
                onClick={closeReviewDelete}
                disabled={reviewDeleting}
              >
                Cancelar
              </button>
              {reviewDeleting && <span>Borrando…</span>}
            </div>
          </section>
        </div>
      )}

      {reviewData?.authenticated && canWriteReview && reviewEditorOpen && (
        <div
          className="book-review-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeReviewEditor();
          }}
        >
          <section
            className="book-review-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-review-dialog-title"
          >
            <form className="book-review-editor" onSubmit={handleReviewSubmit}>
              <div className="book-review-editor-heading">
                <div>
                  <span>{reviewData.my_review ? "Actualizar opinión" : "Tu opinión"}</span>
                  <h3 id="book-review-dialog-title">
                    {reviewData.my_review ? "Edita tu reseña" : "Escribe una reseña"}
                  </h3>
                </div>
                <button
                  type="button"
                  className="review-editor-close"
                  onClick={closeReviewEditor}
                  aria-label="Cerrar el editor de reseña"
                >
                  ×
                </button>
              </div>

              <fieldset className="review-score-fieldset">
                <legend>Tu puntuación</legend>
                <div className="review-score-inline">
                  <StarPicker value={reviewScore} onChange={setReviewScore} />
                  <span>{reviewScore === null ? "Sin puntuar" : `${reviewScore} de 5`}</span>
                </div>
                {reviewScore !== null && (
                  <button
                    type="button"
                    className="review-clear-score"
                    onClick={() => setReviewScore(null)}
                  >
                    Quitar puntuación
                  </button>
                )}
              </fieldset>

              <fieldset className="review-vibes-fieldset">
                <legend>¿Qué sensaciones te dejó?</legend>
                <div className="review-vibes-intro">
                  <p>Elige hasta cinco. Están organizadas para que encuentres rápido la que buscas.</p>
                  <span>{reviewVibes.length} / 5 elegidas</span>
                </div>

                <div className="review-vibe-category-tabs" role="tablist" aria-label="Categorías de sensaciones">
                  {VIBE_CATEGORIES.map((category) => (
                    <button
                      key={category.key}
                      type="button"
                      role="tab"
                      aria-selected={activeVibeCategory === category.key}
                      className={activeVibeCategory === category.key ? "is-active" : ""}
                      onClick={() => setActiveVibeCategory(category.key)}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>

                <div className="review-vibe-picker">
                  {VIBE_OPTIONS.filter((vibe) => vibe.category === activeVibeCategory).map((vibe) => {
                    const selected = reviewVibes.includes(vibe.key);
                    return (
                      <button
                        key={vibe.key}
                        type="button"
                        className={selected ? "is-selected" : ""}
                        onClick={() => toggleReviewVibe(vibe.key)}
                        aria-pressed={selected}
                      >
                        <VibeIcon name={vibe.key} />
                        <span>
                          <strong>{vibe.label}</strong>
                          <small>{vibe.description}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="review-atmosphere-fieldset">
                <legend>Atmósfera</legend>
                <p>
                  Sugerida a partir de la sinopsis. Muévela hasta que se parezca a tu experiencia.
                </p>
                <div className="review-atmosphere-editor">
                  {ATMOSPHERE_FIELDS.map((field) => {
                    const value = reviewAtmosphere[field.key] ?? 50;
                    return (
                      <label className="review-atmosphere-control" key={field.key}>
                        <span className="review-atmosphere-control-top">
                          <strong>{field.label}</strong>
                          <output>{value}% · {atmosphereTone(field, value)}</output>
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={value}
                          onChange={(event) =>
                            setReviewAtmosphere((current) => ({
                              ...current,
                              [field.key]: Number(event.target.value),
                            }))
                          }
                          style={{
                            "--range-color": field.color,
                            "--range-progress": `${value}%`,
                          }}
                        />
                        <span className="review-atmosphere-ends">
                          <small>{field.left}</small>
                          <small>{field.right}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <label className="review-text-field">
                <span>Tu reseña</span>
                <textarea
                  value={reviewText}
                  onChange={(event) => setReviewText(event.target.value)}
                  maxLength={5000}
                  rows={7}
                  placeholder="¿Qué te ha parecido? Puedes hablar de los personajes, el ritmo o lo que te hizo sentir."
                />
                <small>{reviewText.length.toLocaleString("es-ES")} / 5.000</small>
              </label>

              {reviewSaveError && (
                <p className="review-editor-feedback is-error" role="alert">
                  {reviewSaveError}
                </p>
              )}

              <div className="review-editor-actions">
                {reviewData.my_review && (
                  <button
                    type="button"
                    className="review-editor-delete"
                    onClick={openReviewDelete}
                    disabled={reviewSaving}
                  >
                    Borrar mi opinión…
                  </button>
                )}
                <button
                  type="button"
                  className="review-editor-secondary"
                  onClick={closeReviewEditor}
                  disabled={reviewSaving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="review-editor-primary"
                  disabled={reviewSaving}
                >
                  {reviewSaving ? "Guardando…" : "Guardar reseña"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {ratingPromptPortal}
    </main>
  );
}
