import { useEffect, useRef, useState } from "react";
import BookFaceTexture from "./BookFaceTexture.jsx";
import { FULL_FACE, normalizeBookVisual, normalizeFaceQuad, resolveBookVisual, safeProductImageUrl } from "./lib/book3dGeometry.js";
import { saveEditionVisual } from "./lib/bookVisualsApi.js";
import "./BookProductFaceEditor.css";

const CORNERS = ["superior izquierda", "superior derecha", "inferior derecha", "inferior izquierda"];

export default function BookProductFaceEditor({ edition, onClose, onSaved, onConfirm }) {
  const initial = resolveBookVisual(null, edition);
  const dialogRef = useRef(null);
  const photoRef = useRef(null);
  const pointerRef = useRef(null);
  const [url, setUrl] = useState(initial.product_image_url || safeProductImageUrl(edition.cover));
  const [front, setFront] = useState(initial.front_quad || FULL_FACE.map((p) => [...p]));
  const [edge, setEdge] = useState(initial.fore_edge_quad);
  const [face, setFace] = useState("front");
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const points = face === "edge" ? edge : front;
  const validFront = normalizeFaceQuad(front);
  const validEdge = normalizeFaceQuad(edge);
  const source = safeProductImageUrl(url);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  function changeSource(value) {
    setUrl(value); setImageError(false); setFront(FULL_FACE.map((p) => [...p])); setEdge(null); setFace("front"); setError("");
  }
  function updatePoint(index, point) {
    const setter = face === "edge" ? setEdge : setFront;
    setter((old) => old?.map((p, i) => i === index ? point : p));
  }
  function movePoint(event) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId || !photoRef.current) return;
    const rect = photoRef.current.getBoundingClientRect();
    updatePoint(pointer.corner, [Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))]);
  }
  async function save() {
    if (!source || !validFront || edge && !validEdge || imageError) return;
    setBusy(true); setError("");
    try {
      const draft = normalizeBookVisual({ product_image_url: source, image_gallery: [...initial.image_gallery, source], front_quad: validFront, fore_edge_quad: validEdge });
      if (onConfirm) { onConfirm(draft); return; }
      const saved = await saveEditionVisual(edition.id, draft);
      onSaved(saved);
    } catch (e) { setError(e.message || "No se pudo guardar el recorte."); }
    finally { setBusy(false); }
  }

  return <dialog ref={dialogRef} className="book-product-editor" aria-labelledby="book-product-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><small>Texturas de esta edición</small><h2 id="book-product-title">Portada y canto</h2><p>{edition.edition_label || edition.title || "Edición"}{edition.isbn ? ` · ${edition.isbn}` : ""}</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="Cerrar recorte">×</button></header>
    <p className="book-product-instructions">Elige la foto original y coloca las cuatro esquinas sobre cada cara visible. Se quitará la perspectiva sin cambiar el dibujo. Si no se ve el canto, déjalo desactivado.</p>
    <label className="book-product-url"><span>Foto de producto (HTTPS)</span><input type="url" value={url} disabled={busy} onChange={(event) => changeSource(event.target.value)} placeholder="https://…" /></label>
    {initial.image_gallery.length > 1 ? <label className="book-product-url"><span>Imágenes de la ficha</span><select value={initial.image_gallery.includes(url) ? url : ""} onChange={(event) => changeSource(event.target.value)} disabled={busy}><option value="" disabled>Seleccionar foto original</option>{initial.image_gallery.map((u, i) => <option key={u} value={u}>Foto {i + 1}</option>)}</select></label> : null}
    <label className="book-product-toggle"><input type="checkbox" disabled={busy} checked={Boolean(edge)} onChange={(event) => {
      setEdge(event.target.checked ? [[.78, .06], [.94, .02], [.94, .93], [.78, .97]] : null);
      if (!event.target.checked) setFace("front");
    }} /><span>La foto muestra el canto de páginas</span></label>
    <div className="book-product-tabs" role="group" aria-label="Cara que estás recortando"><button type="button" disabled={busy} aria-pressed={face === "front"} onClick={() => setFace("front")}>Portada</button><button type="button" disabled={!edge || busy} aria-pressed={face === "edge"} onClick={() => setFace("edge")}>Canto</button></div>
    {source ? <div className="book-product-photo" ref={photoRef}>
      <img src={source} alt="Foto original de la edición; ajusta las esquinas de la cara visible" draggable="false" onError={() => setImageError(true)} onLoad={() => setImageError(false)} />
      <svg className="book-product-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={(points || []).map(([x, y]) => `${x * 100},${y * 100}`).join(" ")} /></svg>
      {(points || []).map(([x, y], i) => <button type="button" key={i} className="book-product-corner" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} disabled={busy} aria-label={`Esquina ${CORNERS[i]} de ${face === "front" ? "portada" : "canto"}. Usa las flechas para ajustar.`} onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        pointerRef.current = { id: event.pointerId, corner: i };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={movePoint} onPointerUp={() => { pointerRef.current = null; }} onPointerCancel={() => { pointerRef.current = null; }} onLostPointerCapture={() => { pointerRef.current = null; }} onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault(); const step = event.shiftKey ? .02 : .005;
        updatePoint(i, [Math.max(0, Math.min(1, x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0))), Math.max(0, Math.min(1, y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0)))]);
      }}>{i + 1}</button>)}
    </div> : null}
    {imageError ? <p role="alert">No se pudo cargar esta imagen. Prueba otra URL original.</p> : null}
    {(!validFront || edge && !validEdge) ? <p role="alert">Las esquinas deben rodear la cara sin cruzarse. Ajusta la selección antes de guardar.</p> : null}
    <div className="book-product-preview"><div><strong>Portada rectificada</strong><span className="is-front"><BookFaceTexture src={source} quad={validFront} /></span></div>{edge ? <div><strong>Canto rectificado</strong><span className="is-edge"><BookFaceTexture src={source} quad={validEdge} /></span></div> : null}</div>
    {error ? <p role="alert">{error}</p> : null}
    <footer><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="is-primary" disabled={busy || !source || !validFront || Boolean(edge && !validEdge) || imageError} onClick={save}>{busy ? "Guardando…" : onConfirm ? "Usar estas caras" : "Guardar texturas"}</button></footer>
  </dialog>;
}
