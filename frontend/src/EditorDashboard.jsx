import { useDeferredValue, useEffect, useState } from 'react'
import EditorActivityLogView from './EditorActivityLogView'
import EditorBasicReportsView from './EditorBasicReportsView'
import EditorDocumentEditView from './EditorDocumentEditView'
import EditorDocumentsView from './EditorDocumentsView'
import EditorVersionsView from './EditorVersionsView'
import { apiRequest, formatDate, normalizeDocument } from './documentApi'
import './EditorDashboard.css'

function EditorIcon({ name, size = 20 }) {
  const content = name === 'dashboard'
    ? <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>
    : name === 'document'
      ? <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>
      : name === 'layers'
        ? <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>
        : name === 'history'
          ? <><path d="M4 12a8 8 0 1 0 2-5.7" /><path d="M4 4v5h5M12 7v5l3 2" /></>
          : name === 'chart'
            ? <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>
            : name === 'search'
              ? <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>
              : name === 'bell'
                ? <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></>
                : name === 'menu'
                  ? <path d="M4 7h16M4 12h16M4 17h16" />
                  : name === 'plus'
                    ? <path d="M12 5v14M5 12h14" />
                    : name === 'upload'
                      ? <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 14v6h14v-6" /></>
                      : name === 'logout'
                        ? <><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" /></>
                        : <path d="m8 10 4 4 4-4" />
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function EditorBrand() {
  return <div className="editor-brand" aria-label="Consultoría Alexandria"><svg viewBox="0 0 52 52" aria-hidden="true"><path d="M5 18h42L26 7 5 18ZM10 21v19M18 21v19M26 21v19M34 21v19M42 21v19M6 44h40" /></svg><div><span>Consultoría</span><strong>Alexandria</strong></div></div>
}

function Metric({ icon, tone, label, value, detail }) {
  return <article className="editor-dashboard-metric"><span className={`editor-dashboard-metric__icon is-${tone}`}><EditorIcon name={icon} size={28} /></span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>
}

function statusClass(status) {
  return status.toLowerCase().replaceAll(' ', '-').replaceAll('_', '-')
}

function EditorDashboard({ user, onLogout, logoutPending, error }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [activeView, setActiveView] = useState('dashboard')
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Usuario'
  const initials = displayName.split(' ').map((part) => part[0]).join('').slice(0, 2) || '—'
  const role = user.roles?.find((item) => item.code === 'EDITOR')?.name || 'Editor'
  const today = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())

  useEffect(() => {
    let active = true
    apiRequest('/api/documents/?limit=100').then((data) => { if (active) setDocuments((data.results || []).map(normalizeDocument)) }).catch((requestError) => { if (active) setLoadError(requestError.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const filteredDocuments = documents.filter((document) => !deferredQuery || [document.code, document.title, document.area, document.type, document.status].join(' ').toLowerCase().includes(deferredQuery))
  const pendingDocuments = documents.filter((document) => ['Borrador', 'En revisión', 'Devuelto con observaciones'].includes(document.status))
  const publishedDocuments = documents.filter((document) => ['Publicado', 'Aprobado', 'Activo'].includes(document.status))
  const versionedDocuments = documents.filter((document) => document.versionData)
  const statusCounts = [...new Set(documents.map((document) => document.status).filter(Boolean))].map((status) => ({ status, count: documents.filter((document) => document.status === status).length }))

  function action(label) {
    setNotice(label)
    setSidebarOpen(false)
  }

  function navigate(view) {
    setActiveView(view)
    setSelectedDocument(null)
    setNotice('')
    setSidebarOpen(false)
  }

  function openDocumentEditor(document) {
    setSelectedDocument(document)
    setActiveView('edit-document')
  }

  function dashboardView() {
    return <><header className="editor-heading"><div><h1>Dashboard del Editor</h1><p>Gestiona tus documentos, versiones y actividades personales.</p></div><time><EditorIcon name="calendar" size={18} />{today}</time></header>{notice && <p className="editor-dashboard-notice" role="status">{notice}</p>}<section className="editor-dashboard-metrics"><Metric icon="document" tone="blue" label="Mis documentos" value={documents.length} detail="Documentos registrados" /><Metric icon="history" tone="orange" label="Pendientes de revisión" value={pendingDocuments.length} detail="Borradores y revisiones" /><Metric icon="document" tone="violet" label="Documentos publicados" value={publishedDocuments.length} detail="Estados publicados o aprobados" /><Metric icon="layers" tone="teal" label="Versiones activas" value={versionedDocuments.length} detail="Documentos con versión" /></section><div className="editor-dashboard-upper"><section className="editor-card editor-dashboard-recent"><div className="editor-card__heading"><div><h2><EditorIcon name="history" size={18} /> Documentos modificados recientemente</h2><p>Últimos documentos disponibles en tu espacio.</p></div><button type="button" onClick={() => navigate('documents')}>Ver todos</button></div><div className="editor-dashboard-activity-list">{filteredDocuments.slice(0, 5).map((document) => <article key={document.id}><span className="editor-dashboard-activity-dot" /><div><strong>{document.title}</strong><a href="#documents" onClick={(event) => { event.preventDefault(); openDocumentEditor(document) }}>{document.code} · {document.status}</a></div><time>{formatDate(document.updated_at)}</time></article>)}{!loading && !filteredDocuments.length && <p className="editor-empty">No hay documentos para mostrar.</p>}</div></section><section className="editor-card editor-dashboard-pending"><div className="editor-card__heading"><div><h2><EditorIcon name="history" size={18} /> Documentos pendientes</h2><p>Registros que requieren seguimiento.</p></div><span>{pendingDocuments.length}</span></div><div className="editor-dashboard-pending-list">{pendingDocuments.slice(0, 4).map((document) => <article key={document.id}><span className="editor-dashboard-pending-icon"><EditorIcon name="document" size={17} /></span><div><strong>{document.title}</strong><span>{document.code}</span></div><em className={`is-${statusClass(document.status)}`}>{document.status}</em></article>)}{!loading && !pendingDocuments.length && <p className="editor-empty">No hay documentos pendientes.</p>}</div><button className="editor-dashboard-link" type="button" onClick={() => navigate('documents')}>Abrir documentos <span>→</span></button></section><section className="editor-card editor-dashboard-status"><div className="editor-card__heading"><div><h2><EditorIcon name="chart" size={18} /> Estado de documentos</h2><p>Distribución de tus documentos.</p></div></div><div className="editor-dashboard-status-list">{statusCounts.map((item) => <div key={item.status}><span>{item.status}</span><i><b style={{ width: `${documents.length ? (item.count / documents.length) * 100 : 0}%` }} /></i><strong>{item.count}</strong></div>)}{!loading && !statusCounts.length && <p className="editor-empty">No hay estados registrados.</p>}</div></section></div><div className="editor-dashboard-lower"><section className="editor-card editor-dashboard-documents"><div className="editor-card__heading"><div><h2><EditorIcon name="document" size={18} /> Documentos recientes</h2><p>Documentos ordenados por última actualización.</p></div><button type="button" onClick={() => navigate('documents')}>Ver todos</button></div><div className="editor-dashboard-table-wrap"><table><thead><tr><th>Código</th><th>Título</th><th>Estado</th><th>Última actualización</th><th>Versión</th></tr></thead><tbody>{filteredDocuments.slice(0, 4).map((document) => <tr key={document.id}><td>{document.code}</td><td><button type="button" onClick={() => openDocumentEditor(document)}>{document.title}</button></td><td><span className={`editor-dashboard-status is-${statusClass(document.status)}`}>{document.status}</span></td><td>{formatDate(document.updated_at)}</td><td>{document.version || '—'}</td></tr>)}</tbody></table>{!loading && !filteredDocuments.length && <p className="editor-empty">No hay documentos para mostrar.</p>}</div></section><section className="editor-card editor-dashboard-actions"><div className="editor-card__heading"><div><h2><EditorIcon name="plus" size={18} /> Accesos rápidos</h2><p>Ir a las áreas disponibles del editor.</p></div></div><div className="editor-dashboard-actions-grid"><button type="button" onClick={() => navigate('documents')}><EditorIcon name="document" size={27} /><strong>Mis documentos</strong></button><button type="button" onClick={() => navigate('versions')}><EditorIcon name="layers" size={27} /><strong>Versiones</strong></button><button type="button" onClick={() => navigate('audit')}><EditorIcon name="history" size={27} /><strong>Bitácora personal</strong></button><button type="button" onClick={() => navigate('reports')}><EditorIcon name="chart" size={27} /><strong>Reportes básicos</strong></button></div></section></div></>
  }

  let content = dashboardView()
  if (activeView === 'documents') content = selectedDocument ? <EditorDocumentEditView document={selectedDocument} onBack={() => { setSelectedDocument(null); navigate('documents') }} onAction={action} /> : <EditorDocumentsView globalQuery={query} onAction={action} onEditDocument={openDocumentEditor} />
  if (activeView === 'edit-document') content = <EditorDocumentEditView document={selectedDocument} onBack={() => { setSelectedDocument(null); navigate('documents') }} onAction={action} />
  if (activeView === 'versions') content = <EditorVersionsView onAction={action} />
  if (activeView === 'audit') content = <EditorActivityLogView user={user} />
  if (activeView === 'reports') content = <EditorBasicReportsView globalQuery={query} />

  return <main className="editor-shell editor-dashboard-shell"><aside className={`editor-sidebar${sidebarOpen ? ' is-open' : ''}`}><EditorBrand /><nav className="editor-nav" aria-label="Navegación del editor"><button className={activeView === 'dashboard' ? 'is-active' : ''} type="button" onClick={() => navigate('dashboard')}><EditorIcon name="dashboard" size={22} /> Dashboard</button><button className={activeView === 'documents' || activeView === 'edit-document' ? 'is-active' : ''} type="button" onClick={() => navigate('documents')}><EditorIcon name="document" size={22} /> Documentos</button><button className={activeView === 'versions' ? 'is-active' : ''} type="button" onClick={() => navigate('versions')}><EditorIcon name="layers" size={22} /> Versiones</button><button className={activeView === 'audit' ? 'is-active' : ''} type="button" onClick={() => navigate('audit')}><EditorIcon name="history" size={22} /> Bitácora personal</button><button className={activeView === 'reports' ? 'is-active' : ''} type="button" onClick={() => navigate('reports')}><EditorIcon name="chart" size={22} /> Reportes básicos</button></nav><div className="editor-sidebar__illustration" aria-hidden="true">♜</div><div className="editor-sidebar-footer">© {new Date().getFullYear()} Consultoría Alexandria.</div></aside>{sidebarOpen && <button className="editor-overlay" type="button" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} />}<section className="editor-workspace"><header className="editor-topbar"><button className="editor-menu" type="button" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)}><EditorIcon name="menu" size={25} /></button><label className="editor-search"><EditorIcon name="search" size={20} /><input type="search" aria-label="Buscar" placeholder="Buscar documentos, versiones, usuarios..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="editor-topbar__actions"><button className="editor-notification" type="button" aria-label="Notificaciones"><EditorIcon name="bell" size={23} /></button><div className="editor-profile"><button className="editor-profile__trigger" type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span className="editor-avatar">{initials}</span><span><strong>{displayName}</strong><small>{role}</small></span><EditorIcon size={17} /></button>{profileOpen && <div className="editor-profile__menu"><span>{user.email}</span><button type="button" onClick={onLogout} disabled={logoutPending}><EditorIcon name="logout" size={16} /> {logoutPending ? 'Cerrando sesión...' : 'Cerrar sesión'}</button></div>}</div></div></header><main className="editor-content">{(error || loadError) && <p className="editor-error" role="alert">{error || loadError}</p>}{content}<footer className="editor-footer"><span>© {new Date().getFullYear()} Consultoría Alexandria. Todos los derechos reservados.</span><span>Versión 2.1.0</span></footer></main></section></main>
}

export default EditorDashboard
