import { useEffect, useRef, useState } from "react";
import "./NotificationBell.css";
import {
  getNotifications,
  markNotificationsRead,
  subscribeToNotifications,
} from "./lib/notificationsApi.js";

function notificationAction(type) {
  if (type === "reply") return "ha respondido a tu actualización";
  if (type === "follow") return "ha empezado a seguirte";
  return "ha indicado que le gusta tu actualización";
}

function notificationLabel(type) {
  if (type === "reply") return "Respuesta";
  if (type === "follow") return "Nuevo seguidor";
  return "Me gusta";
}

function relativeTime(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return "ahora";

  const elapsed = Math.max(0, Date.now() - time);
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "justo ahora";
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} día${days === 1 ? "" : "s"}`;

  return new Date(time).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 9.8c0-3.6-2.1-6-6-6s-6 2.4-6 6c0 6-2.5 6.4-2.5 8.2h17c0-1.8-2.5-2.2-2.5-8.2Z" />
      <path d="M9.4 21h5.2" />
    </svg>
  );
}

function NotificationTypeIcon({ type }) {
  if (type === "follow") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="3" />
        <path d="M3.8 19c.7-3.2 2.5-4.8 5.2-4.8s4.5 1.6 5.2 4.8" />
        <path d="M17 11v6M14 14h6" />
      </svg>
    );
  }

  if (type === "reply") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 11.5a7.5 7.5 0 0 1-8.6 7.4 8.8 8.8 0 0 1-3.4-1.1L4 19l1.2-3.7A7.5 7.5 0 1 1 20 11.5Z" />
        <path d="M8 11.5h8M8 8.5h5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 5.8c-1.8-2-4.9-2-6.8 0L12 8l-2-2.2c-1.9-2-5-2-6.8 0-1.8 2-1.6 5 .3 6.8L12 21l8.5-8.4c1.9-1.8 2.1-4.8.3-6.8Z" />
    </svg>
  );
}

function formatCount(value) {
  const count = Math.max(0, Number(value) || 0);
  return count > 99 ? "99+" : String(count);
}

export default function NotificationBell({ userId, onOpenNotification, onOpen }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      if (!userId) return;

      setLoading(true);
      setAvailable(null);
      setNotifications([]);
      setUnreadCount(0);
      setError("");
      setOpen(false);

      try {
        const result = await getNotifications();
        if (cancelled) return;
        setAvailable(result.available);
        setNotifications(result.notifications);
        setUnreadCount(result.unreadCount);
      } catch (loadError) {
        if (!cancelled) {
          setAvailable(true);
          setError(loadError.message || "No se pudieron cargar las notificaciones.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadNotifications();

    if (!userId) return undefined;

    const unsubscribe = subscribeToNotifications(userId, (notification) => {
      if (!notification || cancelled) return;

      setAvailable(true);
      setNotifications((current) => {
        if (current.some((item) => item.id === notification.id)) return current;
        return [notification, ...current].slice(0, 40);
      });
      if (!notification.read_at) setUnreadCount((current) => current + 1);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [userId]);

  useEffect(() => {
    if (!open) return undefined;

    function closeOnPointerDown(event) {
      if (buttonRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function markAllAsRead() {
    if (!unreadCount || marking) return;

    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;
    const now = new Date().toISOString();
    setMarking(true);
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || now })));
    setUnreadCount(0);

    try {
      await markNotificationsRead();
    } catch (markError) {
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
      setError(markError.message || "No se pudieron marcar las notificaciones.");
    } finally {
      setMarking(false);
    }
  }

  async function openNotification(notification) {
    setOpen(false);

    if (!notification.read_at) {
      const now = new Date().toISOString();
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: now } : item));
      setUnreadCount((current) => Math.max(0, current - 1));

      try {
        await markNotificationsRead([notification.id]);
      } catch (markError) {
        setError(markError.message || "No se pudo marcar la notificación.");
      }
    }

    onOpenNotification?.(notification);
  }

  const buttonLabel = unreadCount
    ? `Abrir notificaciones: ${formatCount(unreadCount)} sin leer`
    : "Abrir notificaciones";

  return (
    <div className="notification-bell-wrap">
      <button
        ref={buttonRef}
        type="button"
        className={`notification-bell-button${open ? " is-open" : ""}`}
        aria-label={buttonLabel}
        aria-expanded={open}
        aria-controls="notification-panel"
        title={buttonLabel}
        onClick={() => {
          setOpen((current) => !current);
          onOpen?.();
        }}
      >
        <BellIcon />
        {unreadCount > 0 && <span className="notification-bell-badge">{formatCount(unreadCount)}</span>}
      </button>

      {open && (
        <section
          ref={panelRef}
          className="notification-panel"
          id="notification-panel"
          role="dialog"
          aria-labelledby="notification-panel-title"
        >
          <header className="notification-panel-header">
            <div>
              <span className="notification-panel-kicker">Tu rincón lector</span>
              <h2 id="notification-panel-title">Notificaciones</h2>
            </div>
            <button
              type="button"
              className="notification-mark-all"
              onClick={markAllAsRead}
              disabled={!unreadCount || marking || loading || available === false}
            >
              {marking ? "Marcando…" : "Marcar leídas"}
            </button>
          </header>

          {loading ? (
            <p className="notification-panel-state">Buscando novedades…</p>
          ) : available === false ? (
            <div className="notification-panel-state notification-panel-state--quiet">
              <span className="notification-state-icon" aria-hidden="true"><BellIcon /></span>
              <strong>La campanita está preparada</strong>
              <p>Se activará en cuanto se termine de conectar esta versión con el servidor.</p>
            </div>
          ) : error && !notifications.length ? (
            <p className="notification-panel-state notification-panel-state--error" role="alert">{error}</p>
          ) : notifications.length ? (
            <ul className="notification-list" aria-label="Novedades recientes">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    className={`notification-item${notification.read_at ? "" : " is-unread"}`}
                    onClick={() => openNotification(notification)}
                  >
                    <span className={`notification-type-icon notification-type-icon--${notification.type}`} aria-label={notificationLabel(notification.type)}>
                      <NotificationTypeIcon type={notification.type} />
                    </span>
                    <img
                      className="notification-actor-avatar"
                      src={notification.actor_avatar}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = "/images/avatar/avatar1.png";
                      }}
                    />
                    <span className="notification-item-copy">
                      <span><strong>{notification.actor_name}</strong> {notificationAction(notification.type)}</span>
                      {notification.comment_preview && <small>«{notification.comment_preview}»</small>}
                      <time dateTime={notification.created_at || undefined}>{relativeTime(notification.created_at)}</time>
                    </span>
                    {!notification.read_at && <span className="notification-unread-dot" aria-label="Sin leer" />}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="notification-panel-state notification-panel-state--quiet">
              <span className="notification-state-icon" aria-hidden="true"><BellIcon /></span>
              <strong>Todo tranquilo por aquí</strong>
              <p>Cuando alguien responda, te siga o reaccione a una actualización, aparecerá aquí.</p>
            </div>
          )}

          {error && notifications.length > 0 && <p className="notification-inline-error" role="alert">{error}</p>}
        </section>
      )}
    </div>
  );
}
