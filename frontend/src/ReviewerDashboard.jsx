import { useDeferredValue, useState } from 'react'
import ReviewerDocumentReviewView from './ReviewerDocumentReviewView'
import ReviewerReviewInboxView from './ReviewerReviewInboxView'
import ReviewerVersionComparisonView from './ReviewerVersionComparisonView'
import './EditorDashboard.css'
import './ReviewerDashboard.css'

const activities = [
  { icon: 'check', title: 'Aprobaste el documento POL-002', detail: 'Política de Seguridad de la Información', time: 'Hoy, 10:15', tone: 'green' },
  { icon: 'comment', title: 'Emitiste 3 observaciones en PRO-005', detail: 'Proceso de Compras', time: 'Hoy, 09:32', tone: 'red' },
  { icon: 'document', title: 'Revisaste la versión 1.2 de INS-007', detail: 'Instructivo de Auditoría Interna', time: 'Ayer, 16:45', tone: 'blue' },
  { icon: 'clock', title: 'Asignación recibida: FOR-015', detail: 'Formato de Evaluación de Proveedores', time: 'Ayer, 11:20', tone: 'orange' },
  { icon: 'check', title: 'Aprobaste el documento FOR-012', detail: 'Formato de Solicitud', time: '21/05/2024, 14:10', tone: 'green' },
]

const tasks = [
  { code: 'PRO-005', title: 'Proceso de Compras', priority: 'Alta', due: '24/05/2024' },
  { code: 'INS-010', title: 'Instructivo de Gestión de No Conformidades', priority: 'Media', due: '27/05/2024' },
  { code: 'POL-004', title: 'Política de Protección de Datos', priority: 'Media', due: '28/05/2024' },
  { code: 'FOR-015', title: 'Formato de Evaluación de Proveedores', priority: 'Baja', due: '30/05/2024' },
  { code: 'PRO-008', title: 'Control de Registros', priority: 'Media', due: '31/05/2024' },
]

const comments = [
  { initials: 'JR', name: 'Jorge Ramírez', code: 'PRO-005', title: 'Proceso de Compras', text: 'María, por favor confirma si la observación sobre el flujo de aprobación fue atendida en la nueva versión.', time: 'Hoy, 09:10', tone: 'woman' },
  { initials: 'LF', name: 'Lucía Fernández', code: 'INS-007', title: 'Instructivo de Auditoría Interna', text: 'Gracias por las observaciones. Ya subimos la versión 1.2 con los ajustes solicitados.', time: 'Ayer, 17:02', tone: 'woman' },
  { initials: 'CM', name: 'Carlos Méndez', code: 'POL-002', title: 'Política de Seguridad de la Información', text: 'Quedo atento a tus comentarios finales para proceder con la aprobación.', time: '21/05/2024, 15:40', tone: 'man' },
]

const upcomingDocuments = [
  ['PRO-005', 'Proceso de Compras', 'En revisión', '24/05/2024', 'Jorge Ramírez'],
  ['INS-010', 'Instructivo de Gestión de No Conformidades', 'En revisión', '27/05/2024', 'Lucía Fernández'],
  ['POL-004', 'Política de Protección de Datos', 'En revisión', '28/05/2024', 'Carlos Méndez'],
  ['FOR-015', 'Formato de Evaluación de Proveedores', 'Borrador', '30/05/2024', 'Lucía Fernández'],
  ['PRO-008', 'Control de Registros', 'En revisión', '31/05/2024', 'Jorge Ramírez'],
]

