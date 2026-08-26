import { useDeferredValue, useState } from 'react'
import EditorActivityLogView from './EditorActivityLogView'
import EditorBasicReportsView from './EditorBasicReportsView'
import EditorDocumentEditView from './EditorDocumentEditView'
import EditorDocumentsView from './EditorDocumentsView'
import EditorVersionsView from './EditorVersionsView'
import './EditorDashboard.css'

const editorDocuments = [
  { code: 'POL-001', title: 'Política de Calidad', status: 'En revisión', updated: '23/05/2024 10:32', owner: 'Carlos Méndez' },
  { code: 'PRC-005', title: 'Proceso de Compras', status: 'En revisión', updated: '23/05/2024 09:18', owner: 'Carlos Méndez' },
  { code: 'INS-007', title: 'Instructivo de Auditoría Interna', status: 'Borrador', updated: '22/05/2024 16:45', owner: 'Carlos Méndez' },
  { code: 'FOR-012', title: 'Formato de Solicitud', status: 'Activo', updated: '20/05/2024 14:07', owner: 'Carlos Méndez' },
]

const activities = [
  ['Subiste una nueva versión del documento', 'POL-001 Política de Calidad', 'Hoy, 10:32', 'upload'],
  ['Enviaste a revisión el documento', 'PRC-005 Proceso de Compras', 'Hoy, 09:18', 'send'],
  ['Actualizaste el documento', 'INS-007 Instructivo de Auditoría Interna', 'Ayer, 16:45', 'edit'],
  ['Recibiste comentarios en', 'MAN-003 Manual de Organización', 'Ayer, 11:22', 'comment'],
  ['Subiste una nueva versión del documento', 'FOR-012 Formato de Solicitud', '20 may., 14:07', 'upload'],
]

const initialTasks = [
  { title: 'Enviar a revisión', code: 'POL-001 Política de Calidad', priority: 'Alta', date: '24/05/2024', icon: 'send' },
  { title: 'Actualizar documento', code: 'PRC-004 Proceso de Ventas', priority: 'Media', date: '27/05/2024', icon: 'edit' },
  { title: 'Subir nueva versión', code: 'INS-007 Instructivo de Auditoría Interna', priority: 'Media', date: '28/05/2024', icon: 'upload' },
  { title: 'Enviar a revisión', code: 'MAN-003 Manual de Organización', priority: 'Baja', date: '30/05/2024', icon: 'send' },
]

const comments = [
  ['María González', '“Por favor, revisar el alcance del apartado 4.2 y ajustar la redacción final.”', 'POL-001 Política de Calidad', 'Hoy, 09:47', 'MG'],
  ['Jorge Ramírez', '“Incluir criterios de aceptación en el punto 6.1 del procedimiento.”', 'PRC-005 Proceso de Compras', 'Ayer, 16:20', 'JR'],
  ['Lucía Fernández', '“Buen trabajo en la actualización del documento. Solo un ajuste menor en la tabla.”', 'INS-007 Instructivo de Auditoría Interna', '20 may., 11:05', 'LF'],
]

