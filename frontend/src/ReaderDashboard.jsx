import { useDeferredValue, useEffect, useState } from 'react'
import { apiRequest, formatDate, normalizeDocument } from './documentApi'
import './EditorDashboard.css'
import './ReaderDashboard.css'

function ReaderIcon({ name, size = 20 }) {
  let content
  switch (name) {
    case 'dashboard': content = <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>; break
    case 'library': content = <><path d="M4 5h16v14H4z" /><path d="M8 5v14M12 8h5M12 12h5M12 16h3" /></>; break
    case 'document': content = <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>; break
    case 'layers': content = <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>; break
    case 'history': content = <><path d="M4 12a8 8 0 1 0 2-5.7" /><path d="M4 4v5h5M12 7v5l3 2" /></>; break
    case 'favorite': content = <path d="m12 3 2.8 5.8 6.2.9-4.5 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.7l6.2-.9L12 3Z" />; break
    case 'search': content = <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>; break
    case 'bell': content = <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></>; break
    case 'menu': content = <path d="M4 7h16M4 12h16M4 17h16" />; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'read': content = <><path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z" /><path d="M12 7v12" /></>; break
    case 'download': content = <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></>; break
    case 'eye': content = <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>; break
    case 'star': content = <path d="m12 3 2.8 5.8 6.2.9-4.5 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.7l6.2-.9L12 3Z" />; break
    case 'lightning': content = <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />; break
    case 'logout': content = <><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" /></>; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReaderBrand() {
  return <div className="editor-brand" aria-label="Consultoría Alexandria"><svg viewBox="0 0 52 52" aria-hidden="true"><path d="M5 18h42L26 7 5 18ZM10 21v19M18 21v19M26 21v19M34 21v19M42 21v19M6 44h40" /></svg><div><span>Consultoría</span><strong>Alexandria</strong></div></div>
}

function ReaderMetric({ icon, tone, label, value, detail, down = false }) {
  return <article className="reader-metric"><span className={`reader-metric-icon is-${tone}`}><ReaderIcon name={icon} size={29} /></span><div><p>{label}</p><strong>{value}</strong><small className={down ? 'is-down' : ''}>{down ? '↓' : '↑'} <b>{detail}</b> vs. mes anterior</small></div></article>
}

function ReaderDashboard({ user, onLogout, logoutPending, error }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [documents, setDocuments] = useState([])
  const [history, setHistory] = useState([])
  useEffect(() => {
    let active = true
    Promise.all([
      apiRequest('/api/reader/documents/?limit=100'),
      apiRequest('/api/reader/history/?limit=100'),
    ]).then(([documentData, historyData]) => {
      if (!active) return
      setDocuments((documentData.results || []).map(normalizeDocument))
      setHistory(historyData.results || [])
    }).catch(() => {})
    return () => { active = false }
  }, [])
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const initials = `${user.first_name?.[0] || 'M'}${user.last_name?.[0] || 'L'}`
  const activity = history.map((event) => [event.type === 'DESCARGA' ? 'Descargaste' : 'Consultaste', `${event.document.code} ${event.document.title}`, `Versión ${event.version}`, formatDate(event.registered_at), event.type === 'DESCARGA' ? 'download' : 'read', event.type === 'DESCARGA' ? 'green' : 'blue'])
  const recommended = documents.slice(0, 5).map((item) => [item.title, item.code, `Versión ${item.version}`, item.type, 'blue'])
  const publications = documents.slice(0, 5).map((item) => [item.title, item.code, `Versión ${item.version}`, item.updated])
  const mostRead = Object.values(history.reduce((items, event) => {
    const current = items[event.document.id] || { event, count: 0 }
    items[event.document.id] = { event, count: current.count + 1 }
    return items
  }, {})).sort((left, right) => right.count - left.count).slice(0, 5).map(({ event, count }) => [event.document.title, event.document.code, `Versión ${event.version}`, String(count)])
  const visibleActivity = activity.filter((item) => !deferredQuery || item.join(' ').toLowerCase().includes(deferredQuery))
  const visiblePublications = publications.filter((item) => !deferredQuery || item.join(' ').toLowerCase().includes(deferredQuery))
  const role = user.roles?.find((item) => item.code === 'LECTOR')?.name || 'Lector'

  function action(label) {
    if (label === 'La biblioteca documental') window.dispatchEvent(new Event('reader-library-open'))
    if (label === 'Los documentos disponibles') window.dispatchEvent(new Event('reader-document-open'))
    if (label === 'El historial de versiones') window.dispatchEvent(new Event('reader-history-open'))
    if (label === 'El historial de lectura') window.dispatchEvent(new Event('reader-reading-open'))
    if (label === 'Tus favoritos') window.dispatchEvent(new Event('reader-favorites-open'))
    setNotice(label.endsWith('.') ? label : `${label} está disponible en esta vista frontend.`)
    setSidebarOpen(false)
  }

  return <main className="editor-shell reader-shell"><aside className={`editor-sidebar${sidebarOpen ? ' is-open' : ''}`}><ReaderBrand /><nav className="editor-nav reader-nav" aria-label="Navegación del lector"><button className="is-active" type="button" onClick={() => action('Dashboard')}><ReaderIcon name="dashboard" size={22} /> Dashboard</button><button type="button" onClick={() => action('La biblioteca documental')}><ReaderIcon name="library" size={22} /> Biblioteca documental</button><button type="button" onClick={() => action('Los documentos disponibles')}><ReaderIcon name="document" size={22} /> Documentos disponibles</button><button type="button" onClick={() => action('El historial de versiones')}><ReaderIcon name="layers" size={22} /> Historial de versiones</button><button type="button" onClick={() => action('El historial de lectura')}><ReaderIcon name="history" size={22} /> Historial de lectura</button><button type="button" onClick={() => action('Tus favoritos')}><ReaderIcon name="favorite" size={22} /> Favoritos</button></nav><div className="reader-sidebar-illustration" aria-hidden="true">♜</div><div className="reader-sidebar-footer">© 2024 Consultoría Alexandria.<br />Todos los derechos reservados.</div></aside>{sidebarOpen && <button className="editor-overlay" type="button" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} />}<section className="editor-workspace"><header className="editor-topbar"><button className="editor-menu" type="button" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)}><ReaderIcon name="menu" size={25} /></button><label className="editor-search"><ReaderIcon name="search" size={20} /><input type="search" aria-label="Buscar" placeholder="Buscar documentos, versiones, usuarios..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="editor-topbar__actions"><button className="editor-notification" type="button" aria-label="Notificaciones" onClick={() => setNotice('Tienes 3 notificaciones nuevas.')}><ReaderIcon name="bell" size={24} /><span>3</span></button><div className="editor-profile"><button className="editor-profile__trigger" type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span className="editor-avatar reader-profile-avatar">{initials}</span><span><strong>{user.full_name || 'Maria Lopez'}</strong><small>{role}</small></span><ReaderIcon name="chevron" size={17} /></button>{profileOpen && <div className="editor-profile__menu"><span>{user.email}</span><button type="button" onClick={onLogout} disabled={logoutPending}><ReaderIcon name="logout" size={17} /> {logoutPending ? 'Cerrando...' : 'Cerrar sesión'}</button></div>}</div></div></header><div className="editor-content reader-content">{error && <p className="editor-error" role="alert">{error}</p>}<header className="reader-heading"><div><h1>Dashboard del Lector</h1><p>Consulta documentos disponibles, realiza búsquedas y da seguimiento a tus lecturas.</p></div><time><ReaderIcon name="calendar" size={18} /> 23 de mayo de 2024</time></header><section className="reader-metrics"><ReaderMetric icon="document" tone="blue" label="Documentos disponibles" value="128" detail="18%" /><ReaderMetric icon="check" tone="green" label="Documentos leídos este mes" value="24" detail="20%" /><ReaderMetric icon="favorite" tone="orange" label="Favoritos" value="16" detail="14%" /><ReaderMetric icon="clock" tone="red" label="Lecturas pendientes" value="9" detail="10%" down /></section><div className="reader-upper-grid"><section className="reader-card reader-activity"><div className="reader-card-heading"><h2><ReaderIcon name="history" size={20} /> Actividad reciente</h2><button type="button" onClick={() => action('Toda la actividad')}>Ver todo</button></div><div className="reader-list">{visibleActivity.map((item) => <article key={`${item[0]}-${item[3]}`}><span className={`reader-list-icon is-${item[5]}`}><ReaderIcon name={item[4]} size={17} /></span><div><strong>{item[0]}</strong><span>{item[1]} <i>•</i> {item[2]}</span></div><time>{item[3]}</time></article>)}{!visibleActivity.length && <p className="reader-empty">No se encontraron actividades.</p>}</div></section><section className="reader-card reader-recommended"><div className="reader-card-heading"><h2><ReaderIcon name="favorite" size={20} /> Documentos recomendados para ti</h2><button type="button" onClick={() => action('Todos los documentos recomendados')}>Ver todos</button></div><div className="reader-list">{recommended.map((item) => <article key={item[1]}><span className={`reader-list-icon is-${item[4]}`}><ReaderIcon name="document" size={17} /></span><div><strong>{item[0]}</strong><span>{item[1]} <i>•</i> {item[2]}</span></div><b className={`reader-type is-${item[4]}`}>{item[3]}</b></article>)}</div></section><section className="reader-card reader-publications"><div className="reader-card-heading"><h2><ReaderIcon name="calendar" size={20} /> Últimas publicaciones</h2><button type="button" onClick={() => action('Todas las publicaciones')}>Ver todas</button></div><div className="reader-list">{visiblePublications.map((item) => <article key={item[1]}><span className="reader-list-icon is-blue"><ReaderIcon name="document" size={17} /></span><div><strong>{item[0]}</strong><span>{item[1]} <i>•</i> {item[2]}</span></div><time>{item[3]}</time></article>)}</div></section></div><div className="reader-lower-grid"><section className="reader-card reader-most-read"><div className="reader-card-heading"><h2><ReaderIcon name="favorite" size={20} /> Documentos más consultados</h2><button type="button" onClick={() => action('Todos los documentos consultados')}>Ver todos</button></div><div>{mostRead.map((item, index) => <article key={item[1]}><b>{index + 1}</b><div><strong>{item[0]}</strong><span>{item[1]} <i>•</i> {item[2]}</span></div><em>{item[3]}</em></article>)}</div></section><section className="reader-card reader-quick-actions"><div className="reader-card-heading"><h2><ReaderIcon name="lightning" size={20} /> Acciones rápidas</h2></div><div className="reader-quick-grid"><button type="button" onClick={() => action('Abrir biblioteca')}><ReaderIcon name="library" size={35} /><strong>Abrir biblioteca</strong><span>Explora toda la biblioteca documental</span></button><button type="button" onClick={() => action('Buscar documento')}><ReaderIcon name="search" size={35} /><strong>Buscar documento</strong><span>Encuentra documentos rápidamente</span></button><button type="button" onClick={() => action('Ver favoritos')}><ReaderIcon name="favorite" size={35} /><strong>Ver favoritos</strong><span>Accede a tus documentos marcados</span></button><button type="button" onClick={() => action('Descargar PDF')}><ReaderIcon name="download" size={35} /><strong>Descargar PDF</strong><span>Descarga documentos en formato PDF</span></button></div></section></div><footer className="editor-footer"><span>© 2024 Consultoría Alexandria. Todos los derechos reservados.</span><span>Versión 2.1.0</span></footer></div><span className="editor-live-notice" role="status">{notice}</span></section></main>
}

export default ReaderDashboard
