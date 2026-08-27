import { useDeferredValue, useEffect, useState } from 'react'
import EditorActivityLogView from './EditorActivityLogView'
import EditorBasicReportsView from './EditorBasicReportsView'
import EditorDocumentEditView from './EditorDocumentEditView'
import EditorDocumentsView from './EditorDocumentsView'
import EditorVersionsView from './EditorVersionsView'
import { apiRequest, normalizeDocument } from './documentApi'
import './EditorDashboard.css'

function EditorIcon({ name, size = 20 }) {
  const content = name === 'dashboard' ? <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> : name === 'document' ? <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></> : name === 'layers' ? <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></> : name === 'history' ? <><path d="M4 12a8 8 0 1 0 2-5.7" /><path d="M4 4v5h5M12 7v5l3 2" /></> : name === 'chart' ? <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></> : name === 'search' ? <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></> : name === 'bell' ? <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></> : name === 'menu' ? <path d="M4 7h16M4 12h16M4 17h16" /> : name === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></> : name === 'logout' ? <><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" /></> : <path d="m8 10 4 4 4-4" />
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function EditorBrand() {
  return <div className="editor-brand" aria-label="Consultoría Alexandria"><svg viewBox="0 0 52 52" aria-hidden="true"><path d="M5 18h42L26 7 5 18ZM10 21v19M18 21v19M26 21v19M34 21v19M42 21v19M6 44h40" /></svg><div><span>Consultoría</span><strong>Alexandria</strong></div></div>
}

function EditorDashboard({ user, onLogout, logoutPending, error }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [activeView, setActiveView] = useState('dashboard')
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [documents, setDocuments] = useState([])
  const [loadError, setLoadError] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Usuario'
  const initials = displayName.split(' ').map((part) => part[0]).join('').slice(0, 2) || '—'
  const role = user.roles?.find((item) => item.code === 'EDITOR')?.name || 'Editor'

  useEffect(() => {
    let active = true
    apiRequest('/api/documents/?limit=100').then((data) => { if (active) setDocuments((data.results || []).map(normalizeDocument)) }).catch((requestError) => { if (active) setLoadError(requestError.message) })
    return () => { active = false }
  }, [])

  const visibleDocuments = documents.filter((item) => !deferredQuery || [item.code, item.title, item.status].join(' ').toLowerCase().includes(deferredQuery))
  const pending = documents.filter((item) => ['Borrador', 'En revisión'].includes(item.status))
  const today = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date())

  function action(label) {
    setNotice(label.endsWith('.') ? label : `${label} está disponible en esta vista.`)
    setSidebarOpen(false)
  }

  function navigate(view) { setActiveView(view); setSidebarOpen(false) }

  return <main className="editor-shell"><aside className={`editor-sidebar${sidebarOpen ? ' is-open' : ''}`}><EditorBrand /><nav className="editor-nav" aria-label="Navegación del editor"><button className={activeView === 'dashboard' ? 'is-active' : ''} type="button" onClick={() => navigate('dashboard')}><EditorIcon name="dashboard" size={22} /> Dashboard</button><button className={activeView === 'documents' ? 'is-active' : ''} type="button" onClick={() => navigate('documents')}><EditorIcon name="document" size={22} /> Documentos</button><button className={activeView === 'versions' ? 'is-active' : ''} type="button" onClick={() => navigate('versions')}><EditorIcon name="layers" size={22} /> Versiones</button><button className={activeView === 'audit' ? 'is-active' : ''} type="button" onClick={() => navigate('audit')}><EditorIcon name="history" size={22} /> Bitácora personal</button><button className={activeView === 'reports' ? 'is-active' : ''} type="button" onClick={() => navigate('reports')}><EditorIcon name="chart" size={22} /> Reportes básicos</button></nav><div className="editor-sidebar__illustration" aria-hidden="true">♜</div><div className="editor-sidebar-footer">© {new Date().getFullYear()} Consultoría Alexandria.</div></aside>{sidebarOpen && <button className="editor-overlay" type="button" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} />}<section className="editor-workspace"><header className="editor-topbar"><button className="editor-menu" type="button" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)}><EditorIcon name="menu" size={25} /></button><label className="editor-search"><EditorIcon name="search" size={20} /><input type="search" aria-label="Buscar" placeholder="Buscar documentos, versiones, usuarios..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="editor-topbar__actions"><button className="editor-notification" type="button" aria-label="Notificaciones" onClick={() => setNotice('No hay un contador de notificaciones disponible en el backend.')}><EditorIcon name="bell" size={24} /></button><div className="editor-profile"><button className="editor-profile__trigger" type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span className="editor-avatar">{initials}</span><span><strong>{displayName}</strong><small>{role}</small></span><EditorIcon name="chevron" size={17} /></button>{profileOpen && <div className="editor-profile__menu"><span>{user.email}</span><button type="button" onClick={onLogout} disabled={logoutPending}><EditorIcon name="logout" size={17} /> {logoutPending ? 'Cerrando...' : 'Cerrar sesión'}</button></div>}</div></div></header><div className="editor-content">{(error || loadError) && <p className="editor-error" role="alert">{error || loadError}</p>}{activeView === 'documents' ? <EditorDocumentsView globalQuery={query} onAction={action} onEditDocument={(document) => { setSelectedDocument(document); setActiveView('edit') }} /> : activeView === 'edit' ? <EditorDocumentEditView document={selectedDocument} onBack={() => setActiveView('documents')} onAction={action} /> : activeView === 'versions' ? <EditorVersionsView onAction={action} /> : activeView === 'audit' ? <EditorActivityLogView user={user} /> : activeView === 'reports' ? <EditorBasicReportsView globalQuery={query} /> : <><header className="editor-heading"><div><h1>Dashboard del editor</h1><p>Gestiona tus documentos y consulta tu actividad.</p></div><time><EditorIcon name="calendar" size={18} /> {today}</time></header><section className="editor-metrics"><article className="editor-metric"><span className="editor-metric__icon editor-tone--blue"><EditorIcon name="document" size={29} /></span><div><p>Mis documentos</p><strong>{documents.length}</strong><small>Datos registrados</small></div></article><article className="editor-metric"><span className="editor-metric__icon editor-tone--orange"><EditorIcon name="history" size={29} /></span><div><p>Pendientes de revisión</p><strong>{pending.length}</strong><small>Datos registrados</small></div></article><article className="editor-metric"><span className="editor-metric__icon editor-tone--violet"><EditorIcon name="layers" size={29} /></span><div><p>Versiones activas</p><strong>{documents.filter((item) => item.version !== '—').length}</strong><small>Datos registrados</small></div></article></section><div className="editor-lower-grid"><section className="editor-card editor-documents"><div className="editor-card__heading"><h2><EditorIcon name="document" size={20} /> Documentos recientes</h2><button type="button" onClick={() => navigate('documents')}>Ver todos</button></div><div className="editor-table-wrap"><table><thead><tr><th>Código</th><th>Título</th><th>Estado</th><th>Actualización</th><th>Responsable</th></tr></thead><tbody>{visibleDocuments.slice(0, 10).map((item) => <tr key={item.id}><td>{item.code}</td><td>{item.title}</td><td>{item.status}</td><td>{item.updated}</td><td>{item.responsible?.name || '—'}</td></tr>)}</tbody></table>{!visibleDocuments.length && <p className="editor-empty">No se encontraron documentos.</p>}</div></section><section className="editor-card editor-tasks"><div className="editor-card__heading"><h2><EditorIcon name="history" size={20} /> Tareas pendientes</h2></div><div className="editor-tasks__list">{pending.slice(0, 5).map((item) => <article key={item.id}><div><strong>{item.status}</strong><span>{item.code} {item.title}</span></div><time>{item.updated}</time></article>)}{!pending.length && <p className="editor-empty">No tienes tareas pendientes.</p>}</div></section></div></> }</div><span className="editor-live-notice" role="status">{notice}</span></section></main>
}

export default EditorDashboard
