import { useRef, useState } from "react";
import LibraryBook3D from "./LibraryBook3D.jsx";
import { bookImageUrl, pickVisualEdition } from "./lib/book3dGeometry.js";

const DRAG_THRESHOLD = 4;
const YAW_PER_PIXEL = 0.7;
const PITCH_PER_PIXEL = 0.32;

function clampPitch(value) {
  return Math.max(-35, Math.min(35, value));
}

export default function InteractiveLibraryBook3D({ item, edition, initialYaw = -12, initialPitch = -3, onOpen, openLabel, children }) {
  const book = item.book || {};
  const selected = edition || item.visual_edition || pickVisualEdition(book, item.editions);
  const originalCover = bookImageUrl(selected?.cover || book.cover);
  const objectRef = useRef(null);
  const surfaceRef = useRef(null);
  const gestureRef = useRef(null);
  const rotationRef = useRef({ yaw: initialYaw, pitch: initialPitch });
  const draggedRef = useRef(false);
  const [isFlat, setIsFlat] = useState(false);
  const [loadedCover, setLoadedCover] = useState("");
  const [failedCover, setFailedCover] = useState("");
  const hasOriginalCover = Boolean(originalCover && failedCover !== originalCover);
  const originalReady = hasOriginalCover && loadedCover === originalCover;
  const Surface = typeof onOpen === "function" ? "button" : "span";

  function applyRotation(yaw, pitch) {
    rotationRef.current = { yaw, pitch };
    if (!objectRef.current) return;
    objectRef.current.style.setProperty("--book-yaw", `${yaw}deg`);
    objectRef.current.style.setProperty("--book-pitch", `${pitch}deg`);
  }

  function startDrag(event) {
    if (!event.isPrimary || event.button !== 0) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      ...rotationRef.current,
    };
    draggedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event) {
    const start = gestureRef.current;
    if (!start || start.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (!draggedRef.current && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;

    if (!draggedRef.current) setIsFlat(false);
    draggedRef.current = true;
    event.preventDefault();
    applyRotation(
      start.yaw + deltaX * YAW_PER_PIXEL,
      clampPitch(start.pitch - deltaY * PITCH_PER_PIXEL),
    );
  }

  function endDrag(event) {
    const start = gestureRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleClick(event) {
    if (draggedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      draggedRef.current = false;
      return;
    }
    onOpen?.();
  }

  function resetTo2D(event) {
    event.preventDefault();
    event.stopPropagation();
    const pointerId = gestureRef.current?.pointerId;
    gestureRef.current = null;
    if (pointerId != null && surfaceRef.current?.hasPointerCapture?.(pointerId)) {
      surfaceRef.current.releasePointerCapture(pointerId);
    }
    draggedRef.current = false;
    applyRotation(0, 0);
    setIsFlat(true);
  }

  return (
    <span className={`book3d-interactive ${isFlat ? "is-flat" : ""} ${originalReady ? "has-original-cover" : ""}`}>
      <Surface
        ref={surfaceRef}
        className="book3d-drag-surface"
        type={Surface === "button" ? "button" : undefined}
        aria-label={Surface === "button" ? openLabel || `Abrir ${item.book?.title || "este libro"}` : undefined}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onClick={handleClick}
      >
        <LibraryBook3D
          item={item}
          edition={edition}
          objectRef={objectRef}
          initialYaw={initialYaw}
          initialPitch={initialPitch}
        />
        {isFlat && hasOriginalCover ? <img
          className="book3d-original-cover"
          src={originalCover}
          alt=""
          loading="lazy"
          decoding="async"
          draggable="false"
          onLoad={() => setLoadedCover(originalCover)}
          onError={() => setFailedCover(originalCover)}
        /> : null}
        {children}
      </Surface>
      <button
        type="button"
        className="book3d-reset-2d"
        onClick={resetTo2D}
        aria-label={`Volver al modo 2D de ${item.book?.title || "este libro"}`}
        title="Volver al modo 2D"
      >2D</button>
    </span>
  );
}
