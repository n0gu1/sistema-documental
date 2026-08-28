import { useDeferredValue, useEffect, useState } from 'react'
import AuditView from './AuditView'
import BackupsView from './BackupsView'
import DocumentsView from './DocumentsView'
import ReportsView from './ReportsView'
import RolesView from './RolesView'
import SettingsView from './SettingsView'
import UsersView from './UsersView'
import VersionsView from './VersionsView'
import { apiRequest, formatDate } from './api'
import './Dashboard.css'

const navigation = [
  ['dashboard', 'Dashboard'],
  ['document', 'Documentos'],
  ['layers', 'Versiones'],
  ['users', 'Usuarios'],
  ['shield', 'Roles y permisos'],
  ['clipboard', 'Bitácora'],
  ['chart', 'Reportes'],
  ['cloud', 'Respaldos'],
  ['settings', 'Configuración'],
]

const emptyDashboard = {
  metrics: { total_documents: 0, pending_reviews: 0, overdue_reviews: 0, published_documents: 0, active_users: 0, pending_activation: 0, blocked_users: 0, active_sessions: 0 },
  statuses: {},
  recent_documents: [],
  pending_queue: [],
  activity: [],
  security_alerts: [],
  security_alert_count: 0,
}

function Icon({ name, size = 20 }) {
  let content
  switch (name) {
    case 'dashboard': content = <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>; break
    case 'document': content = <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>; break
    case 'layers': content = <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>; break
    case 'users': content = <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20M16 5.5a3 3 0 0 1 0 5.5M17 14a4 4 0 0 1 4 4v2" /></>; break
    case 'shield': content = <><path d="M12 2.5 20 6v5.5c0 4.8-3.2 8-8 10-4.8-2-8-5.2-8-10V6l8-3.5Z" /><rect x="9" y="10" width="6" height="5" rx="1" /><path d="M10.5 10V8.8a1.5 1.5 0 0 1 3 0V10" /></>; break
    case 'clipboard': content = <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4" /></>; break
    case 'chart': content = <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>; break
    case 'cloud': content = <><path d="M6.5 18H18a4 4 0 0 0 .6-8A6.5 6.5 0 0 0 6.3 8.2 5 5 0 0 0 6.5 18Z" /><path d="M12 10v8m0-8-3 3m3-3 3 3" /></>; break
    case 'settings': content = <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>; break
    case 'search': content = <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>; break
    case 'bell': content = <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></>; break
    case 'menu': content = <path d="M4 7h16M4 12h16M4 17h16" />; break
    case 'plus': content = <path d="M12 5v14M5 12h14" />; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>; break
    case 'check': content = <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'arrow': content = <path d="m9 18 6-6-6-6" />; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    case 'logout': content = <><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" /></>; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function DashboardBrand() {
  return <div className="dashboard-brand" aria-label="Consultoría Alexandria"><svg viewBox="0 0 52 52" aria-hidden="true"><path d="M5 18h42L26 7 5 18ZM10 21v19M18 21v19M26 21v19M34 21v19M42 21v19M6 44h40" /></svg><div><span>Consultoría</span><strong>Alexandria</strong></div></div>
}

function metricItems(metrics) {
  return [
    { icon: 'document', label: 'Total documentos', value: metrics.total_documents, detail: `${metrics.published_documents} publicados`, tone: 'blue' },
    { icon: 'clock', label: 'Pendientes de revisión', value: metrics.pending_reviews, detail: `${metrics.overdue_reviews} vencidas`, tone: 'orange' },
    { icon: 'check', label: 'Documentos publicados', value: metrics.published_documents, detail: 'versiones vigentes', tone: 'green' },
    { icon: 'users', label: 'Usuarios activos', value: metrics.active_users, detail: `${metrics.active_sessions} sesiones activas`, tone: 'violet' },
  ]
}

function Dashboard({ user, onLogout, logoutPending, error }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [activeView, setActiveView] = useState('dashboard')
  const [query, setQuery] = useState('')
  const [data, setData] = useState(emptyDashboard)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const role = user.roles?.find((item) => item.code === 'ADMINISTRADOR')?.name || 'Administrador'
  const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}` || 'AD'
  const today = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())

  useEffect(() => {
    let active = true
    apiRequest('/api/admin/dashboard/')
      .then((result) => { if (active) setData({ ...emptyDashboard, ...result }) })
      .catch((requestError) => { if (active) setLoadError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const filteredDocuments = data.recent_documents.filter((document) => !deferredQuery || [document.code, document.title, document.type, document.area, document.responsible, document.status].join(' ').toLowerCase().includes(deferredQuery))
  const filteredActivity = data.activity.filter((item) => !deferredQuery || [item.user, item.action, item.detail].join(' ').toLowerCase().includes(deferredQuery))
  const statusTotal = Object.values(data.statuses).reduce((total, value) => total + value, 0) || 1

  function navigate(view) {
    setActiveView(view)
    setSidebarOpen(false)
  }

  return <main className="dashboard-shell">
    <aside className={`dashboard-sidebar${sidebarOpen ? ' dashboard-sidebar--open' : ''}`}>
      <DashboardBrand />
      <nav className="dashboard-nav" aria-label="Navegación principal">
        <p>Administración</p>
        {navigation.map(([icon, label]) => <button className={activeView === icon ? 'dashboard-nav__item dashboard-nav__item--active' : 'dashboard-nav__item'} type="button" key={label} onClick={() => navigate(icon)}><Icon name={icon} size={21} /><span>{label}</span></button>)}
      </nav>
      <div className="dashboard-sidebar__footer"><div className="dashboard-storage"><span><Icon name="cloud" size={17} /> Datos en tiempo real</span><strong>{loading ? '...' : 'OK'}</strong></div><p>Indicadores calculados desde la organización activa.</p><span className="dashboard-version">Versión 2.1.0</span></div>
    </aside>
    {sidebarOpen && <button className="dashboard-overlay" type="button" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} />}
    <section className="dashboard-workspace">
      <header className="dashboard-topbar"><button className="dashboard-menu" type="button" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)}><Icon name="menu" size={24} /></button><label className="dashboard-search"><Icon name="search" size={19} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar documentos, versiones, usuarios..." aria-label="Buscar" /><kbd>⌘ K</kbd></label><div className="dashboard-topbar__actions"><button className="dashboard-notification" type="button" aria-label="Notificaciones"><Icon name="bell" size={22} /></button><div className="dashboard-profile"><button className="dashboard-profile__trigger" type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span className="dashboard-avatar">{initials}</span><span className="dashboard-profile__text"><strong>{user.full_name}</strong><small>{role}</small></span><Icon name="chevron" size={17} /></button>{profileOpen && <div className="dashboard-profile__menu"><span>{user.email}</span><button type="button" onClick={onLogout} disabled={logoutPending}><Icon name="logout" size={18} /> {logoutPending ? 'Cerrando...' : 'Cerrar sesión'}</button></div>}</div></div></header>
      <div className="dashboard-content">
        {(error || loadError) && <p className="dashboard-error" role="alert">{error || loadError}</p>}
        {activeView === 'document' ? <DocumentsView globalQuery={query} today={today} onOpenVersions={() => navigate('layers')} /> : activeView === 'layers' ? <VersionsView onBack={() => navigate('document')} /> : activeView === 'users' ? <UsersView globalQuery={query} organizationId={user.organization_id} /> : activeView === 'shield' ? <RolesView globalQuery={query} /> : activeView === 'clipboard' ? <AuditView globalQuery={query} /> : activeView === 'chart' ? <ReportsView globalQuery={query} /> : activeView === 'cloud' ? <BackupsView globalQuery={query} /> : activeView === 'settings' ? <SettingsView globalQuery={query} /> : <>
          <div className="dashboard-heading"><div><p>Vista general</p><h1>Panel de administración</h1><span>Supervise la actividad documental y el estado de la organización.</span></div><div className="dashboard-date"><Icon name="calendar" size={18} /><span>{today}</span></div></div>
           <section className="dashboard-welcome"><div><span className="dashboard-welcome__eyebrow"><Icon name="check" size={16} /> Datos de la organización</span><h2>Bienvenido, {user.first_name}</h2><p>{loading ? 'Cargando indicadores...' : `Hay ${data.metrics.pending_reviews} solicitudes de revisión pendientes y ${data.metrics.pending_activation} usuarios que deben activar su acceso.`}</p></div><button type="button" onClick={() => navigate('document')}><Icon name="plus" size={19} /> Nuevo documento</button></section>
           <section className="dashboard-metrics" aria-label="Indicadores principales">{metricItems(data.metrics).map((metric) => <article className="dashboard-metric" key={metric.label}><span className={`dashboard-metric__icon dashboard-tone--${metric.tone}`}><Icon name={metric.icon} size={22} /></span><div><p>{metric.label}</p><strong>{loading ? '...' : metric.value}</strong><span>{metric.detail}</span></div></article>)}</section>
           {data.security_alerts.length > 0 && <section className="dashboard-panel dashboard-security-alerts" aria-labelledby="dashboard-security-alerts-title"><div className="dashboard-panel__heading"><div><h2 id="dashboard-security-alerts-title"><Icon name="bell" size={17} /> Alertas de seguridad</h2><p>{data.security_alert_count} grupos requieren revisión</p></div><button type="button" onClick={() => navigate('clipboard')}>Ver bitácora <Icon name="arrow" size={15} /></button></div><div className="dashboard-security-alerts__list">{data.security_alerts.map((alert) => <article key={alert.id}><span><Icon name="shield" size={17} /></span><div><strong>{alert.title}</strong><p>{alert.message}</p><small>{alert.source}</small></div><b>{alert.severity === 'critico' ? 'Crítico' : 'Alto'}</b></article>)}</div></section>}
           <div className="dashboard-primary-grid"><section className="dashboard-panel dashboard-documents"><div className="dashboard-panel__heading"><div><h2>Documentos recientes</h2><p>Últimos documentos modificados en la organización</p></div><button type="button" onClick={() => navigate('document')}>Ver todos <Icon name="arrow" size={16} /></button></div><div className="dashboard-table-wrap"><table><thead><tr><th>Documento</th><th>Tipo</th><th>Responsable</th><th>Estado</th><th>Versión</th><th>Actualización</th></tr></thead><tbody>{filteredDocuments.map((document, index) => <tr key={document.id}><td><div className="dashboard-document"><span className={`dashboard-document__icon dashboard-document__icon--${index % 4}`}><Icon name="document" size={18} /></span><div><strong>{document.title}</strong><small>{document.code}</small></div></div></td><td><span className="dashboard-type">{document.type}</span></td><td>{document.responsible}</td><td><span className="dashboard-status">{document.status}</span></td><td>{document.version || '—'}</td><td>{formatDate(document.updated_at)}</td></tr>)}</tbody></table>{!loading && !filteredDocuments.length && <p className="dashboard-empty">No hay documentos para mostrar.</p>}</div><div className="dashboard-table__footer"><span>{loading ? 'Cargando documentos...' : `Mostrando ${filteredDocuments.length} de ${data.metrics.total_documents} documentos`}</span><button type="button" onClick={() => navigate('document')}>Abrir repositorio</button></div></section>
            <aside className="dashboard-side-column"><section className="dashboard-panel dashboard-actions"><div className="dashboard-panel__heading"><div><h2>Acciones rápidas</h2><p>Operaciones frecuentes</p></div></div><div className="dashboard-actions__grid"><button type="button" onClick={() => navigate('document')}><span className="dashboard-tone--blue"><Icon name="plus" size={21} /></span><strong>Nuevo documento</strong><small>Abrir repositorio</small></button><button type="button" onClick={() => navigate('users')}><span className="dashboard-tone--violet"><Icon name="users" size={21} /></span><strong>Administrar usuarios</strong><small>Gestionar accesos</small></button><button type="button" onClick={() => navigate('shield')}><span className="dashboard-tone--green"><Icon name="shield" size={21} /></span><strong>Roles y permisos</strong><small>Revisar autorizaciones</small></button><button type="button" onClick={() => navigate('clipboard')}><span className="dashboard-tone--orange"><Icon name="clipboard" size={21} /></span><strong>Ver bitácora</strong><small>Auditar actividad</small></button></div></section><section className="dashboard-panel dashboard-review"><div className="dashboard-panel__heading"><div><h2>Cola de revisión</h2><p>Solicitudes pendientes</p></div><span>{data.metrics.pending_reviews}</span></div><div className="dashboard-review__progress"><span style={{ width: `${data.metrics.pending_reviews ? Math.max(8, Math.min(100, (data.metrics.overdue_reviews / data.metrics.pending_reviews) * 100)) : 0}%` }} /></div><strong>{data.metrics.overdue_reviews} revisiones vencidas</strong><p>{data.pending_queue.length ? `Próxima: ${data.pending_queue[0].code} · ${data.pending_queue[0].reviewer}` : 'No hay revisiones pendientes.'}</p><button type="button" onClick={() => navigate('document')}>Abrir documentos <Icon name="arrow" size={16} /></button></section></aside></div>
          <div className="dashboard-secondary-grid"><section className="dashboard-panel dashboard-chart"><div className="dashboard-panel__heading"><div><h2>Estados documentales</h2><p>Distribución actual del repositorio</p></div><span><i /> Documentos</span></div><div className="dashboard-chart__body dashboard-status-chart">{Object.entries(data.statuses).map(([status, count]) => <div className="dashboard-status-row" key={status}><span>{status}</span><i><b style={{ width: `${(count / statusTotal) * 100}%` }} /></i><strong>{count}</strong></div>)}</div></section><section className="dashboard-panel dashboard-activity"><div className="dashboard-panel__heading"><div><h2>Actividad reciente</h2><p>Movimientos registrados en la bitácora</p></div><button type="button" onClick={() => navigate('clipboard')}>Ver bitácora</button></div><div className="dashboard-activity__list">{filteredActivity.map((item) => <article key={item.id}><span className={item.successful ? 'dashboard-tone--green' : 'dashboard-tone--orange'}><Icon name={item.successful ? 'check' : 'clock'} size={18} /></span><div><strong>{item.action}</strong><p>{item.user} · {item.detail}</p></div><time>{formatDate(item.at)}</time></article>)}{!loading && !filteredActivity.length && <p className="dashboard-empty">No hay actividad registrada.</p>}</div></section></div>
        </>}
        <footer className="dashboard-footer"><span>© 2026 Consultoría Alexandria. Todos los derechos reservados.</span><span>Plataforma segura y confiable</span></footer>
      </div>
    </section>
  </main>
}

export default Dashboard
