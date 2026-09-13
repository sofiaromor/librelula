import { useRef } from "react";
import LibraryBook3D from "./LibraryBook3D.jsx";

const DRAG_THRESHOLD = 4;
const YAW_PER_PIXEL = 0.7;
const PITCH_PER_PIXEL = 0.32;

function clampPitch(value) {
  return Math.max(-35, Math.min(35, value));
}

export default function InteractiveLibraryBook3D({ item, edition, initialYaw = -12, initialPitch = -3 }) {
  const objectRef = useRef(null);
  const gestureRef = useRef(null);
  const rotationRef = useRef({ yaw: initialYaw, pitch: initialPitch });
  const draggedRef = useRef(false);

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
    if (!draggedRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    draggedRef.current = false;
  }

  return (
    <span
      className="book3d-interactive"
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
      <span className="book3d-rotate-hint" aria-hidden="true">↻</span>
    </span>
  );
}