function EditorIcon({ name, size = 20 }) {
  let content
  switch (name) {
    case 'dashboard': content = <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>; break
    case 'document': content = <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>; break
    case 'layers': content = <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>; break
    case 'history': content = <><path d="M4 12a8 8 0 1 0 2-5.7" /><path d="M4 4v5h5M12 7v5l3 2" /></>; break
    case 'chart': content = <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>; break
    case 'search': content = <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>; break
    case 'bell': content = <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></>; break
    case 'menu': content = <path d="M4 7h16M4 12h16M4 17h16" />; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'upload': content = <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 14v6h14v-6" /></>; break
    case 'send': content = <><path d="m21 3-7.5 18-3.5-7-7-3.5L21 3Z" /><path d="M10 14 21 3" /></>; break
    case 'edit': content = <><path d="m4 16-.8 4.8L8 20l11-11-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></>; break
    case 'comment': content = <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></>; break
    case 'plus': content = <path d="M12 5v14M5 12h14" />; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    case 'arrow': content = <path d="m9 18 6-6-6-6" />; break
    case 'lightning': content = <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />; break
    case 'logout': content = <><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" /></>; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function EditorBrand() {
  return <div className="editor-brand" aria-label="Consultoría Alexandria"><svg viewBox="0 0 52 52" aria-hidden="true"><path d="M5 18h42L26 7 5 18ZM10 21v19M18 21v19M26 21v19M34 21v19M42 21v19M6 44h40" /></svg><div><span>Consultoría</span><strong>Alexandria</strong></div></div>
}

function Metric({ tone, icon, label, value, detail, direction }) {
  return <article className="editor-metric"><span className={`editor-metric__icon editor-tone--${tone}`}><EditorIcon name={icon} size={29} /></span><div><p>{label}</p><strong>{value}</strong><small className={direction === 'down' ? 'is-down' : ''}>{direction === 'down' ? '↘' : '↗'} <b>{detail}</b> vs. mes anterior</small></div></article>
}

function EditorDashboard({ user, onLogout, logoutPending, error }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [activeView, setActiveView] = useState('dashboard')
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [tasks, setTasks] = useState(initialTasks)
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const initials = `${user.first_name?.[0] || 'C'}${user.last_name?.[0] || 'M'}`
  const visibleDocuments = editorDocuments.filter((item) => !deferredQuery || [item.code, item.title, item.status].join(' ').toLowerCase().includes(deferredQuery))
  const visibleComments = comments.filter((item) => !deferredQuery || item.join(' ').toLowerCase().includes(deferredQuery))
  const role = user.roles?.find((item) => item.code === 'EDITOR')?.name || 'Editor'

  function action(label) {
    setNotice(label.endsWith('.') ? label : `${label} está disponible en esta vista frontend.`)
    setSidebarOpen(false)
  }

  function completeTask(index) {
    setTasks((current) => current.filter((_, itemIndex) => itemIndex !== index))
    setNotice('La tarea se marcó como completada.')
  }

  return <main className="editor-shell">
    <aside className={`editor-sidebar${sidebarOpen ? ' is-open' : ''}`}>
      <EditorBrand />
      <nav className="editor-nav" aria-label="Navegación del editor">
        <button className={activeView === 'dashboard' ? 'is-active' : ''} type="button" onClick={() => { setActiveView('dashboard'); setSidebarOpen(false) }}><EditorIcon name="dashboard" size={22} /> Dashboard</button>
        <button className={activeView === 'documents' ? 'is-active' : ''} type="button" onClick={() => { setActiveView('documents'); setSidebarOpen(false) }}><EditorIcon name="document" size={22} /> Documentos</button>
        <button className={activeView === 'versions' ? 'is-active' : ''} type="button" onClick={() => { setActiveView('versions'); setSidebarOpen(false) }}><EditorIcon name="layers" size={22} /> Versiones</button>
        <button className={activeView === 'audit' ? 'is-active' : ''} type="button" onClick={() => { setActiveView('audit'); setSidebarOpen(false) }}><EditorIcon name="history" size={22} /> Bitácora personal</button>
        <button className={activeView === 'reports' ? 'is-active' : ''} type="button" onClick={() => { setActiveView('reports'); setSidebarOpen(false) }}><EditorIcon name="chart" size={22} /> Reportes básicos</button>
      </nav>
      <div className="editor-sidebar__illustration" aria-hidden="true">♜</div>
    </aside>
    {sidebarOpen && <button className="editor-overlay" type="button" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} />}
    <section className="editor-workspace">
      <header className="editor-topbar"><button className="editor-menu" type="button" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)}><EditorIcon name="menu" size={25} /></button><label className="editor-search"><EditorIcon name="search" size={20} /><input type="search" aria-label="Buscar" placeholder="Buscar documentos, versiones, usuarios..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="editor-topbar__actions"><button className="editor-notification" type="button" aria-label="Notificaciones" onClick={() => setNotice('Tienes 3 notificaciones nuevas.')}><EditorIcon name="bell" size={24} /><span>3</span></button><div className="editor-profile"><button className="editor-profile__trigger" type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span className="editor-avatar">{initials}</span><span><strong>{user.full_name || 'Carlos Méndez'}</strong><small>{role}</small></span><EditorIcon name="chevron" size={17} /></button>{profileOpen && <div className="editor-profile__menu"><span>{user.email}</span><button type="button" onClick={onLogout} disabled={logoutPending}><EditorIcon name="logout" size={17} /> {logoutPending ? 'Cerrando...' : 'Cerrar sesión'}</button></div>}</div></div></header>
      <div className="editor-content">
        {error && <p className="editor-error" role="alert">{error}</p>}
        {activeView === 'documents' ? <EditorDocumentsView globalQuery={query} onAction={action} onEditDocument={(document) => { setSelectedDocument(document); setActiveView('edit') }} /> : activeView === 'edit' ? <EditorDocumentEditView document={selectedDocument || editorDocuments[0]} onBack={() => setActiveView('documents')} onAction={action} /> : activeView === 'versions' ? <EditorVersionsView /> : activeView === 'audit' ? <EditorActivityLogView globalQuery={query} onAction={action} /> : activeView === 'reports' ? <EditorBasicReportsView globalQuery={query} /> : <>
        <header className="editor-heading"><div><h1>Dashboard del Editor</h1><p>Gestiona tus documentos, versiones y actividades personales.</p></div><time><EditorIcon name="calendar" size={18} /> 23 de mayo de 2024</time></header>
        <section className="editor-metrics" aria-label="Resumen del editor"><Metric tone="blue" icon="document" label="Mis documentos" value="24" detail="12%" /><Metric tone="orange" icon="history" label="Pendientes de revisión" value="7" detail="17%" direction="down" /><Metric tone="violet" icon="comment" label="Comentarios recibidos" value="16" detail="11%" direction="down" /><Metric tone="teal" icon="layers" label="Versiones activas" value="31" detail="8%" /></section>
        <div className="editor-upper-grid">
          <section className="editor-card editor-activity"><div className="editor-card__heading"><h2><EditorIcon name="history" size={20} /> Actividad reciente</h2><button type="button" onClick={() => action('La actividad completa')}>Ver todas</button></div><div className="editor-activity__list">{activities.map((item) => <article key={`${item[0]}-${item[2]}`}><i /><div><strong>{item[0]}</strong><a href="#documento" onClick={(event) => { event.preventDefault(); action(item[1]) }}>{item[1]}</a></div><time>{item[2]}</time></article>)}</div></section>
          <section className="editor-card editor-tasks"><div className="editor-card__heading"><h2><EditorIcon name="calendar" size={20} /> Tareas pendientes</h2><button type="button" onClick={() => action('La lista de tareas')}>Ver todas</button></div><div className="editor-tasks__list">{tasks.map((task, index) => <article key={task.code}><button className={`editor-task-icon editor-task-icon--${task.icon}`} type="button" aria-label={`Completar ${task.title}`} onClick={() => completeTask(index)}><EditorIcon name={task.icon} size={19} /></button><div><strong>{task.title}</strong><span>{task.code}</span></div><b className={`editor-priority editor-priority--${task.priority.toLowerCase()}`}>{task.priority}</b><time><EditorIcon name="calendar" size={14} /> {task.date}</time></article>)}{!tasks.length && <p className="editor-empty">No tienes tareas pendientes.</p>}</div></section>
          <section className="editor-card editor-comments"><div className="editor-card__heading"><h2><EditorIcon name="comment" size={20} /> Comentarios recientes</h2><button type="button" onClick={() => action('Todos los comentarios')}>Ver todos</button></div><div>{visibleComments.map((item) => <article key={item[0]}><span className="editor-comment-avatar">{item[4]}</span><div><strong>{item[0]}</strong><time>{item[3]}</time><p>{item[1]}</p><a href="#documento" onClick={(event) => { event.preventDefault(); action(item[2]) }}>{item[2]}</a></div></article>)}{!visibleComments.length && <p className="editor-empty">No se encontraron comentarios.</p>}</div></section>
        </div>
        <div className="editor-lower-grid"><section className="editor-card editor-documents"><div className="editor-card__heading"><h2><EditorIcon name="document" size={20} /> Documentos recientes</h2><button type="button" onClick={() => action('Todos los documentos')}>Ver todos</button></div><div className="editor-table-wrap"><table><thead><tr><th>Código</th><th>Título</th><th>Estado</th><th>Última actualización</th><th>Responsable</th></tr></thead><tbody>{visibleDocuments.map((item) => <tr key={item.code}><td>{item.code}</td><td>{item.title}</td><td><span className={`editor-status editor-status--${item.status.toLowerCase().replace(' ', '-')}`}>{item.status}</span></td><td>{item.updated}</td><td>{item.owner}</td></tr>)}</tbody></table>{!visibleDocuments.length && <p className="editor-empty">No se encontraron documentos.</p>}</div></section><section className="editor-card editor-quick-actions"><div className="editor-card__heading"><h2><EditorIcon name="lightning" size={20} /> Acciones rápidas</h2></div><div className="editor-quick-actions__grid"><button type="button" onClick={() => action('Crear un nuevo documento')}><EditorIcon name="document" size={34} /><strong>Nuevo<br />documento</strong></button><button type="button" onClick={() => action('Subir un documento')}><EditorIcon name="upload" size={34} /><strong>Subir<br />documento</strong></button><button type="button" onClick={() => action('Crear una nueva versión')}><EditorIcon name="layers" size={34} /><strong>Nueva<br />versión</strong></button><button type="button" onClick={() => action('Enviar a revisión')}><EditorIcon name="send" size={34} /><strong>Enviar a<br />revisión</strong></button><button type="button" onClick={() => action('Generar reporte básico')}><EditorIcon name="chart" size={34} /><strong>Generar<br />reporte básico</strong></button></div></section></div>
        <footer className="editor-footer"><span>© 2024 Consultoría Alexandria. Todos los derechos reservados.</span><span>Versión 2.1.0</span></footer>
        </>}
      </div><span className="editor-live-notice" role="status">{notice}</span>
    </section>
  </main>
}

export default EditorDashboard
