import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { apiRequest, downloadFile, formatDate, normalizeDocument } from './documentApi'
import './EditorDashboard.css'
import './ReaderDashboard.css'

function ReaderIcon({ name, size = 20 }) {
  const content = name === 'dashboard' ? <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> : name === 'library' || name === 'folder' ? <><path d="M3 7.5h7l2 2h9v9.5H3z" /><path d="M3 7.5V5h7l2 2h9v2.5" /></> : name === 'document' ? <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></> : name === 'layers' ? <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></> : name === 'history' || name === 'clock' ? <><path d="M4 12a8 8 0 1 0 2-5.7" /><path d="M4 4v5h5M12 7v5l3 2" /></> : name === 'favorite' || name === 'star' ? <path d="m12 3 2.8 5.8 6.2.9-4.5 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.7l6.2-.9L12 3Z" /> : name === 'search' ? <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></> : name === 'bell' ? <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></> : name === 'menu' ? <path d="M4 7h16M4 12h16M4 17h16" /> : name === 'download' ? <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></> : name === 'chart' ? <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 5-7" /></> : <circle cx="12" cy="12" r="8" />
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'favorite' || name === 'star' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReaderBrand() {
  return <div className="editor-brand" aria-label="Consultoría Alexandria"><svg viewBox="0 0 52 52" aria-hidden="true"><path d="M5 18h42L26 7 5 18ZM10 21v19M18 21v19M26 21v19M34 21v19M42 21v19M6 44h40" /></svg><div><span>Consultoría</span><strong>Alexandria</strong></div></div>
}

function ReaderMetric({ icon, tone, label, value, detail }) {
  return <article className="reader-metric"><span className={`reader-metric-icon is-${tone}`}><ReaderIcon name={icon} size={29} /></span><div><p>{label}</p><strong>{value}</strong>{detail && <small>{detail}</small>}</div></article>
}

function ReaderCard({ title, icon, action, children, className = '' }) {
  return <section className={`reader-card ${className}`}><header className="reader-card-heading"><h2><ReaderIcon name={icon} size={19} /> {title}</h2>{action}</header>{children}</section>
}

function EmptyState({ children }) {
  return <p className="reader-empty">{children}</p>
}

function isSameMonth(value, date) {
  if (!value) return false
  const parsed = new Date(value)
  return parsed.getFullYear() === date.getFullYear() && parsed.getMonth() === date.getMonth()
}

function ReaderDashboard({ user, onLogout, logoutPending, error, onNavigate }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [documents, setDocuments] = useState([])
  const [history, setHistory] = useState([])
  const [loadError, setLoadError] = useState('')
  const searchRef = useRef(null)

  useEffect(() => {
    let active = true
    Promise.all([apiRequest('/api/reader/documents/?limit=100'), apiRequest('/api/reader/history/?limit=100')])
      .then(([documentData, historyData]) => {
        if (!active) return
        setDocuments((documentData.results || []).map(normalizeDocument))
        setHistory(historyData.results || [])
      })
      .catch((requestError) => { if (active) setLoadError(requestError.message) })
    return () => { active = false }
  }, [])

  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Usuario'
  const initials = displayName.split(' ').map((part) => part[0]).join('').slice(0, 2) || '—'
  const today = new Date()
  const visibleDocuments = documents.filter((item) => !deferredQuery || [item.code, item.title, item.type, item.area].join(' ').toLowerCase().includes(deferredQuery))
  const recentActivity = history.slice(0, 5)
  const monthReadings = history.filter((item) => item.type === 'LECTURA' && isSameMonth(item.registered_at, today)).length
  const consultedDocuments = new Set(history.filter((item) => item.type !== 'DESCARGA').map((item) => item.document?.id)).size
  const popularDocuments = Object.values(history.reduce((result, item) => {
    if (!item.document?.id || item.type === 'DESCARGA') return result
    const current = result[item.document.id] || { ...item.document, count: 0, version: item.version }
    current.count += 1
    result[item.document.id] = current
    return result
  }, {})).sort((left, right) => right.count - left.count).slice(0, 5)

  function navigate(view, documentId = null) {
    onNavigate?.(view, documentId)
    setSidebarOpen(false)
  }

  function showNotice(message) {
    setNotice(message)
    setSidebarOpen(false)
  }

  function focusSearch() {
    searchRef.current?.focus()
    showNotice('Usa la búsqueda para filtrar los documentos disponibles.')
  }

  function downloadFirstDocument() {
    const document = documents.find((item) => item.downloadUrl)
    if (!document) return showNotice('No hay una versión descargable disponible.')
    downloadFile(document.downloadUrl)
  }

  return (
    <main className="editor-shell reader-shell">
      <aside className={`editor-sidebar${sidebarOpen ? ' is-open' : ''}`}>
        <ReaderBrand />
        <nav className="editor-nav reader-nav" aria-label="Navegación del lector">
          <button className="is-active" type="button" onClick={() => navigate('dashboard')}><ReaderIcon name="dashboard" size={22} /> Dashboard</button>
          <button type="button" onClick={() => navigate('library')}><ReaderIcon name="library" size={22} /> Biblioteca documental</button>
          <button type="button" onClick={() => navigate('document')}><ReaderIcon name="document" size={22} /> Documentos disponibles</button>
          <button type="button" onClick={() => navigate('history', documents[0]?.id)}><ReaderIcon name="layers" size={22} /> Historial de versiones</button>
          <button type="button" onClick={() => navigate('reading')}><ReaderIcon name="history" size={22} /> Historial de lectura</button>
          <button type="button" onClick={() => navigate('favorites')}><ReaderIcon name="favorite" size={22} /> Favoritos</button>
        </nav>
        <div className="reader-sidebar-illustration" aria-hidden="true">♜</div>
        <div className="reader-sidebar-footer">© {today.getFullYear()} Consultoría Alexandria.<br />Todos los derechos reservados.</div>
      </aside>
      {sidebarOpen && <button className="editor-overlay" type="button" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} />}
      <section className="editor-workspace">
        <header className="editor-topbar">
          <button className="editor-menu" type="button" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)}><ReaderIcon name="menu" size={25} /></button>
          <label className="editor-search"><ReaderIcon name="search" size={20} /><input ref={searchRef} type="search" aria-label="Buscar" placeholder="Buscar documentos, versiones, usuarios..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="editor-topbar__actions">
            <button className="editor-notification" type="button" aria-label="Notificaciones"><ReaderIcon name="bell" size={23} /></button>
            <div className="editor-profile">
              <button className="editor-profile__trigger" type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen((current) => !current)}><span className="editor-avatar">{initials}</span><span><strong>{displayName}</strong><small>{user.roles?.find((item) => item.code === 'LECTOR')?.name || 'Lector'}</small></span><ReaderIcon name="chevron" size={17} /></button>
              {profileOpen && <div className="editor-profile__menu"><span>{user.email}</span><button type="button" onClick={onLogout} disabled={logoutPending}><ReaderIcon name="logout" size={16} /> {logoutPending ? 'Cerrando sesión...' : 'Cerrar sesión'}</button></div>}
            </div>
          </div>
        </header>
        <main className="editor-content reader-content">
          <header className="reader-heading"><div><h1>Dashboard del lector</h1><p>Consulta documentos disponibles, realiza búsquedas y da seguimiento a tus lecturas.</p></div><time><ReaderIcon name="calendar" size={19} />{new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(today)}</time></header>
          {(error || loadError) && <p className="editor-error" role="alert">{error || loadError}</p>}
          <section className="reader-metrics">
            <ReaderMetric icon="document" tone="blue" label="Documentos disponibles" value={documents.length} detail="Publicados y accesibles" />
            <ReaderMetric icon="history" tone="green" label="Lecturas este mes" value={monthReadings} detail="Registros de lectura" />
            <ReaderMetric icon="favorite" tone="orange" label="Favoritos" value={documents.filter((item) => item.favorite).length} detail="Documentos marcados" />
            <ReaderMetric icon="clock" tone="red" label="Documentos consultados" value={consultedDocuments} detail="Según tu historial" />
          </section>
          <section className="reader-dashboard-grid">
            <ReaderCard title="Actividad reciente" icon="history" action={<button type="button" onClick={() => navigate('reading')}>Ver todo</button>} className="reader-activity-card">
              <div className="reader-activity-list">{recentActivity.length ? recentActivity.map((item) => <article key={item.id}><span className="reader-activity-icon"><ReaderIcon name={item.type === 'DESCARGA' ? 'download' : item.type === 'LECTURA' ? 'document' : 'eye'} size={17} /></span><div><strong>{item.document?.title || 'Documento'}</strong><small>{item.document?.code || '—'} · {item.type === 'DESCARGA' ? 'Descarga' : item.type === 'LECTURA' ? 'Lectura' : 'Consulta'}{item.version ? ` · Versión ${item.version}` : ''}</small></div><time>{formatDate(item.registered_at)}</time></article>) : <EmptyState>No hay actividad de lectura registrada.</EmptyState>}</div>
            </ReaderCard>
            <ReaderCard title="Últimas publicaciones" icon="calendar" action={<button type="button" onClick={() => navigate('library')}>Ver todas</button>} className="reader-publications-card">
              <div className="reader-document-list">{visibleDocuments.slice(0, 5).length ? visibleDocuments.slice(0, 5).map((item) => <article key={item.id}><span className="reader-document-icon"><ReaderIcon name="document" size={18} /></span><div><strong>{item.title}</strong><small>{item.code} · Versión {item.version}</small></div><time>{item.updated}</time></article>) : <EmptyState>No hay documentos publicados disponibles.</EmptyState>}</div>
            </ReaderCard>
          </section>
          <section className="reader-dashboard-grid reader-dashboard-grid-lower">
            <ReaderCard title="Documentos más consultados" icon="chart" action={<button type="button" onClick={() => navigate('reading')}>Ver todo</button>}>
              <div className="reader-popular-list">{popularDocuments.length ? popularDocuments.map((item, index) => <article key={item.id}><b>{index + 1}</b><div><strong>{item.title}</strong><small>{item.code} · Versión {item.version || '—'}</small></div><em>{item.count}</em></article>) : <EmptyState>Aún no hay documentos consultados.</EmptyState>}</div>
            </ReaderCard>
            <ReaderCard title="Acciones rápidas" icon="bolt">
              <div className="reader-quick-grid">
                <button type="button" onClick={() => navigate('library')}><ReaderIcon name="folder" size={30} /><strong>Abrir biblioteca</strong><small>Explora los documentos disponibles</small></button>
                <button type="button" onClick={focusSearch}><ReaderIcon name="search" size={30} /><strong>Buscar documento</strong><small>Filtra por código o título</small></button>
                <button type="button" onClick={() => navigate('favorites')}><ReaderIcon name="favorite" size={30} /><strong>Ver favoritos</strong><small>Accede a tus documentos marcados</small></button>
                <button type="button" onClick={downloadFirstDocument}><ReaderIcon name="download" size={30} /><strong>Descargar archivo</strong><small>Descarga una versión publicada</small></button>
              </div>
            </ReaderCard>
          </section>
          {notice && <p className="reader-notice" role="status">{notice}</p>}
        </main>
      </section>
    </main>
  )
}

export default ReaderDashboard
