import BookFaceTexture from "./BookFaceTexture.jsx";
import { shouldShowSpineTitle } from "./lib/librarySpineMedia.js";
import { pickVisualEdition, resolveBookVisual } from "./lib/book3dGeometry.js";
import useBook3DColor from "./useBook3DColor.js";
import "./LibraryBook3D.css";

export default function LibrarySpineStatic({ item }) {
  const book = item.book || {};
  const edition = item.visual_edition || pickVisualEdition(book, item.editions);
  const visual = resolveBookVisual(book, edition);
  const { cloth, ink } = useBook3DColor(book, edition, visual);
  const personalUrl = String(item.personal_spine_url || "").trim();
  const generatedCover = String(edition?.cover || book.cover || "").trim();
  const showTitle = shouldShowSpineTitle({
    hasPersonalSpine: Boolean(personalUrl),
    showText: item.personal_spine_show_text,
  });
  const spineInk = personalUrl || generatedCover ? "#fffaf3" : ink;

  return (
    <span className={`library-spine-static ${personalUrl ? "is-personal" : "is-generated"}`} style={{ "--book-cloth": cloth, "--book-ink": spineInk }}>
      {personalUrl
        ? <BookFaceTexture src={personalUrl} crop={item.personal_spine_crop} />
        : generatedCover
          ? <BookFaceTexture src={generatedCover} />
          : null}
      <span className="library-spine-static-overlay" />
      {showTitle ? <span className="library-spine-static-title">{book.title || "Libro"}</span> : null}
      {showTitle && personalUrl && book.author ? <span className="library-spine-static-author">{book.author}</span> : null}
    </span>
  );
}
