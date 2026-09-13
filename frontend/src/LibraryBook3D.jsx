import BookFaceTexture from "./BookFaceTexture.jsx";
import { bookClothColor, bookThicknessRatio, normalizeBookVisual, pickVisualEdition } from "./lib/book3dGeometry.js";
import { shouldShowSpineTitle } from "./lib/librarySpineMedia.js";
import "./LibraryBook3D.css";

export default function LibraryBook3D({ item, edition, compact = false, objectRef }) {
  const book = item.book || {};
  const selected = edition || item.visual_edition || pickVisualEdition(book, item.editions);
  const visual = normalizeBookVisual(selected?.visual);
  const cover = selected?.cover || book.cover;
  const personal = item.personal_spine_url;
  const showTitle = shouldShowSpineTitle({ hasPersonalSpine: Boolean(personal), showText: item.personal_spine_show_text });
  const style = {
    "--book-depth": `calc(var(--book-width) * ${bookThicknessRatio(selected?.pages || book.pages)})`,
    "--book-cloth": bookClothColor(book),
  };
  return <span className={`book3d-stage ${compact ? "is-compact" : ""}`} style={style} aria-hidden="true">
    <span className="book3d-object" ref={objectRef}>
      <span className="book3d-face is-front">
        <BookFaceTexture src={visual.front_quad ? visual.product_image_url : cover} quad={visual.front_quad} />
        <span className="book3d-cover-gloss" />
      </span>
      <span className="book3d-face is-back">
        {!compact ? <BookFaceTexture src={cover} blurred /> : null}
        <span className="book3d-back-copy"><small>Entre estas páginas</small><strong>{book.title || "Libro"}</strong><span>{String(book.synopsis || "Esta edición aún no tiene sinopsis.").replace(/<[^>]*>/g, " ")}</span><em>{book.author || ""}</em></span>
      </span>
      <span className="book3d-face is-spine">
        <BookFaceTexture src={personal || cover} blurred={!personal} crop={personal ? item.personal_spine_crop : undefined} />
        <span className="book3d-spine-shade" />
        {showTitle ? <span className="book3d-spine-copy"><strong>{book.title || "Libro"}</strong><small>{book.author || ""}</small><em>✦</em></span> : null}
      </span>
      <span className={`book3d-face is-edge ${visual.fore_edge_quad ? "is-painted" : ""}`}>
        {!compact && visual.fore_edge_quad ? <BookFaceTexture src={visual.product_image_url} quad={visual.fore_edge_quad} /> : <span className="book3d-paper-lines" />}
      </span>
      <span className="book3d-face is-top"><span className="book3d-paper-lines" /></span>
      <span className="book3d-face is-bottom"><span className="book3d-paper-lines" /></span>
    </span>
  </span>;
}
