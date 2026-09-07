import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { appUrl } from "./api.js";

import { READING_STATUSES, READING_STATUS_BY_VALUE } from "./readingStatuses.js";

const VIEWPORT_MARGIN = 12;
const MENU_GAP = 8;

export default function ReadingStatusControl({
  currentStatus,
  isLoggedIn,
  loading = false,
  saving = false,
  onSelect,
  emptyLabel = "+ Añadir a mi biblioteca",
  menuTitle = "Guardar como…",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [readingSetupOpen, setReadingSetupOpen] = useState(false);
  const [readingSetup, setReadingSetup] = useState({ mode: "percentage", totalMinutes: "", totalChapters: "" });
  const [menuPosition, setMenuPosition] = useState(null);
  const controlRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const status = READING_STATUS_BY_VALUE[currentStatus] || null;

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutside(event) {
      const insideControl = controlRef.current?.contains(event.target);
      const insideMenu = menuRef.current?.contains(event.target);
      if (!insideControl && !insideMenu) setOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!readingSetupOpen) return undefined;

    function closeSetupOnEscape(event) {
      if (event.key === "Escape") setReadingSetupOpen(false);
    }

    document.addEventListener("keydown", closeSetupOnEscape);
    return () => document.removeEventListener("keydown", closeSetupOnEscape);
  }, [readingSetupOpen]);

  useLayoutEffect(() => {
    if (!open) return undefined;

    function positionMenu() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const triggerRect = trigger.getBoundingClientRect();
      const measuredHeight = menuRef.current?.offsetHeight || 360;
      const width = Math.min(
        Math.max(220, triggerRect.width),
        Math.max(220, window.innerWidth - VIEWPORT_MARGIN * 2),
      );
      const maxHeight = Math.max(180, window.innerHeight - VIEWPORT_MARGIN * 2);
      const menuHeight = Math.min(measuredHeight, maxHeight);
      const roomBelow = window.innerHeight - triggerRect.bottom - MENU_GAP - VIEWPORT_MARGIN;
      const roomAbove = triggerRect.top - MENU_GAP - VIEWPORT_MARGIN;
      const openUpward = roomBelow < menuHeight && roomAbove > roomBelow;

      let left = triggerRect.left;
      left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN));

      let top = openUpward
        ? triggerRect.top - MENU_GAP - menuHeight
        : triggerRect.bottom + MENU_GAP;
      top = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - menuHeight - VIEWPORT_MARGIN));

      setMenuPosition({
        left,
        top,
        width,
        maxHeight,
        transformOrigin: openUpward ? "bottom center" : "top center",
      });
    }

    positionMenu();
    const animationFrame = window.requestAnimationFrame(positionMenu);

    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open]);

  function stopCardAction(event) {
    event.stopPropagation();
  }

  function selectStatus(value) {
    if (value === "reading") {
      setReadingSetup({ mode: "percentage", totalMinutes: "", totalChapters: "" });
      setReadingSetupOpen(true);
      return;
    }
    onSelect(value);
  }

  if (!isLoggedIn) {
    return (
      <a
        className={`catalog-status-login ${className}`.trim()}
        href={appUrl("login.php")}
        onClick={stopCardAction}
        onKeyDown={stopCardAction}
      >
        Iniciar sesión para guardar
      </a>
    );
  }

  const menu = open && !saving && typeof document !== "undefined"
    ? createPortal(
        <div
          className="catalog-status-menu catalog-status-menu-portal"
          role="menu"
          aria-label="Elegir estado de lectura"
          ref={menuRef}
          style={menuPosition ? {
            left: `${menuPosition.left}px`,
            top: `${menuPosition.top}px`,
            width: `${menuPosition.width}px`,
            maxHeight: `${menuPosition.maxHeight}px`,
            transformOrigin: menuPosition.transformOrigin,
            visibility: "visible",
          } : { visibility: "hidden" }}
          onClick={stopCardAction}
          onKeyDown={stopCardAction}
        >
          <span className="catalog-status-menu-title">{menuTitle}</span>
          {READING_STATUSES.map((option) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={currentStatus === option.value}
              className={currentStatus === option.value ? "is-current" : ""}
              key={option.value}
                onClick={() => {
                  setOpen(false);
                  selectStatus(option.value);
                }}
            >
              <span className={`catalog-status-dot status-${option.value}`} aria-hidden="true" />
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
              {currentStatus === option.value && <b aria-hidden="true">✓</b>}
            </button>
          ))}
          {currentStatus && (
            <button
              type="button"
              role="menuitem"
              className="catalog-status-remove"
              onClick={() => {
                setOpen(false);
                onSelect("remove");
              }}
            >
              <span aria-hidden="true">×</span>
              <span><strong>Quitar de mi biblioteca</strong><small>Deshacer este estado</small></span>
            </button>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div
        className={`catalog-status-control${open ? " is-open" : ""} ${className}`.trim()}
        ref={controlRef}
        onClick={stopCardAction}
        onKeyDown={stopCardAction}
      >
        <button
          ref={triggerRef}
          type="button"
          className={`catalog-status-trigger${status ? ` status-${currentStatus}` : ""}`}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={loading || saving}
          onClick={() => setOpen((value) => !value)}
        >
          <span>{saving ? "Guardando…" : status?.label || emptyLabel}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      {menu}
      {readingSetupOpen && typeof document !== "undefined" && createPortal(
        <div className="reading-setup-backdrop" role="presentation" onClick={() => setReadingSetupOpen(false)}>
          <section className="reading-setup-modal" role="dialog" aria-modal="true" aria-labelledby="reading-setup-title" onClick={stopCardAction}>
            <button type="button" className="reading-setup-close" aria-label="Cerrar" onClick={() => setReadingSetupOpen(false)}>×</button>
            <span className="reading-setup-kicker">Tu lectura, a tu manera</span>
            <h2 id="reading-setup-title">¿Cómo quieres medir este libro?</h2>
            <p>El avance se verá siempre como porcentaje en Inicio. Solo elegimos qué referencia usar para calcularlo.</p>
            <div className="reading-setup-options" role="radiogroup" aria-label="Modo de lectura">
              {[
                ["percentage", "Porcentaje", "Lo iré actualizando directamente"],
                ["minutes", "Minutos", "Sé cuánto dura mi lectura"],
                ["chapters", "Capítulos", "Prefiero avanzar por capítulos"],
              ].map(([mode, label, description]) => (
                <button type="button" key={mode} className={readingSetup.mode === mode ? "is-selected" : ""} role="radio" aria-checked={readingSetup.mode === mode} onClick={() => setReadingSetup((current) => ({ ...current, mode }))}>
                  <span className="reading-setup-radio" aria-hidden="true" />
                  <span><strong>{label}</strong><small>{description}</small></span>
                </button>
              ))}
            </div>
            {readingSetup.mode === "minutes" && (
              <label className="reading-setup-field">¿Cuántos minutos dura en total?
                <input type="number" min="1" autoFocus value={readingSetup.totalMinutes} onChange={(event) => setReadingSetup((current) => ({ ...current, totalMinutes: event.target.value }))} placeholder="Ej. 720" />
              </label>
            )}
            {readingSetup.mode === "chapters" && (
              <label className="reading-setup-field">¿Cuántos capítulos tiene?
                <input type="number" min="1" autoFocus value={readingSetup.totalChapters} onChange={(event) => setReadingSetup((current) => ({ ...current, totalChapters: event.target.value }))} placeholder="Ej. 30" />
              </label>
            )}
            <footer className="reading-setup-actions">
              <button type="button" className="is-secondary" onClick={() => { setReadingSetupOpen(false); onSelect("reading", { mode: "percentage" }); }}>Ahora no</button>
              <button type="button" onClick={() => { setReadingSetupOpen(false); onSelect("reading", readingSetup); }}>Empezar a leer</button>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
