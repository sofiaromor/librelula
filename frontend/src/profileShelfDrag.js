const dragState = {
  shelf: null,
  pointerId: null,
  startX: 0,
  startScrollLeft: 0,
  dragged: false,
};

function clearDragState() {
  dragState.shelf?.classList.remove("is-dragging");
  dragState.shelf = null;
  dragState.pointerId = null;
  dragState.startX = 0;
  dragState.startScrollLeft = 0;
  dragState.dragged = false;
}

if (typeof document !== "undefined" && !window.__librelulaProfileShelfDrag) {
  window.__librelulaProfileShelfDrag = true;

  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const shelf = event.target.closest?.(".profile-v2-bookshelf-books");
    if (!shelf || shelf.scrollWidth <= shelf.clientWidth + 2) return;

    dragState.shelf = shelf;
    dragState.pointerId = event.pointerId;
    dragState.startX = event.clientX;
    dragState.startScrollLeft = shelf.scrollLeft;
    dragState.dragged = false;
    shelf.classList.add("is-dragging");

    try {
      shelf.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional; document-level listeners still keep drag working.
    }
  });

  document.addEventListener("pointermove", (event) => {
    if (!dragState.shelf || event.pointerId !== dragState.pointerId) return;

    const delta = event.clientX - dragState.startX;
    if (Math.abs(delta) > 4) dragState.dragged = true;
    if (!dragState.dragged) return;

    dragState.shelf.scrollLeft = dragState.startScrollLeft - delta;
    event.preventDefault();
  }, { passive: false });

  const finishDrag = (event) => {
    if (!dragState.shelf || event.pointerId !== dragState.pointerId) return;
    const shelf = dragState.shelf;

    if (dragState.dragged) {
      shelf.dataset.didDrag = "1";
      window.setTimeout(() => {
        if (shelf.dataset.didDrag === "1") delete shelf.dataset.didDrag;
      }, 0);
    }

    try {
      if (shelf.hasPointerCapture?.(event.pointerId)) shelf.releasePointerCapture(event.pointerId);
    } catch {
      // No-op when the browser already released capture.
    }

    clearDragState();
  };

  document.addEventListener("pointerup", finishDrag);
  document.addEventListener("pointercancel", finishDrag);

  document.addEventListener("click", (event) => {
    const shelf = event.target.closest?.(".profile-v2-bookshelf-books");
    if (shelf?.dataset.didDrag === "1") {
      event.preventDefault();
      event.stopPropagation();
      delete shelf.dataset.didDrag;
    }
  }, true);
}
