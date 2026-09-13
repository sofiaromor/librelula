import { lazy, Suspense, useEffect, useRef, useState } from "react";
import LibraryBook3D from "./LibraryBook3D.jsx";
import { normalizeBookVisual } from "./lib/book3dGeometry.js";
import "./Book3DInspector.css";

const BookProductFaceEditor = lazy(() => import("./BookProductFaceEditor.jsx"));
const FACES = [["front", "Portada", 0], ["spine", "Lomo", 90], ["edge", "Canto", -90], ["back", "Contraportada", 180]];

export default function Book3DInspector({ item, isAdmin = false, onClose, onSelectBook, onOpenReader, onVisualSaved }) {
  const dialogRef = useRef(null);
  const objectRef = useRef(null);
  const gestureRef = useRef(null);
  const rotationRef = useRef({ yaw: -25, pitch: -7 });
  const book = item.book || {};
  const [editions, setEditions] = useState(item.editions || []);
  const [editionId, setEditionId] = useState(item.visual_edition?.id || "");
  const [activeFace, setActiveFace] = useState("");
  const [editing, setEditing] = useState(false);
  const edition = editions.find((e) => e.id === editionId) || item.visual_edition;
  const exactEdge = Boolean(normalizeBookVisual(edition?.visual).fore_edge_quad);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; };
  }, []);

  function rotate(yaw, pitch = -7) {
    rotationRef.current = { yaw, pitch };
    if (objectRef.current) {
      objectRef.current.style.setProperty("--book-yaw", `${yaw}deg`);
      objectRef.current.style.setProperty("--book-pitch", `${pitch}deg`);
    }
  }

  function selectFace(face, yaw) { setActiveFace(face); rotate(yaw); }
  function startDrag(event) {
    if (!event.isPrimary || event.button !== 0) return;
    gestureRef.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, ...rotationRef.current };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (objectRef.current) objectRef.current.style.transition = "none";
  }
  function moveDrag(event) {
    const start = gestureRef.current;
    if (!start || start.pointer !== event.pointerId) return;
    rotate(start.yaw + (event.clientX - start.x) * .65, Math.max(-35, Math.min(35, start.pitch - (event.clientY - start.y) * .3)));
  }
  function endDrag() {
    if (!gestureRef.current) return;
    gestureRef.current = null;
    if (objectRef.current) objectRef.current.style.transition = "";
    setActiveFace("");
  }
  function onKeyDown(event) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
    event.preventDefault();
    const { yaw, pitch } = rotationRef.current;
    if (event.key === "Home") rotate(-25, -7);
    else rotate(yaw + (event.key === "ArrowLeft" ? -15 : event.key === "ArrowRight" ? 15 : 0), Math.max(-35, Math.min(35, pitch + (event.key === "ArrowUp" ? -5 : event.key === "ArrowDown" ? 5 : 0))));
    setActiveFace("");
  }
  function navigate(callback) { onClose(); callback?.(book); }

  return <dialog ref={dialogRef} className="book3d-inspector" aria-labelledby="book3d-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="book3d-inspector-header"><div><small>Un libro entre tus manos</small><h2 id="book3d-title">{book.title || "Libro"}</h2><p>{book.author || ""}</p></div><button type="button" onClick={onClose} aria-label="Cerrar libro 3D" autoFocus>×</button></header>
    {editions.length > 1 || editions.length && !edition ? <label className="book3d-edition-picker"><span>Ver edición</span><select value={editionId} onChange={(event) => setEditionId(event.target.value)}>{!editionId ? <option value="" disabled>Elegir edición</option> : null}{editions.map((e) => <option key={e.id} value={e.id}>{e.edition_label || e.binding || (e.is_primary ? "Edición principal" : "Otra edición")}{e.isbn ? ` · ${e.isbn}` : ""}</option>)}</select></label> : edition ? <p className="book3d-edition-caption">{edition.edition_label || edition.binding || "Edición principal"}{edition.isbn ? ` · ISBN ${edition.isbn}` : ""}</p> : null}
    <div className="book3d-inspector-scene" tabIndex={0} role="group" aria-label="Libro 3D. Arrastra para girar o usa las flechas del teclado." onKeyDown={onKeyDown} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
      <LibraryBook3D item={item} edition={edition} objectRef={objectRef} />
      <span className="book3d-scene-shadow" />
    </div>
    <p className="book3d-drag-hint">Arrastra con el dedo o el cursor para girarlo</p>
    <div className="book3d-face-switcher" role="group" aria-label="Caras del libro">{FACES.map(([id, label, yaw]) => <button type="button" key={id} aria-pressed={activeFace === id} onClick={() => selectFace(id, yaw)}>{label}</button>)}</div>
    <p className="book3d-texture-note">{exactEdge ? "Canto recortado de la foto de esta edición." : "Canto de papel recreado: todavía no hay una foto del canto de esta edición."} El lomo y la contraportada son una composición; el grosor es aproximado según sus páginas.</p>
    {book.synopsis ? <details className="book3d-synopsis"><summary>Leer sinopsis</summary><p>{String(book.synopsis).replace(/<[^>]*>/g, " ")}</p></details> : null}
    {isAdmin && edition?.id ? <button className="book3d-edit-textures" type="button" onClick={() => setEditing(true)}>Ajustar portada y canto de esta edición</button> : null}
    <footer className="book3d-inspector-footer">{onSelectBook ? <button type="button" onClick={() => navigate(onSelectBook)}>Abrir ficha</button> : null}{onOpenReader ? <button type="button" className="is-primary" onClick={() => navigate(onOpenReader)}>Abrir lector</button> : <button type="button" className="is-primary" onClick={onClose}>Volver</button>}</footer>
    {editing ? <Suspense fallback={<p role="status">Abriendo el recorte…</p>}><BookProductFaceEditor edition={edition} onClose={() => setEditing(false)} onSaved={(visual) => { setEditions((rows) => rows.map((e) => e.id === edition.id ? { ...e, visual } : e)); onVisualSaved?.(edition.id, visual); setEditing(false); }} /></Suspense> : null}
  </dialog>;
}