export function ReviewerIcon({ name, size = 20 }) {
  let content
  switch (name) {
    case 'dashboard': content = <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>; break
    case 'inbox': content = <><path d="M4 4h16l2 10v6H2v-6L4 4Z" /><path d="M2 14h5l2 3h6l2-3h5" /></>; break
    case 'document': content = <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>; break
    case 'layers': content = <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>; break
    case 'history': content = <><path d="M4 12a8 8 0 1 0 2-5.7" /><path d="M4 4v5h5M12 7v5l3 2" /></>; break
    case 'chart': content = <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>; break
    case 'search': content = <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>; break
    case 'bell': content = <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></>; break
    case 'menu': content = <path d="M4 7h16M4 12h16M4 17h16" />; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'check': content = <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>; break
    case 'comment': content = <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></>; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>; break
    case 'eye': content = <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>; break
    case 'lightning': content = <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />; break
    case 'compare': content = <><path d="M7 4v16M17 4v16M3 8h8M13 16h8" /><path d="m4 8 3-3 3 3m4 8 3 3 3-3" /></>; break
    case 'send': content = <><path d="m21 3-7.5 18-3.5-7-7-3.5L21 3Z" /><path d="M10 14 21 3" /></>; break
    case 'plus': content = <path d="M12 5v14M5 12h14" />; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    case 'logout': content = <><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" /></>; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReviewerMetric({ icon, tone, label, value, detail, negative = false }) {
  return <article className="reviewer-metric"><span className={`reviewer-metric-icon is-${tone}`}><ReviewerIcon name={icon} size={30} /></span><div><p>{label}</p><strong>{value}</strong><small className={negative ? 'is-negative' : ''}>{negative ? '↑' : '↑'} <b>{detail}</b> vs. período anterior</small></div></article>
}

function ReviewerBrand() {
  return <div className="editor-brand" aria-label="Consultoría Alexandria"><svg viewBox="0 0 52 52" aria-hidden="true"><path d="M5 18h42L26 7 5 18ZM10 21v19M18 21v19M26 21v19M34 21v19M42 21v19M6 44h40" /></svg><div><span>Consultoría</span><strong>Alexandria</strong></div></div>
}

function ReviewerDashboard({ user, onLogout, logoutPending, error }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [activeView, setActiveView] = useState('dashboard')
  const [query, setQuery] = useState('')
  const [tasksState, setTasksState] = useState(tasks)
  const [notice, setNotice] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const initials = `${user.first_name?.[0] || 'M'}${user.last_name?.[0] || 'G'}`
  const role = user.roles?.find((item) => ['REVISOR', 'REVIEWER'].includes(item.code))?.name || 'Revisor'
  const visibleComments = comments.filter((item) => !deferredQuery || [item.name, item.code, item.title, item.text].join(' ').toLowerCase().includes(deferredQuery))
  const visibleDocuments = upcomingDocuments.filter((item) => !deferredQuery || item.join(' ').toLowerCase().includes(deferredQuery))

  function action(label) {
    setNotice(label.endsWith('.') ? label : `${label} está disponible en esta vista frontend.`)
    setSidebarOpen(false)
  }

  function navigate(view, label) {
    setActiveView(view)
    setSidebarOpen(false)
    if (label) setNotice(label)
  }

  function completeTask(code) {
    setTasksState((current) => current.filter((item) => item.code !== code))
    setNotice(`La revisión de ${code} fue marcada como completada.`)
  }

  return <main className="editor-shell reviewer-shell"><aside className={`editor-sidebar${sidebarOpen ? ' is-open' : ''}`}><ReviewerBrand /><nav className="editor-nav reviewer-nav" aria-label="Navegación del revisor"><button className={activeView === 'dashboard' ? 'is-active' : ''} type="button" onClick={() => navigate('dashboard')}><ReviewerIcon name="dashboard" size={22} /> Dashboard</button><button className={activeView === 'review-inbox' ? 'is-active' : ''} type="button" onClick={() => navigate('review-inbox')}><ReviewerIcon name="inbox" size={22} /> Bandeja de revisión</button><button className={activeView === 'review-document' ? 'is-active' : ''} type="button" onClick={() => navigate('review-document')}><ReviewerIcon name="document" size={22} /> Documentos asignados</button><button className={activeView === 'compare' ? 'is-active' : ''} type="button" onClick={() => navigate('compare')}><ReviewerIcon name="layers" size={22} /> Comparación de versiones</button><button type="button" onClick={() => action('La bitácora personal')}><ReviewerIcon name="history" size={22} /> Bitácora personal</button><button type="button" onClick={() => action('Los reportes básicos')}><ReviewerIcon name="chart" size={22} /> Reportes básicos</button></nav><div className="editor-sidebar__illustration" aria-hidden="true">♜</div></aside>{sidebarOpen && <button className="editor-overlay" type="button" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} />}<section className="editor-workspace"><header className="editor-topbar"><button className="editor-menu" type="button" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)}><ReviewerIcon name="menu" size={25} /></button><label className="editor-search"><ReviewerIcon name="search" size={20} /><input type="search" aria-label="Buscar" placeholder="Buscar documentos, versiones, usuarios..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="editor-topbar__actions"><button className="editor-notification" type="button" aria-label="Notificaciones" onClick={() => setNotice('Tienes 3 notificaciones nuevas.')}><ReviewerIcon name="bell" size={24} /><span>3</span></button><div className="editor-profile"><button className="editor-profile__trigger" type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span className="editor-avatar reviewer-profile-avatar">{initials}</span><span><strong>{user.full_name || 'María González'}</strong><small>{role}</small></span><ReviewerIcon name="chevron" size={17} /></button>{profileOpen && <div className="editor-profile__menu"><span>{user.email}</span><button type="button" onClick={onLogout} disabled={logoutPending}><ReviewerIcon name="logout" size={17} /> {logoutPending ? 'Cerrando...' : 'Cerrar sesión'}</button></div>}</div></div></header><div className="editor-content reviewer-content">{error && <p className="editor-error" role="alert">{error}</p>}{activeView === 'review-inbox' ? <ReviewerReviewInboxView onAction={action} /> : activeView === 'review-document' ? <ReviewerDocumentReviewView onAction={action} /> : activeView === 'compare' ? <ReviewerVersionComparisonView onAction={action} /> : <><header className="reviewer-heading"><div><h1>Dashboard del Revisor</h1><p>Supervisa documentos asignados, revisa versiones y emite observaciones o aprobaciones.</p></div><time><ReviewerIcon name="calendar" size={18} /> 23 de mayo de 2024</time></header><section className="reviewer-metrics"><ReviewerMetric icon="document" tone="blue" label="Documentos asignados" value="18" detail="12%" /><ReviewerMetric icon="clock" tone="orange" label="Pendientes por revisar" value="9" detail="5%" negative /><ReviewerMetric icon="comment" tone="red" label="Observaciones emitidas" value="27" detail="25%" /><ReviewerMetric icon="check" tone="green" label="Documentos aprobados" value="12" detail="9%" /></section><div className="reviewer-upper-grid"><section className="reviewer-card reviewer-activity"><div className="reviewer-card-heading"><h2><ReviewerIcon name="history" size={20} /> Actividad reciente</h2><button type="button" onClick={() => action('Toda la actividad')}>Ver todo</button></div><div className="reviewer-activity-list">{activities.map((item) => <article key={`${item.title}-${item.time}`}><span className={`reviewer-activity-icon is-${item.tone}`}><ReviewerIcon name={item.icon} size={17} /></span><div><strong>{item.title}</strong><span>{item.detail}</span></div><time>{item.time}</time></article>)}</div></section><section className="reviewer-card reviewer-tasks"><div className="reviewer-card-heading"><h2><ReviewerIcon name="document" size={20} /> Tareas pendientes</h2><button type="button" onClick={() => action('Todas las tareas')}>Ver todas</button></div><div className="reviewer-task-list">{tasksState.map((item) => <article key={item.code}><button className="reviewer-task-check" type="button" aria-label={`Completar revisión ${item.code}`} onClick={() => completeTask(item.code)}><ReviewerIcon name="check" size={17} /></button><div><strong>{item.code}</strong><span>{item.title}</span></div><b className={`reviewer-priority is-${item.priority.toLowerCase()}`}>{item.priority}</b><time>Vence<br /><strong>{item.due}</strong></time></article>)}{!tasksState.length && <p className="reviewer-empty">No tienes tareas pendientes.</p>}</div><button className="reviewer-card-link" type="button" onClick={() => navigate('review-inbox')}>Ir a bandeja de revisión <span>→</span></button></section><section className="reviewer-card reviewer-comments"><div className="reviewer-card-heading"><h2><ReviewerIcon name="comment" size={20} /> Comentarios recientes</h2><button type="button" onClick={() => action('Todos los comentarios')}>Ver todos</button></div><div>{visibleComments.map((item) => <article key={item.name}><span className={`reviewer-comment-avatar is-${item.tone}`}>{item.initials}</span><div><strong>{item.name}</strong><time>{item.time}</time><span>en {item.code} {item.title}</span><p>{item.text}</p></div></article>)}{!visibleComments.length && <p className="reviewer-empty">No se encontraron comentarios.</p>}</div></section></div><div className="reviewer-lower-grid"><section className="reviewer-card reviewer-documents"><div className="reviewer-card-heading"><h2><ReviewerIcon name="calendar" size={20} /> Documentos próximos a vencer</h2><button type="button" onClick={() => action('Todos los documentos próximos a vencer')}>Ver todos</button></div><div className="reviewer-table-wrap"><table><thead><tr><th>Código</th><th>Documento</th><th>Estado</th><th>Fecha límite</th><th>Responsable</th><th /></tr></thead><tbody>{visibleDocuments.map((item) => <tr key={item[0]}><td><strong>{item[0]}</strong></td><td>{item[1]}</td><td><span className={`reviewer-document-status is-${item[2] === 'Borrador' ? 'draft' : 'review'}`}>{item[2]}</span></td><td className="reviewer-due-date">{item[3]}</td><td>{item[4]}</td><td><button type="button" aria-label={`Ver ${item[1]}`} onClick={() => action(`Ver ${item[1]}`)}><ReviewerIcon name="eye" size={16} /></button></td></tr>)}</tbody></table>{!visibleDocuments.length && <p className="reviewer-empty">No se encontraron documentos.</p>}</div></section><section className="reviewer-card reviewer-quick-actions"><div className="reviewer-card-heading"><h2><ReviewerIcon name="lightning" size={20} /> Acciones rápidas</h2></div><div className="reviewer-quick-grid"><button type="button" onClick={() => action('Abrir revisión')}><ReviewerIcon name="document" size={37} /><span>Abrir revisión</span></button><button type="button" onClick={() => action('Comparar versiones')}><ReviewerIcon name="compare" size={37} /><span>Comparar versiones</span></button><button type="button" onClick={() => action('Agregar observación')}><ReviewerIcon name="comment" size={37} /><span>Agregar observación</span></button><button type="button" onClick={() => action('Aprobar documento')}><ReviewerIcon name="check" size={37} /><span>Aprobar documento</span></button><button type="button" onClick={() => action('Generar reporte básico')}><ReviewerIcon name="chart" size={37} /><span>Generar reporte básico</span></button></div></section></div><footer className="editor-footer"><span>© 2024 Consultoría Alexandria. Todos los derechos reservados.</span><span>Versión 2.1.0</span></footer></>}</div><span className="editor-live-notice" role="status">{notice}</span></section></main>
}

export default ReviewerDashboard
