import { useEffect, useRef, useState } from 'react'
import { apiRequest, formatDate } from './api'
import './NotificationBell.css'

function BellIcon({ size }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></svg>
}

export default function NotificationBell({ className = 'notification-bell__trigger', iconSize = 22 }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [error, setError] = useState('')
  const rootRef = useRef(null)

  async function loadNotifications() {
    try {
      const data = await apiRequest('/api/notifications/?limit=8')
      setNotifications(data.results || [])
      setUnreadCount(Number(data.unread_count || 0))
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()
    const timer = window.setInterval(loadNotifications, 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    function closeOnOutsideClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  async function markAsRead(notification) {
    if (notification.read_at) return
    try {
      await apiRequest(`/api/notifications/${notification.id}/read/`, { method: 'POST' })
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item))
      setUnreadCount((current) => Math.max(0, current - 1))
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function markAllAsRead() {
    if (!unreadCount) return
    try {
      await apiRequest('/api/notifications/read-all/', { method: 'POST' })
      const readAt = new Date().toISOString()
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || readAt })))
      setUnreadCount(0)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return <div className="notification-bell" ref={rootRef}>
    <button className={className} type="button" aria-label={unreadCount ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'} aria-expanded={open} onClick={() => { setOpen((current) => !current); if (!open) loadNotifications() }}>
      <BellIcon size={iconSize} />
      {unreadCount > 0 && <span className="notification-bell__badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
    {open && <section className="notification-bell__panel" role="dialog" aria-label="Notificaciones">
      <header className="notification-bell__heading">
        <div><strong>Notificaciones</strong><small>{unreadCount ? `${unreadCount} sin leer` : 'Todo al día'}</small></div>
        <button type="button" onClick={markAllAsRead} disabled={!unreadCount}>Marcar todas</button>
      </header>
      {error && <p className="notification-bell__error" role="alert">{error}</p>}
      {loading && <p className="notification-bell__empty">Cargando notificaciones...</p>}
      {!loading && !notifications.length && <p className="notification-bell__empty">No hay notificaciones.</p>}
      {!loading && notifications.length > 0 && <div className="notification-bell__list">{notifications.map((notification) => <button className={`notification-bell__item${notification.read_at ? '' : ' is-unread'}`} type="button" key={notification.id} onClick={() => markAsRead(notification)}><span className="notification-bell__dot" /><span className="notification-bell__content"><strong>{notification.title}</strong><span>{notification.message}</span><time>{formatDate(notification.created_at, 'Ahora')}</time></span></button>)}</div>}
    </section>}
  </div>
}
