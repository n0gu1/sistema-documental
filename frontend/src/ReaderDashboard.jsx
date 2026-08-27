import { useDeferredValue, useEffect, useState } from 'react'
import { apiRequest, formatDate, normalizeDocument } from './documentApi'
import './EditorDashboard.css'
import './ReaderDashboard.css'

function ReaderIcon({ name, size = 20 }) {
  const content = name === 'dashboard' ? <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> : name === 'library' ? <><path d="M4 5h16v14H4z" /><path d="M8 5v14M12 8h5M12 12h5M12 16h3" /></> : name === 'document' ? <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></> : name === 'layers' ? <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></> : name === 'history' ? <><path d="M4 12a8 8 0 1 0 2-5.7" /><path d="M4 4v5h5M12 7v5l3 2" /></> : name === 'favorite' ? <path d="m12 3 2.8 5.8 6.2.9-4.5 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.7l6.2-.9L12 3Z" /> : name === 'search' ? <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></> : name === 'bell' ? <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></> : name === 'menu' ? <path d="M4 7h16M4 12h16M4 17h16" /> : name === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></> : name === 'logout' ? <><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" /></> : name === 'chevron' ? <path d="m8 10 4 4 4-4" /> : <circle cx="12" cy="12" r="8" />
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReaderBrand() {
  return <div className="editor-brand" aria-label="Consultoría Alexandria"><svg viewBox="0 0 52 52" aria-hidden="true"><path d="M5 18h42L26 7 5 18ZM10 21v19M18 21v19M26 21v19M34 21v19M42 21v19M6 44h40" /></svg><div><span>Consultoría</span><strong>Alexandria</strong></div></div>
}

function ReaderMetric({ icon, tone, label, value, detail }) {
  return <article className="reader-metric"><span className={`reader-metric-icon is-${tone}`}><ReaderIcon name={icon} size={29} /></span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>
}

function ReaderDashboard({ user, onLogout, logoutPending, error, onNavigate }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [documents, setDocuments] = useState([])
  const [history, setHistory] = useState([])
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([apiRequest('/api/reader/documents/?limit=100'), apiRequest('/api/reader/history/?limit=100')])
      .then(([documentData, historyData]) => { if (active) { setDocuments((documentData.results || []).map(normalizeDocument)); setHistory(historyData.results || []) } })
      .catch((requestError) => { if (active) setLoadError(requestError.message) })
    return () => { active = false }
  }, [])

  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Usuario'
  const initials = displayName.split(' ').map((part) => part[0]).join('').slice(0, 2) || '—'
  const visibleDocuments = documents.filter((item) => !deferredQuery || [item.code, item.title, item.type, item.area].join(' ').toLowerCase().includes(deferredQuery))
  const role = user.roles?.find((item) => item.code === 'LECTOR')?.name || 'Lector'
  const today = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date())
  const recentActivity = history.slice(0, 5)

  function action(label) {
    const views = { 'La biblioteca documental': 'library', 'Los documentos disponibles': 'document', 'El historial de versiones': 'history', 'El historial de lectura': 'reading', 'Tus favoritos': 'favorites' }
    if (views[label]) onNavigate?.(views[label], views[label] === 'history' ? documents[0]?.id : null)
    setNotice(label.endsWith('.') ? label : `${label} está disponible en esta vista.`)
    setSidebarOpen(false)
  }

  return <main className="editor-shell reader-shell"><aside className={`editor-sidebar${sidebarOpen ? ' is-open' : ''}`}><ReaderBrand /><nav className="editor-nav reader-nav" aria-label="Navegación del lector"><button className="is-active" type="button" onClick={() => action('Dashboard')}><ReaderIcon name="dashboard" size={22} /> Dashboard</button><button type="button" onClick={() => action('La biblioteca documental')}><ReaderIcon name="library" size={22} /> Biblioteca documental</button><button type="button" onClick={() => action('Los documentos disponibles')}><ReaderIcon name="document" size={22} /> Documentos disponibles</button><button type="button" onClick={() => action('El historial de versiones')}><ReaderIcon name="layers" size={22} /> Historial de versiones</button><button type="button" onClick={() => action('El historial de lectura')}><ReaderIcon name="history" size={22} /> Historial de lectura</button><button type="button" onClick={() => action('Tus favoritos')}><ReaderIcon name="favorite" size={22} /> Favoritos</button></nav><div className="reader-sidebar-illustration" aria-hidden="true">♜</div><div className="reader-sidebar-footer">© {new Date().getFullYear()} Consultoría Alexandria.<br />Todos los derechos reservados.</div></aside>{sidebarOpen && <button className="editor-overlay" type="button" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} />}<section className="editor-workspace"><header className="editor-topbar"><button className="editor-menu" type="button" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)}><ReaderIcon name="menu" size={25} /></button><label className="editor-search"><ReaderIcon name="search" size={20} /><input type="search" aria-label="Buscar" placeholder="Buscar documentos, versiones, usuarios..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="editor-topbar__actions"><button className="editor-notification" type="button" aria-label="Notificaciones" onClick={() => setNotice('No hay un contador de notificaciones disponible en el backend.')}><ReaderIcon name="bell" size={24} /></button><div className="editor-profile"><button className="editor-profile__trigger" type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span className="editor-avatar">{initials}</span><span><strong>{displayName}</strong><small>{role}</small></span><ReaderIcon name="chevron" size={17} /></button>{profileOpen && <div className="editor-profile__menu"><span>{user.email}</span><button type="button" onClick={onLogout} disabled={logoutPending}><ReaderIcon name="logout" size={17} /> {logoutPending ? 'Cerrando...' : 'Cerrar sesión'}</button></div>}</div></div></header><div className="editor-content">{(error || loadError) && <p className="editor-error" role="alert">{error || loadError}</p>}<header className="editor-heading"><div><h1>Dashboard del lector</h1><p>Consulta los documentos publicados y tu actividad de lectura.</p></div><time><ReaderIcon name="calendar" size={18} /> {today}</time></header><section className="reader-metrics"><ReaderMetric icon="document" tone="blue" label="Documentos disponibles" value={documents.length} detail="Datos publicados" /><ReaderMetric icon="history" tone="orange" label="Lecturas registradas" value={history.length} detail="Datos de tu cuenta" /><ReaderMetric icon="favorite" tone="violet" label="Documentos consultados" value={new Set(history.map((item) => item.document?.id)).size} detail="Datos de tu cuenta" /></section><div className="reader-dashboard-grid"><section className="editor-card"><div className="editor-card__heading"><h2><ReaderIcon name="document" size={20} /> Documentos disponibles</h2><button type="button" onClick={() => action('Los documentos disponibles')}>Ver todos</button></div><div className="editor-table-wrap"><table><thead><tr><th>Documento</th><th>Tipo</th><th>Área</th><th>Versión</th><th>Actualización</th></tr></thead><tbody>{visibleDocuments.slice(0, 5).map((item) => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.code}</small></td><td>{item.type}</td><td>{item.area}</td><td>{item.version}</td><td>{item.updated}</td></tr>)}</tbody></table>{!visibleDocuments.length && <p className="editor-empty">No hay documentos publicados disponibles.</p>}</div></section><section className="editor-card"><div className="editor-card__heading"><h2><ReaderIcon name="history" size={20} /> Actividad reciente</h2><button type="button" onClick={() => action('El historial de lectura')}>Ver historial</button></div><div className="editor-activity__list">{recentActivity.map((item) => <article key={item.id}><i /><div><strong>{item.type === 'DESCARGA' ? 'Descarga' : 'Consulta'}</strong><span>{item.document?.title || '—'}</span></div><time>{formatDate(item.registered_at)}</time></article>)}{!recentActivity.length && <p className="editor-empty">No hay actividad registrada.</p>}</div></section></div></div><span className="editor-live-notice" role="status">{notice}</span></section></main>
}

export default ReaderDashboard
