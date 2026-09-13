import BookFaceTexture from "./BookFaceTexture.jsx";
import { shouldShowSpineTitle } from "./lib/librarySpineMedia.js";

function coverUrl(cover) {
  const value = String(cover || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `/${value.replace(/^\/+/, "")}`;
}

export default function LibrarySpineStatic({ item }) {
  const book = item.book || {};
  const personalUrl = String(item.personal_spine_url || "").trim();
  const showTitle = shouldShowSpineTitle({
    hasPersonalSpine: Boolean(personalUrl),
    showText: item.personal_spine_show_text,
  });

  return (
    <span className={`library-spine-static ${personalUrl ? "is-personal" : "is-generated"}`}>
      <BookFaceTexture
        src={personalUrl || coverUrl(book.cover)}
        blurred={!personalUrl}
        crop={personalUrl ? item.personal_spine_crop : undefined}
      />
      <span className="library-spine-static-overlay" />
      {showTitle ? <span className="library-spine-static-title">{book.title || "Libro"}</span> : null}
      {showTitle && personalUrl && book.author ? <span className="library-spine-static-author">{book.author}</span> : null}
    </span>
  );
}
