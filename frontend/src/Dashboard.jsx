import { useDeferredValue, useState } from 'react'
import AuditView from './AuditView'
import BackupsView from './BackupsView'
import DocumentsView from './DocumentsView'
import ReportsView from './ReportsView'
import RolesView from './RolesView'
import UsersView from './UsersView'
import VersionsView from './VersionsView'
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

const metrics = [
  { icon: 'document', label: 'Total documentos', value: '930', detail: '+18 este mes', tone: 'blue' },
  { icon: 'clock', label: 'Pendientes de revisión', value: '78', detail: '12 requieren atención', tone: 'orange' },
  { icon: 'check', label: 'Documentos publicados', value: '542', detail: '58% del repositorio', tone: 'green' },
  { icon: 'users', label: 'Usuarios activos', value: '24', detail: '+3 este trimestre', tone: 'violet' },
]

const documents = [
  { code: 'DOC-2024-00125', title: 'Política de Seguridad de la Información', type: 'Política', owner: 'Juan Martínez', initials: 'JM', status: 'Publicado', version: '2.1', date: '23/05/2024' },
  { code: 'DOC-2024-00124', title: 'Manual de Procedimientos Administrativos', type: 'Manual', owner: 'Laura Ramírez', initials: 'LR', status: 'En revisión', version: '1.3', date: '23/05/2024' },
  { code: 'DOC-2024-00123', title: 'Código de Ética y Conducta', type: 'Código', owner: 'Carlos Pérez', initials: 'CP', status: 'Publicado', version: '3.0', date: '23/05/2024' },
  { code: 'DOC-2024-00122', title: 'Plan Estratégico 2024-2026', type: 'Plan', owner: 'María Gómez', initials: 'MG', status: 'Borrador', version: '0.4', date: '23/05/2024' },
  { code: 'DOC-2024-00121', title: 'Informe de Riesgos Q1 2024', type: 'Informe', owner: 'Diego López', initials: 'DL', status: 'Publicado', version: '1.0', date: '22/05/2024' },
  { code: 'DOC-2024-00120', title: 'Procedimiento de Compras', type: 'Procedimiento', owner: 'María Gómez', initials: 'MG', status: 'Archivado', version: '2.0', date: '22/05/2024' },
]

const activity = [
  { icon: 'upload', title: 'Nuevo documento cargado', detail: 'Laura Ramírez subió “Manual de procedimientos”', time: 'Hace 12 min', tone: 'blue' },
  { icon: 'check', title: 'Documento aprobado', detail: 'Carlos Pérez aprobó la Política de seguridad', time: 'Hace 38 min', tone: 'green' },
  { icon: 'userPlus', title: 'Nuevo usuario registrado', detail: 'Se agregó a Sofía Herrera al área Legal', time: 'Hace 2 h', tone: 'violet' },
  { icon: 'refresh', title: 'Versión actualizada', detail: 'Plan Estratégico cambió a la versión 0.4', time: 'Hace 4 h', tone: 'orange' },
]

const chartValues = [44, 61, 48, 73, 56, 82, 64, 78, 67, 91, 76, 88]

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
    case 'upload': content = <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 14v6h14v-6" /></>; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>; break
    case 'check': content = <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>; break
    case 'userPlus': content = <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20M18 8v6m-3-3h6" /></>; break
    case 'refresh': content = <><path d="M20 7v5h-5" /><path d="M18.5 16a8 8 0 1 1 1.2-8.5L20 12" /></>; break
    case 'eye': content = <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>; break
    case 'arrow': content = <path d="m9 18 6-6-6-6" />; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    case 'logout': content = <><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" /></>; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'trend': content = <><path d="m4 17 5-5 4 3 7-8" /><path d="M15 7h5v5" /></>; break
    default: content = <circle cx="12" cy="12" r="8" />
  }

  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function DashboardBrand() {
  return (
    <div className="dashboard-brand" aria-label="Consultoría Alexandria">
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <path d="M5 18h42L26 7 5 18ZM10 21v19M18 21v19M26 21v19M34 21v19M42 21v19M6 44h40" />
      </svg>
      <div><span>Consultoría</span><strong>Alexandria</strong></div>
    </div>
  )
}

function Dashboard({ user, onLogout, logoutPending, error }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [activeView, setActiveView] = useState('dashboard')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const role = user.roles?.find((item) => item.code === 'ADMINISTRADOR')?.name || 'Administrador'
  const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}` || 'AD'
  const today = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  const filteredDocuments = documents.filter((document) => (
    !deferredQuery || [document.code, document.title, document.type, document.owner, document.status]
      .some((value) => value.toLowerCase().includes(deferredQuery))
  ))

  return (
    <main className="dashboard-shell">
      <aside className={`dashboard-sidebar${sidebarOpen ? ' dashboard-sidebar--open' : ''}`}>
        <DashboardBrand />
        <nav className="dashboard-nav" aria-label="Navegación principal">
          <p>Administración</p>
          {navigation.map(([icon, label], index) => (
            <button className={activeView === icon ? 'dashboard-nav__item dashboard-nav__item--active' : 'dashboard-nav__item'} type="button" key={label} title={index < 8 ? label : `${label}: disponible próximamente`} onClick={() => { if (index < 8) setActiveView(icon); setSidebarOpen(false) }}>
              <Icon name={icon} size={21} />
              <span>{label}</span>
              {label === 'Bitácora' && activeView !== 'clipboard' && <small>8</small>}
            </button>
          ))}
        </nav>
        <div className="dashboard-sidebar__footer">
          <div className="dashboard-storage"><span><Icon name="cloud" size={17} /> Almacenamiento</span><strong>68%</strong></div>
          <div className="dashboard-storage__bar"><span /></div>
          <p>68 GB de 100 GB utilizados</p>
          <span className="dashboard-version">Versión 2.1.0</span>
        </div>
      </aside>

      {sidebarOpen && <button className="dashboard-overlay" type="button" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} />}

      <section className="dashboard-workspace">
        <header className="dashboard-topbar">
          <button className="dashboard-menu" type="button" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)}><Icon name="menu" size={24} /></button>
          <label className="dashboard-search">
            <Icon name="search" size={19} />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar documentos, versiones, usuarios..." aria-label="Buscar" />
            <kbd>⌘ K</kbd>
          </label>
          <div className="dashboard-topbar__actions">
            <button className="dashboard-notification" type="button" aria-label="Notificaciones"><Icon name="bell" size={22} /><span>8</span></button>
            <div className="dashboard-profile">
              <button className="dashboard-profile__trigger" type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}>
                <span className="dashboard-avatar">{initials}</span>
                <span className="dashboard-profile__text"><strong>{user.full_name}</strong><small>{role}</small></span>
                <Icon name="chevron" size={17} />
              </button>
              {profileOpen && (
                <div className="dashboard-profile__menu">
                  <span>{user.email}</span>
                  <button type="button" onClick={onLogout} disabled={logoutPending}><Icon name="logout" size={18} /> {logoutPending ? 'Cerrando...' : 'Cerrar sesión'}</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="dashboard-content">
          {error && <p className="dashboard-error" role="alert">{error}</p>}
          {activeView === 'document' ? <DocumentsView globalQuery={query} today={today} onOpenVersions={() => setActiveView('layers')} /> : activeView === 'layers' ? <VersionsView onBack={() => setActiveView('document')} /> : activeView === 'users' ? <UsersView globalQuery={query} /> : activeView === 'shield' ? <RolesView globalQuery={query} /> : activeView === 'clipboard' ? <AuditView globalQuery={query} /> : activeView === 'chart' ? <ReportsView globalQuery={query} /> : activeView === 'cloud' ? <BackupsView globalQuery={query} /> : <>
          <div className="dashboard-heading">
            <div>
              <p>Vista general</p>
              <h1>Panel de administración</h1>
              <span>Supervise la actividad documental y el estado de la organización.</span>
            </div>
            <div className="dashboard-date"><Icon name="calendar" size={18} /><span>{today}</span></div>
          </div>

          <section className="dashboard-welcome">
            <div>
              <span className="dashboard-welcome__eyebrow"><Icon name="trend" size={16} /> Resumen de la organización</span>
              <h2>Bienvenido, {user.first_name}</h2>
              <p>Hay <strong>12 documentos</strong> que requieren atención y <strong>5 solicitudes</strong> pendientes de aprobación.</p>
            </div>
            <button type="button" onClick={() => setActiveView('document')}><Icon name="plus" size={19} /> Nuevo documento</button>
            <span className="dashboard-welcome__orb dashboard-welcome__orb--one" />
            <span className="dashboard-welcome__orb dashboard-welcome__orb--two" />
          </section>

          <section className="dashboard-metrics" aria-label="Indicadores principales">
            {metrics.map((metric) => (
              <article className="dashboard-metric" key={metric.label}>
                <span className={`dashboard-metric__icon dashboard-tone--${metric.tone}`}><Icon name={metric.icon} size={22} /></span>
                <div><p>{metric.label}</p><strong>{metric.value}</strong><span>{metric.detail}</span></div>
              </article>
            ))}
          </section>

          <div className="dashboard-primary-grid">
            <section className="dashboard-panel dashboard-documents">
              <div className="dashboard-panel__heading">
                <div><h2>Documentos recientes</h2><p>Últimos documentos modificados en la organización</p></div>
                <button type="button" onClick={() => setActiveView('document')}>Ver todos <Icon name="arrow" size={16} /></button>
              </div>
              <div className="dashboard-table-wrap">
                <table>
                  <thead><tr><th>Documento</th><th>Tipo</th><th>Responsable</th><th>Estado</th><th>Versión</th><th>Actualización</th><th aria-label="Acciones" /></tr></thead>
                  <tbody>
                    {filteredDocuments.map((document, index) => (
                      <tr key={document.code}>
                        <td><div className="dashboard-document"><span className={`dashboard-document__icon dashboard-document__icon--${index % 4}`}><Icon name="document" size={18} /></span><div><strong>{document.title}</strong><small>{document.code}</small></div></div></td>
                        <td><span className="dashboard-type">{document.type}</span></td>
                        <td><div className="dashboard-owner"><span>{document.initials}</span>{document.owner}</div></td>
                        <td><span className={`dashboard-status dashboard-status--${document.status.toLowerCase().replace(' ', '-').replace('ó', 'o')}`}>{document.status}</span></td>
                        <td>{document.version}</td>
                        <td>{document.date}</td>
                        <td><button className="dashboard-row-action" type="button" aria-label={`Ver ${document.title}`}><Icon name="eye" size={18} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredDocuments.length && <p className="dashboard-empty">No se encontraron documentos para “{query}”.</p>}
              </div>
              <div className="dashboard-table__footer"><span>Mostrando {filteredDocuments.length} de 930 documentos</span><div><button type="button" disabled>‹</button><button className="is-current" type="button">1</button><button type="button">2</button><button type="button">3</button><button type="button">›</button></div></div>
            </section>

            <aside className="dashboard-side-column">
              <section className="dashboard-panel dashboard-actions">
                <div className="dashboard-panel__heading"><div><h2>Acciones rápidas</h2><p>Operaciones frecuentes</p></div></div>
                <div className="dashboard-actions__grid">
                  <button type="button"><span className="dashboard-tone--blue"><Icon name="plus" size={21} /></span><strong>Nuevo documento</strong><small>Crear desde cero</small></button>
                  <button type="button"><span className="dashboard-tone--green"><Icon name="upload" size={21} /></span><strong>Subir archivo</strong><small>PDF, DOCX o XLSX</small></button>
                  <button type="button"><span className="dashboard-tone--violet"><Icon name="userPlus" size={21} /></span><strong>Nuevo usuario</strong><small>Asignar acceso</small></button>
                  <button type="button"><span className="dashboard-tone--orange"><Icon name="chart" size={21} /></span><strong>Generar reporte</strong><small>Exportar métricas</small></button>
                </div>
              </section>

              <section className="dashboard-panel dashboard-review">
                <div className="dashboard-panel__heading"><div><h2>Cola de revisión</h2><p>Prioridad de esta semana</p></div><span>12</span></div>
                <div className="dashboard-review__progress"><span style={{ width: '64%' }} /></div>
                <strong>8 de 12 revisiones completadas</strong>
                <p>Buen ritmo. Quedan cuatro documentos para completar el objetivo semanal.</p>
                <button type="button">Revisar pendientes <Icon name="arrow" size={16} /></button>
              </section>
            </aside>
          </div>

          <div className="dashboard-secondary-grid">
            <section className="dashboard-panel dashboard-chart">
              <div className="dashboard-panel__heading"><div><h2>Actividad documental</h2><p>Documentos procesados durante los últimos 12 meses</p></div><span><i /> Documentos</span></div>
              <div className="dashboard-chart__body">
                <div className="dashboard-chart__axis"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div>
                <div className="dashboard-chart__plot">
                  {chartValues.map((value, index) => <div key={`${value}-${index}`}><span style={{ height: `${value}%` }} /><small>{['Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Ene', 'Feb', 'Mar', 'Abr', 'May'][index]}</small></div>)}
                </div>
              </div>
            </section>

            <section className="dashboard-panel dashboard-activity">
              <div className="dashboard-panel__heading"><div><h2>Actividad reciente</h2><p>Movimientos de la organización</p></div><button type="button">Ver bitácora</button></div>
              <div className="dashboard-activity__list">
                {activity.map((item) => (
                  <article key={item.title}><span className={`dashboard-tone--${item.tone}`}><Icon name={item.icon} size={18} /></span><div><strong>{item.title}</strong><p>{item.detail}</p></div><time>{item.time}</time></article>
                ))}
              </div>
            </section>
          </div>
          </>}

          <footer className="dashboard-footer"><span>© 2026 Consultoría Alexandria. Todos los derechos reservados.</span><span>Plataforma segura y confiable</span></footer>
        </div>
      </section>
    </main>
  )
}

export default Dashboard
